const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');
const ctx={window:{}};vm.createContext(ctx);for(const f of ['data.js','validation.js'])vm.runInContext(fs.readFileSync(__dirname+'/'+f,'utf8'),ctx);
const data=ctx.window.BOARD_DATA,validate=ctx.window.validateBoard;
assert.equal(validate(data).length,0);
assert.deepEqual(Array.from(data.strategies,item=>item.id),['balance','win','stamina']);
assert.deepEqual(Array.from(data.balanceVariants,item=>item.id),['balance-1','balance-2','balance-3']);
const pairSet=plan=>[...new Set(Array.from(plan.matches,match=>[...match.pair].sort().join('+')))].sort().join('|');
assert.equal(new Set(Array.from(data.balanceVariants,pairSet)).size,3);
assert.deepEqual(Array.from(data.schedule,item=>item.court),[2,3,3,3,4,1,2,3,4,3,4,1,2,3,4,2,3,3,2,3]);
for(const slot of data.schedule){
 const minutes=value=>{const [hour,minute]=value.split(':').map(Number);return hour*60+minute;};
 assert.equal(minutes(slot.endTime)-minutes(slot.time),30);
}
for(const team of ['A','B','D']){
 const names=Object.keys(data.teams[team]);assert.equal(data.combos[team].length,names.length*(names.length-1)/2);
 for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++)assert.equal(data.combos[team].filter(c=>c.pair.includes(names[i])&&c.pair.includes(names[j])).length,1);
}
for(const mutate of [d=>d.strategies[0].matches.pop(),d=>d.strategies[0].matches[0].pair=['꿉','한치'],d=>d.strategies[0].matches[1].pair=d.strategies[0].matches[0].pair,d=>d.strategies[0].matches[0].id=2,d=>d.strategies[0].matches[0].pair=['우디','우디'],d=>d.strategies[0].matches[0].time='11:30',d=>d.schedule[0].court=5,d=>d.schedule[1].court=d.schedule[0].court,d=>d.balanceVariants[2].matches[0].pair=['꿉','한치']]){const copy=JSON.parse(JSON.stringify(data));mutate(copy);assert.ok(validate(copy).length>0);}
const {cleanProfile}=require('./ratings.js');
const old={ratings:{serve:5,forehand:4.5},scores:[5,4,3,2,1],position:'back',style:'defense',keywords:[{kind:'weak',text:'체력'}]};
const migrated=cleanProfile(old,'C');
assert.deepEqual(migrated,{position:'back',style:'defense',confidentSkills:[],partnerRoles:[],restPreference:'',traits:[]});
assert.ok(!Object.hasOwn(migrated,'ratings')&&!Object.hasOwn(migrated,'keywords'));
const edited=cleanProfile({...migrated,confidentSkills:['lob','serve','serve','invalid'],partnerRoles:['cover','either'],restPreference:'continuous'},'C');
assert.deepEqual(edited.confidentSkills,['serve','lob']);
assert.deepEqual(edited.partnerRoles,['cover']);
assert.equal(edited.restPreference,'continuous');
assert.deepEqual(cleanProfile(JSON.parse(JSON.stringify(edited)),'C'),edited);
assert.deepEqual(cleanProfile({confidentSkills:[5],partnerRoles:['bad'],restPreference:'bad',style:'allround'},'C'),{position:'',style:'unknown',confidentSkills:[],partnerRoles:[],restPreference:'',traits:[]});
const withTraits=cleanProfile({...edited,traits:['  왼손잡이  ','왼손잡이','파트너와   콜을 많이 함',null,5,'']},'C');
assert.deepEqual(withTraits.traits,['왼손잡이','파트너와 콜을 많이 함']);
assert.deepEqual(cleanProfile(JSON.parse(JSON.stringify(withTraits)),'C'),withTraits);
assert.equal(cleanProfile({traits:Array.from({length:25},(_,index)=>'특징 '+index)},'C').traits.length,20);
assert.equal(cleanProfile({traits:['가'.repeat(50)]},'C').traits[0].length,40);
assert.deepEqual(cleanProfile({traits:'왼손잡이'},'C').traits,[]);
const seeds=[{kind:'strong',text:'포핸드'}];
const opponent=cleanProfile({position:'fore',style:'allround',ratings:{serve:5}},'A',seeds);
assert.equal(opponent.tendency,'unknown');assert.equal(opponent.style,'allround');
assert.deepEqual(opponent.keywords,seeds);assert.ok(!Object.hasOwn(opponent,'confidentSkills'));
assert.ok(!Object.hasOwn(cleanProfile({traits:['왼손잡이']},'A'),'traits'));
const keywords=cleanProfile({tendency:'back',keywords:[{kind:'weak',text:'  높은   공  '},{kind:'weak',text:'높은 공'},{kind:'note',text:'장신'},{kind:'bad',text:'무효'}]},'D');
assert.deepEqual(keywords.keywords,[{kind:'weak',text:'높은 공'},{kind:'note',text:'장신'}]);
assert.equal(keywords.tendency,'back');
assert.deepEqual(cleanProfile({keywords:[]},'B',seeds).keywords,[]);
assert.equal(cleanProfile({keywords:Array.from({length:25},(_,index)=>({kind:'note',text:'특징 '+index}))},'A').keywords.length,20);
const {isLegalPair,summarizePairs,analyzeMatchup}=require('./app.js');
assert.ok(isLegalPair([{name:'우디',tier:'forty'},{name:'꿉',tier:'love'}]));
assert.equal(isLegalPair([{name:'꿉',tier:'love'},{name:'한치',tier:'love'}]),false);
assert.equal(isLegalPair([{name:'송이',tier:'love'},{name:'올리버',tier:'love'}]),false);
assert.equal(isLegalPair([{name:'우디',tier:'forty'},{name:'우디',tier:'forty'}]),false);
assert.equal(isLegalPair([{name:'우디',tier:'forty'},{name:'',tier:'thirty'}]),false);
for(const strategy of [...data.strategies,...data.balanceVariants])assert.equal(summarizePairs(strategy.matches).reduce((total,pair)=>total+pair.matches.length,0),20);
assert.equal(summarizePairs([{id:1,pair:['우디','꿉']},{id:2,pair:['꿉','우디']}]).length,1);
const own=[
 {name:'우디',profile:cleanProfile({position:'fore',confidentSkills:['lob'],partnerRoles:['cover']},'C')},
 {name:'숭',profile:cleanProfile({position:'back',confidentSkills:['coverage'],restPreference:'rest'},'C')}
];
const opponents=[
 {name:'동글',profile:cleanProfile({keywords:[{kind:'weak',text:'높은 공'},{kind:'strong',text:'발리'}]},'A')},
 {name:'송이',profile:cleanProfile(null,'A')}
];
const analysis=analyzeMatchup(own,opponents);
assert.ok(analysis.plans.some(plan=>plan.text.includes('우디')&&plan.evidence.includes('높은 공')));
assert.ok(analysis.roles.some(text=>text.includes('우디')&&text.includes('숭')&&text.includes('커버')));
assert.ok(analysis.checks.some(text=>text.includes('숭')&&text.includes('휴식')));
const differentOwn=[{name:'냉면',profile:cleanProfile({confidentSkills:['forehand']},'C')},own[1]];
assert.ok(!analyzeMatchup(differentOwn,opponents).plans.some(plan=>plan.evidence.includes('높은 공')));
const unconfirmed=opponents.map(player=>({...player,profile:cleanProfile({tendency:'fore',keywords:[]},'A')}));
assert.ok(!analyzeMatchup(own,unconfirmed).plans.some(plan=>plan.evidence.includes('약점 기록')));
console.log('PASS: 3개 전략·밸런스 3안, 공식 20경기 코트 배정, 77개 시트 메모, 프로필 이관·특징 저장, 금지 페어, 두 페어에 따른 공략');
