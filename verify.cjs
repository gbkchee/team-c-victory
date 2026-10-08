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
const {isLegalPair,analyzeOpponentPair}=require('./app.js');
assert.equal(isLegalPair([{name:'꿉',tier:'love'},{name:'한치',tier:'love'}]),false);
assert.equal(isLegalPair([{name:'우디',tier:'forty'},{name:'우디',tier:'forty'}]),false);
const analysis=analyzeOpponentPair([{name:'동글',profile:opponent}]);
assert.ok(analysis.cautions.some(tip=>tip.title.includes('포칭')));assert.ok(!Object.hasOwn(analysis,'roles'));
console.log('PASS: 공식 일정·기존 편성, 새 프로필과 보존 이관, 키워드 제한·미입력 처리');

const pairing=require('./pairing-model.js');
assert.equal(pairing.partitions(data).length,90);
const fixture={};Object.keys(data.teams.C).forEach((name,i)=>fixture['C:'+name]={position:i%2?'fore':'back',courtPreference:i%2?'net':'baseline',partnerRoles:[i%2?'cover':'attack'],restPreference:i%3===0?'rest':i%3===1?'continuous':'flexible'});
for(const mode of ['fixed','free','partial']){
 const options={mode,fixedPairs:[['우디','꿉']]},plans=pairing.generate(data,fixture,options);
 assert.deepEqual(plans.map(plan=>plan.strategy),['balance','balance','win']);
 for(const plan of plans){
  assert.deepEqual(pairing.validatePlan(data,plan),[]);
  assert.deepEqual(pairing.restViolations(data,plan.matches,fixture),[]);
  assert.deepEqual(pairing.opponentViolations(data,plan.matches),[]);
  const keys=new Set(plan.matches.map(match=>pairing.pairKey(match.pair)));
  assert.ok(mode==='fixed'?keys.size===4:keys.size>4);
  if(mode==='partial')assert.ok(plan.matches.filter(match=>match.pair.includes('우디')).every(match=>match.pair.includes('꿉')));
 }
 assert.notDeepEqual(plans[0].matches,plans[1].matches);
 assert.deepEqual(pairing.generate(data,fixture,options),plans);
}
for(const fixedPairs of [[['꿉','한치']],[['우디','숭'],['숭','냉면']],[['우디','숭'],['냉면','만두'],['쏘오리','기른지']]])assert.throws(()=>pairing.generate(data,{}, {mode:'partial',fixedPairs}));
const onlyTwo=pairing.generate(data,{}, {mode:'partial',fixedPairs:[['우디','꿉'],['숭','한치'],['냉면','만두']]});assert.equal(onlyTwo.length,2);
const normal=pairing.generate(data,{}, {mode:'fixed'})[0];
for(const mutate of [p=>p.matches[0].pair=['꿉','한치'],p=>p.matches[0].pair=['우디','우디'],p=>p.matches[0].court=1,p=>p.matches[0]=null,p=>p.fixedPairs='invalid',p=>p.matches.pop()]){const broken=JSON.parse(JSON.stringify(normal));mutate(broken);assert.ok(pairing.validatePlan(data,broken).length);}
assert.notDeepEqual(pairing.generate(data,fixture,{mode:'fixed'}).map(p=>p.matches),pairing.generate(data,{}, {mode:'fixed'}).map(p=>p.matches));
const tendencies={};Object.keys(data.teams.C).forEach((name,index)=>tendencies['C:'+name]={style:index<4?'attack':'defense'});
for(const match of pairing.generate(data,tendencies,{mode:'fixed'})[0].matches)assert.notEqual(tendencies['C:'+match.pair[0]].style,tendencies['C:'+match.pair[1]].style);
let randomSeed=7;const random=()=>((randomSeed=Math.imul(randomSeed,1664525)+1013904223>>>0)/4294967296);
for(let trial=0;trial<12;trial++){
 const profiles={};for(const name of Object.keys(data.teams.C))profiles['C:'+name]={position:['','fore','back','either'][Math.floor(random()*4)],courtPreference:['','baseline','net','either'][Math.floor(random()*4)],restPreference:['','rest','continuous','flexible'][Math.floor(random()*4)]};
 for(const mode of ['fixed','free','partial'])for(const plan of pairing.generate(data,profiles,{mode,fixedPairs:[['우디','한치']]})){
  assert.deepEqual(pairing.validatePlan(data,plan),[]);
  assert.deepEqual(pairing.restViolations(data,plan.matches,profiles),[]);
  assert.deepEqual(pairing.opponentViolations(data,plan.matches),[]);
 }
}
// Regressions: resting players cannot be assigned a late three-game run, including with a fixed partner who prefers continuous play.
for(const scenario of ['blank','rest','mixed']){
 const profiles=Object.fromEntries(Object.keys(data.teams.C).map(name=>['C:'+name,{restPreference:scenario==='rest'?'rest':scenario==='mixed'?(['우디','한치'].includes(name)?'rest':'continuous'):''}]));
 for(const mode of ['fixed','free','partial'])for(const plan of pairing.generate(data,profiles,{mode,fixedPairs:[['우디','한치']]})){
  assert.deepEqual(pairing.restViolations(data,plan.matches,profiles),[]);
  assert.deepEqual(pairing.opponentViolations(data,plan.matches),[]);
 }
}
const triple=[{time:'14:30',endTime:'15:00',pair:['우디','한치']},{time:'15:00',endTime:'15:30',pair:['우디','한치']},{time:'15:30',endTime:'16:00',pair:['우디','한치']}];
assert.deepEqual(pairing.restViolations(data,triple,{'C:우디':{restPreference:'rest'}}),['우디']);
assert.deepEqual(pairing.restViolations(data,triple,{'C:우디':{restPreference:'continuous'}}),[]);
assert.deepEqual(pairing.restViolations(data,triple.map((match,index)=>index===2?{...match,time:'16:00',endTime:'16:30'}:match),{'C:우디':{restPreference:'rest'}}),[]);
const strong=pairing.generate(data,{}, {mode:'free'}).at(-1);
assert.ok(strong.matches.filter(match=>match.pair.includes('우디')).every(match=>match.pair.some(name=>name!=='우디'&&data.teams.C[name].tier==='thirty')));
const oldPlan={...normal,algorithmVersion:'pairing-v1',strategy:'stamina'};assert.deepEqual(pairing.validatePlan(data,oldPlan),[]);
console.log('PASS: 세 운영 모드·밸런스 2안·강강 1안, 휴식 선수 최대 2연속, 상대 조별 1~2경기, 고정 유지·결정적 추천');
