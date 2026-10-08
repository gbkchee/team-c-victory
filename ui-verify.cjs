'use strict';
// Dependency-free DOM/Firestore fixtures exercise the real scripts; they do not render CSS.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test'),crypto=require('node:crypto');
const read=file=>fs.readFileSync(__dirname+'/'+file,'utf8'),clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
class EventTarget {
 constructor(){this.listeners=new Map();}
 addEventListener(type,callback,options={}){const listeners=this.listeners.get(type)||[];listeners.push({callback,once:options.once});this.listeners.set(type,listeners);}
 dispatchEvent(event){event.target??=this;const results=[];for(const entry of [...(this.listeners.get(event.type)||[])]){if(entry.once)this.listeners.set(event.type,this.listeners.get(event.type).filter(item=>item!==entry));results.push(entry.callback(event));}return results;}
}
class Element extends EventTarget {
 constructor(tag,document){super();this.tagName=tag.toUpperCase();this.document=document;this.children=[];this.parentNode=null;this.attributes={};this.dataset={};this.className='';this.id='';this.value='';this.disabled=false;this.hidden=false;this._text='';this.classList={add:name=>{this.className+=' '+name;},remove:name=>{this.className=this.className.split(' ').filter(item=>item!==name).join(' ');}};}
 setAttribute(key,value){this.attributes[key]=String(value);if(key==='id')this.id=value;if(key==='class')this.className=value;if(key==='value')this.value=value;if(key==='hidden'||key==='disabled')this[key]=true;if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;}
 getAttribute(key){return this.attributes[key];}
 append(...nodes){for(const node of nodes){node.remove();node.parentNode=this;this.children.push(node);}}
 add(node){this.append(node);}
 insertBefore(node,before){if(!before){this.append(node);return;}node.remove();node.parentNode=this;this.children.splice(this.children.indexOf(before),0,node);}
 replaceChildren(...nodes){for(const child of this.children)child.parentNode=null;this.children=[];this._text='';this.append(...nodes);}
 remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(node=>node!==this);this.parentNode=null;}}
 set textContent(value){this.replaceChildren();this._text=String(value);}
 get textContent(){return this._text+this.children.map(node=>node.textContent).join('');}
 contains(node){return node===this||this.children.some(child=>child.contains(node));}
 querySelectorAll(selector){const matches=node=>selector[0]==='.'?node.className.split(' ').includes(selector.slice(1)):selector[0]==='#'?node.id===selector.slice(1):node.tagName===selector.toUpperCase();const result=[];for(const node of this.children){if(matches(node))result.push(node);result.push(...node.querySelectorAll(selector));}return result;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 click(){if(!this.disabled)return this.dispatchEvent({type:'click'});return [];}
 focus(){this.document.activeElement=this;}
 blur(){if(this.document.activeElement===this)this.document.activeElement=this.document.body;}
 setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
 select(){}
 scrollIntoView(){}
 get isConnected(){return this.document.body.contains(this);}
 getClientRects(){return this.isConnected?[{}]:[];}
 getBoundingClientRect(){return {left:0,right:100,top:0,bottom:100};}
 showModal(){this.open=true;}
 close(){this.open=false;this.dispatchEvent({type:'close'});}
}
function documentFixture(){
 const document=new EventTarget();document.body=new Element('body',document);document.createElement=tag=>new Element(tag,document);document.getElementById=id=>document.body.querySelector('#'+id);document.querySelectorAll=selector=>document.body.querySelectorAll(selector);document.querySelector=selector=>{const parts=selector.split(' ');let node=document.body;for(const part of parts)node=node.querySelector(part);return node;};
 const stack=[document.body],voidTags=new Set(['meta','link','img','input','br']);
 for(const match of read('index.html').matchAll(/<\/?([a-z][\w-]*)\b([^>]*)>|([^<]+)/gi)){
  if(match[3]){stack.at(-1)._text+=match[3].trim();continue;}
  if(match[0].startsWith('</')){if(stack.length>1)stack.pop();continue;}
  const tag=match[1].toLowerCase();if(tag==='body'||tag==='html'||tag==='head')continue;
  const node=document.createElement(tag);for(const attribute of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))node.setAttribute(attribute[1],attribute[2]??'');
  stack.at(-1).append(node);if(!voidTags.has(tag))stack.push(node);
 }
 return document;
}
function firestoreFixture(){
 const entries=new Map(),subscriptions=new Set();let tail=Promise.resolve();
 const docSnapshot=path=>({id:path.split('/').at(-1),exists:()=>entries.has(path),data:()=>clone(entries.get(path))});
 const snapshot=ref=>ref.collection?{docs:[...entries.keys()].filter(key=>key.startsWith(ref.path+'/')&&!key.slice(ref.path.length+1).includes('/')).map(docSnapshot)}:docSnapshot(ref.path);
 const broadcast=()=>{for(const item of subscriptions)queueMicrotask(()=>item.callback(snapshot(item.ref)));};
 const api={
  initializeApp:()=>({}),getAuth:()=>({currentUser:{uid:'fixture-user'}}),signInAnonymously:async()=>({}),getFirestore:()=>({}),
  collection:(_,path)=>({path,collection:true}),doc:(ref,...parts)=>({path:[ref.path,...parts].filter(Boolean).join('/')}),getDocs:async ref=>snapshot(ref),serverTimestamp:()=>({seconds:Date.now()/1000}),Timestamp:{fromMillis:value=>({seconds:value/1000})},
  onSnapshot:(ref,callback,onError)=>{const entry={ref,callback};subscriptions.add(entry);queueMicrotask(()=>{if(api.deniedCollection===ref.path)onError?.({code:'permission-denied'});else callback(snapshot(ref));});return ()=>subscriptions.delete(entry);},
  runTransaction:(_,callback)=>{const task=tail.then(async()=>{const writes=[];const result=await callback({get:async ref=>docSnapshot(ref.path),set:(ref,value)=>writes.push([ref.path,clone(value)])});for(const [path,value] of writes)entries.set(path,value);if(writes.length)broadcast();return result;});tail=task.catch(()=>{});return task;},
  fixtureImport:async path=>{if(api.importError)throw api.importError;return path.endsWith('firebase-ai.js')?{getAI:()=>({}),GoogleAIBackend:class {},Schema:Object.fromEntries(['object','array','string','enumString'].map(name=>[name,value=>({type:name,...value})])),getGenerativeModel:(_,options,requestOptions)=>({generateContent:async text=>{api.generations=(api.generations||0)+1;api.lastOptions={options,requestOptions};const context=JSON.parse(text),result=api.generate?await api.generate(context):{summary:'Gemini 연결 결과',patterns:[{title:'관찰 패턴',action:'패턴을 확인하세요.',basis:'입력된 관찰'}],cautions:[{title:'주의할 점',action:'반복 패턴을 확인하세요.',basis:'입력된 관찰'}],tactics:[{title:'패턴 확인',action:'초반 반응을 확인하세요.',basis:'입력된 관찰'}],checks:['로브 담당 확인']};return {response:{text:()=>JSON.stringify(result),candidates:[{finishReason:'STOP'}]}};}})}:{initializeAppCheck:()=>({}),ReCaptchaEnterpriseProvider:class {},getToken:async()=>{if(api.appCheckError)throw api.appCheckError;return {token:'fixture-attestation'};}};}
 };
 return {entries,api,broadcast};
}
function browser(store,{saved={},hash='',siteKey='fixture-public-site-key',mobile=false}={}){
 const document=documentFixture(),window=new EventTarget(),storage=new Map(Object.entries(saved)),timers=new Map();let clock=0,sequence=0;
 const location={hash,href:'https://gbkchee.github.io/team-c-victory/'+hash};
 const historyEntries=[{state:null,hash}],mobileMedia=new EventTarget();let historyIndex=0;mobileMedia.matches=mobile;
 const setLocation=value=>{location.hash=value;location.href='https://gbkchee.github.io/team-c-victory/'+value;};
 const moveHistory=delta=>{const next=historyIndex+delta;if(next<0||next>=historyEntries.length)return;const oldHash=location.hash;historyIndex=next;setLocation(historyEntries[next].hash);window.dispatchEvent({type:'popstate',state:historyEntries[next].state});if(oldHash!==location.hash)window.dispatchEvent({type:'hashchange'});};
 const history={scrollRestoration:'auto',get state(){return historyEntries[historyIndex].state;},replaceState:(state,_,value)=>{historyEntries[historyIndex]={state,hash:value};setLocation(value);},pushState:(state,_,value)=>{historyEntries.splice(historyIndex+1);historyEntries.push({state,hash:value});historyIndex++;setLocation(value);},back:()=>moveHistory(-1),forward:()=>moveHistory(1)};
 const context={window,document,location,history,navigator:{clipboard:{writeText:async()=>{}}},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},CustomEvent:class {constructor(type,{detail}={}){this.type=type;this.detail=detail;}},URLSearchParams,Intl,console,TextEncoder,crypto:{randomUUID:crypto.randomUUID,subtle:{digest:async(_,input)=>Uint8Array.from(crypto.createHash('sha256').update(input).digest()).buffer}},
  setTimeout:(callback,delay=0)=>{const id=++sequence;timers.set(id,{callback,due:clock+delay});return id;},clearTimeout:id=>timers.delete(id),...store.api};
 window.location=location;window.scrollY=0;window.scrollTo=options=>{window.scrollY=options.top;};window.matchMedia=query=>query==='(max-width: 767px)'?mobileMedia:{matches:false};
 context.Option=function(text,value){const option=document.createElement('option');option.textContent=text;option.value=value;return option;};
 context.Worker=class {
  constructor(){this.stopped=false;}
  terminate(){this.stopped=true;}
  postMessage(message){context.setTimeout(()=>{if(!this.stopped)this.onmessage({data:{generation:message.generation,plans:window.PAIRING_MODEL.generate(window.BOARD_DATA,message.profiles,message.options)}});},0);}
 };
 vm.createContext(context);for(const file of ['data.js','profile-model.js','ratings.js','pairing-model.js','gemini-config.js','gemini-analysis.js','app.js'])vm.runInContext(read(file),context,{filename:file});
 window.GEMINI_CONFIG={...window.GEMINI_CONFIG,appCheckSiteKey:siteKey};
 vm.runInContext(read('firebase-cloud.js').replace(/^import .*;\n/gm,'').replace(/\bimport\(/g,'fixtureImport('),context,{filename:'firebase-cloud.js'});
 const flush=async()=>{for(let i=0;i<2500;i++)await Promise.resolve();};
 const advance=async(ms=150)=>{clock+=ms;for(;;){const ready=[...timers].filter(([,item])=>item.due<=clock);if(!ready.length)break;for(const [id,item] of ready){timers.delete(id);item.callback();}await flush();}};
 const $=id=>document.getElementById(id),clickText=(id,text)=>{const node=$(id).querySelectorAll('button').find(node=>node.textContent===text);assert.ok(node,'Button missing: '+text);node.click();};
 const select=(id,value)=>{$(id).value=value;$(id).dispatchEvent({type:'change'});};
 const open=id=>{const node=$('player-roster').querySelectorAll('button').find(node=>node.dataset.player===id);assert.ok(node);node.click();};
 const choose=(field,value)=>{const input=$('profile-'+field+'-'+value);assert.ok(input);input.checked=true;input.dispatchEvent({type:'change'});};
 const submit=(id,text)=>{const input=$(id);input.value=text;let form=input.parentNode;while(form.tagName!=='FORM')form=form.parentNode;form.dispatchEvent({type:'submit',preventDefault(){}});};
 const resize=isMobile=>{mobileMedia.matches=isMobile;mobileMedia.dispatchEvent({type:'change'});};
 return {window,document,storage,$,flush,advance,clickText,select,open,choose,submit,history,location,resize};
}
test('새 입력 화면, 기존 데이터 이관, 20개 제한과 두 기기 실시간 공유',async()=>{
 const store=firestoreFixture(),one=browser(store,{saved:{'courtside.player-profiles.v3':JSON.stringify({'C:우디':{position:'fore',confidentSkills:['serve'],traits:['왼손잡이']}})}});
 await one.flush();assert.equal(one.window.PLAYER_PROFILE_CLOUD.status,'ready');assert.equal(store.entries.size>=39,true);
 const two=browser(store);await two.flush();one.open('C:우디');
 const fields=one.$('team-profile-fields').textContent;for(const text of ['선호 리턴 자리','편한 플레이 위치','잘 맞는 파트너','경기·휴식 선호'])assert.ok(fields.includes(text));assert.ok(!fields.includes('요즘 자신'));assert.ok(!fields.includes('집 나갔어요'));
 one.choose('courtPreference','net');one.choose('style','balance');await one.flush();assert.equal(two.window.PLAYER_PROFILES.get('C','우디').courtPreference,'net');assert.equal(two.window.PLAYER_PROFILES.get('C','우디').style,'balance');
 for(let i=0;i<20;i++)one.submit('profile-trait-text','특징 '+i);assert.ok(one.$('profile-trait-status').textContent.includes('20개'));await one.flush();assert.equal(one.window.PLAYER_PROFILES.get('C','우디').traits.length,20);assert.equal(two.window.PLAYER_PROFILES.get('C','우디').traits.length,20);
 assert.ok(one.storage.has('courtside.player-profiles.v3'));assert.equal(one.$('ratings-panel').open,true);one.$('rating-close').click();assert.equal(one.$('ratings-panel').open,false);
 one.open('A:펩시');one.submit('profile-keyword-text-pattern','서브 후 네트 접근');await one.flush();two.open('A:동글');assert.ok(two.$('opponent-keywords').querySelectorAll('button').some(node=>node.textContent==='＋ 서브 후 네트 접근'));
 // Editing different fields concurrently must merge instead of losing either change.
 one.open('C:숭');two.open('C:숭');one.choose('position','back');two.choose('courtPreference','baseline');await one.flush();
 assert.equal(store.entries.get('playerProfilesV2/C:숭').profile.position,'back');assert.equal(store.entries.get('playerProfilesV2/C:숭').profile.courtPreference,'baseline');
});
test('운영 모드, 일부 고정, 공동 확정표와 프로필 변경 후 유지',async()=>{
 const store=firestoreFixture(),one=browser(store),two=browser(store);await one.flush();await one.advance();await two.advance();
 one.$('tab-strategy').click();assert.equal(one.$('page-strategy').hidden,false);assert.equal(one.$('matches').querySelectorAll('.matrix-match').length,20);
 one.clickText('operation-modes','일부 고정');one.select('fixed-player1','우디');one.select('fixed-player2','꿉');one.$('add-fixed-pair').click();await one.advance();
 assert.equal(one.$('fixed-pairs-list').querySelectorAll('.fixed-pair-row').length,1);assert.equal(one.$('matches').querySelectorAll('.matrix-match').length,20);
 await Promise.all(one.$('confirm-lineup').click());await one.flush();assert.equal(two.window.PLAYER_PROFILE_CLOUD.lineup.mode,'partial');const matches=clone(store.entries.get('teamLineups/C').matches);
 assert.ok(matches.filter(item=>item.pair.includes('우디')).every(item=>item.pair.includes('꿉')));
 one.open('C:우디');one.choose('courtPreference','net');await one.flush();await one.advance();assert.deepEqual(store.entries.get('teamLineups/C').matches,matches);assert.ok(one.$('lineup-status').textContent.includes('확정표는 유지'));
 one.$('view-draft').click();one.clickText('operation-modes',one.window.PAIRING_MODEL.modeLabels.free);await one.advance();assert.equal(one.$('matches').querySelectorAll('.matrix-match').length,20);assert.equal(one.window.PLAYER_PROFILE_CLOUD.lineup.mode,'partial');
 await assert.rejects(one.window.PLAYER_PROFILE_CLOUD.saveLineup({...clone(one.window.PLAYER_PROFILE_CLOUD.lineup),revision:undefined,confirmedAt:undefined,confirmedBy:undefined},0),/다른 팀원/);
});
test('AI는 버튼으로만 호출하고 선택이 바뀐 뒤 늦은 결과를 표시하지 않는다',async()=>{
 let calls=0,release;const store=firestoreFixture();store.api.analyze=async()=>{calls++;return await new Promise(resolve=>{release=resolve;});};
 const one=browser(store,{hash:'#page=analysis&own1=우디&own2=숭&team=D&p1=아르(시트%3A%20야르)&p2=스노'});await one.flush();one.window.PLAYER_PROFILE_CLOUD.analyzeMatchup=request=>store.api.analyze(request);assert.equal(calls,0);assert.equal(one.$('ai-analyze').disabled,false);one.$('ai-analyze').click();assert.equal(calls,1);
 one.select('opponent2','초코');release({status:'ready',result:{summary:'늦은 이전 결과',patterns:[],cautions:[],tactics:[],checks:[]}});await one.flush();assert.ok(!one.$('analysis-result').textContent.includes('늦은 이전 결과'));assert.equal(one.$('ai-analyze').disabled,false);
 store.api.analyze=async request=>{calls++;assert.ok(request.opponentPlayerIds.includes('D:아르(시트: 야르)'));return {status:'ready',cached:true,result:{summary:'새 선택 분석',patterns:[{title:'패턴',action:'확인',basis:'관찰'}],cautions:[{title:'주의',action:'확인',basis:'관찰'}],tactics:[{title:'초반 확인',action:'로브 대처를 확인하세요.',basis:'입력 기록'}],checks:['가능한 샷 확인']}};};
 await Promise.all(one.$('ai-analyze').click());assert.equal(calls,2);assert.ok(one.$('analysis-result').textContent.includes('새 선택 분석'));assert.ok(one.$('analysis-ai-status').textContent.includes('팀원이 생성한 분석'));
});
test('초기화 후 오래된 브라우저 입력을 서버에 다시 이관하지 않는다',async()=>{
 const store=firestoreFixture(),{blankDocuments}=require('./reset-test-data.cjs');
 for(const [path,value] of blankDocuments({seconds:1}))store.entries.set(path,value);
 const one=browser(store,{saved:{'courtside.player-profiles.v4':JSON.stringify({'C:우디':{position:'back',traits:['삭제한 테스트 입력']},'A:펩시':{keywords:[{kind:'pattern',text:'삭제한 테스트 패턴'}]}})}});await one.flush();
 assert.equal(one.window.PLAYER_PROFILES.get('C','우디').position,'');assert.equal(one.window.PLAYER_PROFILES.get('C','우디').traits.length,0);assert.equal(one.window.PLAYER_PROFILES.get('A','펩시').keywords.length,0);
 assert.ok(!JSON.stringify([...store.entries]).includes('삭제한 테스트'));
});
test('공동 AI 분석 대기를 구독하고 시간 초과 후 재시도할 수 있다',async()=>{
 const store=firestoreFixture(),key='fixture-pending';store.api.analyze=async()=>({status:'pending',analysisKey:key});
 const one=browser(store,{hash:'#page=analysis&own1=우디&own2=숭&team=A&p1=동글&p2=펩시'});await one.flush();one.window.PLAYER_PROFILE_CLOUD.analyzeMatchup=request=>store.api.analyze(request);await Promise.all(one.$('ai-analyze').click());assert.equal(one.$('ai-analyze').disabled,true);
 store.entries.set('geminiMatchupAnalyses/'+key,{status:'ready',opponentPlayerIds:['A:동글','A:펩시'],result:{summary:'공동 분석 완료',patterns:[{title:'패턴',action:'확인',basis:'관찰'}],cautions:[{title:'주의',action:'확인',basis:'관찰'}],tactics:[{title:'초반 확인',action:'반응을 확인하세요.',basis:'입력 기록'}],checks:['담당 확인']}});store.broadcast();await one.flush();assert.ok(one.$('analysis-result').textContent.includes('공동 분석 완료'));assert.equal(one.$('ai-analyze').disabled,false);
 store.api.analyze=async()=>({status:'pending',analysisKey:'fixture-timeout'});await Promise.all(one.$('ai-analyze').click());await one.advance(90001);assert.ok(one.$('analysis-ai-status').textContent.includes('다시 시도'));assert.equal(one.$('ai-analyze').disabled,false);
});
test('연결 중 수정한 항목은 보존하고 다른 항목은 최신 서버 값으로 읽는다',async()=>{
 const store=firestoreFixture(),{blankDocuments}=require('./reset-test-data.cjs');for(const [path,value] of blankDocuments({seconds:1}))store.entries.set(path,value);
 store.entries.get('playerProfilesV2/C:우디').profile.position='back';
 const one=browser(store,{saved:{'courtside.player-profiles.v4':JSON.stringify({'C:우디':{position:'fore'}})}});one.open('C:우디');one.choose('courtPreference','net');await one.flush();
 const profile=one.window.PLAYER_PROFILES.get('C','우디');assert.equal(profile.position,'back');assert.equal(profile.courtPreference,'net');assert.equal(one.window.PLAYER_PROFILE_CLOUD.pendingCount,0);
 assert.equal(store.entries.get('playerProfilesV2/C:우디').profile.courtPreference,'net');
});
test('키 없이 기본 공략을 표시하고 관찰 수정과 함께 갱신한다',async()=>{
 const store=firestoreFixture(),one=browser(store,{siteKey:'',hash:'#page=analysis&own1=우디&own2=숭&team=A&p1=동글&p2=펩시'});await one.flush();
 assert.equal(one.window.PLAYER_PROFILE_CLOUD.status,'ready');assert.equal(one.$('ai-analyze').disabled,true);assert.ok(one.$('analysis-result').textContent.includes('기본 관찰 요약'));assert.equal(store.api.generations,undefined);
 const previousCount=store.entries.get('playerProfilesV2/A:펩시').profile.keywords.length;
 one.open('A:펩시');one.submit('profile-keyword-text-pattern','포칭 자주 함');one.submit('profile-keyword-text-weak','높은 백핸드');await one.flush();
 const result=one.$('analysis-result').textContent;assert.ok(result.includes('포칭 움직임 확인'));assert.ok(result.includes('높은 백핸드 반응 확인'));assert.ok(result.includes('펩시 · 포칭 자주 함'));assert.equal(store.api.generations,undefined);
 assert.equal(store.entries.get('playerProfilesV2/A:펩시').profile.keywords.length,previousCount+2);
 const own=['우디','숭'].map(name=>({name,profile:one.window.PLAYER_PROFILES.get('C',name)})),opponents=['동글','펩시'].map(name=>({name,profile:one.window.PLAYER_PROFILE_MODEL.cleanProfile({keywords:[{kind:'note',text:'키가 큼 왼손잡이'}]},'A')}));
 assert.equal(one.window.MATCHUP_MODEL.analyzeOpponentPair(opponents).tactics[0].title,'초반 플레이부터 확인');
});
test('실제 Gemini 연결 코드가 구조화 요청·공동 캐시·사용량을 연결한다',async()=>{
 const store=firestoreFixture(),one=browser(store,{hash:'#page=analysis&own1=우디&own2=숭&team=D&p1=아르(시트%3A%20야르)&p2=스노'});await one.flush();assert.equal(store.api.generations,undefined);
 await Promise.all(one.$('ai-analyze').click());await one.flush();assert.ok(one.$('analysis-result').textContent.includes('Gemini 연결 결과'));
 assert.equal(store.api.generations,1);assert.equal(store.entries.get('geminiAiUsage/team').count,1);
 const {options,requestOptions}=store.api.lastOptions;assert.equal(options.model,'gemini-3.5-flash-lite');assert.equal(options.generationConfig.responseMimeType,'application/json');assert.equal(options.generationConfig.maxOutputTokens,2000);assert.equal(requestOptions.timeout,45000);
 const two=browser(store,{hash:'#page=analysis&own1=우디&own2=숭&team=D&p1=아르(시트%3A%20야르)&p2=스노'});await two.flush();await Promise.all(two.$('ai-analyze').click());await two.flush();
 assert.equal(store.api.generations,1);assert.equal(store.entries.get('geminiAiUsage/team').count,1);assert.ok(two.$('analysis-ai-status').textContent.includes('팀원이 생성한 분석'));
 // Server version checks reject stale snapshots even if the UI was delayed.
 const ids=['D:아르(시트: 야르)','D:스노'],players=ids.map(id=>({id,tier:one.window.BOARD_DATA.teams[id[0]][id.slice(2)].tier,profile:one.window.PLAYER_PROFILES.get(id[0],id.slice(2))}));
 const request={opponentPlayerIds:ids,expectedProfileHash:one.window.PLAYER_PROFILE_MODEL.analysisVersion(players)};
 store.entries.get('playerProfilesV2/D:스노').profile.keywords.push({kind:'note',text:'새 관찰'});await assert.rejects(one.window.PLAYER_PROFILE_CLOUD.analyzeMatchup(request),/선수 정보가 변경/);assert.equal(store.api.generations,1);
});
test('AI SDK 로딩 차단 시 기본 공략과 선수 저장은 계속 동작한다',async()=>{
 const store=firestoreFixture();store.api.importError=new Error('network blocked by policy');const one=browser(store,{hash:'#page=analysis&own1=우디&own2=숭&team=A&p1=동글&p2=펩시'});await one.flush();
 await Promise.all(one.$('ai-analyze').click());assert.ok(one.$('analysis-ai-status').textContent.includes('AI에 연결하지 못했습니다'));assert.ok(one.$('analysis-result').textContent.includes('기본 관찰 요약'));assert.equal(store.entries.has('geminiAiUsage/team'),false);
 one.open('C:우디');one.choose('courtPreference','net');await one.flush();assert.equal(store.entries.get('playerProfilesV2/C:우디').profile.courtPreference,'net');assert.equal(one.window.PLAYER_PROFILE_CLOUD.status,'ready');
});
test('모바일 선수 상세는 별도 화면으로 열리고 뒤로 가기·앞으로 가기와 목록 위치를 유지한다',async()=>{
 const store=firestoreFixture(),one=browser(store,{mobile:true});await one.flush();one.window.scrollY=840;one.open('C:우디');
 assert.equal(one.$('player-detail-page').hidden,false);assert.notEqual(one.$('ratings-panel').open,true);assert.equal(one.$('main-content').hidden,true);assert.equal(one.$('site-header').hidden,true);
 assert.equal(one.$('player-profile-editor').parentNode,one.$('player-detail-page'));assert.equal(one.$('rating-back').hidden,false);assert.equal(one.window.scrollY,0);
 assert.equal(new URLSearchParams(one.location.hash.slice(1)).get('player'),'C:우디');assert.equal(one.history.state.teamcRosterScroll,840);
 one.choose('courtPreference','net');await one.flush();
 assert.equal(new URLSearchParams(one.location.hash.slice(1)).get('player'),'C:우디');assert.equal(one.history.state.teamcPlayerEntry,true);assert.equal(one.$('player-detail-page').hidden,false);
 one.history.back();await one.advance(0);assert.equal(one.$('player-detail-page').hidden,true);assert.equal(one.$('main-content').hidden,false);assert.equal(one.$('site-header').hidden,false);assert.equal(one.window.scrollY,840);assert.equal(one.document.activeElement.dataset.player,'C:우디');assert.equal(one.history.scrollRestoration,'auto');
 one.history.forward();await one.flush();assert.equal(one.$('player-detail-page').hidden,false);assert.equal(one.$('profile-courtPreference-net').checked,true);
 one.$('rating-back').click();await one.advance(0);assert.equal(one.window.scrollY,840);assert.equal(one.$('player-detail-page').hidden,true);assert.equal(store.entries.get('playerProfilesV2/C:우디').profile.courtPreference,'net');
});
test('모바일 상세 직접 접속과 화면 크기 변경에서도 입력 초안·포커스·공유 값이 유지된다',async()=>{
 const store=firestoreFixture(),one=browser(store,{mobile:true,hash:'#page=players&player=D%3A아르(시트%3A%20야르)'});await one.flush();
 assert.equal(one.$('player-detail-page').hidden,false);assert.ok(one.$('rating-player-info').textContent.includes('아르'));
 const input=one.$('profile-keyword-text-note');input.value='입력 중인 특징';input.focus();input.setSelectionRange(4,4);
 store.entries.get('playerProfilesV2/D:아르(시트: 야르)').profile.style='attack';store.broadcast();await one.flush();
 assert.equal(one.$('profile-keyword-text-note').value,'입력 중인 특징');assert.equal(one.document.activeElement,one.$('profile-keyword-text-note'));assert.equal(one.document.activeElement.selectionStart,4);assert.equal(one.$('profile-style-attack').checked,true);
 one.resize(false);assert.equal(one.$('ratings-panel').open,true);assert.equal(one.$('player-detail-page').hidden,true);assert.equal(one.$('player-profile-editor').parentNode,one.$('ratings-panel'));assert.equal(one.$('profile-keyword-text-note').value,'입력 중인 특징');
 one.resize(true);assert.equal(one.$('ratings-panel').open,false);assert.equal(one.$('player-detail-page').hidden,false);assert.equal(one.$('profile-keyword-text-note').value,'입력 중인 특징');
 one.$('rating-back').click();await one.advance(0);assert.equal(one.$('player-detail-page').hidden,true);assert.equal(new URLSearchParams(one.location.hash.slice(1)).has('player'),false);assert.equal(one.$('main-content').hidden,false);
});
test('특징·관찰 추천을 키보드 없이 선택·해제하고 입력 초안과 저장 값을 유지한다',async()=>{
 const store=firestoreFixture(),{blankDocuments}=require('./reset-test-data.cjs');for(const [path,value] of blankDocuments({seconds:1}))store.entries.set(path,value);
 store.entries.get('playerProfilesV2/A:펩시').profile.legacyStrengths=['예전 강점 메모'];
 const one=browser(store,{mobile:true});await one.flush();one.open('A:펩시');
 assert.deepEqual(one.$('opponent-profile-section').children.map(node=>node.id),['opponent-features','opponent-profile-fields','opponent-keywords']);assert.equal(one.$('opponent-features').querySelector('h3').textContent,'특징');
 assert.ok(!one.$('player-profile-editor').textContent.includes('기존 강점 메모'));assert.ok(!one.$('player-profile-editor').textContent.includes('예전 강점 메모'));assert.ok(!one.$('player-profile-editor').textContent.includes('기타 특징'));
 const assertNoKeyboardFocus=()=>assert.notEqual(one.document.activeElement?.type,'text');
 let draft=one.$('profile-keyword-text-note');draft.value='작성 중인 특징';draft.focus();
 for(const text of ['탑스핀','베이스라인 긴 공']){one.clickText('opponent-features','＋ '+text);assertNoKeyboardFocus();}await one.flush();assertNoKeyboardFocus();
 assert.equal(one.$('profile-keyword-text-note').value,'작성 중인 특징');
 const opponent=store.entries.get('playerProfilesV2/A:펩시').profile;assert.deepEqual(opponent.keywords,[{kind:'note',text:'탑스핀'},{kind:'note',text:'베이스라인 긴 공'}]);assert.deepEqual(opponent.legacyStrengths,['예전 강점 메모']);
 one.clickText('opponent-features','✓ 탑스핀');assertNoKeyboardFocus();await one.flush();assertNoKeyboardFocus();
 assert.deepEqual(store.entries.get('playerProfilesV2/A:펩시').profile.keywords,[{kind:'note',text:'베이스라인 긴 공'}]);
 assert.ok(!one.$('opponent-features').querySelectorAll('.keyword-chip').some(node=>node.textContent.includes('탑스핀')));
 for(const [kind,text] of [['pattern','서브 후 네트 접근'],['weak','몸쪽 공']]){
  one.clickText('opponent-keywords','＋ '+text);assertNoKeyboardFocus();
  const selected=one.$('opponent-keywords').querySelectorAll('.keyword-suggestion').find(node=>node.textContent==='✓ '+text);assert.equal(selected.getAttribute('aria-pressed'),'true');
  one.clickText('opponent-keywords','✓ '+text);assertNoKeyboardFocus();await one.flush();assertNoKeyboardFocus();
  assert.ok(!store.entries.get('playerProfilesV2/A:펩시').profile.keywords.some(item=>item.kind===kind&&item.text===text));
 }
 one.$('rating-back').click();await one.advance(0);one.open('C:우디');draft=one.$('profile-trait-text');draft.value='작성 중인 특징';draft.focus();
 for(const text of ['탑스핀','베이스라인 긴 공']){one.clickText('team-traits','＋ '+text);assertNoKeyboardFocus();}await one.flush();assertNoKeyboardFocus();
 assert.deepEqual(store.entries.get('playerTraits/C:우디').items,['탑스핀','베이스라인 긴 공']);assert.equal(one.$('profile-trait-text').value,'작성 중인 특징');
 one.clickText('team-traits','✓ 탑스핀');assertNoKeyboardFocus();await one.flush();assertNoKeyboardFocus();assert.deepEqual(store.entries.get('playerTraits/C:우디').items,['베이스라인 긴 공']);
 assert.ok(!one.$('team-traits').querySelectorAll('.keyword-chip').some(node=>node.textContent.includes('탑스핀')));
 assert.ok(one.$('team-traits').querySelectorAll('.keyword-suggestion').some(node=>node.textContent==='＋ 탑스핀'&&!node.disabled));
 one.submit('profile-trait-text','직접 입력한 특징');assert.equal(one.document.activeElement,one.$('profile-trait-text'));assert.equal(one.$('profile-trait-text').value,'');
});

