'use strict';
// Dependency-free DOM/Firestore fixtures exercise the real scripts; they do not render CSS.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
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
 select(){}
 scrollIntoView(){}
 get isConnected(){return this.document.body.contains(this);}
 getClientRects(){return this.isConnected?[{}]:[];}
 getBoundingClientRect(){return {left:0,right:100,top:0,bottom:100};}
 showModal(){this.open=true;}
 close(){this.open=false;this.dispatchEvent({type:'close'});}
}
function documentFixture(){
 const document=new EventTarget();document.body=new Element('body',document);document.createElement=tag=>new Element(tag,document);document.getElementById=id=>document.body.querySelector('#'+id);document.querySelectorAll=selector=>document.body.querySelectorAll(selector);
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
  initializeApp:()=>({}),getAuth:()=>({currentUser:{uid:'fixture-user'}}),signInAnonymously:async()=>({}),getFirestore:()=>({}),getFunctions:()=>({}),
  collection:(_,path)=>({path,collection:true}),doc:(ref,...parts)=>({path:[ref.path,...parts].filter(Boolean).join('/')}),getDocs:async ref=>snapshot(ref),serverTimestamp:()=>({seconds:1}),
  onSnapshot:(ref,callback)=>{const entry={ref,callback};subscriptions.add(entry);queueMicrotask(()=>callback(snapshot(ref)));return ()=>subscriptions.delete(entry);},
  runTransaction:(_,callback)=>{const task=tail.then(async()=>{const writes=[];const result=await callback({get:async ref=>docSnapshot(ref.path),set:(ref,value)=>writes.push([ref.path,clone(value)])});for(const [path,value] of writes)entries.set(path,value);if(writes.length)broadcast();return result;});tail=task.catch(()=>{});return task;},
  httpsCallable:()=>async request=>({data:await api.analyze(request)})
 };
 return {entries,api,broadcast};
}
function browser(store,{saved={},hash=''}={}){
 const document=documentFixture(),window=new EventTarget(),storage=new Map(Object.entries(saved)),timers=new Map();let clock=0,sequence=0;
 const location={hash,href:'https://gbkchee.github.io/team-c-victory/'+hash};
 const context={window,document,location,history:{replaceState:(_,__,value)=>{location.hash=value;location.href='https://gbkchee.github.io/team-c-victory/'+value;}},navigator:{clipboard:{writeText:async()=>{}}},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},CustomEvent:class {constructor(type,{detail}={}){this.type=type;this.detail=detail;}},URLSearchParams,Intl,console,
  setTimeout:(callback,delay=0)=>{const id=++sequence;timers.set(id,{callback,due:clock+delay});return id;},clearTimeout:id=>timers.delete(id),...store.api};
 window.location=location;window.matchMedia=()=>({matches:false});
 context.Option=function(text,value){const option=document.createElement('option');option.textContent=text;option.value=value;return option;};
 context.Worker=class {
  constructor(){this.stopped=false;}
  terminate(){this.stopped=true;}
  postMessage(message){context.setTimeout(()=>{if(!this.stopped)this.onmessage({data:{generation:message.generation,plans:window.PAIRING_MODEL.generate(window.BOARD_DATA,message.profiles,message.options)}});},0);}
 };
 vm.createContext(context);for(const file of ['data.js','profile-model.js','ratings.js','pairing-model.js','app.js'])vm.runInContext(read(file),context,{filename:file});
 vm.runInContext(read('firebase-cloud.js').replace(/^import .*;\n/gm,''),context,{filename:'firebase-cloud.js'});
 const flush=async()=>{for(let i=0;i<2500;i++)await Promise.resolve();};
 const advance=async(ms=150)=>{clock+=ms;for(;;){const ready=[...timers].filter(([,item])=>item.due<=clock);if(!ready.length)break;for(const [id,item] of ready){timers.delete(id);item.callback();}await flush();}};
 const $=id=>document.getElementById(id),clickText=(id,text)=>{const node=$(id).querySelectorAll('button').find(node=>node.textContent===text);assert.ok(node,'Button missing: '+text);node.click();};
 const select=(id,value)=>{$(id).value=value;$(id).dispatchEvent({type:'change'});};
 const open=id=>{const node=$('player-roster').querySelectorAll('button').find(node=>node.dataset.player===id);assert.ok(node);node.click();};
 const choose=(field,value)=>{const input=$('profile-'+field+'-'+value);assert.ok(input);input.checked=true;input.dispatchEvent({type:'change'});};
 const submit=(id,text)=>{const input=$(id);input.value=text;let form=input.parentNode;while(form.tagName!=='FORM')form=form.parentNode;form.dispatchEvent({type:'submit',preventDefault(){}});};
 return {window,document,storage,$,flush,advance,clickText,select,open,choose,submit};
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
 const one=browser(store,{hash:'#page=analysis&own1=우디&own2=숭&team=D&p1=아르(시트%3A%20야르)&p2=스노'});await one.flush();assert.equal(calls,0);assert.equal(one.$('ai-analyze').disabled,false);one.$('ai-analyze').click();assert.equal(calls,1);
 one.select('opponent2','초코');release({status:'ready',result:{direction:'늦은 이전 결과',tactics:[],roles:[],checks:[]}});await one.flush();assert.ok(!one.$('analysis-result').textContent.includes('늦은 이전 결과'));assert.equal(one.$('ai-analyze').disabled,false);
 store.api.analyze=async request=>{calls++;assert.ok(request.opponentPlayerIds.includes('D:아르(시트: 야르)'));return {status:'ready',cached:true,result:{direction:'새 선택 분석',tactics:[{title:'초반 확인',action:'로브 대처를 확인하세요.',basis:'입력 기록'}],roles:request.ownPlayerIds.map(playerId=>({playerId,action:'커버 약속'})),checks:['가능한 샷 확인']}};};
 await Promise.all(one.$('ai-analyze').click());assert.equal(calls,2);assert.ok(one.$('analysis-result').textContent.includes('새 선택 분석'));assert.ok(one.$('analysis-result').textContent.includes('팀원이 생성한 분석'));
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
 const one=browser(store,{hash:'#page=analysis&own1=우디&own2=숭&team=A&p1=동글&p2=펩시'});await one.flush();await Promise.all(one.$('ai-analyze').click());assert.equal(one.$('ai-analyze').disabled,true);
 store.entries.set('matchupAnalyses/'+key,{status:'ready',result:{direction:'공동 분석 완료',tactics:[],roles:[],checks:[]}});store.broadcast();await one.flush();assert.ok(one.$('analysis-result').textContent.includes('공동 분석 완료'));assert.equal(one.$('ai-analyze').disabled,false);
 store.api.analyze=async()=>({status:'pending',analysisKey:'fixture-timeout'});await Promise.all(one.$('ai-analyze').click());await one.advance(90001);assert.ok(one.$('analysis-result').textContent.includes('다시 시도'));assert.equal(one.$('ai-analyze').disabled,false);
});
test('연결 중 수정한 항목은 보존하고 다른 항목은 최신 서버 값으로 읽는다',async()=>{
 const store=firestoreFixture(),{blankDocuments}=require('./reset-test-data.cjs');for(const [path,value] of blankDocuments({seconds:1}))store.entries.set(path,value);
 store.entries.get('playerProfilesV2/C:우디').profile.position='back';
 const one=browser(store,{saved:{'courtside.player-profiles.v4':JSON.stringify({'C:우디':{position:'fore'}})}});one.open('C:우디');one.choose('courtPreference','net');await one.flush();
 const profile=one.window.PLAYER_PROFILES.get('C','우디');assert.equal(profile.position,'back');assert.equal(profile.courtPreference,'net');assert.equal(one.window.PLAYER_PROFILE_CLOUD.pendingCount,0);
 assert.equal(store.entries.get('playerProfilesV2/C:우디').profile.courtPreference,'net');
});
