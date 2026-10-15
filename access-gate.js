'use strict';
// Shared-answer entry screen. The static host and Firestore rules remain separate access boundaries.
(() => {
 const codeHash='e501dfe730fbd9a4ab4712fc78456302f08b2f8e7043bd077f251bf9b621824f';
 const scripts=['data.js','validation.js','profile-model.js?v=20261012-4','ratings.js?v=20261015-1','pairing-model.js?v=20261012-5','tactics-data.js','gemini-config.js?v=20261008-6Leej-Qt','gemini-analysis.js','app.js?v=20261012-5'];
 const $=id=>document.getElementById(id),gate=$('access-gate'),form=$('access-form'),button=$('access-submit'),app=$('team-app'),status=$('access-status'),inputs=Array.from({length:6},(_,i)=>$('access-code-'+i));
 let busy=false,accepted=false,loadFailed=false;
 function message(text,error=false){status.textContent=text;status.dataset.error=String(error);}
 function focus(index){inputs[index].focus({preventScroll:true});inputs[index].select();}
 function clearError(){for(const input of inputs)input.removeAttribute('aria-invalid');message('');}
 function loadScript(src,type){
  return new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.async=false;script.src=src;if(type)script.type=type;
   script.onload=resolve;script.onerror=()=>reject(new Error('App script failed to load'));document.head.append(script);
  });
 }
 inputs.forEach((input,index)=>{
  input.addEventListener('input',()=>{clearError();if(input.value&&index<5)focus(index+1);});
  input.addEventListener('keydown',event=>{
   if((event.key==='Backspace'&&!input.value)||event.key==='ArrowLeft'){if(index>0){event.preventDefault();focus(index-1);}}
   else if(event.key==='ArrowRight'&&index<5){event.preventDefault();focus(index+1);}
  });
  input.addEventListener('paste',event=>{
   event.preventDefault();clearError();const text=event.clipboardData.getData('text').trim().slice(0,6-index);
   [...text].forEach((value,offset)=>{inputs[index+offset].value=value;});focus(Math.min(index+text.length,5));
  });
 });
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||accepted)return;if(loadFailed){window.location.reload();return;}
  const answer=inputs.map(input=>input.value).join('');
  if(answer.length!==6){message('코드 여섯 자리를 입력해 주세요.',true);window.dispatchEvent(new CustomEvent('teamentryinvalid'));focus(Math.max(0,inputs.findIndex(input=>!input.value)));return;}
  busy=true;button.disabled=true;for(const input of inputs)input.disabled=true;message('코드를 확인하고 있습니다.');
  try{
   if(!globalThis.crypto?.subtle){message('HTTPS 주소 또는 최신 브라우저로 다시 접속해 주세요.',true);return;}
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(answer));
   const hash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
   for(const input of inputs)input.value='';
   if(hash!==codeHash){for(const input of inputs)input.setAttribute('aria-invalid','true');message('음… 다시 생각해 보세요.',true);window.dispatchEvent(new CustomEvent('teamentryinvalid'));return;}
   message('팀 전략보드를 불러오고 있습니다.');
   // Download together; async=false keeps classic scripts in dependency order.
   try{await Promise.all(scripts.map(src=>loadScript(src)));}
   catch{loadFailed=true;button.textContent='다시 시도';message('화면을 불러오지 못했습니다. 다시 시도해 주세요.',true);return;}
   accepted=true;app.hidden=false;app.inert=false;app.removeAttribute('aria-hidden');gate.hidden=true;document.body.classList.remove('entry-open');
   window.dispatchEvent(new CustomEvent('teamentryready'));
   const target=$('ratings-panel').open||!$('player-detail-page').hidden?$('rating-player-info'):$('main-content');target.focus({preventScroll:true});
   void loadScript('firebase-cloud.js?v=20261012-3','module').catch(()=>{$('cloud-status').textContent='공유 저장소를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.';});
  }catch{message('코드를 확인하지 못했습니다. 다시 시도해 주세요.',true);}
  finally{busy=false;button.disabled=accepted;for(const input of inputs)input.disabled=accepted||loadFailed;if(!gate.hidden&&!loadFailed)focus(0);}
 });
 gate.addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const controls=[...inputs,button].filter(node=>!node.disabled),first=controls[0],last=controls.at(-1);
  if(!first){event.preventDefault();return;}
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 });
 gate.focus({preventScroll:true});
})();