test('상대 두 명만 선택하고 조 변경·체크리스트·출전표 이동을 지원한다',async()=>{
 const store=firestoreFixture(),one=browser(store,{hash:'#page=analysis'});await one.flush();
 assert.equal(one.$('our-player1'),null);assert.ok(one.$('analysis-selection-status').textContent.includes('상대 조'));
 one.clickText('analysis-teams','A조');one.select('opponent1','펩시');assert.ok(one.$('analysis-selection-status').textContent.includes('한 명'));
 one.select('opponent2','동글');assert.equal(one.$('analysis-selection-status').hidden,true);
 for(const title of ['상대 페어 한눈에 보기','예상 경기 패턴','주의할 점','공략할 상황','초반에 확인할 것'])assert.ok(one.$('analysis-result').textContent.includes(title));
 assert.equal(one.$('ai-analyze').disabled,false);
 const check=one.$('analysis-result').querySelector('input');check.checked=true;check.dispatchEvent({type:'change'});one.window.dispatchEvent({type:'playerprofilecloudstatuschange'});assert.equal(one.$('analysis-result').querySelector('input').checked,true);
 one.clickText('analysis-teams','D조');assert.equal(one.$('opponent1').value,'');assert.equal(one.$('opponent2').value,'');assert.equal(one.$('analysis-result').children.length,0);
 one.$('tab-strategy').click();await one.advance();one.$('matches').querySelector('.matrix-match').click();assert.equal(one.$('page-analysis').hidden,false);assert.equal(one.document.activeElement,one.$('opponent1'));
});
test('키워드 개수·글자 수·중복 안내와 전체 한도·삭제 후 복구를 제공한다',async()=>{
 const store=firestoreFixture(),{blankDocuments}=require('./reset-test-data.cjs');for(const [path,value] of blankDocuments({seconds:1}))store.entries.set(path,value);
 const one=browser(store,{mobile:true});await one.flush();one.open('C:우디');
 let input=one.$('profile-trait-text');input.value='x'.repeat(41);input.dispatchEvent({type:'input'});assert.equal(input.getAttribute('aria-invalid'),'true');assert.ok(one.$('profile-trait-status').textContent.includes('40자'));
 one.submit('profile-trait-text','탑스핀');input=one.$('profile-trait-text');input.value='탑스핀';input.dispatchEvent({type:'input'});assert.ok(one.$('profile-trait-status').textContent.includes('이미 등록'));
 for(let i=0;i<19;i++)one.submit('profile-trait-text','특징 '+i);assert.equal(one.$('profile-trait-text').disabled,true);assert.ok(one.$('team-traits').querySelectorAll('.keyword-suggestion').every(node=>node.disabled===(node.dataset.selected==='false')));
 one.clickText('team-traits','✓ 탑스핀');assert.equal(one.window.PLAYER_PROFILES.get('C','우디').traits.length,19);assert.equal(one.$('profile-trait-text').disabled,false);
 one.clickText('team-traits','＋ 탑스핀');assert.equal(one.$('profile-trait-text').disabled,true);
 one.$('team-traits').querySelector('.keyword-remove').click();assert.equal(one.$('profile-trait-text').disabled,false);
 one.$('rating-back').click();await one.advance(0);one.open('A:펩시');one.submit('profile-keyword-text-pattern','서브 후 네트 접근');for(let i=0;i<19;i++)one.submit('profile-keyword-text-pattern','패턴 '+i);
 for(const kind of ['note','pattern','weak'])assert.equal(one.$('profile-keyword-text-'+kind).disabled,true);assert.ok(one.$('opponent-features').textContent.includes('20/20'));
 assert.ok(one.$('opponent-keywords').querySelectorAll('.keyword-suggestion').every(node=>node.disabled===(node.dataset.selected==='false')));
 one.clickText('opponent-keywords','✓ 서브 후 네트 접근');for(const kind of ['note','pattern','weak'])assert.equal(one.$('profile-keyword-text-'+kind).disabled,false);
 one.clickText('opponent-keywords','＋ 서브 후 네트 접근');for(const kind of ['note','pattern','weak'])assert.equal(one.$('profile-keyword-text-'+kind).disabled,true);
 one.$('opponent-keywords').querySelector('.keyword-remove').click();for(const kind of ['note','pattern','weak'])assert.equal(one.$('profile-keyword-text-'+kind).disabled,false);
});
test('AI 버튼을 누른 뒤 App Check 오류 코드와 HTTP 상태를 표시하며 생성 한도를 사용하지 않는다',async()=>{
 const store=firestoreFixture();store.api.appCheckError={code:'appCheck/fetch-status-error',customData:{httpStatus:403},message:'AppCheck: token exchange failed'};
 const one=browser(store,{hash:'#page=analysis&team=A'});await one.flush();
 one.select('opponent1','펩시');one.select('opponent2','동글');assert.equal(one.$('ai-analyze').disabled,false);
 await Promise.all(one.$('ai-analyze').click());await one.flush();
 const status=one.$('analysis-ai-status').textContent;assert.ok(status.includes('appCheck/fetch-status-error'));assert.ok(status.includes('HTTP 403'));
 assert.equal(one.$('ai-analyze').disabled,false);assert.ok(one.$('ai-analyze').textContent.includes('다시 시도'));
 assert.equal(store.api.generations||0,0);assert.equal(store.entries.has('geminiAiUsage/team'),false);
 assert.ok(one.$('analysis-result').textContent.includes('기본 관찰 요약'));
});
test('최초 공유 연결 실패 후 재시도하며 입력값과 텍스트 초안을 보존한다',async()=>{
 const store=firestoreFixture();store.api.deniedCollection='playerProfilesV2';
 const one=browser(store,{mobile:true});await one.flush();assert.equal(one.window.PLAYER_PROFILE_CLOUD.status,'error');one.open('C:우디');
 one.choose('position','back');const input=one.$('profile-trait-text');input.value='아직 추가하지 않은 특징';input.focus();input.setSelectionRange(3,3);
 assert.equal(one.$('profile-connection-error').hidden,false);store.api.deniedCollection='';one.$('profile-save-retry').click();await one.flush();
 assert.equal(one.window.PLAYER_PROFILE_CLOUD.status,'ready');assert.equal(store.entries.get('playerProfilesV2/C:우디').profile.position,'back');
 assert.equal(one.$('profile-trait-text').value,'아직 추가하지 않은 특징');assert.equal(one.document.activeElement.selectionStart,3);assert.equal(one.$('profile-connection-error').hidden,true);
});
