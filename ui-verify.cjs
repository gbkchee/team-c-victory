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
 constructor(tag,document){super();this.tagName=tag.toUpperCase();this.document=document;this.children=[];this.parentNode=null;this.attributes={};this.dataset={};this.className='';this.id='';this.value='';this.disabled=false;this.hidden=false;this._text='';this.classList={add:name=>{this.className+=' '+name;},remove:name=>{this.className=this.className.split(' ').filter(item=>item!==name).join(' ');},contains:name=>this.className.split(' ').includes(name)};}
 set value(value){this._value=String(value);}
 get value(){return this._value;}
 removeAttribute(key){delete this.attributes[key];}
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
 setPointerCapture(id){this.capturedPointer=id;}
 hasPointerCapture(id){return this.capturedPointer===id;}
 releasePointerCapture(){const pointerId=this.capturedPointer;this.capturedPointer=null;this.dispatchEvent({type:'lostpointercapture',pointerId});}
 scrollIntoView(){}
 get isConnected(){return this.document.body.contains(this);}
 getClientRects(){return this.isConnected?[{}]:[];}
 getBoundingClientRect(){return {left:0,right:100,top:0,bottom:100};}
 show(){this.open=true;}
 showModal(){this.open=true;}
 close(){this.open=false;this.dispatchEvent({type:'close'});}
}
function documentFixture(){
 const document=new EventTarget();document.body=new Element('body',document);document.createElement=tag=>new Element(tag,document);document.getElementById=id=>document.body.querySelector('#'+id);document.querySelectorAll=selector=>document.body.querySelectorAll(selector);document.querySelector=selector=>{const parts=selector.split(' ');let node=document.body;for(const part of parts)node=node.querySelector(part);return node;};
 const stack=[document.body],voidTags=new Set(['meta','link','img','input','br']);
 for(const match of read('index.html').matchAll(/<\/?([a-z][\w-]*)\b([^>]*)>|([^<]+)/gi)){
  if(match[3]){stack.at(-1)._text+=match[3].trim();continue;}
  if(match[0].startsWith('</')){if(stack.length>1)stack.pop();continue;}
  const tag=match[1].toLowerCase();if(tag==='body'){for(const attribute of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))document.body.setAttribute(attribute[1],attribute[2]??'');continue;}if(tag==='html'||tag==='head')continue;
  const node=document.createElement(tag);for(const attribute of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))node.setAttribute(attribute[1],attribute[2]??'');
  stack.at(-1).append(node);if(!voidTags.has(tag)&&!match[0].endsWith('/>'))stack.push(node);
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
  onSnapshot:(ref,callback,onError)=>{const entry={ref,callback,onError};subscriptions.add(entry);queueMicrotask(()=>{if(api.deniedCollection===ref.path){subscriptions.delete(entry);onError?.({code:'permission-denied'});}else callback(snapshot(ref));});return ()=>subscriptions.delete(entry);},
  failSubscription:path=>{for(const item of subscriptions)if(item.ref.path===path){subscriptions.delete(item);item.onError?.({code:'permission-denied'});}},
  runTransaction:(_,callback)=>{const task=tail.then(async()=>{const writes=[];const result=await callback({get:async ref=>docSnapshot(ref.path),set:(ref,value)=>writes.push([ref.path,clone(value)])});for(const [path,value] of writes)entries.set(path,value);if(writes.length)broadcast();return result;});tail=task.catch(()=>{});return task;},
  fixtureImport:async path=>{if(api.importError)throw api.importError;return path.endsWith('firebase-ai.js')?{getAI:()=>({}),GoogleAIBackend:class {},Schema:Object.fromEntries(['object','array','string','enumString'].map(name=>[name,value=>({type:name,...value})])),getGenerativeModel:(_,options,requestOptions)=>({generateContent:async text=>{api.generations=(api.generations||0)+1;api.lastOptions={options,requestOptions};const context=JSON.parse(text),result=api.generate?await api.generate(context):{summary:'Gemini 연결 결과',responses:[{title:'관찰 패턴',action:'패턴을 확인하세요.',basis:'입력된 관찰'}],cautions:[{title:'주의할 점',action:'반복 패턴을 확인하세요.',basis:'입력된 관찰'}],tactics:[{title:'패턴 확인',action:'초반 반응을 확인하세요.',basis:'입력된 관찰'}]};return {response:{text:()=>JSON.stringify(result),candidates:[{finishReason:'STOP'}]}};}})}:{initializeAppCheck:()=>({}),ReCaptchaEnterpriseProvider:class {},getToken:async()=>{if(api.appCheckError)throw api.appCheckError;return {token:'fixture-attestation'};}};}
 };
 return {entries,api,broadcast};
}
function browser(store,{saved={},hash='#page=players',siteKey='fixture-public-site-key',mobile=false,fragmentDelay=0,deferWorkers=false,historyState=null}={}){
 const document=documentFixture(),window=new EventTarget(),storage=new Map(Object.entries(saved)),timers=new Map(),workerRequests=[],storageFailures=new Set();let clock=0,sequence=0;
 let locationHash=hash;
 const location={get hash(){return locationHash;},set hash(value){changeFragment(value,false);},href:'https://gbkchee.github.io/team-c-victory/'+hash,replace:value=>changeFragment(value,true)};
 const historyEntries=[{state:clone(historyState),hash}],mobileMedia=new EventTarget();let historyIndex=0;mobileMedia.matches=mobile;
 const setLocation=value=>{locationHash=value;location.href='https://gbkchee.github.io/team-c-victory/'+value;};
 function changeFragment(value,replace){
  if(history.rejectFragments)throw Object.assign(new Error('Fragment updates restricted'),{name:'SecurityError'});
  if(locationHash===value)return;
  const commit=()=>{
   if(replace)historyEntries[historyIndex]={state:null,hash:value};
   else{historyEntries.splice(historyIndex+1);historyEntries.push({state:null,hash:value});historyIndex++;}
   setLocation(value);context.setTimeout(()=>window.dispatchEvent({type:'hashchange'}),0);
  };
  if(fragmentDelay)context.setTimeout(commit,fragmentDelay);else commit();
 }
 const moveHistory=delta=>{const next=historyIndex+delta;if(next<0||next>=historyEntries.length)return;const oldHash=location.hash;historyIndex=next;setLocation(historyEntries[next].hash);window.dispatchEvent({type:'popstate',state:historyEntries[next].state});if(oldHash!==location.hash)window.dispatchEvent({type:'hashchange'});};
 const writable=()=>{history.writeCount++;if(history.rejectWrites)throw Object.assign(new Error('History updates restricted'),{name:'SecurityError'});};
 const history={scrollRestoration:'auto',writeCount:0,rejectWrites:false,get state(){return historyEntries[historyIndex].state;},replaceState:(state,_,value)=>{writable();historyEntries[historyIndex]={state,hash:value};setLocation(value);},pushState:(state,_,value)=>{writable();historyEntries.splice(historyIndex+1);historyEntries.push({state,hash:value});historyIndex++;setLocation(value);},back:()=>moveHistory(-1),forward:()=>moveHistory(1)};
 const context={window,document,location,history,navigator:{clipboard:{writeText:async value=>{window.copiedLink=value;}}},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>{if(storageFailures.has(key))throw Object.assign(new Error('Storage quota exceeded'),{name:'QuotaExceededError'});storage.set(key,value);}},CustomEvent:class {constructor(type,{detail}={}){this.type=type;this.detail=detail;}},URLSearchParams,Intl,console,TextEncoder,crypto:{randomUUID:crypto.randomUUID,subtle:{digest:async(_,input)=>Uint8Array.from(crypto.createHash('sha256').update(input).digest()).buffer}},
  setTimeout:(callback,delay=0)=>{const id=++sequence;timers.set(id,{callback,due:clock+delay});return id;},clearTimeout:id=>timers.delete(id),...store.api};
 window.location=location;window.scrollY=0;window.scrollTo=(options,y)=>{window.scrollY=typeof options==='number'?y:options.top;};window.matchMedia=query=>query==='(max-width: 767px)'?mobileMedia:{matches:false};
 context.Option=function(text,value){const option=document.createElement('option');option.textContent=text;option.value=value;return option;};
 context.Worker=class {
  constructor(){this.stopped=false;}
  terminate(){this.stopped=true;}
  postMessage(message){
   const request={message:clone(message),reply:(force=false)=>{
    if(this.stopped&&!force)return;
    const envelope={generation:message.generation,requestId:message.requestId};
    try{
     const workerSelf={PAIRING_MODEL:window.PAIRING_MODEL,BOARD_DATA:window.BOARD_DATA,postMessage:response=>{
      if(response.page){window.fixtureRecommendations=clone(response.page.plans);window.fixtureRecommendationPage=clone(response.page);}
      if(response.plan||response.selectedPlan)window.fixtureRestoredPlan=clone(response.plan||response.selectedPlan);
      this.onmessage({data:response});
     }};
     vm.runInNewContext(read('pairing-worker.js'),{self:workerSelf,importScripts(){}});workerSelf.onmessage({data:message});
    }catch(error){this.onmessage({data:{...envelope,error:error.message,code:error.code}});}
   }};
   workerRequests.push(request);if(!deferWorkers)context.setTimeout(()=>request.reply(),0);
  }
 };
 vm.createContext(context);for(const file of ['data.js','profile-model.js','ratings.js','pairing-model.js','tournament-model.js','tactics-data.js','gemini-config.js','gemini-analysis.js','app.js'])vm.runInContext(read(file),context,{filename:file});
 document.head={append:script=>queueMicrotask(()=>script.onload())};
 const entryHash=crypto.createHash('sha256').update('testcv').digest('hex');
 vm.runInContext(read('access-gate.js').replace(/const codeHash='[^']*'/,"const codeHash='"+entryHash+"'"),context,{filename:'access-gate.js'});
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
 return {window,document,storage,storageFailures,workerRequests,$,flush,advance,clickText,select,open,choose,submit,history,location,resize};
}
function assertUniquePlan(view,matches){
 const data=view.window.BOARD_DATA,model=view.window.PAIRING_MODEL;
 assert.equal(matches.length,20);assert.equal(new Set(matches.map(match=>[...match.pair].sort().join('\u0000'))).size,20);
 for(const match of matches)assert.equal(model.legalPair(data,match.pair),true);
 for(const name of Object.keys(data.teams.C))assert.equal(matches.filter(match=>match.pair.includes(name)).length,5);
 const times=[...new Set(data.schedule.map(match=>match.time))].sort(),players=Object.keys(data.teams.C),rows=players.map(name=>times.map(time=>Number(matches.some(match=>match.time===time&&match.pair.includes(name)))));
 for(const time of times){const active=matches.filter(match=>match.time===time).flatMap(match=>match.pair);assert.equal(new Set(active).size,active.length);}
 for(const row of rows)assert.ok(!/111|000/.test(row.join('')));
 for(let through=1;through<=times.length;through++){const counts=rows.map(row=>row.slice(0,through).reduce((sum,on)=>sum+on,0));assert.ok(Math.max(...counts)-Math.min(...counts)<=1);}
 assert.equal(model.opponentViolations(data,matches).length,0);
}
function compositionKey(pairs){return pairs.map(pair=>[...pair].sort().join('\u0000')).sort().join('|');}
function planComposition(plan){return compositionKey(plan.matches.map(match=>match.pair));}
function visibleCard(view){return view.$('pair-options').querySelectorAll('.pair-option').find(card=>!card.hidden);}
function nextUnseen(view){const cards=view.$('pair-options').querySelectorAll('.pair-option');if(cards.length>1){for(let i=0;i<cards.length;i++){if(visibleCard(view)===cards.at(-1))break;visibleCard(view).querySelector('.recommendation-next').click();}}visibleCard(view).querySelector('.recommendation-next').click();}
function cardCompositions(view){return view.$('pair-options').querySelectorAll('.pair-option').map(card=>compositionKey(JSON.parse(card.dataset.pairs)));}
function matrixPairs(view){return Object.fromEntries(view.$('matches').querySelectorAll('.matrix-match').map(node=>[node.dataset.match,node.querySelectorAll('.matrix-player-name').map(item=>item.textContent).join(' ')]));}
function expectedPairs(plan){return Object.fromEntries(plan.matches.map(match=>[match.id,match.pair.join(' ')]));}
function findSwap(view,plan,{valid=true,errorPattern,otherTime=false}={}){
 for(let i=0;i<plan.matches.length;i++)for(let j=i+1;j<plan.matches.length;j++){
  const first=plan.matches[i],second=plan.matches[j];if(otherTime&&first.time===second.time)continue;
  try{const result=view.window.PAIRING_MODEL.swapPairs(view.window.BOARD_DATA,plan,first.id,second.id);if(valid&&!view.window.PAIRING_MODEL.validatePlan(view.window.BOARD_DATA,result).length)return {first,second,result};}
  catch(error){if(!valid&&(!errorPattern||errorPattern.test(error.message)))return {first,second,error};}
 }
 assert.fail('No '+(valid?'valid':'invalid')+' swap found for fixture');
}
function applySwap(view,swap){nativeDrag(view,swap.first.id,swap.second.id);assert.deepEqual(matrixPairs(view),expectedPairs(swap.result));}