(() => {
 if(typeof window.requestAnimationFrame!=='function')return;
 const $=id=>document.getElementById(id),gate=$('access-gate'),farPlayer=$('entry-far-player'),nearPlayer=$('entry-near-player'),pose=$('entry-near-pose'),impact=$('entry-fall-impact'),ball=$('entry-rally-ball'),shadow=$('entry-ball-shadow');
 const trails=[0,1,2].map(i=>$('entry-trail-'+i)),reduced=window.matchMedia('(prefers-reduced-motion: reduce)'),leg=1.7;
 function players(t){
  const farX=445+96*Math.sin(t*.72),nearX=468+145*Math.sin(t*.59+1.7);
  return {far:{x:Math.round(farX-398),y:Math.round(2*Math.sin(t*7))},near:{x:Math.round(nearX-573),y:Math.round(2*Math.sin(t*7+1))}};
 }
 function contact(t,far){const player=players(t)[far?'far':'near'];return {x:player.x+(far?451:515),y:player.y+(far?743:1000)};}
 function ballAt(t){
  const segment=Math.floor(t/leg),start=segment*leg,u=(t-start)/leg,from=contact(start,segment%2===0),to=contact(start+leg,segment%2!==0);
  return {x:from.x+(to.x-from.x)*u,y:from.y+(to.y-from.y)*u-43*Math.sin(Math.PI*u),u};
 }
 function render(t){
  const frame=players(t),point=ballAt(t);
  farPlayer.setAttribute('transform','translate('+frame.far.x+' '+frame.far.y+')');nearPlayer.setAttribute('transform','translate('+frame.near.x+' '+frame.near.y+')');
  ball.setAttribute('transform','translate('+Math.round(point.x)+' '+Math.round(point.y)+')');
  shadow.setAttribute('x',Math.round(point.x-8));shadow.setAttribute('y',Math.round(point.y+15+18*Math.sin(Math.PI*point.u)));
  trails.forEach((node,i)=>{const old=ballAt(Math.max(0,t-(i+1)*.055));node.setAttribute('x',Math.round(old.x));node.setAttribute('y',Math.round(old.y));});
 }
 let elapsed=.55,lastNow=null,lastFrame=-1,request=null,fall=null,recovery=null;
 function resetFall(){
  fall=null;pose.removeAttribute('transform');impact.setAttribute('opacity','0');gate.dataset.reaction='idle';
  if(recovery!==null)window.clearTimeout(recovery);recovery=null;
 }
 function falling(now){
  if(fall.started===null)fall.started=now;
  const t=Math.floor((now-fall.started)/1000*18)/18;
  if(t>=1.6){resetFall();return;}
  let angle=90;
  if(t<.16)angle=-8*Math.sin(t/.16*Math.PI/2);
  else if(t<.48){const progress=(t-.16)/.32;angle=-8+98*(1-(1-progress)**2);}
  else if(t>=.95&&t<1.35){const progress=(t-.95)/.4;angle=90*(1-(progress*progress*(3-2*progress)));}
  else if(t>=1.35)angle=-5*Math.sin((t-1.35)/.25*Math.PI);
  const bounce=t>=.48&&t<.7?-5*Math.sin((t-.48)/.22*Math.PI):0;
  pose.setAttribute('transform','translate(0 '+bounce.toFixed(1)+') rotate('+angle.toFixed(1)+' 573 1062)');
  impact.setAttribute('opacity',t>=.44&&t<.95?String(Math.min(1,Math.max(0,1-(t-.48)/.5))):'0');
 }
 function stop(){if(request!==null)window.cancelAnimationFrame(request);request=null;lastNow=null;lastFrame=-1;resetFall();}
 function animate(now){
  request=null;
  if(gate.hidden||document.hidden||reduced.matches)return;
  if(lastNow!==null&&!fall)elapsed+=(now-lastNow)/1000;
  lastNow=now;
  const frame=Math.floor(elapsed*18);
  if(fall)falling(now);
  else if(frame!==lastFrame){render(frame/18);lastFrame=frame;}
  request=window.requestAnimationFrame(animate);
 }
 function sync(){stop();if(!gate.hidden&&!document.hidden&&!reduced.matches)request=window.requestAnimationFrame(animate);}
 function trip(){
  if(gate.hidden)return;
  resetFall();fall={started:null};gate.dataset.reaction='falling';
  if(reduced.matches){pose.setAttribute('transform','rotate(90 573 1062)');impact.setAttribute('opacity','1');recovery=window.setTimeout(()=>{resetFall();},1300);return;}
  pose.setAttribute('transform','rotate(-6 573 1062)');
  if(request===null&&!document.hidden){lastNow=null;request=window.requestAnimationFrame(animate);}
 }
 render(elapsed);sync();
 reduced.addEventListener?.('change',sync);document.addEventListener('visibilitychange',sync);
 window.addEventListener('teamentryinvalid',trip);
 window.addEventListener('teamentryready',stop);window.addEventListener('pagehide',stop);window.addEventListener('pageshow',sync);
})();
