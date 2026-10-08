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
const {cleanProfile,profileVersion}=require('./profile-model.js');
const old={position:'back',style:'defense',confidentSkills:['serve'],rustySkills:['lob'],partnerRoles:['cover','either'],restPreference:'condition',traits:['  왼손잡이  ']};
assert.deepEqual(cleanProfile(old,'C'),{position:'back',courtPreference:'',style:'defense',partnerRoles:['cover'],traits:['왼손잡이'],restPreference:''});
const modern=cleanProfile({courtPreference:'net',style:'balance',partnerRoles:['attack','encourage'],restPreference:'flexible'},'C');
assert.equal(modern.courtPreference,'net');assert.equal(modern.style,'balance');assert.equal(modern.restPreference,'flexible');
assert.deepEqual(cleanProfile(JSON.parse(JSON.stringify(modern)),'C'),modern);
const opponent=cleanProfile({style:'allround',keywords:[{kind:'strong',text:'포핸드'},{kind:'weak',text:' 높은  공 '},{kind:'note',text:'장신'},{kind:'pattern',text:'포칭'}]},'A');
assert.equal(opponent.style,'unknown');assert.deepEqual(opponent.legacyStrengths,['포핸드']);
assert.deepEqual(opponent.keywords,[{kind:'weak',text:'높은 공'},{kind:'note',text:'장신'},{kind:'pattern',text:'포칭'}]);
assert.ok(!Object.hasOwn(opponent,'tendency'));assert.ok(!Object.hasOwn(modern,'confidentSkills'));
assert.equal(cleanProfile({traits:Array.from({length:25},(_,i)=>'특징 '+i)},'C').traits.length,20);
assert.equal(cleanProfile({traits:['가'.repeat(50)]},'C').traits[0].length,40);
assert.equal(cleanProfile({keywords:Array.from({length:25},(_,i)=>({kind:'pattern',text:'패턴 '+i}))},'A').keywords.length,20);
assert.deepEqual(cleanProfile({keywords:[]},'A',[{kind:'weak',text:'포핸드'}]).keywords,[]);
assert.deepEqual(cleanProfile({traits:['a',null,5,'a','  ']},'C').traits,['a']);
const players=[{id:'C:우디',tier:'forty',profile:modern},{id:'C:숭',tier:'thirty',profile:cleanProfile(null,'C')}];
assert.equal(profileVersion(players),profileVersion([...players].reverse()));
assert.notEqual(profileVersion(players),profileVersion(players.map(p=>({...p,profile:{...p.profile,position:'fore'}}))));
const {isLegalPair,analyzeMatchup}=require('./app.js');
assert.equal(isLegalPair([{name:'꿉',tier:'love'},{name:'한치',tier:'love'}]),false);
assert.equal(isLegalPair([{name:'우디',tier:'forty'},{name:'우디',tier:'forty'}]),false);
const analysis=analyzeMatchup(players.map(p=>({name:p.id.slice(2),profile:p.profile})),[{name:'동글',profile:opponent}]);
assert.ok(analysis.roles.some(text=>text.includes('네트')));assert.ok(analysis.checks.some(text=>text.includes('포칭')));
console.log('PASS: 공식 일정·기존 편성, 새 프로필과 보존 이관, 키워드 제한·미입력 처리');