function suggestionButton(view,section,text){
 const button=view.$(section).querySelectorAll('.keyword-suggestion').find(node=>node.textContent==='＋ '+text||node.textContent==='✓ '+text);
 assert.ok(button,'Suggestion missing: '+text);return button;
}
function pointerEvent(button,type,detail={}){button.dispatchEvent({type,button:0,isPrimary:true,clientX:0,clientY:0,preventDefault(){},...detail});}
function touchEvent(button,type,touches=[{clientX:0,clientY:0}]){
 const event={type,touches,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};button.dispatchEvent(event);return event;
}
test('직접 선수 링크는 코드 입력 없이 열리고 원래 선택을 유지한다',async()=>{
 for(const mobile of [false,true]){
  const view=browser(firestoreFixture(),{hash:'#page=players&player=C%3A우디',mobile});await view.flush();
  assert.equal(view.$('access-gate').hidden,true);assert.equal(view.document.body.classList.contains('entry-open'),false);
  assert.equal(view.$('team-app').inert,false);assert.equal(new URLSearchParams(view.location.hash.slice(1)).get('player'),'C:우디');
  assert.equal(mobile?!view.$('player-detail-page').hidden:view.$('ratings-panel').open,true);
  assert.equal(view.document.activeElement,view.$('rating-player-info'));
 }
});
test('새 입력 화면, 기존 데이터 이관, 20개 제한과 두 기기 실시간 공유',async()=>{
 const store=firestoreFixture(),one=browser(store,{saved:{'courtside.player-profiles.v3':JSON.stringify({'C:우디':{position:'fore',confidentSkills:['serve'],traits:['왼손잡이']}})}});
 await one.flush();assert.equal(one.window.PLAYER_PROFILE_CLOUD.status,'ready');assert.equal(store.entries.size>=39,true);
 const two=browser(store);await two.flush();one.open('C:우디');
 const fields=one.$('team-profile-fields').textContent;for(const text of ['선호 리턴 자리','편한 플레이 위치','잘 맞는 파트너','경기·휴식 선호'])assert.ok(fields.includes(text));assert.ok(!fields.includes('요즘 자신'));assert.ok(!fields.includes('집 나갔어요'));
 one.choose('courtPreference','net');one.choose('style','balance');await one.flush();assert.equal(two.window.PLAYER_PROFILES.get('C','우디').courtPreference,'net');assert.equal(two.window.PLAYER_PROFILES.get('C','우디').style,'balance');
 for(let i=0;i<20;i++)one.submit('profile-trait-text','특징 '+i);assert.ok(one.$('profile-trait-status').textContent.includes('20개'));await one.flush();assert.equal(one.window.PLAYER_PROFILES.get('C','우디').traits.length,20);assert.equal(two.window.PLAYER_PROFILES.get('C','우디').traits.length,20);
 assert.ok(one.storage.has('courtside.player-profiles.v3'));assert.equal(one.$('ratings-panel').open,true);one.$('rating-close').click();assert.equal(one.$('ratings-panel').open,false);
 one.open('A:펩시');one.submit('profile-keyword-text-pattern','서브 후 네트 접근');await one.flush();two.open('A:동글');assert.ok(two.$('opponent-keywords').querySelectorAll('button').some(node=>node.textContent==='＋ 서브 후 네트 접근'));
 one.submit('profile-keyword-text-note','카드에 표시할 특징');await one.flush();
 for(const view of [one,two]){
  const card=view.$('player-roster').querySelectorAll('.roster-player').find(node=>node.dataset.player==='A:펩시');
  const row=card.querySelectorAll('.roster-highlight').find(node=>node.querySelector('.roster-highlight-label').textContent==='특징');
  assert.ok(row.textContent.includes('카드에 표시할 특징'));assert.ok(card.getAttribute('aria-description').includes('카드에 표시할 특징'));
 }
 const unselected=two.$('player-roster').querySelectorAll('.roster-player').find(node=>node.dataset.player==='A:동글');assert.ok(!unselected.textContent.includes('카드에 표시할 특징'));
 // Editing different fields concurrently must merge instead of losing either change.
 one.open('C:숭');two.open('C:숭');one.choose('position','back');two.choose('courtPreference','baseline');await one.flush();
 assert.equal(store.entries.get('playerProfilesV2/C:숭').profile.position,'back');assert.equal(store.entries.get('playerProfilesV2/C:숭').profile.courtPreference,'baseline');
});
test('미전송 항목은 새로고침 후 복구하고 다른 항목의 최신 서버 값과 합친다',async()=>{
 const store=firestoreFixture(),transaction=store.api.runTransaction;let offline=false;
 store.api.runTransaction=(...args)=>offline?Promise.reject({code:'unavailable'}):transaction(...args);
 const one=browser(store);await one.flush();one.open('C:우디');offline=true;
 one.choose('courtPreference','net');one.submit('profile-trait-text','복구할 특징');one.open('A:펩시');one.submit('profile-keyword-text-pattern','복구할 공격 패턴');await one.flush();
 assert.equal(one.window.PLAYER_PROFILE_CLOUD.pendingCount,2);
 const saved=Object.fromEntries(one.storage);offline=false;store.entries.get('playerProfilesV2/C:우디').profile.position='back';
 const two=browser(store,{saved});await two.flush();
 assert.equal(two.window.PLAYER_PROFILES.get('C','우디').courtPreference,'net');assert.equal(two.window.PLAYER_PROFILES.get('C','우디').position,'back');
 assert.deepEqual(store.entries.get('playerTraits/C:우디').items,['복구할 특징']);
 assert.ok(store.entries.get('playerProfilesV2/A:펩시').profile.keywords.some(item=>item.text==='복구할 공격 패턴'));
 assert.equal(two.window.PLAYER_PROFILE_CLOUD.pendingCount,0);assert.deepEqual(JSON.parse(two.storage.get('teamc.pending-profiles.v1')),{});
});
test('연속 수정 중 저장 완료한 항목은 다음 저장에서 다른 팀원의 최신 값을 덮어쓰지 않는다',async()=>{
 const store=firestoreFixture(),transaction=store.api.runTransaction;let editing=false,calls=0,release;
 store.api.runTransaction=(...args)=>editing&&++calls===2?new Promise(resolve=>{release=()=>resolve(transaction(...args));}):transaction(...args);
 const one=browser(store);await one.flush();store.api.runTransaction=transaction;const two=browser(store);await two.flush();
 one.open('C:우디');two.open('C:우디');editing=true;one.choose('position','fore');one.choose('courtPreference','net');await one.flush();assert.ok(release);
 two.choose('position','back');await two.flush();release();await one.flush();
 assert.equal(store.entries.get('playerProfilesV2/C:우디').profile.position,'back');assert.equal(store.entries.get('playerProfilesV2/C:우디').profile.courtPreference,'net');
 assert.equal(one.window.PLAYER_PROFILES.get('C','우디').position,'back');assert.equal(one.window.PLAYER_PROFILE_CLOUD.pendingCount,0);
 // Repeated changes to one field while a write is running must retain the final selection.
 one.choose('position','fore');one.choose('position','back');one.choose('position','fore');await one.flush();assert.equal(store.entries.get('playerProfilesV2/C:우디').profile.position,'fore');
});
test('연결 후 선수·확정표 구독이 종료돼도 재시도로 구독과 대기 입력을 복구한다',async()=>{
 for(const path of ['playerProfilesV2','teamLineups/C']){
  const store=firestoreFixture(),one=browser(store);await one.flush();one.open('C:우디');store.api.failSubscription(path);
  assert.equal(one.window.PLAYER_PROFILE_CLOUD.status,'error');one.choose('courtPreference','net');await one.flush();assert.equal(one.window.PLAYER_PROFILE_CLOUD.pendingCount,1);
  one.$('profile-save-retry').click();await one.flush();assert.equal(one.window.PLAYER_PROFILE_CLOUD.status,'ready');assert.equal(one.window.PLAYER_PROFILE_CLOUD.lineupReady,true);
  assert.equal(store.entries.get('playerProfilesV2/C:우디').profile.courtPreference,'net');assert.equal(one.window.PLAYER_PROFILE_CLOUD.pendingCount,0);
  store.entries.get('playerProfilesV2/C:우디').profile.position='back';store.broadcast();await one.flush();assert.equal(one.window.PLAYER_PROFILES.get('C','우디').position,'back');
 }
});
test('선수 저장 뒤 공용 추천만 실패해도 재시도로 추천 공유를 복구한다',async()=>{
 const store=firestoreFixture(),transaction=store.api.runTransaction;let blocked=false;
 store.api.runTransaction=(db,callback)=>transaction(db,tx=>callback({...tx,get:ref=>blocked&&ref.path.startsWith('keywordSuggestions/')?Promise.reject({code:'unavailable'}):tx.get(ref)}));
 const one=browser(store);await one.flush();blocked=true;
 one.open('A:펩시');one.submit('profile-keyword-text-pattern','추천 복구 테스트');await one.flush();
 assert.ok(store.entries.get('playerProfilesV2/A:펩시').profile.keywords.some(item=>item.text==='추천 복구 테스트'));
 assert.equal(one.window.PLAYER_PROFILE_CLOUD.status,'error');blocked=false;one.$('profile-save-retry').click();await one.flush();
 assert.equal(one.window.PLAYER_PROFILE_CLOUD.status,'ready');assert.ok([...store.entries].some(([path,value])=>path.startsWith('keywordSuggestions/')&&value.text==='추천 복구 테스트'));
});
test('운영 모드, 일부 고정, 공동 확정표와 프로필 변경 후 유지',async()=>{
 const store=firestoreFixture(),one=browser(store),two=browser(store);await one.flush();await one.advance();await two.advance();
 one.$('tab-strategy').click();assert.equal(one.$('page-strategy').hidden,false);assert.equal(one.$('matches').querySelectorAll('.matrix-match').length,20);
 one.clickText('operation-modes',one.window.PAIRING_MODEL.modeLabels.partial);one.select('fixed-player1','우디');one.select('fixed-player2','꿉');one.$('add-fixed-pair').click();await one.advance();
 assert.equal(one.$('fixed-pairs-list').querySelectorAll('.fixed-pair-row').length,1);assert.equal(one.$('matches').querySelectorAll('.matrix-match').length,20);
 assert.equal(one.$('fixed-player1').children.find(option=>option.value==='우디').disabled,false);one.select('fixed-player1','우디');one.select('fixed-player2','한치');one.$('add-fixed-pair').click();await one.advance();assert.equal(one.$('fixed-pairs-list').querySelectorAll('.fixed-pair-row').length,2);
 await Promise.all(one.$('confirm-lineup').click());await one.flush();assert.equal(two.window.PLAYER_PROFILE_CLOUD.lineup.mode,'partial');const matches=clone(store.entries.get('teamLineups/C').matches);
 assert.equal(matches.filter(item=>item.pair.includes('우디')&&item.pair.includes('꿉')).length,1);assert.equal(matches.filter(item=>item.pair.includes('우디')&&item.pair.includes('한치')).length,1);assertUniquePlan(one,matches);
 one.open('C:우디');one.choose('courtPreference','net');await one.flush();await one.advance();assert.deepEqual(store.entries.get('teamLineups/C').matches,matches);assert.ok(one.$('lineup-status').textContent.includes('확정표는 유지'));
 one.$('view-draft').click();one.clickText('operation-modes',one.window.PAIRING_MODEL.modeLabels.free);await one.advance();assert.equal(one.$('matches').querySelectorAll('.matrix-match').length,20);assert.equal(one.window.PLAYER_PROFILE_CLOUD.lineup.mode,'partial');
 await assert.rejects(one.window.PLAYER_PROFILE_CLOUD.saveLineup({...clone(one.window.PLAYER_PROFILE_CLOUD.lineup),revision:undefined,confirmedAt:undefined,confirmedBy:undefined},0),/다른 팀원/);
});
test('두 추천안을 비교하고 명시적으로 선택한 출전표를 공유 저장한다',async()=>{
 const store=firestoreFixture(),one=browser(store,{hash:'#page=strategy&strategy=stamina'});await one.flush();await one.advance();const originals=clone(one.window.fixtureRecommendations);
 assert.equal(one.$('strategies'),null);assert.equal(one.$('balance-variants'),null);assert.equal(one.$('pair-options').querySelectorAll('.pair-option').length,2);assert.equal(one.$('confirmed-pairs-block').hidden,true);
 for(const card of one.$('pair-options').querySelectorAll('.pair-option')){assert.equal(card.querySelectorAll('li').length,40);assert.equal(JSON.parse(card.dataset.pairs).length,20);};
 one.$('pair-options').querySelectorAll('.pair-option-select')[1].click();assert.deepEqual(matrixPairs(one),expectedPairs(originals[1]));
 assert.equal(new URLSearchParams(one.location.hash.slice(1)).has('strategy'),false);
 const sharedHash=one.location.hash,two=browser(store,{hash:sharedHash});await two.flush();await two.advance();assert.equal(planComposition(two.window.fixtureRestoredPlan),planComposition(originals[1]));assert.deepEqual(matrixPairs(two),expectedPairs(two.window.fixtureRestoredPlan));
 await Promise.all(one.$('confirm-lineup').click());await one.flush();const saved=clone(store.entries.get('teamLineups/C'));assert.deepEqual(saved.matches,originals[1].matches);
 assert.equal(saved.algorithmVersion,one.window.PAIRING_MODEL.algorithmVersion);assert.equal(one.$('confirmed-pairs-block').hidden,true);assert.equal(one.$('schedule-dialog').hidden,true);assertUniquePlan(one,saved.matches);
 one.$('pair-options').querySelectorAll('.pair-option-select')[0].click();assert.deepEqual(matrixPairs(one),expectedPairs(originals[0]));assert.equal(one.$('confirmed-pairs-block').hidden,true);assert.deepEqual(store.entries.get('teamLineups/C').matches,saved.matches);
 one.$('schedule-close').click();one.open('C:우디');one.choose('restPreference','rest');await one.flush();one.$('rating-close').click();await one.advance();assert.equal(one.$('pair-options').querySelectorAll('.pair-option').length,2);one.$('pair-options').querySelectorAll('.pair-option-select')[0].click();
 await Promise.all(one.$('confirm-lineup').click());await one.flush();assert.equal(one.window.PAIRING_MODEL.restViolations(one.window.BOARD_DATA,store.entries.get('teamLineups/C').matches,one.window.PLAYER_PROFILES.all()).length,0);
});
test('추천은 서로 다른 최대 5개만 생성하고 이전·다음은 같은 구성을 다시 보여준다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=strategy'});await one.flush();await one.advance();const first=cardCompositions(one),table=matrixPairs(one);assert.deepEqual(one.window.fixtureRecommendations.map(plan=>plan.strategy),['win','return']);
 for(let index=1;index<5;index++){visibleCard(one).querySelector('.recommendation-next').click();await one.advance();assert.equal(visibleCard(one).querySelector('h3').textContent,'추천 조합 '+(index+1));}
 const keys=cardCompositions(one);assert.equal(keys.length,5);assert.equal(new Set(keys).size,5);assert.deepEqual(keys.slice(0,2),first);const requests=one.workerRequests.length;assert.equal(visibleCard(one).querySelector('.recommendation-next').disabled,true);visibleCard(one).querySelector('.recommendation-next').click();await one.advance();assert.equal(one.workerRequests.length,requests);for(let i=0;i<4;i++)visibleCard(one).querySelector('.recommendation-prev').click();assert.equal(visibleCard(one).querySelector('h3').textContent,'추천 조합 1');assert.deepEqual(cardCompositions(one),keys);assert.deepEqual(matrixPairs(one),table);
});
test('탐색 한도의 빈 페이지는 기본 추천과 선택표를 유지하고 이어간다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=strategy'});await one.flush();await one.advance();const before=matrixPairs(one),first=cardCompositions(one),generatePage=one.window.PAIRING_MODEL.generatePage;
 one.window.PAIRING_MODEL.generatePage=(...args)=>({...generatePage(...args),plans:[],hasMore:true,searchLimited:true});nextUnseen(one);await one.advance();assert.deepEqual(cardCompositions(one),first);assert.deepEqual(matrixPairs(one),before);assert.equal(visibleCard(one).querySelector('.recommendation-next').disabled,false);assert.match(one.$('recommendation-status').textContent,/한도|탐색|다음/);
 one.window.PAIRING_MODEL.generatePage=generatePage;nextUnseen(one);await one.advance();assert.equal(cardCompositions(one).length,3);
});
test('선호 변경 전 페이지의 늦은 응답은 최신 추천과 선택한 출전표를 덮어쓰지 않는다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=strategy',deferWorkers:true});await one.flush();await one.advance();one.workerRequests.at(-1).reply();await one.flush();assert.equal(one.$('pair-options').querySelectorAll('.pair-option').length,2);
 nextUnseen(one);await one.advance();const stale=one.workerRequests.at(-1);
 one.open('C:우디');one.choose('courtPreference','net');await one.flush();one.$('rating-close').click();await one.advance();const current=one.workerRequests.at(-1);assert.notEqual(current,stale);current.reply();await one.flush();const latestCards=cardCompositions(one),latestTable=matrixPairs(one),label=one.$('selected-plan-label').textContent;
 stale.reply(true);await one.flush();assert.deepEqual(cardCompositions(one),latestCards);assert.deepEqual(matrixPairs(one),latestTable);assert.equal(one.$('selected-plan-label').textContent,label);
});
test('가능한 구성이 하나이거나 조건이 불가능하면 다음 페이지와 확정을 안전하게 제한한다',async()=>{
 const data=require('./data.js'),pairing=require('./pairing-model.js'),base=pairing.generate(data,{})[0];
 const only=browser(firestoreFixture(),{hash:'#page=strategy&mode=partial&fixed='+encodeURIComponent(JSON.stringify(base.matches.map(match=>match.pair)))});await only.flush();await only.advance();assert.equal(only.$('pair-options').querySelectorAll('.pair-option').length,1);assert.equal(visibleCard(only).querySelector('.recommendation-next').disabled,true);assert.equal(only.$('confirm-lineup').disabled,false);
 const first=Object.keys(data.teams.C).find(name=>Object.keys(data.teams.C).filter(other=>pairing.legalPair(data,[name,other])).length>=6),locks=Object.keys(data.teams.C).filter(name=>pairing.legalPair(data,[first,name])).slice(0,6).map(name=>[first,name]);
 const none=browser(firestoreFixture(),{hash:'#page=strategy&mode=partial&fixed='+encodeURIComponent(JSON.stringify(locks))});await none.flush();await none.advance();assert.equal(none.$('pair-options').querySelectorAll('.pair-option').length,0);assert.equal((none.$('pair-options').querySelector('.recommendation-next')?.disabled??true),true);assert.equal(none.$('confirm-lineup').disabled,true);assert.match(none.$('recommendation-status').textContent,/5개|조건|지정|불가/);
});



test('기본과 과거 전체 고정 링크는 자유 조합으로 열리고 추천마다 서로 다른 20페어를 표시한다',async()=>{
 for(const hash of ['#page=strategy','#page=strategy&mode=fixed']){
  const one=browser(firestoreFixture(),{hash});await one.flush();await one.advance();
  const modes=one.$('operation-modes').querySelectorAll('button');assert.deepEqual(modes.map(node=>node.textContent),[one.window.PAIRING_MODEL.modeLabels.free,one.window.PAIRING_MODEL.modeLabels.partial]);assert.equal(modes[0].getAttribute('aria-pressed'),'true');
  assert.equal(new URLSearchParams(one.location.hash.slice(1)).get('mode'),'free');
  assert.equal(one.window.fixtureRecommendations.length,2);for(const plan of one.window.fixtureRecommendations)assertUniquePlan(one,plan.matches);
  for(const card of one.$('pair-options').querySelectorAll('.pair-option')){assert.equal(card.querySelectorAll('li').length,40);assert.equal(JSON.parse(card.dataset.pairs).length,20);};
 }
});
test('일부 지정은 같은 선수를 여러 페어에 넣고 20개 페어를 링크에서 읽어 공유 저장한다',async()=>{
 const data=require('./data.js'),pairing=require('./pairing-model.js'),base=pairing.generate(data,{},{}).at(0),locks=base.matches.map(match=>match.pair);
 const store=firestoreFixture(),one=browser(store,{hash:'#page=strategy&mode=partial&fixed='+encodeURIComponent(JSON.stringify(locks))});await one.flush();await one.advance();
 assert.equal(one.$('fixed-pairs-list').querySelectorAll('.fixed-pair-row').length,20);assert.equal(one.$('add-fixed-pair').disabled,true);
 await Promise.all(one.$('confirm-lineup').click());await one.flush();const saved=store.entries.get('teamLineups/C');assert.ok(saved);assert.equal(saved.fixedPairs.length,20);assertUniquePlan(one,saved.matches);
 assert.deepEqual(new Set(saved.matches.map(match=>[...match.pair].sort().join('/'))),new Set(locks.map(pair=>[...pair].sort().join('/'))));
});

test('선수 선호 변경은 편집한 추천 초안을 다시 계산하고 공유 확정표를 유지한다',async()=>{
 const store=firestoreFixture(),one=browser(store,{hash:'#page=strategy'});await one.flush();await one.advance();const original=clone(one.window.fixtureRecommendations[0]);
 await Promise.all(one.$('confirm-lineup').click());await one.flush();const saved=clone(store.entries.get('teamLineups/C'));one.$('view-draft').click();const swap=findSwap(one,original);applySwap(one,swap);
 one.open('C:우디');one.choose('courtPreference','net');await one.flush();one.$('rating-close').click();await one.advance();const regenerated=clone(one.window.fixtureRecommendations[0]);
 assert.notEqual(regenerated.profileVersion,original.profileVersion);assert.deepEqual(matrixPairs(one),expectedPairs(regenerated));assertUniquePlan(one,regenerated.matches);assert.deepEqual(store.entries.get('teamLineups/C'),saved);
});

test('확정표 교환은 초안에서 검토한 뒤 저장하며 다른 팀원의 최신 리비전을 덮어쓰지 않는다',async()=>{
 const store=firestoreFixture(),one=browser(store,{hash:'#page=strategy'}),two=browser(store,{hash:'#page=strategy'});await one.flush();await one.advance();await two.advance();
 await Promise.all(one.$('confirm-lineup').click());await one.flush();const initial=clone(store.entries.get('teamLineups/C'));assert.equal(initial.revision,1);
 two.$('view-confirmed').click();const swap=findSwap(two,initial);applySwap(two,swap);assert.deepEqual(store.entries.get('teamLineups/C'),initial);assert.deepEqual(matrixPairs(two),expectedPairs(swap.result));
 await Promise.all(two.$('confirm-lineup').click());await two.flush();const updated=clone(store.entries.get('teamLineups/C'));assert.equal(updated.revision,2);assert.deepEqual(updated.matches,clone(swap.result.matches));
 one.$('view-confirmed').click();const staleSwap=findSwap(one,updated);applySwap(one,staleSwap);
 two.$('view-draft').click();two.$('pair-options').querySelectorAll('.pair-option-select')[1].click();await Promise.all(two.$('confirm-lineup').click());await two.flush();const latest=clone(store.entries.get('teamLineups/C'));assert.equal(latest.revision,3);
 await Promise.all(one.$('confirm-lineup').click());await one.flush();assert.deepEqual(store.entries.get('teamLineups/C'),latest);assert.match(one.$('lineup-status').textContent,/다른 팀원|최신|변경/);assert.deepEqual(matrixPairs(one),expectedPairs(staleSwap.result));one.$('discard-lineup-edits').click();assert.deepEqual(matrixPairs(one),expectedPairs(latest));assert.equal(one.$('confirm-lineup').disabled,true);
});

