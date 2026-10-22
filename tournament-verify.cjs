'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const data=require('./data.js'),model=require('./tournament-model.js');
const ids=(team,...names)=>names.map(name=>team+':'+name);
function match(team,number){return model.matchesFor(data,team).find(row=>row.sides.some(side=>side.team===team&&side.number===number)).id;}
function record(records,team,number,pair){return model.withRecord(records,match(team,number),team,pair);}
function fullB(){
 const all=model.candidates(data,{},match('B',1),'B').pairs,rows=model.matchesFor(data,'B');
 function fill(index,records,remaining){
  if(index===20)return records;
  for(let i=0;i<remaining.length;i++){
   const next=model.withRecord(records,rows[index].id,'B',remaining[i]);
   if(model.validateRecords(data,next).length)continue;
   const output=fill(index+1,next,remaining.filter((_,j)=>j!==i));if(output)return output;
  }
  return null;
 }
 return fill(0,{},all);
}
const bComplete=fullB();
test('공식 전체 40경기는 12개 시간과 네 코트를 사용하고 기존 C20 배정과 일치한다',()=>{
 assert.equal(data.tournamentSchedule.length,40);assert.equal(new Set(data.tournamentSchedule.map(row=>row.time)).size,12);
 assert.equal(new Set(data.tournamentSchedule.map(row=>row.id)).size,40);
 const cells=new Set();for(const row of data.tournamentSchedule){assert.ok(row.court>=1&&row.court<=4);assert.equal(row.sides.length,2);assert.equal(new Set(row.teams).size,2);assert.ok(!cells.has(row.time+row.court));cells.add(row.time+row.court);}
 for(const team of ['A','B','C','D'])assert.deepEqual(model.matchesFor(data,team).map(row=>row.sides.find(s=>s.team===team).number),Array.from({length:20},(_,i)=>i+1));
 for(const original of data.schedule){const row=model.matchesFor(data,'C')[original.id-1];assert.equal(row.time,original.time);assert.equal(row.endTime,original.endTime);assert.equal(row.court,original.court);assert.equal(row.sides.find(s=>s.team!=='C').team,original.team);}
 assert.deepEqual(data.tournamentSchedule.at(-1),{id:'m40',time:'16:30',endTime:'17:00',court:1,sides:[{team:'B',number:20},{team:'D',number:20}],teams:['B','D']});
});
test('알려진 등록 선수 두 명, 팀 소속, 러브·러브 금지와 역순 중복을 검증한다',()=>{
 const one=record({},'A',1,ids('A','펩시','동글'));assert.deepEqual(model.validateRecords(data,one),[]);
 for(const pair of [ids('A','송이','올리버'),ids('A','펩시','펩시'),ids('A','펩시','미등록'),['A:펩시','B:감자'],['펩시','동글']])assert.ok(model.validateRecords(data,record({},'A',1,pair)).length);
 assert.ok(model.validateRecords(data,record(one,'A',3,ids('A','동글','펩시'))).some(error=>error.includes('조합')));
 assert.ok(model.validateRecords(data,{[match('A',1)]:{C:ids('C','우디','냉면')}}).length);
 assert.ok(model.validateRecords(data,{unknown:{A:ids('A','펩시','동글')}}).length);
});
test('양쪽 중 한 팀만 관찰해 저장하며 C 계획 출전표를 자동 기록하지 않는다',()=>{
 const one=record({},'A',1,ids('A','펩시','동글'));assert.equal(Object.values(one).length,1);assert.equal(one[match('A',1)].B,undefined);
 assert.deepEqual(model.decodeTeam(data,'C',model.encodeTeam(data,one,'C')),{});
 assert.deepEqual(model.validateRecords(data,{}),[]);
});
test('같은 시간 두 코트 출전과 일반 팀 여섯 번째 출전을 금지한다',()=>{
 let records=record({},'A',4,ids('A','펩시','동글'));
 assert.ok(model.validateRecords(data,record(records,'A',5,ids('A','펩시','달래'))).some(error=>error.includes('같은 시간')));
 records={};const numbers=[1,3,4,6,8,10],partners=['동글','달래','찐빵','묭','룽지','송이'];
 for(let index=0;index<5;index++)records=record(records,'A',numbers[index],ids('A','펩시',partners[index]));
 assert.deepEqual(model.validateRecords(data,records),[]);
 assert.ok(model.validateRecords(data,record(records,'A',numbers[5],ids('A','펩시',partners[5]))).some(error=>error.includes('횟수')));
});
test('B조는 포티 포함 전원 최대 여섯 경기이며 7명으로 20개 고유 조합을 편성할 수 있다',()=>{
 assert.ok(bComplete);assert.equal(Object.keys(bComplete).length,20);assert.deepEqual(model.validateRecords(data,bComplete),[]);
 const ledger=model.encodeTeam(data,bComplete,'B').appearances;
 assert.equal(ledger['B:새벽'].length,6);assert.equal(ledger['B:감자'].length,6);assert.equal(ledger['B:땡이'].length,5);assert.equal(model.playerCap(data,'B','B:새벽'),6);
 const modified={...data,teams:{...data.teams,B:{...data.teams.B,추가선수:{tier:'thirty'}}}};
 let records={};for(const [index,name] of ['감자','망빙','둡','몽','땡이','찹','추가선수'].entries())records=record(records,'B',[1,2,4,6,8,10,12][index],ids('B','새벽',name));
 assert.ok(model.validateRecords(modified,records).some(error=>error.includes('횟수')));
});
test('후보는 고유 조합·동시간 선수·잔여 횟수를 반영하고 편집과 삭제 후 복구된다',()=>{
 const empty=model.candidates(data,{},match('A',4),'A');assert.equal(empty.count,27);assert.equal(empty.showPairs,false);assert.equal(empty.unknownCount,20);
 const records=record({},'A',4,ids('A','펩시','동글'));
 const sameTime=model.candidates(data,records,match('A',5),'A');assert.ok(sameTime.pairs.every(pair=>!pair.includes('A:펩시')&&!pair.includes('A:동글')));
 const later=model.candidates(data,records,match('A',6),'A');assert.ok(later.pairs.every(pair=>model.pairKey(pair)!==model.pairKey(ids('A','동글','펩시'))));
 assert.ok(model.candidates(data,records,match('A',4),'A').pairs.some(pair=>model.pairKey(pair)===model.pairKey(ids('A','펩시','동글'))));
 assert.equal(model.candidates(data,records,match('A',4),'A',{editing:false}).showPairs,false);
 assert.deepEqual(model.candidates(data,record(records,'A',4,null),match('A',4),'A').pairs,empty.pairs);
});
test('후보 표시 임계값은 경기 시간이 아닌 실제 조합 수 5개 이하이며 누락 관찰을 알린다',()=>{
 for(const removeCount of [1,5,6]){
  const records={...bComplete},missing=model.matchesFor(data,'B').slice(-removeCount);for(const row of missing)delete records[row.id];
  const output=model.candidates(data,records,missing[0].id,'B');
  assert.equal(output.showPairs,output.count<=5);assert.equal(output.conditional,true);assert.equal(output.knownCount,20-removeCount);assert.equal(output.unknownCount,removeCount);
 }
 const last=match('B',20),nineteen={...bComplete};delete nineteen[last];const one=model.candidates(data,nineteen,last,'B');assert.equal(one.count,1);assert.equal(one.showPairs,true);
 const invalid=record(record({},'A',1,ids('A','펩시','동글')),'A',3,ids('A','동글','펩시'));
 const bad=model.candidates(data,invalid,match('A',20),'A');assert.ok(bad.errors.length);assert.equal(bad.showPairs,false);
});
function firestore(){
 const entries=new Map();let tail=Promise.resolve();
 const api={db:{},doc:(_,collection,id)=>({path:collection+'/'+id}),serverTimestamp:()=>({seconds:1}),runTransaction:(_,callback)=>{const task=tail.then(async()=>{const writes=[];const result=await callback({get:async ref=>({exists:()=>entries.has(ref.path),data:()=>entries.get(ref.path)}),set:(ref,value)=>writes.push([ref.path,value])});for(const [path,value] of writes)entries.set(path,value);return result;});tail=task.catch(()=>{});return task;}};
 return {entries,api,store:model.createFirestoreStore({data,...api})};
}
test('명시적 기록 저장만 원자적으로 쓰고 오래된 편집과 동시 중복을 거절한다',async()=>{
 const f=firestore(),target=match('A',1);assert.equal(f.entries.size,0);
 await assert.rejects(f.store.save(target,'A',ids('A','펩시','동글'),0,null),error=>error.code==='unauthenticated');
 const attempts=await Promise.allSettled([f.store.save(target,'A',ids('A','펩시','동글'),0,'one'),f.store.save(match('A',3),'A',ids('A','동글','펩시'),0,'two')]);
 assert.equal(attempts.filter(result=>result.status==='fulfilled').length,1);assert.equal(attempts.find(result=>result.status==='rejected').reason.code,'conflict');
 await assert.rejects(f.store.save(match('A',3),'A',ids('A','동글','펩시'),1,'two'),error=>error.code==='invalid-argument');
 assert.equal(f.entries.get('tournamentObservations/A').revision,1);
 const edit=await f.store.save(target,'A',ids('A','펩시','달래'),1,'one');assert.equal(edit.revision,2);
 await f.store.save(target,'A',null,2,'one');assert.deepEqual(model.decodeTeam(data,'A',f.entries.get('tournamentObservations/A')),{});
 await f.store.save(target,'A',null,3,'one');assert.equal(f.entries.get('tournamentObservations/A').revision,4);
 assert.deepEqual(f.entries.get('tournamentObservations/A').appearances['A:펩시'],[]);
});
test('Firestore 저장 형태는 중첩 배열 없이 전체 B 기록과 별칭을 왕복한다',()=>{
 const value=model.encodeTeam(data,bComplete,'B');assert.equal(Object.keys(value.slots).length,20);assert.ok(Object.values(value.slots).every(entry=>!Array.isArray(entry)&&Array.isArray(entry.players)&&entry.players.length===2));assert.equal(Object.keys(value.pairKeys).length,20);assert.deepEqual(model.decodeTeam(data,'B',value),Object.fromEntries(Object.entries(bComplete).map(([id,sides])=>[id,{B:[...sides.B].sort()}])));
 const d=record({},'D',20,ids('D','아르(시트: 야르)','스노'));assert.deepEqual(model.decodeTeam(data,'D',model.encodeTeam(data,d,'D'))[match('D',20)].D,['D:스노','D:아르(시트: 야르)'].sort());
});
test('규칙은 실제 명단·20슬롯·정확한 출전 원장·동시간·고유 조합·버전·서버 시각을 제한한다',()=>{
 const rules=fs.readFileSync('firestore.rules','utf8');
 for(const text of ['match /tournamentObservations/{team}','record.changedSlot in legalSlots','record.slots.diff(previous.slots).affectedKeys().hasOnly([slot])','record.pairKeys.diff(previous.pairKeys).affectedKeys().hasOnly([slot])','record.pairKeys.values().toSet().size() == record.pairKeys.size()','record.updatedAt == request.time','record.updatedBy == request.auth.uid','record.revision == previous.revision + 1','int(slot) in record.appearances[pair[0]]','int(slot) in record.appearances[pair[1]]','team == \'B\' ? 6 : 5'] )assert.ok(rules.includes(text),text);
 for(const team of ['A','B','C','D'])for(const id of model.roster(data,team))assert.ok(rules.includes("'"+id+"'"));
});
function cloudFixture({deniedTeam=null}={}){
 const f=firestore(),subscriptions=[],events=[],window={BOARD_DATA:data,TOURNAMENT_MODEL:model,PLAYER_PROFILE_MODEL:require('./profile-model.js'),PLAYER_PROFILES:{all:()=>({}),has:()=>false},PAIRING_MODEL:{validateLineup:()=>[]},GEMINI_CONFIG:{},GEMINI_ANALYSIS:{createFirestoreStore:()=>({}),createService:()=>async()=>({}),normalizeError:error=>error},addEventListener(){},dispatchEvent:event=>events.push(event)};
 const snapshot=ref=>ref.collection?{docs:[]}:{exists:()=>f.entries.has(ref.path),data:()=>f.entries.get(ref.path)};
 const source=fs.readFileSync('firebase-cloud.js','utf8').replace(/^import .*;\n/gm,'');
 const context={window,console:{warn(){},error(){}},localStorage:{getItem:()=>null,setItem(){}},CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},initializeApp:()=>({}),getAuth:()=>({currentUser:{uid:'test-user'}}),getFirestore:()=>f.api.db,collection:(_,path)=>({path,collection:true}),doc:f.api.doc,runTransaction:f.api.runTransaction,serverTimestamp:f.api.serverTimestamp,Timestamp:{},getDocs:async()=>({docs:[]}),onSnapshot:(ref,callback,onError)=>{const item={ref,callback,onError};subscriptions.push(item);queueMicrotask(()=>{if(ref.path==='tournamentObservations/'+deniedTeam)onError({code:'permission-denied'});else callback(snapshot(ref));});return ()=>{item.stopped=true;};}};
 vm.runInNewContext(source,context,{filename:'firebase-cloud.js'});
 return {...f,window,events,subscriptions,flush:async()=>{for(let i=0;i<40;i++)await Promise.resolve();},broadcast:()=>{for(const item of subscriptions)if(!item.stopped)item.callback(snapshot(item.ref));},fail:team=>subscriptions.find(item=>item.ref.path==='tournamentObservations/'+team&&!item.stopped).onError({code:'permission-denied'})};
}
test('실제 cloud 모듈은 빈 관찰을 생성하지 않고 새로고침·다른 창에서 명시적 기록을 읽는다',async()=>{
 const cloud=cloudFixture();await cloud.flush();const state=cloud.window.PLAYER_PROFILE_CLOUD;
 assert.equal(state.status,'ready');assert.equal(state.opponentRecordsReady,true);assert.equal(state.lineupReady,true);assert.equal(cloud.entries.size,0);
 const target=match('A',1);await state.saveOpponentRecord(target,'A',ids('A','펩시','동글'),0);cloud.broadcast();
 assert.equal(state.opponentRecordRevisions.A,1);assert.equal(state.opponentRecords[target].A.length,2);assert.ok(cloud.events.some(event=>event.type==='opponentrecordschange'));
 // Reconstruct the records using another client's independent store, with no browser cache.
 const another=model.createFirestoreStore({data,...cloud.api});await assert.rejects(another.save(target,'A',ids('A','펩시','달래'),0,'second-user'),error=>error.code==='conflict');
 const reloaded=model.decodeTeam(data,'A',cloud.entries.get('tournamentObservations/A'));assert.deepEqual(reloaded[target].A,ids('A','동글','펩시'));
});
test('관찰 구독 권한 오류는 기존 프로필·C 확정표 준비 상태를 손상시키지 않으며 독립 재시도한다',async()=>{
 const cloud=cloudFixture({deniedTeam:'A'});await cloud.flush();const state=cloud.window.PLAYER_PROFILE_CLOUD;
 assert.equal(state.status,'ready');assert.equal(state.lineupReady,true);assert.equal(state.opponentRecordsReady,false);assert.equal(state.opponentRecordsError,'permission-denied');
 await state.saveLineup({fixedPairs:[]},0);assert.equal(cloud.entries.get('teamLineups/C').revision,1);
 await assert.rejects(state.saveOpponentRecord(match('A',1),'A',ids('A','펩시','동글'),0));
 // Later successful unrelated snapshots cannot turn a failed observation subscription ready.
 cloud.subscriptions.find(item=>item.ref.path==='tournamentObservations/B').callback({exists:()=>false});assert.equal(state.opponentRecordsReady,false);assert.equal(state.opponentRecordsError,'permission-denied');
 state.retryOpponentRecords();for(const item of cloud.subscriptions.filter(item=>!item.stopped&&item.ref.path.startsWith('tournamentObservations/')))item.callback({exists:()=>false});
 assert.equal(state.opponentRecordsReady,true);assert.equal(state.opponentRecordsError,'');
});
