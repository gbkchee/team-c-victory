'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const data=require('./data.js'),model=require('./profile-model.js');
const {createService,openAIResponse,validateResult,AnalysisError}=require('./functions/analysis-service.cjs');
const {createFirestoreStore}=require('./functions/firestore-store.cjs');
function fakeFirestore(){
 const entries=new Map();let tail=Promise.resolve();
 const snapshot=ref=>({exists:entries.has(ref.path),data:()=>entries.get(ref.path)});
 return {entries,doc:path=>({path}),getAll:async(...refs)=>refs.map(snapshot),runTransaction:callback=>{
  const task=tail.then(async()=>{const writes=[];const result=await callback({get:async ref=>snapshot(ref),set:(ref,value)=>writes.push([ref.path,value])});for(const [key,value] of writes)entries.set(key,value);return result;});tail=task.catch(()=>{});return task;
 }};
}
function fixture(generate,options={}){
 const db=fakeFirestore(),ids=['C:우디','C:숭','A:동글','A:펩시'];
 const profiles=ids.map(id=>({id,tier:data.teams[id[0]][id.slice(2)].tier,profile:model.cleanProfile(id[0]==='C'?{position:id.endsWith('우디')?'fore':'back',courtPreference:'baseline'}:{keywords:[{kind:'pattern',text:'로브 자주 사용'},{kind:'weak',text:'낮은 발리'}],legacyStrengths:['포핸드']},id[0])}));
 for(const player of profiles){const p={...player.profile};delete p.traits;db.entries.set('playerProfilesV2/'+player.id,{profile:p});if(player.id[0]==='C')db.entries.set('playerTraits/'+player.id,{items:[]});}
 const store=createFirestoreStore(db,model,data,()=>({serverTimestamp:true}));
 const service=createService({data,model,store,generate,...options});
 const request=()=>({ownPlayerIds:ids.slice(0,2),opponentPlayerIds:ids.slice(2),expectedProfileHash:model.profileVersion(profiles)});
 const change=()=>{profiles[0].profile.traits.push('특징 '+profiles[0].profile.traits.length);db.entries.set('playerTraits/'+profiles[0].id,{items:profiles[0].profile.traits});};
 return {db,store,service,request,change,profiles};
}
const validResult={direction:'입력한 리턴 자리와 상대 로브 패턴을 함께 확인하세요.',tactics:[{title:'로브 패턴 확인',action:'초반에 로브의 높이와 깊이를 확인하세요.',basis:'상대 기록: 로브 자주 사용'}],roles:[{playerId:'C:우디',action:'앞뒤 커버를 함께 정하세요.'},{playerId:'C:숭',action:'로브 담당을 함께 정하세요.'}],checks:['무리 없이 사용할 수 있는 샷인지 확인하세요.']};
const errorCode=code=>error=>error instanceof AnalysisError&&error.code===code;
test('인증·선택·최신 버전을 확인하고 오래된 강점은 AI에 보내지 않는다',async()=>{
 let calls=0;const f=fixture(async context=>{calls++;assert.ok(context.players.every(player=>!Object.hasOwn(player.profile,'legacyStrengths')));return validResult;});
 await assert.rejects(f.service(f.request(),null),errorCode('unauthenticated'));
 for(const patch of [{ownPlayerIds:['C:우디','C:우디']},{ownPlayerIds:['C:꿉','C:한치']},{opponentPlayerIds:['A:동글','B:감자']},{opponentPlayerIds:['A:동글','A:없음']},{opponentPlayerIds:['A:송이','A:올리버']}])await assert.rejects(f.service({...f.request(),...patch},'user'),errorCode('invalid-argument'));
 await assert.rejects(f.service({...f.request(),expectedProfileHash:'0000000000000000'},'user'),errorCode('failed-precondition'));
 assert.equal(calls,0);const result=await f.service(f.request(),'user');assert.equal(result.status,'ready');assert.equal(calls,1);
});
test('공동 캐시 재사용과 프로필 변경에 따른 무효화',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;return validResult;});
 const first=await f.service(f.request(),'one'),cached=await f.service(f.request(),'two');
 assert.equal(cached.cached,true);assert.equal(first.analysisKey,cached.analysisKey);assert.equal(calls,1);
 const stale=f.request();f.change();await assert.rejects(f.service(stale,'one'),errorCode('failed-precondition'));
 const next=await f.service(f.request(),'one');assert.notEqual(first.analysisKey,next.analysisKey);assert.equal(calls,2);
});
test('시트 별칭에 콜론이 포함된 D조 선수도 분석할 수 있다',async()=>{
 const f=fixture(async context=>{assert.ok(context.players.some(player=>player.id==='D:아르(시트: 야르)'));return validResult;});
 const ids=['C:우디','C:숭','D:아르(시트: 야르)','D:스노'];
 for(const id of ids.slice(2))f.db.entries.set('playerProfilesV2/'+id,{profile:model.cleanProfile(null,'D')});
 const players=await f.store.loadPlayers(ids);
 const result=await f.service({ownPlayerIds:ids.slice(0,2),opponentPlayerIds:ids.slice(2),expectedProfileHash:model.profileVersion(players)},'one');
 assert.equal(result.status,'ready');
});
test('동시 요청은 한 번만 생성하고 대기 결과를 공유한다',async()=>{
 let release,started;const barrier=new Promise(resolve=>{release=resolve;}),begin=new Promise(resolve=>{started=resolve;});let calls=0;
 const f=fixture(async()=>{calls++;started();await barrier;return validResult;});
 const first=f.service(f.request(),'one');await begin;
 const second=await f.service(f.request(),'two');assert.equal(second.status,'pending');assert.equal(calls,1);
 release();const completed=await first;assert.equal(completed.analysisKey,second.analysisKey);
 assert.equal((await f.service(f.request(),'three')).cached,true);
 assert.equal([...f.db.entries].filter(([key])=>key.startsWith('aiUsage/'))[0][1].count,1);
});
test('일일 한도 이후에도 캐시 결과를 사용할 수 있다',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;return validResult;},{dailyLimit:2});
 const old=f.request();await f.service(old,'one');f.change();await f.service(f.request(),'one');f.change();
 await assert.rejects(f.service(f.request(),'one'),errorCode('resource-exhausted'));assert.equal(calls,2);
 // Cached reads have no extra budget reservation.
 f.profiles[0].profile.traits=[];f.db.entries.set('playerTraits/C:우디',{items:[]});assert.equal((await f.service(old,'two')).cached,true);
});
test('실패 후 재시도와 잘못된 응답 처리를 지원한다',async()=>{
 let calls=0;const f=fixture(async()=>{if(++calls===1)throw new AnalysisError('unavailable','다시 시도');return validResult;});
 await assert.rejects(f.service(f.request(),'one'),errorCode('unavailable'));
 assert.equal([...f.db.entries].find(([key])=>key.startsWith('matchupAnalyses/'))[1].status,'error');
 assert.equal((await f.service(f.request(),'one')).status,'ready');assert.equal(calls,2);
 const invalid=fixture(async()=>({...validResult,roles:[{playerId:'A:펩시',action:'invalid'},validResult.roles[1]]}));
 await assert.rejects(invalid.service(invalid.request(),'one'),errorCode('internal'));
 assert.throws(()=>validateResult({...validResult,direction:''},['C:우디','C:숭']),errorCode('internal'));
});
test('기한이 지난 작업의 늦은 응답이 새 작업을 덮어쓰지 않는다',async()=>{
 const f=fixture(async()=>validResult),key='a'.repeat(64),base={analysisKey:key,version:'v',modelName:'m',promptVersion:'p',day:'2026-10-08',limit:50};
 await f.store.claim({...base,now:0,attempt:'old'});await f.store.claim({...base,now:90001,attempt:'new'});
 await f.store.complete(key,'old',{status:'ready',result:{wrong:true}});assert.equal(f.db.entries.get('matchupAnalyses/'+key).attempt,'new');
 await f.store.complete(key,'new',{status:'ready',result:validResult});assert.deepEqual(f.db.entries.get('matchupAnalyses/'+key).result,validResult);
});
test('Responses API 요청 형식·출력 제한과 오류 응답',async()=>{
 const context={ownPlayerIds:['C:우디','C:숭'],players:[]};
 const options={modelName:'gpt-5.6-terra',schema:{type:'object'},apiKey:'test-only-key'};
 const result=await openAIResponse(context,{...options,fetcher:async(url,request)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(request.body);assert.equal(body.store,false);assert.equal(body.max_output_tokens,2000);assert.equal(body.text.format.strict,true);assert.equal(body.reasoning.effort,'none');assert.ok(!Object.hasOwn(body,'tools'));
  return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(validResult)}]}]})};
 }});assert.deepEqual(result,validResult);
 for(const [status,code] of [[401,'failed-precondition'],[429,'resource-exhausted'],[503,'unavailable']])await assert.rejects(openAIResponse(context,{...options,fetcher:async()=>({ok:false,status})}),errorCode(code));
 await assert.rejects(openAIResponse(context,{...options,fetcher:async()=>{const error=new Error();error.name='TimeoutError';throw error;}}),errorCode('deadline-exceeded'));
 for(const body of [{status:'incomplete'},{output:[{content:[{type:'refusal'}]}]},{output:[{content:[{type:'output_text',text:'broken json'}]}]}])await assert.rejects(openAIResponse(context,{...options,fetcher:async()=>({ok:true,json:async()=>body})}));
});