test('AI는 버튼으로만 호출하고 선택이 바뀐 뒤 늦은 결과를 표시하지 않는다',async()=>{
 let calls=0,release;const store=firestoreFixture();store.api.analyze=async()=>{calls++;return await new Promise(resolve=>{release=resolve;});};
 const one=browser(store,{hash:'#page=analysis&own1=우디&own2=숭&team=D&p1=아르(시트%3A%20야르)&p2=스노'});await one.flush();one.window.PLAYER_PROFILE_CLOUD.analyzeMatchup=request=>store.api.analyze(request);assert.equal(calls,0);assert.equal(one.$('analysis-result').hidden,true);assert.equal(one.$('ai-analyze').disabled,false);one.$('ai-analyze').click();assert.equal(calls,1);
 assert.equal(one.$('analysis-result').hidden,true);assert.equal(one.$('analysis-result').children.length,0);assert.equal(one.$('analysis-result').getAttribute('aria-busy'),'true');assert.equal(one.$('ai-analyze').disabled,true);one.$('ai-analyze').click();assert.equal(calls,1);
 one.select('opponent2','초코');release({status:'ready',result:{summary:'늦은 이전 결과',responses:[],cautions:[],tactics:[]}});await one.flush();assert.ok(!one.$('analysis-result').textContent.includes('늦은 이전 결과'));assert.equal(one.$('ai-analyze').disabled,false);
 store.api.analyze=async request=>{calls++;assert.ok(request.opponentPlayerIds.includes('D:아르(시트: 야르)'));return {status:'ready',cached:true,result:{summary:'새 선택 분석',responses:[{title:'패턴',action:'확인',basis:'관찰'}],cautions:[{title:'주의',action:'확인',basis:'관찰'}],tactics:[{title:'초반 확인',action:'로브 대처를 확인하세요.',basis:'입력 기록'}]}};};
 await Promise.all(one.$('ai-analyze').click());assert.equal(calls,2);assert.ok(one.$('analysis-result').textContent.includes('새 선택 분석'));assert.ok(one.$('analysis-ai-status').textContent.includes('팀원이 생성한 분석'));
});
test('중복 페어가 있는 이전 확정표는 표시를 막고 새 추천안 확정으로 교체한다',async()=>{
 const store=firestoreFixture(),data=require('./data.js'),profileModel=require('./profile-model.js'),{blankDocuments}=require('./reset-test-data.cjs');
 for(const [path,value] of blankDocuments({seconds:1}))store.entries.set(path,value);
 for(const name of Object.keys(data.teams.C))store.entries.get('playerProfilesV2/C:'+name).profile.restPreference='continuous';
 const pairs=[['냉면','만두'],['우디','한치'],['쏘오리','숭'],['꿉','기른지']],sequence=[3,0,3,0,3,0,3,0,3,0,2,1,2,1,2,1,2,1,2,1];
 const matches=data.schedule.map((slot,index)=>({...slot,pair:pairs[sequence[index]]}));
 const profileVersion=profileModel.profileVersion(Object.keys(data.teams.C).map(name=>({id:'C:'+name,tier:data.teams.C[name].tier,profile:{...store.entries.get('playerProfilesV2/C:'+name).profile,traits:[]}})));
 store.entries.set('teamLineups/C',{id:'old-confirmed',title:'이전 확정표',description:'',mode:'fixed',strategy:'balance',fixedPairs:pairs.map(pair=>({pair})),matches,reasons:[],algorithmVersion:'pairing-v3',profileVersion,revision:1});
 const one=browser(store,{hash:'#page=strategy'});await one.flush();await one.advance();
 assert.equal(one.$('view-confirmed').disabled,true);assert.ok(one.$('lineup-status').textContent.includes('규정'));assert.deepEqual(store.entries.get('teamLineups/C').matches,matches);
 one.$('view-draft').click();await one.advance();assert.ok(one.$('strategy-pairs').textContent.includes('출전 횟수 차이는 최대 1경기'));assert.deepEqual(store.entries.get('teamLineups/C').matches,matches);
 await Promise.all(one.$('confirm-lineup').click());await one.flush();const saved=store.entries.get('teamLineups/C');assert.equal(saved.algorithmVersion,one.window.PAIRING_MODEL.algorithmVersion);assert.equal(saved.revision,2);assert.notDeepEqual(saved.matches,matches);
 const times=[...new Set(data.schedule.map(match=>match.time))].sort(),rows=Object.keys(data.teams.C).map(name=>times.map(time=>Number(saved.matches.some(match=>match.time===time&&match.pair.includes(name)))));
 for(const row of rows)assert.ok(!/111|000/.test(row.join('')));
 for(let through=1;through<=times.length;through++){const counts=rows.map(row=>row.slice(0,through).reduce((sum,on)=>sum+on,0));assert.ok(Math.max(...counts)-Math.min(...counts)<=1);}
 one.open('C:냉면');assert.ok(one.$('team-profile-fields').textContent.includes('선호는 분산 정도가 같은 후보를 고를 때만 참고'));
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
 store.entries.set('geminiMatchupAnalyses/'+key,{status:'ready',opponentPlayerIds:['A:동글','A:펩시'],result:{summary:'공동 분석 완료',responses:[{title:'패턴',action:'확인',basis:'관찰'}],cautions:[{title:'주의',action:'확인',basis:'관찰'}],tactics:[{title:'초반 확인',action:'반응을 확인하세요.',basis:'입력 기록'}]}});store.broadcast();await one.flush();assert.ok(one.$('analysis-result').textContent.includes('공동 분석 완료'));assert.equal(one.$('ai-analyze').disabled,false);
 store.api.analyze=async()=>({status:'pending',analysisKey:'fixture-timeout'});await Promise.all(one.$('ai-analyze').click());await one.advance(90001);assert.ok(one.$('analysis-ai-status').textContent.includes('다시 시도'));assert.equal(one.$('ai-analyze').disabled,false);
});
test('연결 중 수정한 항목은 보존하고 다른 항목은 최신 서버 값으로 읽는다',async()=>{
 const store=firestoreFixture(),{blankDocuments}=require('./reset-test-data.cjs');for(const [path,value] of blankDocuments({seconds:1}))store.entries.set(path,value);
 store.entries.get('playerProfilesV2/C:우디').profile.position='back';
 const one=browser(store,{saved:{'courtside.player-profiles.v4':JSON.stringify({'C:우디':{position:'fore'}})}});one.open('C:우디');one.choose('courtPreference','net');await one.flush();
 const profile=one.window.PLAYER_PROFILES.get('C','우디');assert.equal(profile.position,'back');assert.equal(profile.courtPreference,'net');assert.equal(one.window.PLAYER_PROFILE_CLOUD.pendingCount,0);
 assert.equal(store.entries.get('playerProfilesV2/C:우디').profile.courtPreference,'net');
});
test('키 없이 분석하기로 기본 요약을 표시하고 관찰 수정 후 다시 분석한다',async()=>{
 const store=firestoreFixture(),one=browser(store,{siteKey:'',hash:'#page=analysis&own1=우디&own2=숭&team=A&p1=동글&p2=펩시'});await one.flush();
 assert.equal(one.window.PLAYER_PROFILE_CLOUD.status,'ready');assert.equal(one.$('ai-analyze').disabled,false);assert.equal(one.$('analysis-result').hidden,true);assert.equal(one.$('analysis-result').children.length,0);
 await Promise.all(one.$('ai-analyze').click());assert.equal(one.$('analysis-result').hidden,false);assert.ok(one.$('analysis-result').textContent.includes('기본 관찰 요약'));assert.equal(store.api.generations,undefined);
 const previousCount=store.entries.get('playerProfilesV2/A:펩시').profile.keywords.length;
 one.open('A:펩시');one.submit('profile-keyword-text-pattern','포칭 자주 함');one.submit('profile-keyword-text-weak','높은 백핸드');await one.flush();
 assert.equal(one.$('analysis-result').hidden,true);assert.equal(one.$('analysis-result').children.length,0);assert.ok(one.$('analysis-ai-status').textContent.includes('다시 분석'));await Promise.all(one.$('ai-analyze').click());
 const result=one.$('analysis-result').textContent;assert.ok(result.includes('포칭에 대응'));assert.ok(result.includes('높은 백핸드 상황'));assert.ok(result.includes('펩시 · 포칭 자주 함'));assert.equal(store.api.generations,undefined);
 assert.ok(one.$('analysis-result').querySelectorAll('a').some(link=>link.href==='https://ushsta.org/doubles-positioning/'&&link.target==='_blank'&&link.rel==='noopener noreferrer'));
 assert.equal(store.entries.get('playerProfilesV2/A:펩시').profile.keywords.length,previousCount+2);
 const own=['우디','숭'].map(name=>({name,profile:one.window.PLAYER_PROFILES.get('C',name)})),opponents=['동글','펩시'].map(name=>({name,profile:one.window.PLAYER_PROFILE_MODEL.cleanProfile({keywords:[{kind:'note',text:'키가 큼 왼손잡이'}]},'A')}));
 assert.equal(one.window.MATCHUP_MODEL.analyzeOpponentPair(opponents).tactics[0].title,'짧거나 뜨는 공에서 전개');
});
test('실제 Gemini 연결 코드가 구조화 요청·공동 캐시·사용량을 연결한다',async()=>{
 const store=firestoreFixture(),one=browser(store,{hash:'#page=analysis&own1=우디&own2=숭&team=D&p1=아르(시트%3A%20야르)&p2=스노'});await one.flush();assert.equal(store.api.generations,undefined);
 await Promise.all(one.$('ai-analyze').click());await one.flush();assert.ok(one.$('analysis-result').textContent.includes('Gemini 연결 결과'));
 assert.equal(one.$('analysis-result').hidden,false);assert.ok(one.$('analysis-result').textContent.includes('AI 분석 · 완료'));assert.ok(!one.$('analysis-result').textContent.includes('기본 관찰 요약'));
 assert.equal(store.api.generations,1);assert.equal(store.entries.get('geminiAiUsage/team').count,1);
 const {options,requestOptions}=store.api.lastOptions;assert.equal(options.model,'gemini-3.5-flash-lite');assert.equal(options.generationConfig.responseMimeType,'application/json');assert.equal(options.generationConfig.maxOutputTokens,2000);assert.equal(requestOptions.timeout,45000);
 const two=browser(store,{hash:'#page=analysis&own1=우디&own2=숭&team=D&p1=아르(시트%3A%20야르)&p2=스노'});await two.flush();await Promise.all(two.$('ai-analyze').click());await two.flush();
 assert.equal(store.api.generations,1);assert.equal(store.entries.get('geminiAiUsage/team').count,1);assert.ok(two.$('analysis-ai-status').textContent.includes('팀원이 생성한 분석'));
 // Server version checks reject stale snapshots even if the UI was delayed.
 const ids=['D:아르(시트: 야르)','D:스노'],players=ids.map(id=>({id,tier:one.window.BOARD_DATA.teams[id[0]][id.slice(2)].tier,profile:one.window.PLAYER_PROFILES.get(id[0],id.slice(2))}));
 const request={opponentPlayerIds:ids,expectedProfileHash:one.window.PLAYER_PROFILE_MODEL.analysisVersion(players)};
 store.entries.get('playerProfilesV2/D:스노').profile.keywords.push({kind:'note',text:'새 관찰'});await assert.rejects(one.window.PLAYER_PROFILE_CLOUD.analyzeMatchup(request),/선수 정보가 변경/);assert.equal(store.api.generations,1);
});
test('공유 연결 실패 시 기본 요약을 제공하고 연결 복구 후 다음 클릭에서 AI를 사용한다',async()=>{
 const store=firestoreFixture();store.api.deniedCollection='playerProfilesV2';
 const one=browser(store,{hash:'#page=analysis&team=A&p1=동글&p2=펩시'});await one.flush();
 assert.equal(one.window.PLAYER_PROFILE_CLOUD.status,'error');assert.equal(one.$('analysis-result').hidden,true);assert.equal(one.$('ai-analyze').disabled,false);
 await Promise.all(one.$('ai-analyze').click());assert.ok(one.$('analysis-result').textContent.includes('기본 관찰 요약'));assert.equal(store.api.generations,undefined);
 store.api.deniedCollection='';one.window.PLAYER_PROFILE_CLOUD.retry();await one.flush();
 assert.equal(one.window.PLAYER_PROFILE_CLOUD.status,'ready');assert.equal(store.api.generations,undefined);
 await Promise.all(one.$('ai-analyze').click());await one.flush();assert.ok(one.$('analysis-result').textContent.includes('AI 분석 · 완료'));assert.equal(store.api.generations,1);
});
test('분석 완료 후 페어를 바꾸거나 이전 선택으로 돌아와도 클릭 전에는 결과를 숨긴다',async()=>{
 const store=firestoreFixture(),one=browser(store,{siteKey:'',hash:'#page=analysis&team=A&p1=펩시&p2=동글'});await one.flush();
 await Promise.all(one.$('ai-analyze').click());assert.equal(one.$('analysis-result').hidden,false);
 one.select('opponent2','');assert.equal(one.$('analysis-result').hidden,true);assert.equal(one.$('ai-analyze').disabled,true);
 one.select('opponent2','동글');assert.equal(one.$('analysis-result').hidden,true);assert.equal(one.$('analysis-result').children.length,0);assert.equal(one.$('ai-analyze').disabled,false);
 await Promise.all(one.$('ai-analyze').click());assert.equal(one.$('analysis-result').hidden,false);assert.ok(one.$('analysis-result').textContent.includes('기본 관찰 요약'));
 one.clickText('analysis-teams','B조');assert.equal(one.$('analysis-result').hidden,true);assert.equal(one.$('ai-analyze').disabled,true);
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
test('모바일 탭에서 분석으로 이동한 뒤 뒤로 가면 이전 탭의 목록을 복원한다',async()=>{
 const store=firestoreFixture(),one=browser(store,{mobile:true});await one.flush();await one.advance();
 one.open('C:우디');one.$('rating-back').click();await one.advance(0);
 one.$('tab-strategy').click();one.$('tab-analysis').click();
 one.clickText('analysis-teams','A조');const team='A',opponent=Object.keys(one.window.BOARD_DATA.teams[team])[0];
 one.select('opponent1',opponent);await one.flush();assert.equal(one.$('opponent1').value,opponent);
 assert.equal(one.document.body.dataset.page,'analysis');assert.equal(one.$('player-detail-page').hidden,true);
 assert.equal(one.history.state?.teamcPlayerEntry,undefined);
 const analysisHash=one.location.hash;
 one.history.back();await one.advance(0);
 assert.equal(one.document.body.dataset.page,'strategy');assert.equal(one.$('page-strategy').hidden,false);assert.equal(one.$('player-detail-page').hidden,true);
 one.history.back();await one.advance(0);
 assert.equal(one.document.body.dataset.page,'players');assert.equal(new URLSearchParams(one.location.hash.slice(1)).has('player'),false);assert.equal(one.$('main-content').hidden,false);
 one.history.forward();one.history.forward();await one.advance(0);
 assert.equal(one.location.hash,analysisHash);assert.equal(one.document.body.dataset.page,'analysis');assert.equal(one.$('player-detail-page').hidden,true);
});
test('선수 상세를 떠나는 탭 이동은 상세 기록과 편집 화면을 함께 정리한다',async()=>{
 const one=browser(firestoreFixture(),{mobile:true,hash:'#page=players&player=C%3A우디'});await one.flush();
 one.$('tab-analysis').click();await one.advance(0);
 assert.equal(one.$('player-detail-page').hidden,true);assert.equal(one.$('site-header').hidden,false);assert.equal(one.$('page-analysis').hidden,false);
 one.history.back();await one.advance(0);
 assert.equal(one.document.body.dataset.page,'players');assert.equal(one.$('player-detail-page').hidden,true);assert.equal(new URLSearchParams(one.location.hash.slice(1)).has('player'),false);
});
test('내용이 같은 공유 갱신은 방문 기록을 반복해서 쓰지 않는다',async()=>{
 const one=browser(firestoreFixture(),{mobile:true});await one.flush();await one.advance();
 const before=one.history.writeCount;
 for(let i=0;i<120;i++)one.window.dispatchEvent({type:'playerprofileschange'});
 assert.equal(one.history.writeCount,before);
 one.$('tab-strategy').click();assert.equal(one.document.body.dataset.page,'strategy');
 one.$('tab-analysis').click();assert.equal(one.document.body.dataset.page,'analysis');
});
test('Safari처럼 방문 기록 API가 제한돼도 모바일 탭·공유 주소·뒤로 가기는 동작한다',async()=>{
 const one=browser(firestoreFixture(),{mobile:true});await one.flush();await one.advance();
 one.open('C:우디');one.$('rating-back').click();await one.advance(0);
 one.history.rejectWrites=true;
 one.$('tab-strategy').click();await one.advance(0);assert.equal(one.document.body.dataset.page,'strategy');assert.equal(one.$('page-strategy').hidden,false);
 one.$('tab-analysis').click();await one.advance(0);assert.equal(one.document.body.dataset.page,'analysis');assert.equal(one.$('page-analysis').hidden,false);assert.equal(new URLSearchParams(one.location.hash.slice(1)).get('page'),'analysis');
 one.clickText('analysis-teams','A조');one.select('opponent1','펩시');one.select('opponent2','동글');await one.advance(0);
 assert.equal(one.document.body.dataset.page,'analysis');assert.equal(new URLSearchParams(one.location.hash.slice(1)).get('p1'),'펩시');assert.equal(new URLSearchParams(one.location.hash.slice(1)).get('p2'),'동글');
 one.history.back();await one.advance(0);assert.equal(one.document.body.dataset.page,'strategy');assert.equal(one.$('player-detail-page').hidden,true);
 one.history.back();await one.advance(0);assert.equal(one.document.body.dataset.page,'players');assert.equal(one.$('player-detail-page').hidden,true);
});
test('방문 기록 API가 제한된 상세 화면에서도 탭 이동은 목록 기록을 남긴다',async()=>{
 const one=browser(firestoreFixture(),{mobile:true,hash:'#page=players&player=C%3A우디'});await one.flush();one.history.rejectWrites=true;
 one.$('tab-analysis').click();await one.advance(0);assert.equal(one.document.body.dataset.page,'analysis');assert.equal(one.$('player-detail-page').hidden,true);
 one.history.back();await one.advance(0);assert.equal(one.document.body.dataset.page,'players');assert.equal(new URLSearchParams(one.location.hash.slice(1)).has('player'),false);
});
test('주소 반영이 지연돼도 빠른 탭 선택·공유 갱신·공유 링크는 마지막 화면을 유지한다',async()=>{
 const store=firestoreFixture(),one=browser(store,{mobile:true,fragmentDelay:20});await one.flush();await one.advance();one.history.rejectWrites=true;
 const assertPage=page=>{assert.equal(one.document.body.dataset.page,page);assert.equal(one.$('page-'+page).hidden,false);assert.equal(one.$('player-detail-page').hidden,true);};
 one.$('tab-strategy').click();assertPage('strategy');
 one.$('tab-analysis').click();assertPage('analysis');
 one.clickText('analysis-teams','A조');one.select('opponent1','펩시');one.select('opponent2','찐빵');
 for(let i=0;i<20;i++)one.window.dispatchEvent({type:'playerprofileschange'});
 await Promise.all(one.$('share').click());
 const shared=new URLSearchParams(one.window.copiedLink.split('#')[1]);assert.equal(shared.get('page'),'analysis');assert.equal(shared.get('p2'),'찐빵');assertPage('analysis');
 for(let i=0;i<6;i++){await one.advance(20);assertPage('analysis');}
 assert.equal(new URLSearchParams(one.location.hash.slice(1)).get('p2'),'찐빵');
 one.history.back();await one.advance(0);assertPage('strategy');
 one.history.back();await one.advance(0);assertPage('players');
 one.history.forward();one.history.forward();await one.advance(0);assertPage('analysis');assert.equal(one.$('opponent2').value,'찐빵');
});
test('주소가 늦게 바뀌는 선수 상세에서 탭 이동과 즉시 목록 복귀도 이전 선수를 재표시하지 않는다',async()=>{
 const one=browser(firestoreFixture(),{mobile:true,fragmentDelay:20});await one.flush();await one.advance();one.history.rejectWrites=true;
 one.open('C:우디');assert.equal(one.$('player-detail-page').hidden,false);
 one.$('tab-strategy').click();one.$('tab-analysis').click();
 assert.equal(one.document.body.dataset.page,'analysis');assert.equal(one.$('player-detail-page').hidden,true);
 for(let i=0;i<7;i++){await one.advance(20);assert.equal(one.document.body.dataset.page,'analysis');assert.equal(one.$('player-detail-page').hidden,true);}
 one.history.back();one.history.back();await one.advance(0);assert.equal(one.document.body.dataset.page,'players');assert.equal(one.$('player-detail-page').hidden,true);
 one.open('C:숭');one.$('rating-back').click();await one.advance(20);await one.advance(0);
 assert.equal(one.$('player-detail-page').hidden,true);assert.equal(new URLSearchParams(one.location.hash.slice(1)).has('player'),false);
 one.history.forward();await one.advance(0);assert.equal(one.$('player-detail-page').hidden,false);assert.ok(one.$('rating-player-info').textContent.includes('숭'));
});
test('주소 기록이 모두 거절돼도 탭 화면과 선수 입력은 전환된다',async()=>{
 const one=browser(firestoreFixture(),{mobile:true});await one.flush();await one.advance();one.history.rejectWrites=true;one.history.rejectFragments=true;
 for(const page of ['strategy','analysis','players','analysis']){one.$('tab-'+page).click();assert.equal(one.document.body.dataset.page,page);assert.equal(one.$('page-'+page).hidden,false);}
 one.$('tab-players').click();one.open('C:우디');one.choose('courtPreference','net');await one.flush();assert.equal(one.window.PLAYER_PROFILES.get('C','우디').courtPreference,'net');
 one.$('tab-analysis').click();assert.equal(one.$('player-detail-page').hidden,true);assert.equal(one.document.body.dataset.page,'analysis');
});
test('특징·관찰 추천을 키보드 없이 선택·해제하고 입력 초안과 저장 값을 유지한다',async()=>{
 const store=firestoreFixture(),{blankDocuments}=require('./reset-test-data.cjs');for(const [path,value] of blankDocuments({seconds:1}))store.entries.set(path,value);
 store.entries.get('playerProfilesV2/A:펩시').profile.legacyStrengths=['예전 강점 메모'];
 const one=browser(store,{mobile:true});await one.flush();one.open('A:펩시');
 assert.deepEqual(one.$('opponent-profile-section').children.map(node=>node.id),['opponent-profile-fields','opponent-keywords','opponent-features']);assert.equal(one.$('opponent-features').querySelector('h3').textContent,'추가 특징');
 assert.deepEqual(one.$('opponent-profile-section').querySelectorAll('legend').map(node=>[node.textContent,node.dataset.step]),[['플레이 성향','01']]);
 assert.deepEqual(one.$('opponent-profile-section').querySelectorAll('h3').map(node=>[node.textContent,node.dataset.step]),[['자주 쓰는 플레이·공격 패턴','02'],['어려워하는 공·상황','03'],['추가 특징','04']]);
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

test('등록한 특징을 길게 눌러 공용 추천에서 삭제하며 선수 기록과 다른 기기의 입력 초안을 보존한다',async()=>{
 const store=firestoreFixture(),one=browser(store,{mobile:true}),two=browser(store,{mobile:true});await one.flush();
 one.open('C:우디');one.submit('profile-trait-text','등록 삭제 테스트');await one.flush();
 two.open('C:숭');two.clickText('team-traits','＋ 등록 삭제 테스트');await two.flush();
 const draft=two.$('profile-trait-text');draft.value='아직 등록하지 않은 특징';draft.focus();draft.setSelectionRange(3,3);
 const button=suggestionButton(one,'team-traits','등록 삭제 테스트');assert.equal(button.dataset.custom,'true');
 pointerEvent(button,'pointerdown');await one.advance(649);assert.ok(suggestionButton(one,'team-traits','등록 삭제 테스트'));
 await one.advance(1);pointerEvent(button,'pointerup');button.click();await one.flush();
 for(const view of [one,two])assert.ok(!view.$('team-traits').querySelectorAll('.keyword-suggestion').some(node=>node.textContent.includes('등록 삭제 테스트')));
 for(const name of ['우디','숭'])assert.deepEqual(store.entries.get('playerTraits/C:'+name).items,['등록 삭제 테스트']);
 assert.ok(one.$('profile-trait-status').textContent.includes('선수 기록은 위의 × 버튼'));
 assert.equal(two.$('profile-trait-text').value,'아직 등록하지 않은 특징');assert.equal(two.document.activeElement,two.$('profile-trait-text'));assert.equal(two.document.activeElement.selectionStart,3);
 const [path,deleted]=[...store.entries].find(([path,item])=>path.startsWith('traitSuggestions/')&&item.text==='등록 삭제 테스트');assert.equal(deleted.deleted,true);
 one.choose('restPreference','rest');await one.flush();assert.equal(store.entries.get(path).deleted,true);
 const reopened=browser(store);await reopened.flush();reopened.open('C:우디');assert.ok(!reopened.$('team-traits').querySelectorAll('.keyword-suggestion').some(node=>node.textContent.includes('등록 삭제 테스트')));
 reopened.$('team-traits').querySelector('.keyword-remove').click();reopened.submit('profile-trait-text','등록 삭제 테스트');await reopened.flush();
 assert.equal(store.entries.get(path).deleted,false);assert.deepEqual(store.entries.get(path).createdAt,deleted.createdAt);assert.ok(suggestionButton(two,'team-traits','등록 삭제 테스트'));
});
test('상대 선수의 공용 등록 항목은 종류별로 삭제하고 롱프레스 뒤 선수 선택을 토글하지 않는다',async()=>{
 const store=firestoreFixture(),one=browser(store),two=browser(store);await one.flush();one.open('A:펩시');
 for(const kind of ['note','pattern','weak'])one.submit('profile-keyword-text-'+kind,'같은 이름의 관찰');await one.flush();two.open('A:동글');
 const before=clone(store.entries.get('playerProfilesV2/A:동글').profile);
 const button=suggestionButton(two,'opponent-features','같은 이름의 관찰');pointerEvent(button,'pointerdown');await two.advance(650);pointerEvent(button,'pointerup');button.click();await two.flush();
 assert.ok(!two.$('opponent-features').querySelectorAll('.keyword-suggestion').some(node=>node.textContent.includes('같은 이름의 관찰')));
 assert.equal(two.$('opponent-keywords').querySelectorAll('.keyword-suggestion').filter(node=>node.textContent.includes('같은 이름의 관찰')).length,2);
 assert.deepEqual(store.entries.get('playerProfilesV2/A:동글').profile,before);assert.equal(store.entries.get('playerProfilesV2/A:펩시').profile.keywords.filter(item=>item.text==='같은 이름의 관찰').length,3);
 const pattern=two.$('opponent-keywords').querySelectorAll('.keyword-suggestion').find(node=>node.textContent==='＋ 같은 이름의 관찰');pattern.dispatchEvent({type:'keydown',key:'Delete',preventDefault(){}});await two.flush();
 assert.equal(two.$('opponent-keywords').querySelectorAll('.keyword-suggestion').filter(node=>node.textContent.includes('같은 이름의 관찰')).length,1);
});
test('Safari 터치 롱프레스는 포인터 취소 후에도 삭제하고 합성 클릭으로 선수 선택을 바꾸지 않는다',async()=>{
 const store=firestoreFixture(),one=browser(store,{mobile:true});await one.flush();one.open('A:펩시');one.submit('profile-keyword-text-note','사파리 터치 테스트');await one.flush();
 const before=clone(store.entries.get('playerProfilesV2/A:펩시').profile),button=suggestionButton(one,'opponent-features','사파리 터치 테스트');
 pointerEvent(button,'pointerdown',{pointerType:'touch'});touchEvent(button,'touchstart');await one.advance(500);
 pointerEvent(button,'pointercancel',{pointerType:'touch'});pointerEvent(button,'pointerleave',{pointerType:'touch'});button.dispatchEvent({type:'blur'});await one.advance(150);
 assert.ok(!one.$('opponent-features').querySelectorAll('.keyword-suggestion').some(node=>node.textContent.includes('사파리 터치 테스트')));
 assert.equal(touchEvent(button,'touchend',[]).defaultPrevented,true);button.click();await one.flush();assert.deepEqual(store.entries.get('playerProfilesV2/A:펩시').profile,before);
});
test('Safari 짧은 터치는 선택만 토글하고 스크롤·터치 취소·두 손가락 터치는 삭제하지 않는다',async()=>{
 const store=firestoreFixture(),one=browser(store,{mobile:true});await one.flush();one.open('C:우디');one.submit('profile-trait-text','사파리 취소 테스트');await one.flush();
 let button=suggestionButton(one,'team-traits','사파리 취소 테스트');touchEvent(button,'touchstart');await one.advance(100);assert.equal(touchEvent(button,'touchend',[]).defaultPrevented,false);button.click();await one.flush();
 assert.deepEqual(store.entries.get('playerTraits/C:우디').items,[]);button=suggestionButton(one,'team-traits','사파리 취소 테스트');
 touchEvent(button,'touchstart');touchEvent(button,'touchmove',[{clientX:0,clientY:20}]);await one.advance(650);assert.equal(touchEvent(button,'touchend',[]).defaultPrevented,true);button.click();await one.flush();assert.deepEqual(store.entries.get('playerTraits/C:우디').items,[]);
 touchEvent(button,'touchstart');touchEvent(button,'touchcancel',[]);await one.advance(650);assert.ok(suggestionButton(one,'team-traits','사파리 취소 테스트'));
 touchEvent(button,'touchstart',[{clientX:0,clientY:0},{clientX:10,clientY:10}]);await one.advance(650);assert.ok(suggestionButton(one,'team-traits','사파리 취소 테스트'));
});
test('공용 추천 삭제 버튼은 바로 삭제하며 선수 기록과 입력 초안을 보존하고 실패를 안내한다',async()=>{
 const store=firestoreFixture(),transaction=store.api.runTransaction;let denied=false;
 store.api.runTransaction=(...args)=>denied?Promise.reject({code:'permission-denied'}):transaction(...args);
 const one=browser(store);await one.flush();one.open('C:우디');one.submit('profile-trait-text','버튼 삭제 테스트');await one.flush();
 const input=one.$('profile-trait-text');input.value='입력 초안';
 let button=suggestionButton(one,'team-traits','버튼 삭제 테스트'),remove=button.parentNode.querySelector('.suggestion-delete');assert.ok(remove);assert.equal(remove.getAttribute('aria-label'),'특징 버튼 삭제 테스트 공용 추천에서 삭제');
 denied=true;remove.click();await one.flush();
 assert.ok(suggestionButton(one,'team-traits','버튼 삭제 테스트'));assert.ok(one.$('profile-trait-status').textContent.includes('Firestore 규칙'));
 denied=false;remove.click();await one.flush();assert.ok(!one.$('team-traits').querySelectorAll('.keyword-suggestion').some(node=>node.textContent.includes('버튼 삭제 테스트')));
 assert.deepEqual(store.entries.get('playerTraits/C:우디').items,['버튼 삭제 테스트']);assert.equal(one.$('profile-trait-text').value,'입력 초안');
 assert.notEqual(suggestionButton(one,'team-traits','탑스핀').parentNode.className,'keyword-custom-suggestion');
});
test('예전 ID와 중복 문서로 등록된 공용 추천을 모두 삭제하고 새 ID로 다시 생성하지 않는다',async()=>{
 const store=firestoreFixture(),text='예전에 등록한 특징';
 store.entries.set('traitSuggestions/s_legacy_first',{text,createdAt:{seconds:1}});store.entries.set('traitSuggestions/s_legacy_duplicate',{text,createdAt:{seconds:2}});
 const one=browser(store),two=browser(store);await one.flush();one.open('C:우디');two.open('C:숭');
 const canonical='traitSuggestions/s_'+one.window.PLAYER_PROFILE_MODEL.fingerprint({text});assert.equal(store.entries.has(canonical),false);
 const button=suggestionButton(one,'team-traits',text);button.parentNode.querySelector('.suggestion-delete').click();await one.flush();
 for(const path of ['traitSuggestions/s_legacy_first','traitSuggestions/s_legacy_duplicate'])assert.equal(store.entries.get(path).deleted,true);
 for(const view of [one,two])assert.ok(!view.$('team-traits').querySelectorAll('.keyword-suggestion').some(node=>node.textContent.includes(text)));
 // Existing player records must not recreate a deleted legacy suggestion during migration.
 store.entries.get('playerTraits/C:우디').items=[text];store.broadcast();await one.flush();
 one.choose('restPreference','rest');await one.flush();const reopened=browser(store);await reopened.flush();reopened.open('C:우디');
 assert.equal(store.entries.has(canonical),false);assert.ok(!reopened.$('team-traits').querySelectorAll('.keyword-suggestion').some(node=>node.textContent.includes(text)));
 // Explicit registration restores every duplicate so the list remains consistent.
 two.submit('profile-trait-text',text);await two.flush();for(const path of ['traitSuggestions/s_legacy_first','traitSuggestions/s_legacy_duplicate'])assert.equal(store.entries.get(path).deleted,false);
 assert.ok(suggestionButton(one,'team-traits',text));
});
test('상대 추천도 실제 문서 ID와 중복을 찾아 종류별로 삭제하고 없는 항목에는 완료를 표시하지 않는다',async()=>{
 const store=firestoreFixture(),text='이전 등록 관찰';
 for(const [id,kind] of [['old-note','note'],['other-note','note'],['old-pattern','pattern']])store.entries.set('keywordSuggestions/'+id,{kind,text,createdAt:{seconds:1}});
 const one=browser(store);await one.flush();one.open('A:펩시');
 suggestionButton(one,'opponent-features',text).parentNode.querySelector('.suggestion-delete').click();await one.flush();
 assert.equal(store.entries.get('keywordSuggestions/old-note').deleted,true);assert.equal(store.entries.get('keywordSuggestions/other-note').deleted,true);assert.equal(store.entries.get('keywordSuggestions/old-pattern').deleted,undefined);
 assert.ok(!one.$('opponent-features').querySelectorAll('.keyword-suggestion').some(node=>node.textContent.includes(text)));assert.ok(suggestionButton(one,'opponent-keywords',text));
 store.entries.delete('keywordSuggestions/old-pattern');suggestionButton(one,'opponent-keywords',text).parentNode.querySelector('.suggestion-delete').click();await one.flush();
 assert.ok(one.$('profile-keyword-status-pattern').textContent.includes('찾지 못했습니다'));assert.ok(!one.$('profile-keyword-status-pattern').textContent.includes('공용 추천에서 삭제했습니다'));
 await assert.rejects(one.window.PLAYER_PROFILE_CLOUD.deleteSuggestion('note','존재하지 않는 항목'),/찾지 못했습니다/);
});
test('우리팀과 상대팀은 같은 특징 추천을 공유하며 양쪽에서 등록·선택·삭제·재등록한다',async()=>{
 const store=firestoreFixture(),{blankDocuments}=require('./reset-test-data.cjs');for(const [path,value] of blankDocuments({seconds:1}))store.entries.set(path,value);
 const one=browser(store),two=browser(store);await one.flush();one.open('C:우디');two.open('A:펩시');
 const suggestions=(view,id)=>view.$(id).querySelectorAll('.keyword-suggestion').map(node=>node.textContent.slice(2));
 const defaults=['왼손잡이','키가 큼','슬라이스 서브','로브 잘 함','탑스핀','베이스라인 긴 공','발빠름','발느림','서브강함','서브약함','체력약함'];
 assert.deepEqual(suggestions(one,'team-traits'),defaults);assert.deepEqual(suggestions(two,'opponent-features'),defaults);
 one.submit('profile-trait-text','우리팀에서 등록한 특징');await one.flush();assert.ok(suggestionButton(two,'opponent-features','우리팀에서 등록한 특징'));
 two.clickText('opponent-features','＋ 우리팀에서 등록한 특징');await two.flush();assert.deepEqual(store.entries.get('playerTraits/C:우디').items,['우리팀에서 등록한 특징']);assert.ok(store.entries.get('playerProfilesV2/A:펩시').profile.keywords.some(item=>item.kind==='note'&&item.text==='우리팀에서 등록한 특징'));
 two.submit('profile-keyword-text-note','상대팀에서 등록한 특징');await two.flush();assert.ok(suggestionButton(one,'team-traits','상대팀에서 등록한 특징'));assert.deepEqual(suggestions(one,'team-traits'),suggestions(two,'opponent-features'));
 suggestionButton(two,'opponent-features','우리팀에서 등록한 특징').parentNode.querySelector('.suggestion-delete').click();await two.flush();
 for(const [view,id] of [[one,'team-traits'],[two,'opponent-features']])assert.ok(!suggestions(view,id).includes('우리팀에서 등록한 특징'));
 const deleted=[...store.entries].filter(([path,item])=>(path.startsWith('traitSuggestions/')||path.startsWith('keywordSuggestions/'))&&item.text==='우리팀에서 등록한 특징');assert.equal(deleted.length,2);for(const [,item] of deleted)assert.equal(item.deleted,true);
 // Selected records remain separate from the common suggestion list.
 assert.deepEqual(store.entries.get('playerTraits/C:우디').items,['우리팀에서 등록한 특징']);assert.ok(store.entries.get('playerProfilesV2/A:펩시').profile.keywords.some(item=>item.text==='우리팀에서 등록한 특징'));
 one.choose('position','fore');two.choose('style','attack');await one.flush();assert.ok(!suggestions(one,'team-traits').includes('우리팀에서 등록한 특징'));assert.ok(!suggestions(two,'opponent-features').includes('우리팀에서 등록한 특징'));
 one.open('C:숭');one.submit('profile-trait-text','우리팀에서 등록한 특징');await one.flush();for(const [path] of deleted)assert.equal(store.entries.get(path).deleted,false);assert.ok(suggestionButton(two,'opponent-features','우리팀에서 등록한 특징'));
 // Deleting from our team also works when the item exists only in the opponent collection.
 suggestionButton(one,'team-traits','상대팀에서 등록한 특징').parentNode.querySelector('.suggestion-delete').click();await one.flush();assert.ok(!suggestions(two,'opponent-features').includes('상대팀에서 등록한 특징'));
});
test('짧은 누름·스크롤·취소·다른 선수로 이동 시 등록 항목을 삭제하지 않고 기본 추천을 보호한다',async()=>{
 const store=firestoreFixture(),one=browser(store);await one.flush();one.open('C:우디');one.submit('profile-trait-text','취소 테스트');await one.flush();
 let button=suggestionButton(one,'team-traits','취소 테스트');pointerEvent(button,'pointerdown');await one.advance(100);pointerEvent(button,'pointerup');await one.advance(650);assert.ok(suggestionButton(one,'team-traits','취소 테스트'));
 pointerEvent(button,'pointerdown');pointerEvent(button,'pointermove',{clientY:15});await one.advance(650);pointerEvent(button,'pointerup');button.click();assert.deepEqual(clone(one.window.PLAYER_PROFILES.get('C','우디').traits),['취소 테스트']);
 pointerEvent(button,'pointerdown');pointerEvent(button,'pointercancel');await one.advance(650);assert.ok(suggestionButton(one,'team-traits','취소 테스트'));
 pointerEvent(button,'pointerdown');one.open('C:숭');await one.advance(650);assert.ok(suggestionButton(one,'team-traits','취소 테스트'));
 const builtIn=suggestionButton(one,'team-traits','탑스핀');assert.equal(builtIn.dataset.custom,undefined);pointerEvent(builtIn,'pointerdown');await one.advance(650);assert.ok(suggestionButton(one,'team-traits','탑스핀'));
 await assert.rejects(one.window.PLAYER_PROFILE_CLOUD.deleteSuggestion('trait','탑스핀'),/기본 추천/);
});
test('20개를 선택해도 미선택 공용 항목을 삭제할 수 있으며 연결 실패 시 항목을 유지한다',async()=>{
 const store=firestoreFixture(),one=browser(store),two=browser(store);await one.flush();one.open('C:우디');two.open('C:숭');
 two.submit('profile-trait-text','미선택 삭제 테스트');await two.flush();for(let i=0;i<20;i++)one.submit('profile-trait-text','한도 테스트 '+i);await one.flush();
 let button=suggestionButton(one,'team-traits','미선택 삭제 테스트');assert.equal(button.disabled,false);assert.equal(button.getAttribute('aria-disabled'),'true');button.click();assert.equal(one.window.PLAYER_PROFILES.get('C','우디').traits.length,20);
 store.api.failSubscription('playerProfilesV2');await one.flush();button=suggestionButton(one,'team-traits','미선택 삭제 테스트');pointerEvent(button,'pointerdown');await one.advance(650);
 assert.ok(suggestionButton(one,'team-traits','미선택 삭제 테스트'));assert.ok(one.$('profile-trait-status').textContent.includes('연결 후'));
 one.window.PLAYER_PROFILE_CLOUD.retry();await one.flush();button=suggestionButton(one,'team-traits','미선택 삭제 테스트');pointerEvent(button,'pointerdown');await one.advance(650);
 assert.ok(!one.$('team-traits').querySelectorAll('.keyword-suggestion').some(node=>node.textContent.includes('미선택 삭제 테스트')));assert.equal(one.window.PLAYER_PROFILES.get('C','우디').traits.length,20);
});
test('상대 두 명만 선택하고 세 분석 영역·조 변경·출전표 이동을 지원한다',async()=>{
 const store=firestoreFixture(),one=browser(store,{hash:'#page=analysis'});await one.flush();
 assert.equal(one.$('our-player1'),null);assert.ok(one.$('analysis-selection-status').textContent.includes('상대 조'));
 one.clickText('analysis-teams','A조');one.select('opponent1','펩시');assert.ok(one.$('analysis-selection-status').textContent.includes('한 명'));
 one.select('opponent2','동글');assert.equal(one.$('analysis-selection-status').hidden,true);
 assert.equal(one.$('analysis-result').hidden,true);assert.equal(one.$('analysis-result').children.length,0);assert.equal(one.$('ai-analyze').textContent,'분석하기 🧑‍🔬');
 await Promise.all(one.$('ai-analyze').click());await one.flush();
 for(const title of ['상대 페어 한눈에 보기','주의할 점','대응방안','공략할 상황'])assert.ok(one.$('analysis-result').textContent.includes(title));
 assert.equal(one.$('ai-analyze').disabled,false);
 assert.equal(one.$('analysis-result').querySelector('input'),null);for(const removed of ['예상 경기 패턴','초반에 확인할 것'])assert.ok(!one.$('analysis-result').textContent.includes(removed));
 one.clickText('analysis-teams','D조');assert.equal(one.$('opponent1').value,'');assert.equal(one.$('opponent2').value,'');assert.equal(one.$('analysis-result').children.length,0);
 one.$('tab-strategy').click();await one.advance();one.$('tab-analysis').click();assert.equal(one.$('page-analysis').hidden,false);
});
test('키워드 개수·글자 수·중복 안내와 전체 한도·삭제 후 복구를 제공한다',async()=>{
 const store=firestoreFixture(),{blankDocuments}=require('./reset-test-data.cjs');for(const [path,value] of blankDocuments({seconds:1}))store.entries.set(path,value);
 const one=browser(store,{mobile:true});await one.flush();one.open('C:우디');
 let input=one.$('profile-trait-text');input.value='x'.repeat(41);input.dispatchEvent({type:'input'});assert.equal(input.getAttribute('aria-invalid'),'true');assert.ok(one.$('profile-trait-status').textContent.includes('40자'));
 one.submit('profile-trait-text','탑스핀');input=one.$('profile-trait-text');input.value='탑스핀';input.dispatchEvent({type:'input'});assert.ok(one.$('profile-trait-status').textContent.includes('이미 등록'));
 for(let i=0;i<19;i++)one.submit('profile-trait-text','특징 '+i);assert.equal(one.$('profile-trait-text').disabled,true);assert.ok(one.$('team-traits').querySelectorAll('.keyword-suggestion').every(node=>node.getAttribute('aria-disabled')===String(node.dataset.selected==='false')));
 one.clickText('team-traits','✓ 탑스핀');assert.equal(one.window.PLAYER_PROFILES.get('C','우디').traits.length,19);assert.equal(one.$('profile-trait-text').disabled,false);
 one.clickText('team-traits','＋ 탑스핀');assert.equal(one.$('profile-trait-text').disabled,true);
 one.$('team-traits').querySelector('.keyword-remove').click();assert.equal(one.$('profile-trait-text').disabled,false);
 one.$('rating-back').click();await one.advance(0);one.open('A:펩시');one.submit('profile-keyword-text-pattern','서브 후 네트 접근');for(let i=0;i<19;i++)one.submit('profile-keyword-text-pattern','패턴 '+i);
 for(const kind of ['note','pattern','weak'])assert.equal(one.$('profile-keyword-text-'+kind).disabled,true);assert.ok(one.$('opponent-keywords').textContent.includes('20/20'));
 assert.ok(one.$('opponent-keywords').querySelectorAll('.keyword-suggestion').every(node=>node.getAttribute('aria-disabled')===String(node.dataset.selected==='false')));
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

test('선수 정보와 파트너 행은 각각 전체 경기·페어 설명을 열고 닫기 초점을 돌려준다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=strategy'});await one.flush();await one.advance();const card=visibleCard(one),member=card.querySelector('.recommendation-player-card'),name=member.dataset.player;member.querySelector('.recommendation-player-info').click();assert.equal(one.$('player-match-title').textContent,name+' · 전체 5경기');assert.equal(one.$('player-match-games').querySelectorAll('li').length,5);one.$('player-match-close').click();const row=member.querySelector('.recommendation-pair-row');row.click();assert.equal(one.$('pair-detail-dialog').open,true);one.$('pair-detail-close').click();assert.equal(one.document.activeElement,row);
});




test('추천 카드는 저장 기능 없이 간결한 제목과 실제 원본 아이콘·접기 기능을 표시한다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=strategy'});await one.flush();await one.advance();assert.equal(one.$('validation'),null);assert.equal(one.$('pair-favorites'),null);assert.equal(one.$('recommendation-status').hidden,true);const card=visibleCard(one);assert.equal(card.querySelector('h3').textContent,'추천 조합 1');assert.equal(card.querySelector('.pair-option-favorite'),null);const members=card.querySelectorAll('.recommendation-player-card');assert.equal(members.length,8);for(const member of members){const body=member.querySelector('.recommendation-player-body'),toggle=member.querySelector('.recommendation-player-toggle');assert.equal(body.hidden,false);assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(member.querySelector('.recommendation-pair-columns').textContent,'함께할 선수포·백 제안');assert.equal(member.querySelectorAll('.recommendation-partner-name').length,5);assert.equal(toggle.querySelector('img').src,'assets/pair-card-chevron.svg');assert.equal(toggle.querySelector('img').width,16);assert.equal(member.querySelector('.recommendation-player-note'),null);toggle.click();assert.equal(body.hidden,true);assert.equal(toggle.getAttribute('aria-expanded'),'false');toggle.click();assert.equal(body.hidden,false);}
});

