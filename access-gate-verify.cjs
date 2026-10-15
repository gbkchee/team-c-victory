'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const html=fs.readFileSync(__dirname+'/index.html','utf8'),source=fs.readFileSync(__dirname+'/access-gate.js','utf8');
const answer='testcv',fixtureHash=crypto.createHash('sha256').update(answer).digest('hex');
class Target {
 constructor(){this.listeners={};this.attributes={};this.dataset={};this.hidden=false;this.inert=false;this.disabled=false;this.value='';}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
 dispatchEvent(event){return (this.listeners[event.type]||[]).map(fn=>fn(event));}
 setAttribute(key,value){this.attributes[key]=value;}
 removeAttribute(key){delete this.attributes[key];}
 focus(){this.document.activeElement=this;}
 select(){}
}
function browser({motion=false,reduced=false,failScript='',secure=true,delayDigest=false,delayScripts=false}={}){
 const document=new Target(),window=new Target(),nodes=new Map(),frames=new Map(),timers=new Map(),media=new Target(),scripts=[];let sequence=0,entered=0,rejected=0,reloaded=false,release,timerNow=0;
 const classes=new Set(['entry-open']);document.body={classList:{remove:name=>classes.delete(name)}};
 for(const [,id] of html.matchAll(/\bid="([^"]+)"/g)){const node=new Target();node.document=document;nodes.set(id,node);}
 document.getElementById=id=>{assert.ok(nodes.has(id),'Element missing: '+id);return nodes.get(id);};
 document.createElement=()=>new Target();document.head={append(script){scripts.push(script);if(!delayScripts)queueMicrotask(()=>failScript&&script.src.startsWith(failScript)?script.onerror():script.onload());}};
 nodes.get('team-app').hidden=true;nodes.get('team-app').inert=true;nodes.get('team-app').attributes['aria-hidden']='true';nodes.get('player-detail-page').hidden=true;
 media.matches=reduced;window.matchMedia=()=>media;window.location={hash:'#page=analysis&team=D&p1=아르&p2=스노',reload(){reloaded=true;}};
 if(motion){window.requestAnimationFrame=callback=>{const id=++sequence;frames.set(id,callback);return id;};window.cancelAnimationFrame=id=>frames.delete(id);}
 window.setTimeout=(callback,delay)=>{const id=++sequence;timers.set(id,{callback,due:timerNow+delay});return id;};window.clearTimeout=id=>timers.delete(id);
 window.addEventListener('teamentryready',()=>entered++);
 window.addEventListener('teamentryinvalid',()=>rejected++);
 const digest=async(...args)=>{if(delayDigest)await new Promise(resolve=>{release=resolve;});return crypto.webcrypto.subtle.digest(...args);};
 vm.runInNewContext(source.replace(/const codeHash='[^']*'/,"const codeHash='"+fixtureHash+"'"),{window,document,CustomEvent:class{constructor(type){this.type=type;}},TextEncoder,Uint8Array,crypto:secure?{subtle:{digest}}:undefined});
 return {document,window,nodes,classes,frames,timers,media,scripts,entered:()=>entered,rejected:()=>rejected,reloaded:()=>reloaded,release:()=>release(),
  async submit(value){for(let i=0;i<6;i++)nodes.get('access-code-'+i).value=value[i]||'';await Promise.all(nodes.get('access-form').dispatchEvent({type:'submit',preventDefault(){}}));},
  advance(now){const callbacks=[...frames.values()];frames.clear();for(const fn of callbacks)fn(now);},
  advanceTimers(ms){timerNow+=ms;for(const [id,timer] of [...timers])if(timer.due<=timerNow){timers.delete(id);timer.callback();}}};
}
test('minimal entry keeps the court, six code slots, and entry button',()=>{
 const intro=html.slice(html.indexOf('<section id="access-gate"'),html.indexOf('<div id="team-app"'));
 assert.match(intro,/>코드 입력</);assert.match(intro,/>입장하기 /);
 assert.equal((intro.match(/class="access-code-digit"/g)||[]).length,6);assert.match(intro,/viewBox="0 0 941 1672"/);
 assert.doesNotMatch(intro,/어디서 오셨어요|답변 입력|C조 아닌|C조 전용|스파이 OUT|코드 문의/);assert.match(source,/const codeHash='[a-f0-9]{64}'/);
 assert.deepEqual([...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(match=>match[1]),['access-gate.js?v=20261015-6']);
});
test('entry focuses the dialog without opening an input keyboard',()=>{
 const view=browser();assert.equal(view.document.activeElement,view.nodes.get('access-gate'));
 assert.match(html,/<section id="access-gate"[^>]*tabindex="-1"/);assert.doesNotMatch(html,/\bautofocus\b/);
});
test('empty, partial, and wrong answers cannot load app data or Firebase',async()=>{
 const view=browser();assert.equal(view.scripts.length,0);
 for(const value of ['', 'abc','wrong!']){
  await view.submit(value);assert.equal(view.scripts.length,0);assert.equal(view.nodes.get('team-app').hidden,true);
  assert.equal(view.nodes.get('team-app').inert,true);assert.equal(view.nodes.get('access-gate').hidden,false);
  assert.equal(view.nodes.get('access-submit').disabled,false);assert.equal(view.nodes.get('access-status').dataset.error,'true');
 }
 assert.equal(view.nodes.get('access-code-0').value,'');
 assert.equal(view.rejected(),3);
});
test('correct answer loads dependencies once, enters, and preserves the selected route',async()=>{
 const view=browser(),hash=view.window.location.hash;await view.submit(answer);
 assert.deepEqual(view.scripts.map(script=>script.src.split('?')[0]),['data.js','validation.js','profile-model.js','ratings.js','pairing-model.js','tactics-data.js','gemini-config.js','gemini-analysis.js','app.js','firebase-cloud.js']);
 assert.equal(view.scripts.at(-1).type,'module');assert.equal(view.nodes.get('access-gate').hidden,true);assert.equal(view.nodes.get('team-app').hidden,false);
 assert.equal(view.nodes.get('team-app').inert,false);assert.equal(view.classes.has('entry-open'),false);assert.equal(view.window.location.hash,hash);
 assert.equal(view.document.activeElement,view.nodes.get('main-content'));assert.equal(view.nodes.get('access-code-0').value,'');
 await view.submit(answer);assert.equal(view.entered(),1);assert.equal(view.scripts.length,10);
 assert.equal(browser().nodes.get('access-gate').hidden,false);
});
test('all core downloads start together, preserve execution order, and finish before entry',async()=>{
 const view=browser({delayScripts:true}),entry=view.submit(answer);
 for(let i=0;i<100&&view.scripts.length===0;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(view.scripts.length,9);assert.ok(view.scripts.every(script=>script.async===false));
 assert.equal(view.nodes.get('team-app').hidden,true);
 // Network completion order can differ from the scripts' execution order.
 for(const script of view.scripts.slice(1).reverse())script.onload();
 await Promise.resolve();assert.equal(view.entered(),0);assert.equal(view.scripts.length,9);
 view.scripts[0].onload();await entry;
 assert.equal(view.entered(),1);assert.equal(view.scripts.length,10);assert.equal(view.scripts.at(-1).type,'module');
});
test('authentication reveals a directly linked player dialog and focuses its heading',async()=>{
 const view=browser();view.window.addEventListener('teamentryready',()=>{view.nodes.get('ratings-panel').open=true;});
 await view.submit(answer);assert.equal(view.document.activeElement,view.nodes.get('rating-player-info'));
});
test('paste distributes six characters and Tab wraps within the form',()=>{
 const view=browser(),first=view.nodes.get('access-code-0'),last=view.nodes.get('access-submit');
 first.dispatchEvent({type:'paste',clipboardData:{getData:()=>answer},preventDefault(){}});
 assert.equal(Array.from({length:6},(_,i)=>view.nodes.get('access-code-'+i).value).join(''),answer);assert.equal(view.document.activeElement,view.nodes.get('access-code-5'));
 first.focus();view.nodes.get('access-gate').dispatchEvent({type:'keydown',key:'Tab',shiftKey:true,preventDefault(){}});assert.equal(view.document.activeElement,last);
 view.nodes.get('access-gate').dispatchEvent({type:'keydown',key:'Tab',preventDefault(){}});assert.equal(view.document.activeElement,first);
});
test('double submit cannot initialize two copies of the app',async()=>{
 const view=browser({delayDigest:true}),first=view.submit(answer);await view.submit(answer);assert.equal(view.scripts.length,0);
 view.release();await first;assert.equal(view.scripts.length,10);assert.equal(view.entered(),1);
});
test('failed core loading stays on the answer screen and offers a clean reload',async()=>{
 const view=browser({failScript:'data.js'});await view.submit(answer);assert.equal(view.nodes.get('access-gate').hidden,false);
 assert.equal(view.nodes.get('team-app').hidden,true);assert.equal(view.nodes.get('access-submit').disabled,false);await view.submit('');assert.equal(view.reloaded(),true);
});
test('Firebase load failure does not prevent entry to the local board',async()=>{
 const view=browser({failScript:'firebase-cloud.js'});await view.submit(answer);await Promise.resolve();assert.equal(view.nodes.get('access-gate').hidden,true);assert.match(view.nodes.get('cloud-status').textContent,/공유 저장소/);
});
test('missing Web Crypto leaves the board hidden and reports a recoverable error',async()=>{
 const view=browser({secure:false});await view.submit(answer);assert.equal(view.scripts.length,0);assert.equal(view.nodes.get('team-app').hidden,true);assert.equal(view.nodes.get('access-submit').disabled,false);assert.match(view.nodes.get('access-status').textContent,/HTTPS/);
});
test('both avatars rally within the scene and animation stops after successful entry',async()=>{
 const view=browser({motion:true}),far=new Set(),near=new Set();
 for(let ms=0;ms<14000;ms+=83){view.advance(ms);far.add(view.nodes.get('entry-far-player').attributes.transform);near.add(view.nodes.get('entry-near-player').attributes.transform);const [x,y]=view.nodes.get('entry-rally-ball').attributes.transform.match(/-?\d+/g).map(Number);assert.ok(x>220&&x<740&&y>690&&y<1040);}
 assert.ok(far.size>20&&near.size>20);await view.submit(answer);assert.equal(view.frames.size,0);view.window.dispatchEvent({type:'pageshow'});assert.equal(view.frames.size,0);
});
test('reduced motion and hidden tabs stop animation without disabling authentication',async()=>{
 const view=browser({motion:true,reduced:true});assert.equal(view.frames.size,0);
 view.media.matches=false;view.media.dispatchEvent({type:'change'});assert.equal(view.frames.size,1);
 view.document.hidden=true;view.document.dispatchEvent({type:'visibilitychange'});assert.equal(view.frames.size,0);
 view.document.hidden=false;view.document.dispatchEvent({type:'visibilitychange'});assert.equal(view.frames.size,1);
 view.media.matches=true;view.media.dispatchEvent({type:'change'});assert.equal(view.frames.size,0);await view.submit(answer);assert.equal(view.nodes.get('access-gate').hidden,true);
});
test('invalid code trips one avatar, freezes the rally, and recovers without blocking retry',async()=>{
 const view=browser({motion:true});view.advance(0);view.advance(500);
 const far=view.nodes.get('entry-far-player').attributes.transform,near=view.nodes.get('entry-near-player').attributes.transform,ball=view.nodes.get('entry-rally-ball').attributes.transform;
 await view.submit('wrong!');assert.equal(view.nodes.get('access-gate').dataset.reaction,'falling');assert.equal(view.nodes.get('access-submit').disabled,false);
 view.advance(550);view.advance(1100);
 assert.match(view.nodes.get('entry-near-pose').attributes.transform,/rotate\(90\.0 /);assert.ok(Number(view.nodes.get('entry-fall-impact').attributes.opacity)>0);
 assert.equal(view.nodes.get('entry-far-player').attributes.transform,far);assert.equal(view.nodes.get('entry-near-player').attributes.transform,near);assert.equal(view.nodes.get('entry-rally-ball').attributes.transform,ball);assert.equal(view.scripts.length,0);
 view.advance(2250);assert.equal(view.nodes.get('access-gate').dataset.reaction,'idle');assert.equal(view.nodes.get('entry-near-pose').attributes.transform,undefined);assert.equal(view.nodes.get('entry-fall-impact').attributes.opacity,'0');
 view.advance(2400);assert.notEqual(view.nodes.get('entry-rally-ball').attributes.transform,ball);
});
test('repeated wrong answers restart one fall and correct entry cancels it immediately',async()=>{
 const view=browser({motion:true});await view.submit('wrong!');view.advance(0);view.advance(550);
 await view.submit('wrong!');view.advance(600);view.advance(1150);assert.equal(view.frames.size,1);assert.equal(view.nodes.get('access-gate').dataset.reaction,'falling');
 await view.submit(answer);assert.equal(view.frames.size,0);assert.equal(view.nodes.get('access-gate').dataset.reaction,'idle');assert.equal(view.nodes.get('entry-near-pose').attributes.transform,undefined);assert.equal(view.nodes.get('access-gate').hidden,true);
});
test('reduced motion shows a still fallen pose for incomplete input then restores it',async()=>{
 const view=browser({motion:true,reduced:true});await view.submit('abc');
 assert.match(view.nodes.get('entry-near-pose').attributes.transform,/rotate\(90 /);assert.equal(view.frames.size,0);assert.equal(view.timers.size,1);
 view.advanceTimers(1300);assert.equal(view.nodes.get('access-gate').dataset.reaction,'idle');assert.equal(view.nodes.get('entry-near-pose').attributes.transform,undefined);assert.equal(view.frames.size,0);assert.equal(view.scripts.length,0);
});
test('entry clears the reduced-motion recovery timer',async()=>{
 const view=browser({motion:true,reduced:true});await view.submit('wrong!');assert.equal(view.timers.size,1);
 await view.submit(answer);assert.equal(view.timers.size,0);assert.equal(view.nodes.get('access-gate').dataset.reaction,'idle');assert.equal(view.nodes.get('access-gate').hidden,true);
});
