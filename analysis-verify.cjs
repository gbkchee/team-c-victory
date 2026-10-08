'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const data=require('./data.js'),model=require('./profile-model.js');
const ai=require('./gemini-analysis.js'),{createService,createFirestoreStore,AnalysisError}=ai;
function fakeFirestore(){
 const entries=new Map();let tail=Promise.resolve(),now=Date.parse('2026-10-08T03:00:00Z');
 const snapshot=ref=>({exists:()=>entries.has(ref.path),data:()=>entries.get(ref.path)});
 const db={entries,clock:()=>now,advance:ms=>{now+=ms;},doc:(_,collection,id)=>({path:collection+'/'+id}),serverTimestamp:()=>({seconds:now/1000}),Timestamp:{fromMillis:value=>({seconds:value/1000})},runTransaction:(_,callback)=>{
  const task=tail.then(async()=>{const writes=[];const result=await callback({get:async ref=>snapshot(ref),set:(ref,value)=>writes.push([ref.path,value])});for(const [key,value] of writes)entries.set(key,value);return result;});tail=task.catch(()=>{});return task;
 }};return db;
}
function fixture(generate,options={}){
 const db=fakeFirestore(),ids=['A:동글','A:펩시'];
 const profiles=ids.map(id=>({id,tier:data.teams[id[0]][id.slice(2)].tier,profile:model.cleanProfile(id[0]==='C'?{position:id.endsWith('우디')?'fore':'back',courtPreference:'baseline'}:{keywords:[{kind:'pattern',text:'로브 자주 사용'},{kind:'weak',text:'낮은 발리'}],legacyStrengths:['포핸드']},id[0])}));
 for(const player of profiles){const p={...player.profile};delete p.traits;db.entries.set('playerProfilesV2/'+player.id,{profile:p});if(player.id[0]==='C')db.entries.set('playerTraits/'+player.id,{items:[]});}
 const store=createFirestoreStore({db,...db,model,data});
 const service=createService({data,model,store,generate,clock:db.clock,...options});
 const request=()=>({opponentPlayerIds:ids,expectedProfileHash:model.analysisVersion(profiles)});
 const change=()=>{profiles[0].profile.keywords.push({kind:'note',text:'특징 '+profiles[0].profile.keywords.length});db.entries.set('playerProfilesV2/'+profiles[0].id,{profile:profiles[0].profile});};
 return {db,store,service,request,change,profiles};
}
const tip={title:'로브 패턴 확인',action:'초반에 로브의 높이와 깊이를 확인하세요.',basis:'동글 · 로브 자주 사용'};
const validResult={summary:'상대의 로브 패턴과 낮은 발리 반응을 확인하세요.',patterns:[tip],cautions:[tip],tactics:[tip],checks:['첫 게임에서 두 선수의 역할을 확인하세요.']};
const errorCode=code=>error=>error instanceof AnalysisError&&error.code===code;
test('인증·선택·최신 버전을 확인하고 오래된 강점은 AI에 보내지 않는다',async()=>{
 let calls=0;const f=fixture(async context=>{calls++;assert.ok(context.players.every(player=>!Object.hasOwn(player.profile,'legacyStrengths')));assert.equal(context.players.length,2);assert.ok(!Object.hasOwn(context,'ownPlayerIds'));return validResult;});
 await assert.rejects(f.service(f.request(),null),errorCode('unauthenticated'));
 for(const patch of [{opponentPlayerIds:['A:동글','A:동글']},{opponentPlayerIds:['C:우디','C:숭']},{opponentPlayerIds:['A:동글','B:감자']},{opponentPlayerIds:['A:동글','A:없음']},{opponentPlayerIds:['A:송이','A:올리버']}])await assert.rejects(f.service({...f.request(),...patch},'user'),errorCode('invalid-argument'));
 await assert.rejects(f.service({...f.request(),expectedProfileHash:'0000000000000000'},'user'),errorCode('failed-precondition'));
 assert.equal(calls,0);assert.equal((await f.service(f.request(),'user')).status,'ready');assert.equal(calls,1);
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
 const ids=['D:아르(시트: 야르)','D:스노'];
 for(const id of ids)f.db.entries.set('playerProfilesV2/'+id,{profile:model.cleanProfile(null,'D')});
 const players=await f.store.loadPlayers(ids);
 assert.equal((await f.service({opponentPlayerIds:ids,expectedProfileHash:model.analysisVersion(players)},'one')).status,'ready');
});
test('동시 요청은 한 번만 생성하고 대기 결과를 공유한다',async()=>{
 let release,started;const barrier=new Promise(resolve=>{release=resolve;}),begin=new Promise(resolve=>{started=resolve;});let calls=0;
 const f=fixture(async()=>{calls++;started();await barrier;return validResult;});
 const first=f.service(f.request(),'one');await begin;
 const second=await f.service(f.request(),'two');assert.equal(second.status,'pending');assert.equal(calls,1);
 release();const completed=await first;assert.equal(completed.analysisKey,second.analysisKey);
 assert.equal((await f.service(f.request(),'three')).cached,true);
 assert.equal(f.db.entries.get('geminiAiUsage/team').count,1);
});
test('한국 날짜별 50회 한도, 다음 날 초기화와 한도 이후 캐시 사용',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;return validResult;});
 const old=f.request();await f.service(old,'one');
 f.db.entries.get('geminiAiUsage/team').count=50;f.change();
 await assert.rejects(f.service(f.request(),'one'),errorCode('resource-exhausted'));assert.equal(calls,1);
 f.profiles[0].profile.keywords.pop();f.db.entries.set('playerProfilesV2/'+f.profiles[0].id,{profile:f.profiles[0].profile});assert.equal((await f.service(old,'two')).cached,true);
 f.change();f.db.advance(86400000);await f.service(f.request(),'one');assert.equal(f.db.entries.get('geminiAiUsage/team').count,1);
 assert.equal(ai.dayStart(Date.parse('2026-10-08T14:59:59Z')),Date.parse('2026-10-08T00:00:00Z'));
 assert.equal(ai.dayStart(Date.parse('2026-10-08T15:00:00Z')),Date.parse('2026-10-09T00:00:00Z'));
});
test('App Check 설정 실패는 한도를 사용하지 않고 기존 캐시는 계속 읽는다',async()=>{
 const f=fixture(async()=>validResult);await f.service(f.request(),'one');
 const blocked=createService({data,model,store:f.store,generate:()=>assert.fail('must not call Gemini'),prepare:async()=>{throw {code:'appCheck/fetch-status-error',customData:{httpStatus:403}};}});
 assert.equal((await blocked(f.request(),'two')).cached,true);f.change();
 await assert.rejects(blocked(f.request(),'two'),error=>{assert.equal(error.code,'failed-precondition');assert.equal(error.reason,'app-check');assert.match(error.message,/appCheck\/fetch-status-error/);assert.match(error.message,/HTTP 403/);return true;});assert.equal(f.db.entries.get('geminiAiUsage/team').count,1);
});
test('실패 후 재시도와 잘못된 응답 처리를 지원한다',async()=>{
 let calls=0;const f=fixture(async()=>{if(++calls===1)throw new Error('[429 Too Many Requests]');return validResult;});
 await assert.rejects(f.service(f.request(),'one'),errorCode('resource-exhausted'));
 assert.equal([...f.db.entries].find(([key])=>key.startsWith('geminiMatchupAnalyses/'))[1].status,'error');
 assert.equal((await f.service(f.request(),'one')).status,'ready');assert.equal(calls,2);assert.equal(f.db.entries.get('geminiAiUsage/team').count,2);
 const invalid=fixture(async()=>({...validResult,patterns:[]}));
 await assert.rejects(invalid.service(invalid.request(),'one'),errorCode('internal'));
 assert.throws(()=>ai.validateResult({...validResult,summary:''},['C:우디','C:숭']),errorCode('internal'));
});
test('기한이 지난 작업의 늦은 응답이 새 작업을 덮어쓰지 않는다',async()=>{
 const f=fixture(async()=>validResult),key='a'.repeat(64),base={analysisKey:key,version:'a'.repeat(16),ownerId:'one',opponentPlayerIds:['A:동글','A:펩시'],dayStart:ai.dayStart(f.db.clock())};
 await f.store.claim({...base,now:f.db.clock(),attempt:'old'});f.db.advance(90001);await f.store.claim({...base,now:f.db.clock(),attempt:'new'});
 assert.equal(await f.store.complete(key,'old',{status:'ready',result:{wrong:true}}),false);assert.equal(f.db.entries.get('geminiMatchupAnalyses/'+key).attempt,'new');
 assert.equal(await f.store.complete(key,'new',{status:'ready',result:validResult}),true);assert.deepEqual(f.db.entries.get('geminiMatchupAnalyses/'+key).result,validResult);
});
test('45초 시간 초과 후 오류를 저장하고 재시도할 수 있다',async()=>{
 let expire;const f=fixture(()=>new Promise(()=>{}),{setTimer:callback=>{expire=callback;return 1;},clearTimer:()=>{}});
 const pending=f.service(f.request(),'one');for(let i=0;i<100;i++)await Promise.resolve();
 // Native SHA-256 runs outside the microtask queue.
 while(!expire)await new Promise(resolve=>setImmediate(resolve));expire();
 await assert.rejects(pending,errorCode('deadline-exceeded'));assert.equal([...f.db.entries].find(([key])=>key.startsWith('geminiMatchupAnalyses/'))[1].status,'error');
});
test('Gemini 구조화 응답, 제한·차단·잘못된 JSON과 SDK 오류를 처리한다',()=>{
 const Schema=Object.fromEntries(['object','array','string','enumString'].map(name=>[name,value=>({type:name,...value})]));
 const schema=ai.responseSchema(Schema);assert.equal(schema.properties.patterns.maxItems,5);assert.ok(!schema.properties.roles);
 assert.deepEqual(ai.parseResponse({text:()=>JSON.stringify(validResult),candidates:[{finishReason:'STOP'}]}),validResult);
 for(const response of [{promptFeedback:{blockReason:'SAFETY'}},{candidates:[{finishReason:'MAX_TOKENS'}]},{text:()=>'{broken'}])assert.throws(()=>ai.parseResponse(response),AnalysisError);
 for(const [error,code] of [[{status:403},'failed-precondition'],[{message:'[429 Too Many Requests]'},'resource-exhausted'],[{code:'appCheck/recaptcha-error'},'failed-precondition'],[{code:'permission-denied'},'permission-denied'],[{name:'TimeoutError'},'deadline-exceeded'],[{},'unavailable']])assert.equal(ai.normalizeError(error).code,code);
 for(const httpStatus of [400,403,429]){
  const error=ai.normalizeError({code:'appCheck/throttled',customData:{httpStatus},message:'AppCheck: private error details 429'});
  assert.equal(error.reason,'app-check');assert.match(error.message,/appCheck\/throttled/);assert.ok(error.message.includes('HTTP '+httpStatus));assert.ok(!error.message.includes('private'));assert.ok(error.message.length<=250);assert.equal(ai.normalizeError(error),error);
 }
 const initial=ai.normalizeError({code:'appCheck/initial-throttle',customData:{httpStatus:400}});
 assert.equal(initial.reason,'app-check');assert.match(initial.message,/App Check 등록 키/);assert.match(initial.message,/HTTP 400/);assert.ok(!initial.message.includes('잠시 후'));
});

test('우리팀 입력과 숨긴 강점 기록은 상대 분석 캐시를 바꾸지 않는다',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;return validResult;}),first=await f.service(f.request(),'one');
 f.db.entries.set('playerProfilesV2/C:우디',{profile:model.cleanProfile({style:'attack',traits:['새 특징']},'C')});
 f.profiles[0].profile.legacyStrengths.push('숨겨진 강점');f.db.entries.set('playerProfilesV2/'+f.profiles[0].id,{profile:f.profiles[0].profile});
 const next=await f.service(f.request(),'two');assert.equal(next.analysisKey,first.analysisKey);assert.equal(next.cached,true);assert.equal(calls,1);
});