test('페어 자리 제안은 현재 선호와 역할 근거를 반영하고 충돌·미입력을 솔직하게 안내한다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=strategy'});await one.flush();await one.advance();const plan=one.window.fixtureRecommendations[0],pair=JSON.parse(one.$('pair-options').querySelector('.recommendation-pair-row').dataset.pair),readProfile=one.window.PLAYER_PROFILES.get;let values={};one.window.PLAYER_PROFILES.get=(team,name)=>team==='C'&&values[name]?values[name]:readProfile(team,name);
 const open=()=>one.$('pair-options').querySelector('.recommendation-pair-row').click(),close=()=>one.$('pair-detail-close').click();
 values={[pair[0]]:{position:'fore',courtPreference:'net',style:'attack',partnerRoles:['cover']},[pair[1]]:{position:'back',courtPreference:'baseline',style:'defense'}};open();assert.ok(one.$('pair-detail-positions').textContent.includes(pair[0]+' 포'));assert.ok(one.$('pair-detail-positions').textContent.includes(pair[1]+' 백'));assert.match(one.$('pair-detail-reasons').textContent,/모두 반영/);assert.match(one.$('pair-detail-reasons').textContent,/네트·베이스라인/);assert.equal(one.$('pair-detail-reasons').querySelectorAll('li').length,3);close();
 values={[pair[0]]:{position:'back'},[pair[1]]:{position:'back'}};open();assert.match(one.$('pair-detail-reasons').textContent,/선호가 겹칩니다/);assert.match(one.$('pair-detail-reasons').textContent,/임시 배치/);close();
 values={[pair[0]]:{},[pair[1]]:{}};open();assert.match(one.$('pair-detail-reasons').textContent,/자리 정보가 부족/);assert.match(one.$('pair-detail-reasons').textContent,/선호 정보가 적어/);assert.match(one.$('pair-detail-positions').textContent,/포 .*백/);close();
 values={[pair[0]]:{position:'either'},[pair[1]]:{position:'either'}};open();assert.match(one.$('pair-detail-reasons').textContent,/두 선수 모두.*상관없음/);assert.ok(!one.$('pair-detail-reasons').textContent.includes('자리 정보가 부족'));close();
 values={[pair[0]]:{position:'either'},[pair[1]]:{position:'back'}};open();assert.match(one.$('pair-detail-reasons').textContent,/상관없음 응답을 반영/);assert.ok(!one.$('pair-detail-reasons').textContent.includes('임시 제안'));close();
 values={[pair[0]]:{partnerRoles:['cover','tactics']},[pair[1]]:{position:'fore',courtPreference:'baseline',traits:['전술가']}};open();assert.ok(one.$('pair-detail-positions').textContent.includes(pair[1]+' 포'));assert.match(one.$('pair-detail-reasons').textContent,/임시 제안/);assert.match(one.$('pair-detail-reasons').textContent,/뒤 커버 파트너 선호/);assert.match(one.$('pair-detail-reasons').textContent,/전술가 역할/);close();
});

