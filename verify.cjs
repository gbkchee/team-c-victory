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
const {cleanProfile,profileVersion,fingerprint}=require('./profile-model.js');
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
const clone=value=>JSON.parse(JSON.stringify(value));
const names=Object.keys(data.teams.C);
const assertEvenDistribution=plan=>{
 const groups=[...new Set(data.schedule.map(match=>match.time))].sort().map(time=>data.schedule.find(match=>match.time===time));
 const rows=names.map(name=>({name,bits:groups.map(group=>Number(plan.matches.some(match=>match.time===group.time&&match.pair.includes(name))))}));
 for(const {name,bits} of rows){
  assert.equal(bits.reduce((sum,on)=>sum+on,0),5);
  let last=-1,run=0;
  for(let index=0;index<bits.length;index++){run=bits[index]===last&&index&&groups[index-1].endTime===groups[index].time?run+1:1;last=bits[index];assert.ok(run<=2,name+'의 연속 출전/휴식은 최대 2타임');}
 }
 for(let through=1;through<=groups.length;through++){
  const counts=rows.map(({bits})=>bits.slice(0,through).reduce((sum,on)=>sum+on,0));
  assert.ok(Math.max(...counts)-Math.min(...counts)<=1,groups[through-1].time+'까지 출전 횟수 차이는 최대 1경기');
 }
};
const assertPlan=(plan,profiles={},locks=[])=>{
 assert.deepEqual(pairing.validatePlan(data,plan),[]);
 assert.equal(new Set(plan.matches.map(match=>pairing.pairKey(match.pair))).size,20);
 assert.deepEqual(pairing.restViolations(data,plan.matches,profiles),[]);
 assert.deepEqual(pairing.opponentViolations(data,plan.matches),[]);
 assertEvenDistribution(plan);
 for(const slot of data.schedule){const match=plan.matches.find(match=>match.id===slot.id);for(const key of ['time','endTime','court','team'])assert.equal(match[key],slot[key]);}
 for(const pair of locks)assert.equal(plan.matches.filter(match=>pairing.pairKey(match.pair)===pairing.pairKey(pair)).length,1);
};
assert.equal(pairing.partitions(data).length,90);
assert.equal(pairing.algorithmVersion,'pairing-v6');
const fixture={};names.forEach((name,i)=>fixture['C:'+name]={position:i%2?'fore':'back',courtPreference:i%2?'net':'baseline',style:i%2?'attack':'defense',partnerRoles:[i%2?'cover':'attack'],restPreference:i%3===0?'rest':i%3===1?'continuous':'flexible'});
const partialLocks=[['우디','꿉'],['우디','한치'],['꿉','냉면']];
for(const mode of ['free','partial']){
 const locks=mode==='partial'?partialLocks:[],options={mode,fixedPairs:locks},plans=pairing.generate(data,fixture,options);
 assert.deepEqual(plans.map(plan=>plan.strategy),['balance','balance','win']);
 assert.equal(new Set(plans.map(pairSet)).size,3,'후보 간 페어 구성도 달라야 함');
 for(const plan of plans)assertPlan(plan,fixture,locks);
 assert.deepEqual(pairing.generate(data,fixture,options),plans);
}
const standard=pairing.generate(data,{}, {mode:'free'});
assert.ok(standard.at(-1).matches.filter(match=>match.pair.includes('우디')).every(match=>match.pair.some(name=>name!=='우디'&&data.teams.C[name].tier==='thirty')),'강강 후보는 가능한 높은 등급의 서로 다른 파트너를 우선');
assert.notDeepEqual(pairing.generate(data,fixture,{mode:'free'}).map(plan=>plan.matches),standard.map(plan=>plan.matches),'선호 프로필을 편성에 반영');
for(const fixedPairs of [[],[['꿉','한치']],[['우디','우디']],[['없는 선수','우디']],[['우디','숭'],['숭','우디']],names.filter(name=>name!=='우디').slice(0,6).map(name=>['우디',name]),Array.from({length:21},()=>['우디','숭'])])assert.throws(()=>pairing.generate(data,{}, {mode:'partial',fixedPairs}));
const fiveLocks=names.filter(name=>name!=='우디').slice(0,5).map(name=>['우디',name]);
for(const plan of pairing.generate(data,fixture,{mode:'partial',fixedPairs:fiveLocks}))assertPlan(plan,fixture,fiveLocks);
// Large lists may share players; a complete prescribed graph produces only one pair-set candidate.
for(const count of [10,18,19,20]){
 const locks=standard[0].matches.slice(0,count).map(match=>match.pair),plans=pairing.generate(data,{}, {mode:'partial',fixedPairs:locks});
 for(const plan of plans)assertPlan(plan,{},locks);
 assert.equal(new Set(plans.map(pairSet)).size,plans.length);
 if(count===20)assert.equal(plans.length,1);
}
// Impossible required graph: six non-love players all already have five mutual edges,
// leaving the two love players unable to reach five appearances.
const nonLove=names.filter(name=>data.teams.C[name].tier!=='love'),closed=[];
for(let a=0;a<nonLove.length;a++)for(let b=a+1;b<nonLove.length;b++)closed.push([nonLove[a],nonLove[b]]);
assert.throws(()=>pairing.generate(data,{}, {mode:'partial',fixedPairs:closed}),/조합이 없습니다/);
const normal=standard[0];
for(const mutate of [p=>p.matches[0].pair=['꿉','한치'],p=>p.matches[0].pair=['우디','우디'],p=>p.matches[0].court=1,p=>p.matches[0]=null,p=>p.fixedPairs='invalid',p=>p.matches.pop(),p=>p.matches[1].id=p.matches[0].id,p=>p.matches[1].pair=[...p.matches[0].pair]]){
 const broken=clone(normal);mutate(broken);assert.ok(pairing.validatePlan(data,broken).length);
}
// The historical fixed generator remains available internally, while active validation
// rejects its repeated pair sets under every old or missing version string.
const legacy=pairing.generate(data,{}, {mode:'fixed'})[0];
assert.equal(new Set(legacy.matches.map(match=>pairing.pairKey(match.pair))).size,4);
for(const algorithmVersion of [undefined,'pairing-v1','pairing-v4',pairing.algorithmVersion]){
 assert.ok(pairing.validatePlan(data,{...legacy,algorithmVersion}).length);
 assert.ok(pairing.validatePlan(data,{...legacy,mode:'free',fixedPairs:[],algorithmVersion}).some(error=>error.includes('20개 페어')));
 const invalidTiming=clone(normal);invalidTiming.algorithmVersion=algorithmVersion;[invalidTiming.matches[0].pair,invalidTiming.matches[10].pair]=[invalidTiming.matches[10].pair,invalidTiming.matches[0].pair];assert.ok(pairing.validatePlan(data,invalidTiming).length);
}
const absentPair=names.flatMap((name,index)=>names.slice(index+1).map(other=>[name,other])).find(pair=>pairing.legalPair(data,pair)&&!normal.matches.some(match=>pairing.pairKey(match.pair)===pairing.pairKey(pair)));
const missingLock={...normal,mode:'partial',fixedPairs:[{pair:absentPair}]};
assert.ok(pairing.validatePlan(data,missingLock).some(error=>error.includes('지정 페어')));
let validSwap=null,invalidSwap=null;
for(let first=1;first<=20;first++)for(let second=first+1;second<=20;second++){
 try{const result=pairing.swapPairs(data,normal,first,second);if(!pairing.validatePlan(data,result).length)validSwap??={first,second,result};}catch(error){invalidSwap??={first,second,error};}
}
assert.ok(validSwap);assert.ok(invalidSwap);assertPlan(validSwap.result);
assert.equal(pairSet(validSwap.result),pairSet(normal));
assert.deepEqual(validSwap.result.matches.find(match=>match.id===validSwap.first).pair,normal.matches.find(match=>match.id===validSwap.second).pair);
assert.notEqual(validSwap.result,normal);assert.notEqual(validSwap.result.matches[0],normal.matches[0]);
const before=clone(normal);assert.throws(()=>pairing.swapPairs(data,normal,invalidSwap.first,invalidSwap.second),/페어 교환 불가/);assert.deepEqual(clone(normal),before);
assert.throws(()=>pairing.swapPairs(data,normal,1,1),/서로 다른/);assert.throws(()=>pairing.swapPairs(data,normal,1,999),/경기 번호/);assert.throws(()=>pairing.swapPairs(data,legacy,1,2));
let randomSeed=7;const random=()=>((randomSeed=Math.imul(randomSeed,1664525)+1013904223>>>0)/4294967296);
for(let trial=0;trial<12;trial++){
 const profiles={};for(const name of names)profiles['C:'+name]={position:['','fore','back','either'][Math.floor(random()*4)],courtPreference:['','baseline','net','either'][Math.floor(random()*4)],style:['','attack','defense','balance'][Math.floor(random()*4)],partnerRoles:[['cover','attack','connect','tactics','encourage'][Math.floor(random()*5)]],restPreference:['','rest','continuous','flexible'][Math.floor(random()*4)]};
 for(const mode of ['free','partial']){
  const locks=mode==='partial'?partialLocks:[],plans=pairing.generate(data,profiles,{mode,fixedPairs:locks});
  assert.equal(plans.length,3);assert.equal(new Set(plans.map(pairSet)).size,3);
  for(const plan of plans)assertPlan(plan,profiles,locks);
 }
}
for(const scenario of ['blank','rest','mixed','continuous']){
 const profiles=Object.fromEntries(names.map((name,index)=>['C:'+name,{restPreference:scenario==='rest'?'rest':scenario==='continuous'?'continuous':scenario==='mixed'?(index%2?'rest':'continuous'):''}]));
 for(const mode of ['free','partial'])for(const plan of pairing.generate(data,profiles,{mode,fixedPairs:[['우디','한치']]}))assertPlan(plan,profiles);
}
const triple=[{time:'14:30',endTime:'15:00',pair:['우디','한치']},{time:'15:00',endTime:'15:30',pair:['우디','한치']},{time:'15:30',endTime:'16:00',pair:['우디','한치']}];
assert.deepEqual(pairing.restViolations(data,triple,{'C:우디':{restPreference:'rest'}}),['우디']);
assert.deepEqual(pairing.restViolations(data,triple,{'C:우디':{restPreference:'continuous'}}),[]);
assert.deepEqual(pairing.restViolations(data,triple.map((match,index)=>index===2?{...match,time:'16:00',endTime:'16:30'}:match),{'C:우디':{restPreference:'rest'}}),[]);
console.log('PASS: 서로 다른20페어·전원5경기·요청페어1회, 겹치는1~20개 지정, 후보결정성·선호반영, 휴식/출전2·누적차이1·상대조1~2, 구버전반복거부, 페어교환·불변성');
// Browse the complete ranked graph pool in batches: scheduling is performed only
// for the consumed compositions, and page boundaries never repeat a pair set.
const firstPage=pairing.generatePage(data,{}, {mode:'free'});
assert.equal(firstPage.plans.length,2);assert.equal(firstPage.hasMore,true);assert.equal(typeof firstPage.nextCursor,'string');
assert.deepEqual(pairing.generatePage(data,{}, {mode:'free'}),firstPage);
assert.deepEqual(pairing.generatePage(data,{}, {excludedSignatures:[pairSet(firstPage.plans[0])],restorePairs:firstPage.plans[0].matches.map(match=>match.pair),paging:false}),firstPage,'공개 페이지 API는 내부 탐색 옵션을 받지 않음');
const singleFirst=pairing.generatePage(data,{}, {limit:1}),singleSecond=pairing.generatePage(data,{}, {limit:1,cursor:singleFirst.nextCursor});
assert.deepEqual([singleFirst.plans[0],singleSecond.plans[0]],firstPage.plans,'배치 크기가 달라도 전역 순서와 편성은 동일');
const terminalScope=JSON.parse(firstPage.nextCursor).scope,terminalCursor=JSON.stringify({version:1,scope:terminalScope,index:1002,check:fingerprint({scope:terminalScope,index:1002})});
assert.deepEqual(pairing.generatePage(data,{}, {cursor:terminalCursor}),{plans:[],nextCursor:null,hasMore:false});
const browseSeen=new Set();let browseCursor=null,browseCount=0,browsePages=0,lastPage;
do{
 const page=pairing.generatePage(data,{}, {mode:'free',cursor:browseCursor,limit:2});
 assert.equal(page.plans.length,2);
 for(const plan of page.plans){assertPlan(plan);const key=pairSet(plan);assert.ok(!browseSeen.has(key),'다른 페어 보기에서 이전 구성을 반복하지 않음');browseSeen.add(key);browseCount++;}
 browsePages++;browseCursor=page.nextCursor;lastPage=page;
}while(browseCursor);
assert.equal(browseCount,1002);assert.equal(browsePages,501);assert.equal(lastPage.hasMore,false);assert.equal(lastPage.nextCursor,null);
for(const cursor of ['invalid','null','{}',JSON.stringify({...JSON.parse(firstPage.nextCursor),index:0})])assert.throws(()=>pairing.generatePage(data,{}, {cursor}),error=>error.code==='PAIRING_STALE_CURSOR');
assert.throws(()=>pairing.generatePage(data,fixture,{cursor:firstPage.nextCursor}),error=>error.code==='PAIRING_STALE_CURSOR');
const changedSchedule=clone(data);changedSchedule.schedule[0].court=4;
assert.throws(()=>pairing.generatePage(changedSchedule,{}, {cursor:firstPage.nextCursor}),error=>error.code==='PAIRING_STALE_CURSOR');
const changedTier=clone(data);changedTier.teams.C['냉면'].tier='forty';
assert.throws(()=>pairing.generatePage(changedTier,{}, {cursor:firstPage.nextCursor}),error=>error.code==='PAIRING_STALE_CURSOR');
for(const limit of [0,-1,21,1.5,'2'])assert.throws(()=>pairing.generatePage(data,{}, {limit}));
const partialPage=pairing.generatePage(data,fixture,{mode:'partial',fixedPairs:partialLocks});
for(const plan of partialPage.plans)assertPlan(plan,fixture,partialLocks);
const reversedLocks=[...partialLocks].reverse().map(pair=>[...pair].reverse());
assert.deepEqual(pairing.generatePage(data,fixture,{mode:'partial',fixedPairs:partialLocks,cursor:partialPage.nextCursor}),pairing.generatePage(data,fixture,{mode:'partial',fixedPairs:reversedLocks,cursor:partialPage.nextCursor}));
assert.throws(()=>pairing.generatePage(data,fixture,{mode:'partial',fixedPairs:[['우디','숭']],cursor:partialPage.nextCursor}),error=>error.code==='PAIRING_STALE_CURSOR');
const savedPairs=firstPage.plans[0].matches.map(match=>[...match.pair]),savedBefore=clone(savedPairs);
const fullPage=pairing.generatePage(data,{}, {mode:'partial',fixedPairs:savedPairs});
assert.equal(fullPage.plans.length,1);assert.equal(fullPage.hasMore,false);assert.equal(fullPage.nextCursor,null);assertPlan(fullPage.plans[0],{},savedPairs);
const restored=pairing.restorePairSet(data,fixture,savedPairs,{mode:'free'});
assert.notEqual(restored.id,firstPage.plans[0].id);
assertPlan(restored,fixture);assert.equal(pairSet(restored),pairSet(firstPage.plans[0]));assert.deepEqual(restored.fixedPairs,[]);
assert.notEqual(restored.profileVersion,firstPage.plans[0].profileVersion);assert.equal(restored.profileVersion,pairing.generatePage(data,fixture).plans[0].profileVersion);
assert.deepEqual(clone(savedPairs),savedBefore);
const activeLocks=savedPairs.slice(0,3),restoredPartial=pairing.restorePairSet(data,fixture,savedPairs.map(pair=>({pair})),{mode:'partial',fixedPairs:activeLocks});
assertPlan(restoredPartial,fixture,activeLocks);assert.equal(restoredPartial.fixedPairs.length,3);assert.equal(pairSet(restoredPartial),pairSet(firstPage.plans[0]));
const incompatible=names.flatMap((name,index)=>names.slice(index+1).map(other=>[name,other])).find(pair=>pairing.legalPair(data,pair)&&!savedPairs.some(saved=>pairing.pairKey(saved)===pairing.pairKey(pair)));
assert.throws(()=>pairing.restorePairSet(data,{},savedPairs,{mode:'partial',fixedPairs:[incompatible]}),/현재 일부 고정.*없습니다/);
for(const pairs of [savedPairs.slice(0,19),[...savedPairs.slice(0,19),savedPairs[0]],[...savedPairs.slice(0,19),['꿉','한치']]])assert.throws(()=>pairing.restorePairSet(data,{},pairs));
assert.throws(()=>pairing.restorePairSet(data,{},savedPairs,{mode:'fixed'}));
console.log('PASS: 1002개 페어 구성 전체501페이지·반복없음·결정성·끝처리, 조건/프로필/일정/등급 변경 커서거부, 공유20페어 재편성·현재일부지정·최신프로필');