test('연속 3경기와 상대 조 분산을 벗어난 수동 교환도 경고 후 적용·저장·재접속한다',async()=>{
 const store=firestoreFixture(),one=browser(store,{hash:'#page=strategy'});await one.flush();await one.advance();const model=one.window.PAIRING_MODEL,data=one.window.BOARD_DATA,plan=one.window.fixtureRecommendations[0];let swap;
 for(const first of plan.matches)for(const second of plan.matches){if(swap||first.id>=second.id)continue;try{const result=model.swapPairs(data,plan,first.id,second.id);if(model.consecutivePlayWarnings(data,result.matches).length&&model.opponentViolations(data,result.matches).length)swap={first,second,result};}catch{}}
 assert.ok(swap);assert.deepEqual(Array.from(model.validateLineup(data,swap.result)),[]);assert.ok(model.validatePlan(data,swap.result).length);applySwap(one,swap);assert.match(one.$('lineup-status').textContent,/가 연속 [3-5]경기 출전합니다/);assert.equal(store.entries.has('teamLineups/C'),false);
 await Promise.all(one.$('confirm-lineup').click());await one.flush();assert.deepEqual(store.entries.get('teamLineups/C').matches,clone(swap.result.matches));const two=browser(store,{hash:'#page=strategy'});await two.flush();await two.advance();two.$('view-confirmed').click();assert.deepEqual(matrixPairs(two),expectedPairs(swap.result));assert.equal(two.$('view-confirmed').disabled,false);assert.match(two.$('lineup-status').textContent,/가 연속 [3-5]경기 출전합니다/);assert.ok(!store.entries.get('teamLineups/C').reasons.some(reason=>reason.includes('모든 선수는 A·B·D조')));const third=browser(store,{hash:'#page=strategy'});await third.flush();await third.advance();assertUniquePlan(third,third.window.fixtureRecommendations[0].matches);
});

function scheduleCell(view,id){return view.$('matches').querySelectorAll('.matrix-match').find(node=>String(node.dataset.match)===String(id));}
function nativeDrag(view,sourceId,targetId,{drop=true}={}){
 const source=scheduleCell(view,sourceId),target=scheduleCell(view,targetId),transfer={setData(){}};let allowed=false;
 source.dispatchEvent({type:'dragstart',dataTransfer:transfer,preventDefault(){}});view.document.dispatchEvent({type:'pointercancel',pointerId:1,pointerType:'mouse'});target.dispatchEvent({type:'dragover',clientX:100,clientY:200,dataTransfer:transfer,preventDefault(){allowed=true;}});
 if(drop)target.dispatchEvent({type:'drop',preventDefault(){}});source.dispatchEvent({type:'dragend'});return {allowed,source,target};
}
test('데스크톱 드래그는 두 페어만 교환하고 동시간 중복 목표는 거부한다',async()=>{
 const store=firestoreFixture(),one=browser(store,{hash:'#page=strategy'});await one.flush();await one.advance();const plan=one.window.fixtureRecommendations[0],swap=findSwap(one,plan,{otherTime:true}),before=matrixPairs(one);
 const done=nativeDrag(one,swap.first.id,swap.second.id);assert.equal(done.allowed,true);assert.deepEqual(matrixPairs(one),expectedPairs(swap.result));assert.equal(Object.keys(before).filter(key=>before[key]!==matrixPairs(one)[key]).length,2);assert.equal(store.entries.has('teamLineups/C'),false);assert.equal(one.$('match-editor'),null);const unchangedClick=matrixPairs(one);scheduleCell(one,swap.first.id).click();assert.deepEqual(matrixPairs(one),unchangedClick);
 const invalid=findSwap(one,swap.result,{valid:false,errorPattern:/동시간 중복/}),unchanged=matrixPairs(one);const blocked=nativeDrag(one,invalid.first.id,invalid.second.id,{drop:false});assert.equal(blocked.allowed,false);assert.deepEqual(matrixPairs(one),unchanged);assert.match(one.$('schedule-drag-status').textContent,/동시간 중복/);
});
test('드래그의 연속 출전 경고는 선수 이름 옆에 표시되고 해소·재접속을 반영한다',async()=>{
 const store=firestoreFixture(),one=browser(store,{hash:'#page=strategy'});await one.flush();await one.advance();const model=one.window.PAIRING_MODEL,data=one.window.BOARD_DATA,plan=one.window.fixtureRecommendations[0];let swap;
 for(const first of plan.matches)for(const second of plan.matches){if(swap||first.id>=second.id)continue;try{const result=model.swapPairs(data,plan,first.id,second.id);if(model.consecutivePlayDetails(data,result.matches).length)swap={first,second,result};}catch{}}
 assert.ok(swap);nativeDrag(one,swap.first.id,swap.second.id);assert.match(one.$('schedule-drag-status').textContent,/💦/);one.$('discard-lineup-edits').click();assert.equal(one.$('schedule-drag-status').textContent,'');assert.equal(one.$('matches').querySelectorAll('.matrix-run-warning').length,0);assert.equal(one.$('matches').querySelectorAll('.drop-valid').length,0);assert.deepEqual(matrixPairs(one),expectedPairs(plan));nativeDrag(one,swap.first.id,swap.second.id);const warnings=one.$('matches').querySelectorAll('.matrix-run-warning');assert.ok(warnings.length);for(const warning of warnings){assert.equal(warning.textContent,'💦');assert.match(warning.title,/연속 [3-5]경기/);assert.equal(warning.getAttribute('aria-label'),warning.title);assert.ok(warning.title.includes(warning.parentNode.querySelector('.matrix-player-name').textContent));}
 await Promise.all(one.$('confirm-lineup').click());await one.flush();const two=browser(store,{hash:'#page=strategy'});await two.flush();await two.advance();two.$('view-confirmed').click();assert.ok(two.$('matches').querySelectorAll('.matrix-run-warning').length);nativeDrag(two,swap.first.id,swap.second.id);assert.equal(two.$('matches').querySelectorAll('.matrix-run-warning').length,0);assert.deepEqual(matrixPairs(two),expectedPairs(plan));
});
test('모바일은 길게 누른 뒤 이동하고 누르기 전 스크롤·취소는 교환하지 않는다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=strategy',mobile:true});await one.flush();await one.advance();const plan=one.window.fixtureRecommendations[0],swap=findSwap(one,plan,{otherTime:true}),before=matrixPairs(one);let source=scheduleCell(one,swap.first.id),target=scheduleCell(one,swap.second.id);one.document.elementFromPoint=()=>target;
 const down=()=>source.dispatchEvent({type:'pointerdown',pointerType:'touch',pointerId:7,clientX:100,clientY:200});down();one.document.dispatchEvent({type:'pointermove',pointerId:7,clientX:100,clientY:220,preventDefault(){assert.fail('Pending scroll must remain native');}});await one.advance(400);one.document.dispatchEvent({type:'pointercancel',pointerId:7,pointerType:'touch'});assert.deepEqual(matrixPairs(one),before);assert.equal(source.hasPointerCapture(7),false);
 down();await one.advance(350);assert.equal(source.hasPointerCapture(7),true);let prevented=false;one.document.dispatchEvent({type:'touchmove',preventDefault(){prevented=true;}});assert.equal(prevented,true);one.document.dispatchEvent({type:'pointermove',pointerId:7,clientX:105,clientY:210,preventDefault(){}});assert.equal(target.classList.contains('drop-valid'),true);one.document.dispatchEvent({type:'pointerup',pointerId:7,clientX:105,clientY:210});assert.deepEqual(matrixPairs(one),expectedPairs(swap.result));assert.equal(source.hasPointerCapture(7),false);assert.equal(one.$('match-editor'),null);scheduleCell(one,swap.first.id).click();assert.deepEqual(matrixPairs(one),expectedPairs(swap.result));
 source=scheduleCell(one,swap.first.id);down();await one.advance(350);one.document.dispatchEvent({type:'pointercancel',pointerId:7,pointerType:'touch'});assert.equal(source.hasPointerCapture(7),false);const after=matrixPairs(one);one.document.dispatchEvent({type:'pointerup',pointerId:7,clientX:105,clientY:210});assert.deepEqual(matrixPairs(one),after);
});
test('드래그 도중 공유 리비전이 달라지면 놓아도 초안에 적용하지 않는다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=strategy'});await one.flush();await one.advance();const plan=one.window.fixtureRecommendations[0],swap=findSwap(one,plan),before=matrixPairs(one),source=scheduleCell(one,swap.first.id),target=scheduleCell(one,swap.second.id);source.dispatchEvent({type:'dragstart',dataTransfer:{setData(){}},preventDefault(){}});one.window.PLAYER_PROFILE_CLOUD.lineup={...clone(plan),revision:99};target.dispatchEvent({type:'drop',preventDefault(){}});assert.deepEqual(matrixPairs(one),before);assert.match(one.$('schedule-drag-status').textContent,/변경.*취소/);assert.equal(one.$('matches').querySelectorAll('.drag-source').length,0);
});

test('드래그는 빈 칸에서 표시를 지우며 화면 가장자리 스크롤에 유효한 좌표를 사용한다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=strategy'});await one.flush();await one.advance();const plan=one.window.fixtureRecommendations[0],swap=findSwap(one,plan),source=scheduleCell(one,swap.first.id),target=scheduleCell(one,swap.second.id);let scrolls=0,hits=0;one.window.innerHeight=800;one.window.scrollBy=()=>scrolls++;one.document.elementFromPoint=(x,y)=>{assert.ok(Number.isFinite(x));assert.ok(Number.isFinite(y));hits++;return target;};
 source.dispatchEvent({type:'dragstart',dataTransfer:{setData(){}},preventDefault(){}});target.dispatchEvent({type:'dragover',clientX:120,clientY:790,dataTransfer:{},preventDefault(){}});await one.advance(50);assert.ok(scrolls>=2);assert.ok(hits);assert.equal(target.classList.contains('drop-valid'),true);target.dispatchEvent({type:'dragleave',relatedTarget:one.$('matches')});assert.equal(target.classList.contains('drop-valid'),false);const transfer={};one.document.dispatchEvent({type:'dragover',target:one.$('matches'),clientX:50,clientY:400,dataTransfer:transfer});assert.equal(transfer.dropEffect,'none');assert.equal(one.$('matches').querySelectorAll('.drop-valid').length,0);source.dispatchEvent({type:'dragend'});assert.deepEqual(matrixPairs(one),expectedPairs(plan));
});
test('두 손가락 제스처는 길게 누른 드래그를 취소하고 이전 캡처 해제는 새 드래그를 건드리지 않는다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=strategy',mobile:true});await one.flush();await one.advance();const plan=one.window.fixtureRecommendations[0],swap=findSwap(one,plan),source=scheduleCell(one,swap.first.id),target=scheduleCell(one,swap.second.id);const down=(node,id)=>node.dispatchEvent({type:'pointerdown',pointerType:'touch',pointerId:id,clientX:100,clientY:200});
 down(source,1);await one.advance(350);assert.equal(source.hasPointerCapture(1),true);one.document.dispatchEvent({type:'pointerdown',pointerType:'touch',pointerId:2,isPrimary:false});let blocked=false;one.document.dispatchEvent({type:'touchmove',preventDefault(){blocked=true;}});assert.equal(blocked,false);assert.equal(source.hasPointerCapture(1),false);assert.deepEqual(matrixPairs(one),expectedPairs(plan));
 down(target,3);await one.advance(350);let nativePrevented=false;target.dispatchEvent({type:'dragstart',dataTransfer:{setData(){}},preventDefault(){nativePrevented=true;}});assert.equal(nativePrevented,true);one.document.dispatchEvent({type:'pointercancel',pointerId:999,pointerType:'touch'});assert.equal(target.hasPointerCapture(3),true);source.dispatchEvent({type:'lostpointercapture',pointerId:1});assert.equal(target.hasPointerCapture(3),true);one.document.dispatchEvent({type:'touchstart',touches:[{},{}]});assert.equal(target.hasPointerCapture(3),false);blocked=false;one.document.dispatchEvent({type:'touchmove',preventDefault(){blocked=true;}});assert.equal(blocked,false);
 source.dispatchEvent({type:'pointerdown',pointerType:'mouse',pointerId:4});source.click();assert.equal(one.$('match-editor'),null);
});

test('추천 조합은 8명의 카드와 각 5페어를 모두 표시하며 팝업이 출전표를 바꾸지 않는다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=strategy',mobile:true});await one.flush();await one.advance();const plans=clone(one.window.fixtureRecommendations),table=matrixPairs(one);let card=one.$('pair-options').querySelector('.pair-option');assert.equal(card.querySelector('.plan-members'),null);assert.equal(card.querySelector('.pair-option-pairs'),null);assert.equal(card.querySelector('.recommendation-player-select'),null);assert.equal(card.querySelector('.recommendation-player-list'),null);const members=card.querySelectorAll('.recommendation-player-card');assert.equal(members.length,8);
 const union=new Map();for(const member of members){const name=member.dataset.player;assert.equal(member.hidden,false);assert.equal(member.querySelector('.recommendation-player-count').textContent,'총 5경기');assert.ok(member.querySelector('h4').textContent.includes(name));const rows=member.querySelectorAll('.recommendation-pair-row');assert.equal(rows.length,5);const actual=rows.map(row=>JSON.parse(row.dataset.pair));assert.ok(actual.every(pair=>pair[0]===name));assert.deepEqual(actual.map(pair=>pair[1]).sort(),plans[0].matches.filter(match=>match.pair.includes(name)).map(match=>match.pair.find(player=>player!==name)).sort());for(const pair of actual){const key=compositionKey([pair]);union.set(key,(union.get(key)||0)+1);}member.querySelector('.recommendation-player-info').click();assert.equal(one.$('player-match-title').textContent,name+' · 전체 5경기');assert.equal(one.$('player-match-games').querySelectorAll('li').length,5);one.$('player-match-close').click();assert.deepEqual(matrixPairs(one),table);}
 assert.equal(union.size,20);assert.ok([...union.values()].every(count=>count===2));assert.equal(compositionKey([...union.keys()].map(key=>key.split('\u0000'))),planComposition(plans[0]));assert.equal(one.$('pair-options').querySelector('.pair-option').querySelectorAll('.recommendation-player-card').length,8);nextUnseen(one);await one.advance();for(const composition of one.$('pair-options').querySelectorAll('.pair-option')){assert.equal(composition.querySelectorAll('.recommendation-player-card').length,8);assert.equal(composition.querySelectorAll('.recommendation-pair-row').length,40);}assert.deepEqual(matrixPairs(one),table);
});
test('양쪽 선수 카드의 인라인 제안이 팝업과 같고 미입력은 포·백 미지정으로 표시된다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=strategy'});await one.flush();await one.advance();let card=visibleCard(one);const pair=JSON.parse(card.querySelector('.recommendation-pair-row').dataset.pair),get=one.window.PLAYER_PROFILES.get;let profiles={[pair[0]]:{position:'fore'},[pair[1]]:{position:'back'}};one.window.PLAYER_PROFILES.get=(team,name)=>team==='C'&&profiles[name]?profiles[name]:get(team,name);
 const refresh=()=>{visibleCard(one).querySelector('.recommendation-next').click();visibleCard(one).querySelector('.recommendation-prev').click();card=visibleCard(one);},row=name=>card.querySelectorAll('.recommendation-player-card').find(member=>member.dataset.player===name).querySelectorAll('.recommendation-pair-row').find(node=>{const names=JSON.parse(node.dataset.pair);return names.includes(pair[0])&&names.includes(pair[1]);});refresh();let previous,inline;
 for(const name of pair){const button=row(name);assert.equal(button.querySelector('.recommendation-partner-name').textContent,pair.find(player=>player!==name));assert.equal(button.querySelector('.suggestion-kind').textContent,'제안');const proposal=button.querySelector('.suggestion-position').textContent;assert.equal(proposal,pair[0]+' (포) · '+pair[1]+' (백)');if(inline)assert.equal(proposal,inline);inline=proposal;button.click();const text=one.$('pair-detail-positions').textContent;assert.ok(text.includes(pair[0]+' 포'));assert.ok(text.includes(pair[1]+' 백'));if(previous)assert.equal(text,previous);previous=text;one.$('pair-detail-close').click();}
 profiles={[pair[0]]:{},[pair[1]]:{}};refresh();for(const name of pair){assert.equal(row(name).querySelector('.suggestion-position').textContent,'포·백 미지정');assert.equal(row(name).querySelector('.suggestion-kind'),null);row(name).click();assert.match(one.$('pair-detail-reasons').textContent,/임시/);one.$('pair-detail-close').click();}
});

test('이전 즐겨찾기 저장값은 추천에 영향을 주지 않고 UI와 저장 동작이 없다',async()=>{
 const base=browser(firestoreFixture(),{hash:'#page=strategy'});await base.flush();await base.advance();const key='teamc.pair-favorites.v1',saved=JSON.stringify(base.window.fixtureRecommendations.map(plan=>({pairs:plan.matches.map(match=>match.pair)}))),one=browser(firestoreFixture(),{hash:'#page=strategy',saved:{[key]:saved}});await one.flush();await one.advance();assert.deepEqual(cardCompositions(one),cardCompositions(base));assert.equal(one.storage.get(key),saved);assert.equal(one.$('pair-favorites'),null);assert.equal(one.$('favorite-count'),null);assert.ok(!read('app.js').includes('teamc.pair-favorites'));assert.ok(!one.document.body.textContent.includes('즐겨찾기'));assert.equal(one.workerRequests[0].message.options.excludePairs.length,0);
});
test('추천 출전표 페이지의 드래그·취소는 세션 변경만 되돌리고 확정은 저장 후 돌아간다',async()=>{
 const store=firestoreFixture(),one=browser(store,{hash:'#page=strategy'});await one.flush();await one.advance();const plan=one.window.fixtureRecommendations[0],swap=findSwap(one,plan,{otherTime:true});visibleCard(one).querySelector('.pair-option-select').click();assert.equal(one.$('schedule-dialog').hidden,false);assert.equal(one.$('schedule-dialog-title').textContent,'출전표 편집');assert.equal(one.$('schedule-dialog-badge').textContent,'미저장 초안');assert.equal(one.$('match-editor'),null);assert.equal(one.$('match-opponent1'),null);applySwap(one,swap);assert.deepEqual(matrixPairs(one),expectedPairs(swap.result));one.$('schedule-cancel').click();assert.equal(one.$('schedule-dialog').hidden,true);assert.deepEqual(matrixPairs(one),expectedPairs(plan));assert.equal(one.document.activeElement,visibleCard(one).querySelector('.pair-option-select'));assert.equal(store.entries.has('teamLineups/C'),false);
 visibleCard(one).querySelector('.pair-option-select').click();applySwap(one,swap);await Promise.all(one.$('schedule-confirm').click());await one.flush();assert.equal(one.$('schedule-dialog').hidden,true);assert.deepEqual(store.entries.get('teamLineups/C').matches,clone(swap.result.matches));
});
test('상단 팀 출전표는 비어 있을 때 정직하게 안내하고 저장 뒤 읽기 전용으로 열며 이전 탐색을 복원한다',async()=>{
 const store=firestoreFixture(),one=browser(store,{hash:'#page=strategy'});await one.flush();await one.advance();const top=one.$('tab-schedule');assert.equal(top.textContent,'대진표');assert.equal(top.parentNode.className,'page-tabs');top.click();assert.equal(one.$('schedule-empty').hidden,true);assert.equal(one.$('schedule-dialog-badge').textContent,'기본 출전표 · 추천 조합 1');assert.deepEqual(matrixPairs(one),expectedPairs(one.window.fixtureRecommendations[0]));one.$('schedule-close').click();assert.equal(one.document.activeElement,top);
 visibleCard(one).querySelector('.pair-option-select').click();await Promise.all(one.$('schedule-confirm').click());await one.flush();one.$('view-draft').click();const draft=matrixPairs(one),hash=one.location.hash;top.click();assert.equal(one.$('schedule-dialog').dataset.readonly,'true');assert.equal(one.$('schedule-dialog-title').textContent,'최강 C조 대진표 🔥');assert.equal(one.$('schedule-analysis-hint').hidden,true);assert.equal(one.$('schedule-header').hidden,false);assert.equal(one.$('schedule-analysis-hint').textContent,'우리조 경기를 눌러 상대 페어 AI 분석을 확인하세요!');assert.equal(one.$('schedule-dialog-badge').hidden,true);assert.equal(one.$('schedule-dialog-subtitle').hidden,true);assert.equal(one.$('schedule-guide').hidden,true);assert.equal(one.$('schedule-cheer').hidden,false);assert.equal(one.$('schedule-guide-title').textContent,'전체 공식 경기와 대진표를 확인하세요');assert.equal(one.$('schedule-guide-text').textContent,'경기를 눌러 대진을 입력하고, C조 경기의 상대 AI 분석을 확인하세요.');assert.equal(one.$('tournament-record-status').hidden,true);assert.equal(one.$('tournament-record-status').textContent,'');assert.equal(one.$('schedule-confirm').hidden,true);assert.equal(one.$('schedule-edit-shared'),null);assert.ok(one.$('matches').querySelectorAll('.matrix-match').every(node=>node.getAttribute('aria-readonly')==='true'&&!node.draggable));one.clickText('filters','A조');one.$('schedule-close').click();assert.equal(one.$('view-draft').getAttribute('aria-pressed'),'true');assert.equal(new URLSearchParams(one.location.hash.slice(1)).get('view'),new URLSearchParams(hash.slice(1)).get('view'));one.clickText('filters','전체');assert.deepEqual(matrixPairs(one),draft);
});
test('출전표 페이지의 드래그는 화면 끝에서 페이지를 스크롤한다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=strategy',mobile:true});await one.flush();await one.advance();const plan=one.window.fixtureRecommendations[0],swap=findSwap(one,plan);visibleCard(one).querySelector('.pair-option-select').click();const source=scheduleCell(one,swap.first.id),target=scheduleCell(one,swap.second.id);let pageScroll=0;one.window.innerHeight=700;one.$('schedule-scroll').scrollBy=()=>assert.fail('Schedule must use page scrolling');one.window.scrollBy=()=>pageScroll++;one.document.elementFromPoint=()=>target;source.dispatchEvent({type:'dragstart',dataTransfer:{setData(){}},preventDefault(){}});target.dispatchEvent({type:'dragover',clientX:150,clientY:690,dataTransfer:{},preventDefault(){}});await one.advance(50);assert.ok(pageScroll>=2);source.dispatchEvent({type:'dragend'});one.$('schedule-close').click();
});

test('미확정 팀 출전표는 편집·선택과 무관하게 원본 추천 1을 쓰고 실시간 확정본을 우선한다',async()=>{
 const store=firestoreFixture(),one=browser(store,{hash:'#page=strategy'});await one.flush();await one.advance();const raw=clone(one.window.fixtureRecommendations[0]),second=clone(one.window.fixtureRecommendations[1]),swap=findSwap(one,raw,{otherTime:true});visibleCard(one).querySelector('.pair-option-select').click();nativeDrag(one,swap.first.id,swap.second.id);assert.deepEqual(matrixPairs(one),expectedPairs(swap.result));one.$('schedule-close').click();assert.deepEqual(matrixPairs(one),expectedPairs(raw));
 // A pre-existing manual draft remains separate from the raw recommendation fallback.
 nativeDrag(one,swap.first.id,swap.second.id);assert.deepEqual(matrixPairs(one),expectedPairs(swap.result));one.$('tab-schedule').click();assert.deepEqual(matrixPairs(one),expectedPairs(raw));assert.match(one.$('schedule-dialog-badge').textContent,/기본 출전표/);assert.equal(one.$('schedule-shared-note'),null);assert.equal(one.$('schedule-footer').hidden,true);assert.equal(store.entries.has('teamLineups/C'),false);assert.equal(one.$('matches').querySelectorAll('.official-match').length,40);assert.equal(one.$('match-editor'),null);assert.equal(one.$('match-opponent1'),null);const before=matrixPairs(one);scheduleCell(one,raw.matches[0].id).click();assert.deepEqual(matrixPairs(one),before);
 store.entries.set('teamLineups/C',{...second,revision:1});store.broadcast();await one.flush();assert.equal(one.$('schedule-dialog-badge').textContent,'');assert.equal(one.$('schedule-dialog-badge').hidden,true);assert.equal(one.$('schedule-dialog-subtitle').hidden,true);assert.deepEqual(matrixPairs(one),expectedPairs(second));assert.equal(one.$('schedule-footer').hidden,true);one.$('schedule-close').click();assert.deepEqual(matrixPairs(one),expectedPairs(swap.result));
});

test('일부 고정 GUI는 별도 지정 카드와 안내를 표시하고 추가·중복검사·해제·모드 전환을 유지한다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=strategy',mobile:true});await one.flush();await one.advance();const editor=one.$('fixed-pairs-editor'),guide=one.$('fixed-pairs-guide');assert.equal(editor.hidden,true);assert.equal(guide.hidden,true);assert.equal(one.$('mode-player-count').textContent,'C조 · '+Object.keys(one.window.BOARD_DATA.teams.C).length+'명');one.clickText('operation-modes',one.window.PAIRING_MODEL.modeLabels.partial);await one.advance();assert.equal(editor.hidden,false);assert.equal(guide.hidden,false);assert.equal(editor.parentNode,one.document.querySelector('.strategy-panel'));assert.notEqual(editor.parentNode,guide.parentNode);assert.equal(guide.parentNode.className,'pairing-mode-panel');assert.equal(one.$('add-fixed-pair').parentNode.className,'fixed-pair-fields');assert.equal(one.$('add-fixed-pair').textContent,'추가');assert.equal(one.$('add-fixed-pair').disabled,true);
 one.select('fixed-player1','냉면');one.select('fixed-player2','기른지');assert.equal(one.$('add-fixed-pair').disabled,false);one.$('add-fixed-pair').click();await one.advance();let rows=one.$('fixed-pairs-list').querySelectorAll('.fixed-pair-row');assert.equal(rows.length,1);assert.equal(rows[0].querySelector('.fixed-pair-names').textContent,'냉면×기른지');assert.equal(rows[0].querySelectorAll('button').length,1);assert.equal(one.document.activeElement,one.$('fixed-player1'));for(const card of one.$('pair-options').querySelectorAll('.pair-option'))assert.ok(JSON.parse(card.dataset.pairs).some(pair=>pair.includes('냉면')&&pair.includes('기른지')));
 one.select('fixed-player1','기른지');one.select('fixed-player2','냉면');assert.equal(one.$('add-fixed-pair').disabled,true);assert.match(one.$('fixed-pair-status').textContent,/이미 지정/);one.select('fixed-player2','숭');assert.equal(one.$('add-fixed-pair').disabled,false);one.$('add-fixed-pair').click();await one.advance();assert.equal(one.$('fixed-pairs-list').querySelectorAll('.fixed-pair-row').length,2);one.clickText('operation-modes',one.window.PAIRING_MODEL.modeLabels.free);await one.advance();assert.equal(editor.hidden,true);assert.equal(guide.hidden,true);assert.equal(one.$('mode-player-count').textContent,'C조 · '+Object.keys(one.window.BOARD_DATA.teams.C).length+'명');one.clickText('operation-modes',one.window.PAIRING_MODEL.modeLabels.partial);await one.advance();assert.equal(one.$('fixed-pairs-list').querySelectorAll('.fixed-pair-row').length,2);one.$('fixed-pairs-list').querySelector('.fixed-pair-remove').click();await one.advance();assert.equal(one.$('fixed-pairs-list').querySelectorAll('.fixed-pair-row').length,1);assert.equal(one.document.activeElement,one.$('fixed-player1'));
});

test('다른 팀끼리 경기는 기록 저장만 표시하고 상대 분석·삭제 버튼은 표시하지 않는다',async()=>{
 const store=firestoreFixture(),one=browser(store,{hash:'#page=strategy'});await one.flush();await one.advance();one.$('tab-schedule').click();let matches=one.$('matches').querySelectorAll('.official-match');assert.equal(matches.length,40);assert.match(one.$('matches').textContent,/16:30/);assert.equal(one.$('matches').querySelectorAll('.matrix-match').length,20);assert.equal(Object.keys(one.window.PLAYER_PROFILE_CLOUD.opponentRecords).length,0);
 const official=one.window.BOARD_DATA.tournamentSchedule.find(match=>match.sides.every(side=>side.team!=='C'));matches.find(node=>node.dataset.officialMatch===official.id).click();assert.equal(one.$('official-record-dialog').open,true);const sides=official.sides.map(side=>side.team);assert.equal(one.$('official-record-body').querySelectorAll('.record-team').length,2);assert.equal(one.$('official-record-body').querySelectorAll('.record-actions').every(actions=>actions.children.length===1),true);assert.doesNotMatch(one.$('official-record-description').textContent,/분석/);assert.equal(one.$('official-record-body').querySelectorAll('.record-candidate-list').length,0);assert.match(one.$('official-record-body').textContent,/기록 0\/20경기/);
 for(const team of sides){const roster=Object.keys(one.window.BOARD_DATA.teams[team]),pair=roster.filter(name=>one.window.BOARD_DATA.teams[team][name].tier!=='love').slice(0,2);one.select('record-'+team+'-0',team+':'+pair[0]);one.select('record-'+team+'-1',team+':'+pair[1]);await Promise.all(one.$('official-record-body').querySelectorAll('button').find(node=>node.textContent===team+'조 기록 저장').click());await one.flush();assert.deepEqual(clone(one.window.PLAYER_PROFILE_CLOUD.opponentRecords[official.id][team]).sort(),pair.map(name=>team+':'+name).sort());}
 assert.equal(one.$('official-record-body').querySelectorAll('.record-candidates').length,0);assert.equal(store.entries.has('teamLineups/C'),false);for(const actions of one.$('official-record-body').querySelectorAll('.record-actions')){assert.equal(actions.children.length,1);assert.match(actions.children[0].textContent,/조 기록 저장/);assert.doesNotMatch(actions.textContent,/분석|삭제/);}one.$('official-record-close').click();assert.equal(one.$('official-record-dialog').open,false);assert.equal(one.document.activeElement.dataset.officialMatch,official.id);one.clickText('filters','A조');assert.equal(one.$('matches').querySelectorAll('.official-match').length,20);
});

test('기록 후보는 실제 개수 5개 이하일 때만 나오고 원격 변경·연결 오류는 저장을 막는다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=strategy'});await one.flush();await one.advance();const cloud=one.window.PLAYER_PROFILE_CLOUD,model=one.window.TOURNAMENT_MODEL,original=model.candidates;one.$('tab-schedule').click();const match=one.window.BOARD_DATA.tournamentSchedule[0],team=match.sides[0].team,roster=Object.keys(one.window.BOARD_DATA.teams[team]),pair=roster.slice(0,2).map(name=>team+':'+name);model.candidates=()=>({count:5,pairs:Array.from({length:5},()=>pair),showPairs:true,knownCount:15,unknownCount:5});one.$('matches').querySelectorAll('.official-match').find(node=>node.dataset.officialMatch===match.id).click();assert.equal(one.$('official-record-body').querySelectorAll('.record-candidate-list')[0].querySelectorAll('li').length,5);assert.match(one.$('official-record-body').textContent,/기록 15\/20경기/);model.candidates=()=>({count:6,pairs:[],showPairs:false,knownCount:14,unknownCount:6});one.window.dispatchEvent({type:'opponentrecordschange'});assert.equal(one.$('official-record-body').querySelectorAll('.record-candidate-list').length,0);
 one.select('record-'+team+'-0',pair[0]);one.select('record-'+team+'-1',pair[1]);cloud.opponentRecordRevisions[team]++;one.window.dispatchEvent({type:'opponentrecordschange'});const save=one.$('official-record-body').querySelectorAll('button').find(node=>node.textContent===team+'조 기록 저장');assert.equal(save.disabled,true);assert.match(one.$('official-record-body').textContent,/다른 기기/);cloud.opponentRecordsError='permission-denied';one.window.dispatchEvent({type:'opponentrecordschange'});assert.equal(one.$('retry-tournament-records').hidden,false);assert.equal(one.$('official-record-retry').hidden,false);assert.match(one.$('official-record-connection').textContent,/접근 권한/);let retries=0;cloud.retryOpponentRecords=()=>retries++;one.$('official-record-retry').click();assert.equal(retries,1);assert.equal(one.$('matches').querySelectorAll('.official-match').length,40);model.candidates=original;
});

test('추천 계산 전에도 공식40경기와 실제기록은 열리고 C조 편성은 준비 후 갱신된다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=strategy',deferWorkers:true});await one.flush();await one.advance();one.$('tab-schedule').click();assert.equal(one.$('matches').querySelectorAll('.official-match').length,40);assert.equal(one.$('matches').querySelectorAll('.matrix-match').length,0);assert.equal(one.$('schedule-content').hidden,false);assert.match(one.$('schedule-dialog-subtitle').textContent,/준비 중/);one.$('matches').querySelector('.official-match').click();assert.equal(one.$('official-record-dialog').open,true);one.$('official-record-close').click();one.workerRequests.at(-1).reply();await one.flush();assert.equal(one.$('matches').querySelectorAll('.matrix-match').length,20);
});

test('셀 전체 터치는 선택을 막고 부유 카드로 이동하며 잘못된 놓기·스크롤·취소를 구분한다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=strategy',mobile:true});await one.flush();await one.advance();visibleCard(one).querySelector('.pair-option-select').click();const plan=one.window.fixtureRecommendations[0],invalid=findSwap(one,plan,{valid:false,errorPattern:/동시간 중복/}),before=matrixPairs(one),source=scheduleCell(one,invalid.first.id),target=scheduleCell(one,invalid.second.id);assert.equal(source.querySelector('.matrix-drag-handle'),null);assert.equal(source.dataset.editable,'true');let blocked=0;for(const type of ['contextmenu','selectstart'])source.dispatchEvent({type,preventDefault(){blocked++;}});assert.equal(blocked,2);
 const point=(x=100,y=200)=>({identifier:31,clientX:x,clientY:y}),start=()=>source.dispatchEvent({type:'touchstart',touches:[point()]});start();one.document.dispatchEvent({type:'touchmove',touches:[point(100,220)],preventDefault(){assert.fail('Early swipe must scroll');}});await one.advance(350);assert.equal(one.document.querySelector('.schedule-drag-ghost'),null);assert.deepEqual(matrixPairs(one),before);
 start();await one.advance(350);assert.ok(one.document.querySelector('.schedule-drag-ghost'));assert.equal(source.classList.contains('drag-source'),true);one.document.dispatchEvent({type:'pointercancel',pointerId:31,pointerType:'touch'});assert.ok(one.document.querySelector('.schedule-drag-ghost'));one.document.elementFromPoint=()=>target;let prevented=false;one.document.dispatchEvent({type:'touchmove',touches:[point(140,240)],preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.match(one.document.querySelector('.schedule-drag-ghost').getAttribute('style'),/left:140px/);assert.equal(target.classList.contains('drop-invalid'),true);one.document.dispatchEvent({type:'touchend',touches:[],changedTouches:[point(140,240)],preventDefault(){}});assert.deepEqual(matrixPairs(one),before);assert.match(one.$('schedule-drag-status').textContent,/동시간 중복/);assert.equal(source.draggable,true);assert.equal(one.document.querySelector('.schedule-drag-ghost'),null);
 start();await one.advance(350);one.document.dispatchEvent({type:'touchstart',touches:[point(),{identifier:32}]});assert.equal(one.document.querySelector('.schedule-drag-ghost'),null);assert.deepEqual(matrixPairs(one),before);
 one.$('schedule-close').click();one.$('tab-schedule').click();assert.equal(one.$('matches').querySelectorAll('.matrix-drag-handle').length,0);assert.equal(one.$('matches').querySelectorAll('.official-planned-label').length,0);assert.equal(one.$('matches').querySelectorAll('.official-unrecorded').length,0);assert.ok(!one.$('matches').textContent.includes('실제 출전 미입력'));assert.ok(!one.$('matches').textContent.includes('예정 편성'));for(const cell of one.$('matches').querySelectorAll('.official-match')){const sides=cell.querySelectorAll('.official-team-line');if(sides.some(side=>side.dataset.team==='C')){assert.equal(sides[0].dataset.team,'C');assert.equal(sides[0].querySelector('.official-team-label'),null);}}
});

test('공유 C셀은 실제 한 페어를 우선하고 읽기 전용 하단은 숨기며 초안 확정 버튼은 유지한다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=strategy'});await one.flush();await one.advance();const plan=clone(one.window.fixtureRecommendations[0]);one.$('tab-schedule').click();const official=one.window.BOARD_DATA.tournamentSchedule.find(match=>match.sides.some(side=>side.team==='C')),number=official.sides.find(side=>side.team==='C').number,planned=plan.matches.find(match=>match.id===number).pair,cloud=one.window.PLAYER_PROFILE_CLOUD;for(const pair of [planned,Object.keys(one.window.BOARD_DATA.teams.C).filter(name=>!planned.includes(name)).slice(0,2)]){cloud.opponentRecords[official.id]={C:pair.map(name=>'C:'+name)};one.window.dispatchEvent({type:'opponentrecordschange'});const cell=one.$('matches').querySelectorAll('.official-match').find(node=>node.dataset.officialMatch===official.id),own=cell.querySelectorAll('.official-team-line')[0];assert.equal(own.dataset.team,'C');assert.deepEqual(own.querySelectorAll('.matrix-player-name').map(node=>node.textContent),pair);assert.equal(own.querySelectorAll('.official-own-name').length,0);assert.equal(own.querySelectorAll('.official-team-label').length,0);assert.equal(own.querySelectorAll('.matrix-run-warning').length,0);}assert.deepEqual(clone(one.window.fixtureRecommendations[0]),plan);assert.equal(one.$('schedule-footer').hidden,true);assert.equal(one.$('schedule-readonly-close'),null);assert.equal(one.document.querySelector('.schedule-footer-note'),null);one.$('schedule-close').click();visibleCard(one).querySelector('.pair-option-select').click();assert.equal(one.$('schedule-footer').hidden,false);assert.equal(one.$('schedule-confirm').hidden,false);assert.equal(one.$('schedule-cancel').hidden,false);
});

test('출전표 전용 주소와 브라우저 뒤로가기는 초안을 취소하고 추천 탐색·필터·스크롤을 복원한다',async()=>{
 const store=firestoreFixture(),one=browser(store,{hash:'#page=strategy',mobile:true});await one.flush();await one.advance();
 visibleCard(one).querySelector('.recommendation-next').click();const heading=visibleCard(one).querySelector('h3').textContent;one.clickText('filters','D조');one.window.scrollY=480;
 const originHash=one.location.hash;one.$('tab-schedule').click();
 assert.equal(new URLSearchParams(one.location.hash.slice(1)).get('page'),'schedule');assert.equal(new URLSearchParams(one.location.hash.slice(1)).has('schedule'),false);assert.equal(one.$('schedule-dialog').tagName,'SECTION');assert.equal(one.$('site-header').hidden,false);assert.equal(one.$('page-strategy').hidden,true);
 one.clickText('filters','A조');one.history.back();await one.advance(0);
 assert.equal(one.location.hash,originHash);assert.equal(one.$('schedule-dialog').hidden,true);assert.equal(one.$('site-header').hidden,false);assert.equal(visibleCard(one).querySelector('h3').textContent,heading);assert.equal(one.window.scrollY,480);assert.equal(new URLSearchParams(one.location.hash.slice(1)).get('filter'),'D');
 one.history.forward();await one.advance(0);assert.equal(one.$('schedule-dialog').hidden,false);assert.equal(one.$('schedule-dialog').dataset.readonly,'true');one.$('schedule-close').click();await one.advance(0);
 one.clickText('filters','전체');visibleCard(one).querySelector('.recommendation-prev').click();visibleCard(one).querySelector('.pair-option-select').click();const plan=clone(one.window.fixtureRecommendations[0]),swap=findSwap(one,plan,{otherTime:true});applySwap(one,swap);one.history.back();await one.advance(0);assert.deepEqual(matrixPairs(one),expectedPairs(plan));assert.equal(store.entries.has('teamLineups/C'),false);
 one.history.forward();await one.advance(0);assert.equal(one.$('schedule-dialog').hidden,false);assert.deepEqual(matrixPairs(one),expectedPairs(plan));
});

test('공유 출전표 주소를 바로 열거나 새로고침하면 공식 40경기와 원본 추천 1을 표시한다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=schedule&schedule=shared&origin=analysis',mobile:true});await one.flush();await one.advance();
 assert.equal(new URLSearchParams(one.location.hash.slice(1)).get('page'),'schedule');assert.equal(one.$('schedule-dialog').hidden,false);assert.equal(one.$('schedule-dialog').dataset.readonly,'true');assert.equal(one.$('matches').querySelectorAll('.official-match').length,40);assert.deepEqual(matrixPairs(one),expectedPairs(one.window.fixtureRecommendations[0]));assert.equal(one.$('schedule-footer').hidden,true);
 const reload=browser(firestoreFixture(),{hash:one.location.hash,mobile:true,historyState:one.history.state});await reload.flush();await reload.advance();assert.equal(reload.$('schedule-dialog').hidden,false);assert.equal(reload.$('matches').querySelectorAll('.official-match').length,40);reload.$('schedule-close').click();await reload.advance(0);assert.equal(reload.$('page-analysis').hidden,false);
});

test('출전표 저장 실패는 편집 페이지와 교환 초안을 유지하고 재시도 성공 시 이전 페이지로 돌아간다',async()=>{
 const store=firestoreFixture(),one=browser(store,{hash:'#page=strategy'});await one.flush();await one.advance();visibleCard(one).querySelector('.pair-option-select').click();const plan=one.window.fixtureRecommendations[0],swap=findSwap(one,plan,{otherTime:true});applySwap(one,swap);
 const cloud=one.window.PLAYER_PROFILE_CLOUD,save=cloud.saveLineup;cloud.saveLineup=async()=>{throw new Error('저장 실패 테스트');};await Promise.all(one.$('schedule-confirm').click());await one.flush();assert.equal(one.$('schedule-dialog').hidden,false);assert.match(one.$('schedule-save-status').textContent,/저장 실패 테스트/);assert.deepEqual(matrixPairs(one),expectedPairs(swap.result));cloud.saveLineup=save;await Promise.all(one.$('schedule-confirm').click());await one.flush();assert.equal(one.$('schedule-dialog').hidden,true);assert.equal(one.$('page-strategy').hidden,false);assert.deepEqual(store.entries.get('teamLineups/C').matches,clone(swap.result.matches));
});

test('출전표 편집 직접 주소에서 원격 프로필 변경 후 교환한 초안도 돌아가면 취소된다',async()=>{
 const store=firestoreFixture(),one=browser(store,{hash:'#page=schedule&schedule=edit&origin=strategy'}),two=browser(store);
 await one.flush();await one.advance();await two.flush();await two.advance();
 const requestsBefore=one.workerRequests.length;
 two.open('C:우디');two.choose('position','fore');await two.flush();await one.flush();await one.advance();
 assert.ok(one.workerRequests.length>requestsBefore,'Remote C profile change must invalidate recommendations');
 const plan=clone(one.window.fixtureRecommendations[0]),swap=findSwap(one,plan,{otherTime:true});
 assert.deepEqual(matrixPairs(one),expectedPairs(plan));applySwap(one,swap);assert.deepEqual(matrixPairs(one),expectedPairs(swap.result));
 one.$('schedule-close').click();await one.advance(0);assert.equal(one.$('page-strategy').hidden,false);
 visibleCard(one).querySelector('.pair-option-select').click();assert.deepEqual(matrixPairs(one),expectedPairs(plan));assert.equal(store.entries.has('teamLineups/C'),false);
});

function openRecordAnalysisFixture(one){
 one.$('tab-schedule').click();const match=one.window.BOARD_DATA.tournamentSchedule.find(item=>item.sides.some(side=>side.team==='C')&&item.sides.some(side=>side.team==='A'));
 one.$('matches').querySelectorAll('.official-match').find(node=>node.dataset.officialMatch===match.id).click();
 one.select('record-A-0','A:펩시');one.select('record-A-1','A:동글');return match;
}
test('출전표에서 C조 입력 없이 상대 AI 분석을 아래 표시하고 저장 전에도 생성·캐시 재사용한다',async()=>{
 for(const mobile of [false,true]){
  const store=firestoreFixture(),one=browser(store,{hash:'#page=strategy',mobile});await one.flush();await one.advance();
  const match=openRecordAnalysisFixture(one);assert.equal(one.$('record-C-0'),null);assert.equal(one.$('official-record-body').querySelectorAll('.record-team').length,1);
  assert.equal(one.$('record-analysis-A').hidden,true);assert.equal(store.api.generations,undefined);
  const action=one.$('record-analyze-A');assert.equal(action.textContent,'상대 분석 보기');assert.equal(action.disabled,false);
  assert.equal(action.parentNode.children[0].textContent,'A조 기록 저장');
  await Promise.all(action.click());await one.flush();
  const result=one.$('record-analysis-A');assert.equal(result.hidden,false);for(const text of ['AI 분석 · 완료','Gemini 연결 결과','주의할 점','대응방안','공략할 상황','펩시','동글'])assert.ok(result.textContent.includes(text),text);
  assert.equal(store.api.generations,1);assert.equal(one.window.PLAYER_PROFILE_CLOUD.opponentRecords[match.id],undefined);assert.equal(store.entries.has('teamLineups/C'),false);
  await Promise.all(one.$('record-analyze-A').click());await one.flush();assert.equal(store.api.generations,1);assert.match(one.$('record-analysis-A').textContent,/저장된 AI 분석/);
  one.$('official-record-close').click();assert.equal(one.$('official-record-dialog').open,false);
 }
});
test('출전표 분석은 선수 변경·창 닫기·시간 초과 후 늦은 결과를 버리고 재시도한다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=strategy'});await one.flush();await one.advance();const match=openRecordAnalysisFixture(one),cloud=one.window.PLAYER_PROFILE_CLOUD;
 const result={summary:'이전 선수 분석',cautions:[],responses:[],tactics:[]};let complete;
 cloud.analyzeMatchup=()=>new Promise(resolve=>{complete=resolve;});
 let pending=Promise.all(one.$('record-analyze-A').click());assert.equal(one.$('record-analyze-A').disabled,true);assert.match(one.$('record-analysis-A').textContent,/분석하고/);
 one.select('record-A-1','');complete({status:'ready',result});await pending;assert.equal(one.$('record-analysis-A').hidden,true);assert.equal(one.$('record-analyze-A').disabled,true);
 one.select('record-A-1','A:동글');pending=Promise.all(one.$('record-analyze-A').click());one.$('official-record-close').click();complete({status:'ready',result});await pending;
 one.$('matches').querySelectorAll('.official-match').find(node=>node.dataset.officialMatch===match.id).click();one.select('record-A-0','A:펩시');one.select('record-A-1','A:동글');assert.equal(one.$('record-analysis-A').hidden,true);
 pending=Promise.all(one.$('record-analyze-A').click());await one.advance(90001);assert.match(one.$('record-analysis-A').textContent,/시간이 오래/);assert.equal(one.$('record-analyze-A').disabled,false);
 complete({status:'ready',result});await pending;assert.ok(!one.$('record-analysis-A').textContent.includes(result.summary));
 cloud.analyzeMatchup=async()=>({status:'ready',result:{...result,summary:'새 분석 성공'}});await Promise.all(one.$('record-analyze-A').click());assert.match(one.$('record-analysis-A').textContent,/새 분석 성공/);
});
test('출전표 분석은 공동 생성 구독을 정리하고 연결 실패를 알린 뒤 다시 생성한다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=strategy'});await one.flush();await one.advance();openRecordAnalysisFixture(one);const cloud=one.window.PLAYER_PROFILE_CLOUD;let accept,unsubscribed=0;
 cloud.analyzeMatchup=async()=>({status:'pending',analysisKey:'shared'});cloud.subscribeAnalysis=(key,callback)=>{assert.equal(key,'shared');accept=callback;return ()=>unsubscribed++;};
 await Promise.all(one.$('record-analyze-A').click());assert.equal(one.$('record-analyze-A').disabled,true);
 accept({status:'ready',result:{summary:'공동 분석',cautions:[],responses:[],tactics:[]}});assert.equal(unsubscribed,1);assert.match(one.$('record-analysis-A').textContent,/공동 분석/);
 await Promise.all(one.$('record-analyze-A').click());one.select('record-A-1','');assert.equal(unsubscribed,2);accept({status:'ready',result:{summary:'낡은 결과',cautions:[],responses:[],tactics:[]}});assert.equal(one.$('record-analysis-A').hidden,true);
 one.select('record-A-1','A:동글');cloud.analyzeMatchup=async()=>{throw new Error('AI 연결 실패');};await Promise.all(one.$('record-analyze-A').click());assert.match(one.$('record-analysis-A').textContent,/AI 연결 실패/);assert.match(one.$('record-analysis-A').textContent,/기본 관찰 요약/);assert.equal(one.$('record-analyze-A').disabled,false);
});

test('최종 출전표는 경기 칸 여백도 기록·분석 창을 열고 C조 이동은 제공하지 않는다',async()=>{
 for(const mobile of [false,true]){
  const one=browser(firestoreFixture(),{hash:'#page=strategy',mobile});await one.flush();await one.advance();one.$('tab-schedule').click();
  const button=one.$('matches').querySelectorAll('.official-match').find(node=>node.querySelector('.official-c-plan')),cell=button.parentNode,id=button.dataset.officialMatch;
  assert.equal(one.$('schedule-dialog').dataset.readonly,'true');assert.equal(button.querySelector('.official-c-plan').draggable,false);
  cell.dispatchEvent({type:'click',target:cell});assert.equal(one.$('official-record-dialog').open,true);
  assert.equal(one.$('record-C-0'),null);assert.equal(one.$('official-record-body').querySelectorAll('.record-team').length,1);
  assert.equal(one.$('official-record-body').querySelectorAll('button').some(node=>node.textContent==='상대 분석 보기'),true);
  one.$('official-record-close').click();assert.equal(one.document.activeElement.dataset.officialMatch,id);
 }
});

test('공유 페어와 확정 보기 주소로 직접 연 최종 출전표도 PC에서 모든 경기 창을 연다',async()=>{
 const pairs=[['기른지','냉면'],['기른지','만두'],['기른지','숭'],['기른지','쏘오리'],['기른지','한치'],['꿉','냉면'],['꿉','만두'],['꿉','숭'],['꿉','쏘오리'],['꿉','우디'],['냉면','만두'],['냉면','우디'],['냉면','한치'],['만두','숭'],['만두','한치'],['숭','쏘오리'],['숭','우디'],['쏘오리','우디'],['쏘오리','한치'],['우디','한치']];
 const hash='#page=schedule&mode=free&variant=3&view=confirmed&filter=all&schedule=shared&origin=strategy&pairs='+encodeURIComponent(JSON.stringify(pairs));
 const one=browser(firestoreFixture(),{hash,mobile:false});await one.flush();await one.advance();
 assert.equal(one.$('schedule-dialog').dataset.readonly,'true');assert.equal(one.$('matches').querySelectorAll('.official-match').length,40);
 for(const button of one.$('matches').querySelectorAll('.official-match')){
  button.click();assert.equal(one.$('official-record-dialog').open,true,button.dataset.officialMatch);
  assert.equal(one.$('official-record-body').querySelectorAll('.record-team').some(node=>node.dataset.team==='C'),false);
  one.$('official-record-close').click();assert.equal(one.document.activeElement.dataset.officialMatch,button.dataset.officialMatch);
 }
});

test('전체 대진이 없는 오래된 데이터는 클릭 불가능한 20경기 표 대신 복구 안내를 표시한다',async()=>{
 for(const missing of ['data','model']){
  const one=browser(firestoreFixture(),{hash:'#page=strategy'});await one.flush();await one.advance();
  if(missing==='data')delete one.window.BOARD_DATA.tournamentSchedule;else delete one.window.TOURNAMENT_MODEL;
  one.$('tab-schedule').click();
  assert.equal(one.$('matches').querySelectorAll('.matrix-match').length,0);
  assert.equal(one.$('tournament-record-status').hidden,false);assert.match(one.$('tournament-record-status').textContent,/전체 경기 정보를 불러오지 못했습니다/);
 }
});

test('대진표 응원 배너는 검토한 30개 문구를 선수 이름·출처와 함께 순환한다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=schedule&schedule=shared'});await one.flush();await one.advance();
 assert.equal(one.$('schedule-cheer').hidden,false);assert.equal(one.$('schedule-guide').hidden,true);assert.equal(one.$('schedule-dialog-title').textContent,'최강 C조 대진표 🔥');
 const seen=new Set();for(let index=0;index<30;index++){
  seen.add(one.$('cheer-text').textContent+' - '+one.$('cheer-author').textContent.slice(1,-1));
  assert.ok(one.$('cheer-emoji').textContent);assert.match(one.document.querySelector('.cheer-attribution').textContent.trim(),/^-\s*\[.+\]$/);
  await one.advance(5000);
 }
 assert.equal(seen.size,30);assert.ok([...seen].some(text=>text==='압박감은 특권이다. - 빌리 진 킹'));
 assert.ok([...seen].some(text=>text==='테니스도 팀 스포츠다. 성공은 함께 만들어간다. - 로저 페더러'));assert.ok([...seen].some(text=>text==='패배에서 배우되, 과거에 머물지 말고 현재를 살자. - 세리나 윌리엄스'));
 assert.equal(one.$('cheer-prev'),null);assert.equal(one.$('cheer-next'),null);assert.equal(one.$('cheer-face'),null);
});
test('응원 배너는 자동으로 넘기되 일시정지·화면 숨김·경기 창에서는 멈춘다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=schedule&schedule=shared'});await one.flush();await one.advance();
 let text=one.$('cheer-text').textContent;await one.advance(5000);assert.notEqual(one.$('cheer-text').textContent,text);
 one.$('cheer-pause').click();text=one.$('cheer-text').textContent;await one.advance(20000);assert.equal(one.$('cheer-text').textContent,text);assert.equal(one.$('cheer-pause').getAttribute('aria-pressed'),'true');
 one.$('cheer-pause').click();one.document.hidden=true;one.document.dispatchEvent({type:'visibilitychange'});await one.advance(5000);assert.equal(one.$('cheer-text').textContent,text);
 one.document.hidden=false;one.document.dispatchEvent({type:'visibilitychange'});await one.advance(5000);assert.notEqual(one.$('cheer-text').textContent,text);
 one.$('matches').querySelector('.official-match').click();text=one.$('cheer-text').textContent;await one.advance(20000);assert.equal(one.$('cheer-text').textContent,text);
 one.$('official-record-close').click();await one.advance(5000);assert.notEqual(one.$('cheer-text').textContent,text);
 one.$('schedule-close').click();await one.advance(0);assert.equal(one.$('schedule-cheer').hidden,true);text=one.$('cheer-text').textContent;await one.advance(5000);assert.equal(one.$('cheer-text').textContent,text);
});

test('대진표는 첫 탭이며 네 탭 사이를 이동해도 공유 대진과 편집 모드를 혼동하지 않는다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=players'});await one.flush();await one.advance();
 assert.deepEqual(one.document.querySelectorAll('.page-tab').map(tab=>tab.textContent),['대진표','선수정보','상대 페어 분석','페어 조합']);assert.equal(one.$('open-team-schedule'),null);
 for(const page of ['schedule','players','analysis','schedule','strategy','schedule']){
  one.$('tab-'+page).click();await one.advance(0);assert.equal(one.document.body.dataset.page,page);assert.equal(one.$('site-header').hidden,false);assert.equal(one.$('tab-'+page).getAttribute('aria-selected'),'true');
  if(page==='schedule'){assert.equal(one.$('schedule-dialog').hidden,false);assert.equal(one.$('schedule-dialog').dataset.readonly,'true');assert.equal(one.$('matches').querySelectorAll('.official-match').length,40);assert.equal(one.$('schedule-footer').hidden,true);}
 }
 one.$('tab-strategy').click();await one.advance();visibleCard(one).querySelector('.pair-option-select').click();assert.equal(one.$('site-header').hidden,true);assert.equal(one.$('schedule-dialog').dataset.readonly,'false');assert.equal(one.$('schedule-footer').hidden,false);
 one.$('schedule-close').click();await one.advance(0);one.$('tab-schedule').click();assert.equal(one.$('site-header').hidden,false);assert.equal(one.$('schedule-dialog').dataset.readonly,'true');
});
test('배너는 5초 뒤 전환하고 클릭하면 전체 명언 30개 팝업을 열며 닫을 때 초점을 돌려준다',async()=>{
 const store=firestoreFixture(),one=browser(store,{hash:'#page=schedule&schedule=shared'});await one.flush();
 const before=one.$('cheer-text').textContent;await one.advance(4999);assert.equal(one.$('cheer-text').textContent,before);await one.advance(1);assert.notEqual(one.$('cheer-text').textContent,before);
 one.$('cheer-open').click();assert.equal(one.$('cheer-dialog').open,true);assert.equal(one.$('cheer-dialog-title').textContent,'멘탈 잡아!!!!!!!!!!!!!!!');assert.equal(one.$('cheer-dialog-description'),null);assert.equal(one.document.activeElement,one.$('cheer-close'));
 const items=one.$('cheer-list').querySelectorAll('li');assert.equal(items.length,30);assert.equal(new Set(items.map(item=>item.textContent)).size,30);
 for(const item of items){const link=item.querySelector('a');assert.match(link.href,/^https:\/\//);assert.match(link.textContent,/^\[.+\]$/);assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');}
 const current=one.$('cheer-text').textContent;await one.advance(10000);assert.equal(one.$('cheer-text').textContent,current);assert.equal(store.entries.has('geminiAiUsage/team'),false);
 one.$('cheer-close').click();assert.equal(one.$('cheer-dialog').open,false);assert.equal(one.document.activeElement,one.$('cheer-open'));
});
test('전체 명언 팝업이 열린 상태로 뒤로 가면 팝업도 닫고 이전 탭을 복원한다',async()=>{
 const one=browser(firestoreFixture(),{hash:'#page=players'});await one.flush();await one.advance();one.$('tab-schedule').click();one.$('cheer-open').click();assert.equal(one.$('cheer-dialog').open,true);
 one.history.back();await one.advance(0);assert.equal(one.$('cheer-dialog').open,false);assert.equal(one.$('page-players').hidden,false);assert.equal(one.$('tab-players').getAttribute('aria-selected'),'true');
});

test('일반 첫 접속은 대진표를 열고 페이지·선수를 지정한 직접 링크는 선택을 보존한다',async()=>{
 for(const mobile of [false,true]){
  const first=browser(firestoreFixture(),{hash:'',mobile});await first.flush();await first.advance();
  assert.equal(first.document.body.dataset.page,'schedule');assert.equal(first.$('tab-schedule').getAttribute('aria-selected'),'true');assert.equal(first.$('schedule-dialog').hidden,false);assert.equal(first.$('schedule-dialog').dataset.readonly,'true');assert.equal(first.$('matches').querySelectorAll('.official-match').length,40);
  const player=browser(firestoreFixture(),{hash:'#player=C%3A우디',mobile});await player.flush();await player.advance();
  assert.equal(player.document.body.dataset.page,'players');assert.equal(player.$('tab-players').getAttribute('aria-selected'),'true');assert.equal(mobile?!player.$('player-detail-page').hidden:player.$('ratings-panel').open,true);
 }
 for(const page of ['players','analysis','strategy']){
  const linked=browser(firestoreFixture(),{hash:'#page='+page});await linked.flush();await linked.advance();assert.equal(linked.document.body.dataset.page,page);assert.equal(linked.$('tab-'+page).getAttribute('aria-selected'),'true');
 }
});

test('공유 대진표는 짧은 주소로 공유하고 선택한 페어 구성은 편집 주소와 뒤로가기에 보존한다',async()=>{
 const store=firestoreFixture(),one=browser(store,{hash:'#page=strategy'});await one.flush();await one.advance();
 visibleCard(one).querySelector('.pair-option-select').click();assert.ok(new URLSearchParams(one.location.hash.slice(1)).has('pairs'));const editHash=one.location.hash;
 one.$('schedule-close').click();await one.advance(0);const strategyHash=one.location.hash;
 one.$('tab-schedule').click();assert.equal(one.location.hash,'#page=schedule');assert.ok(new URLSearchParams(one.history.state.teamcScheduleContext).has('pairs'));
 await Promise.all(one.$('share').click());assert.equal(one.window.copiedLink,'https://gbkchee.github.io/team-c-victory/#page=schedule');
 one.clickText('filters','A조');assert.equal(one.location.hash,'#page=schedule&filter=A');
 one.history.back();await one.advance(0);assert.equal(one.location.hash,strategyHash);
 one.history.forward();await one.advance(0);assert.equal(one.location.hash,'#page=schedule&filter=A');assert.equal(one.$('schedule-dialog').dataset.readonly,'true');
 one.$('tab-strategy').click();await one.advance();visibleCard(one).querySelector('.pair-option-select').click();assert.equal(new URLSearchParams(one.location.hash.slice(1)).get('pairs'),new URLSearchParams(editHash.slice(1)).get('pairs'));
});
test('새 브라우저의 짧은 대진표 링크는 서버 최신 확정표를 불러오고 필터를 유지한다',async()=>{
 const store=firestoreFixture(),one=browser(store,{hash:'#page=strategy'});await one.flush();await one.advance();const plan=clone(one.window.fixtureRecommendations[1]);store.entries.set('teamLineups/C',{...plan,revision:1});store.broadcast();await one.flush();
 const other=browser(store,{hash:'#page=schedule&filter=D'});await other.flush();await other.advance();assert.equal(other.location.hash,'#page=schedule&filter=D');assert.equal(other.$('schedule-dialog').dataset.readonly,'true');assert.equal(other.$('schedule-dialog-badge').hidden,true);
 const expected=Object.fromEntries(plan.matches.filter(match=>match.team==='D').map(match=>[match.id,match.pair.join(' ')]));assert.deepEqual(matrixPairs(other),expected);
});
