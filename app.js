'use strict';
(() => {
 function isLegalPair(players){
  return Array.isArray(players)&&players.length===2&&players.every(player=>typeof player?.name==='string'&&player.name&&['forty','thirty','love'].includes(player.tier))
   &&players[0].name!==players[1].name&&!players.every(player=>player.tier==='love');
 }
 function summarizePairs(matches){
  const pairs=new Map(),collator=new Intl.Collator('ko');
  for(const match of matches){
   const pair=[...match.pair].sort(collator.compare),key=pair.join('\u0000');
   if(!pairs.has(key))pairs.set(key,{pair,matches:[]});
   pairs.get(key).matches.push(match.id);
  }
  return [...pairs.values()];
 }
 function analyzeMatchup(own,opponents){
  const roles=[],checks=[],plans=[];
  for(const player of own){
   const p=player.profile;
   if(p.courtPreference==='baseline')roles.push(player.name+'은 뒤에서 플레이하는 것을 선호합니다. 전위·후위 전환과 커버를 함께 정해 보세요.');
   if(p.courtPreference==='net')roles.push(player.name+'은 네트 플레이를 선호합니다. 포칭과 로브 대처 약속을 함께 정해 보세요.');
   if(p.partnerRoles.includes('tactics'))roles.push(player.name+'은 짧은 작전 상의를 편하게 느낍니다.');
   if(p.partnerRoles.includes('encourage'))roles.push(player.name+'에게는 실수 뒤 칭찬과 응원이 도움이 됩니다.');
   if(p.restPreference==='rest')checks.push(player.name+'은 쉬었다가 출전하기를 선호합니다.');
   if(p.restPreference==='continuous')checks.push(player.name+'은 연속 출전을 선호합니다.');
  }
  if(own[0].profile.position===own[1].profile.position&&['fore','back'].includes(own[0].profile.position))checks.push('두 선수의 리턴 자리 선호가 같습니다. 경기 전에 자리를 조율하세요.');
  for(const opponent of opponents){
   const patterns=opponent.profile.keywords.filter(item=>item.kind==='pattern');
   if(patterns.length)checks.push(opponent.name+'의 주로 쓰는 패턴: '+patterns.map(item=>item.text).join(', '));
   if(!opponent.profile.keywords.length)checks.push(opponent.name+'의 관찰 기록이 없습니다. 초반 플레이를 확인하세요.');
   for(const keyword of opponent.profile.keywords){
    const text=keyword.text.replace(/\s/g,'');let title='',action='';
    if(keyword.kind==='pattern'){
     if(/포칭/.test(text)){title='포칭 움직임 확인';action='상대 전위가 움직이는 시점을 확인하세요. 같은 코스만 반복하지 말고, 가능한 경우 로브나 라인을 섞을지 미리 약속하세요.';}
     else if(/네트|전위/.test(text)){title='네트 접근에 대비';action='상대가 앞으로 들어오는 시점을 확인하세요. 낮은 공이나 로브를 무리 없이 사용할 수 있는지 우리 페어가 먼저 상의하세요.';}
     else if(/로브/.test(text)){title='로브 담당 약속';action='초반에 로브의 높이와 깊이를 확인하고, 누가 뒤로 커버할지 정하세요. 급하게 무리한 스매시를 시도하지 않아도 됩니다.';}
     else if(/다운더라인|직선/.test(text)){title='라인 공격 확인';action='상대가 라인으로 방향을 바꾸는 순간을 관찰하세요. 전위 위치와 라인 커버 범위를 함께 정해 두세요.';}
     else if(/슬라이스/.test(text)){title='낮은 공에 준비';action='슬라이스가 낮게 오는지 확인하고 발을 먼저 움직이세요. 무리한 공격보다 편하게 연결할 코스를 정하세요.';}
    }else if(keyword.kind==='weak'){
     if(/몸쪽/.test(text)){title='몸쪽 공 반응 확인';action='초반에 무리 없는 몸쪽 서브나 리턴으로 반응을 확인하세요. 성공 여부를 보고 반복할지 정하세요.';}
     else if(/높은.*백|백.*높은/.test(text)){title='높은 백핸드 반응 확인';action='안전하게 보낼 수 있다면 높고 깊은 공으로 백핸드 쪽 반응을 확인하세요. 관찰 기록과 실제 반응이 같은지 먼저 보세요.';}
     else if(/낮은.*발리|발리.*낮은/.test(text)){title='낮은 발리 반응 확인';action='상대가 네트에 있을 때 가능한 범위에서 낮은 공을 연결해 보세요. 무리한 속도보다 높이와 깊이를 먼저 확인하세요.';}
     else if(/로브/.test(text)){title='로브 대처 확인';action='우리 페어가 로브를 편하게 쓸 수 있다면 초반에 한 번 시도해 상대의 뒷공간 대처를 확인하세요.';}
     else if(/리턴/.test(text)){title='리턴 상황 확인';action='안정적으로 넣을 수 있는 서브부터 사용해 상대 리턴을 관찰하세요. 단순히 세게 치기보다 어느 코스에서 어려워하는지 확인하세요.';}
     else if(/포핸드|백핸드/.test(text)){title='기록된 방향 확인';action='기록된 방향으로 안전하게 연결해 실제 반응을 확인하세요. 한 번의 실수만으로 약점이라고 단정하지 마세요.';}
    }
    if(title&&plans.length<5)plans.push({title,action,basis:opponent.name+' · '+keyword.text});
   }
  }
  if(!plans.length)plans.push({title:'초반 플레이부터 확인',action:'첫 몇 포인트에서 상대의 서브·리턴·네트 접근을 확인하고, 우리 페어의 리턴 자리와 로브 담당부터 정하세요.',basis:'기록만으로 구체적인 공략을 정하기에는 정보가 부족합니다.'});
  return {roles,checks,plans};
 }
 const model={isLegalPair,summarizePairs,analyzeMatchup};
 if(typeof module==='object'&&module.exports)module.exports=model;
 else window.MATCHUP_MODEL=model;
})();
if(typeof document!=='undefined')(() => {
 const data=window.BOARD_DATA,$=id=>document.getElementById(id),model=window.MATCHUP_MODEL,pairing=window.PAIRING_MODEL,definitions=window.PLAYER_PROFILE_MODEL;
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
 const displayName=name=>name.replace(/\s*\(시트:.*\)$/,'');
 const tiers={forty:'4️⃣',thirty:'3️⃣',love:'🫶'},tierLabels={forty:'포티',thirty:'써티',love:'러브'},tierOrder={forty:0,thirty:1,love:2};
 const names=team=>Object.keys(data.teams[team]||{}).sort((a,b)=>tierOrder[data.teams[team][a].tier]-tierOrder[data.teams[team][b].tier]||a.localeCompare(b,'ko'));
 let state={},plans=[],worker=null,generation=0,requestKey='',recommendationError='',calculating=false,timer=null,confirmationMessage='';
 const recommendationCache=new Map();let aiState=null,aiGeneration=0,aiUnsubscribe=null,aiWaitTimer=null;
 function readHash(){
  const q=new URLSearchParams(location.hash.slice(1));let fixed=[];
  try{const parsed=JSON.parse(q.get('fixed')||'[]');if(Array.isArray(parsed)&&parsed.length<=3&&parsed.every(item=>pairing.legalPair(data,item)))fixed=parsed;}catch{}
  state={page:['players','strategy','analysis'].includes(q.get('page'))?q.get('page'):'players',strategy:Object.hasOwn(pairing.strategyLabels,q.get('strategy'))?q.get('strategy'):'balance',
   mode:Object.hasOwn(pairing.modeLabels,q.get('mode'))?q.get('mode'):'fixed',fixedPairs:fixed,variant:Math.max(0,Math.min(2,Number(q.get('variant')||Number((q.get('balance')||'balance-1').slice(-1))-1)||0)),
   view:['draft','confirmed'].includes(q.get('view'))?q.get('view'):'auto',filter:['A','B','D'].includes(q.get('filter'))?q.get('filter'):'all',team:['A','B','D'].includes(q.get('team'))?q.get('team'):'',
   own1:q.get('own1')||'',own2:q.get('own2')||'',p1:q.get('p1')||'',p2:q.get('p2')||''};
  [state.own1,state.own2]=cleanPair('C',state.own1,state.own2);[state.p1,state.p2]=cleanPair(state.team,state.p1,state.p2);
 }
 function writeHash(){
  const q=new URLSearchParams({page:state.page,strategy:state.strategy,mode:state.mode,variant:String(state.variant),view:state.view,filter:state.filter});
  if(state.mode==='partial')q.set('fixed',JSON.stringify(state.fixedPairs));
  for(const key of ['team','own1','own2','p1','p2'])if(state[key])q.set(key,state[key]);
  try{history.replaceState(null,'','#'+q);}catch{}
 }
 function cleanPair(team,a,b){
  a=Object.hasOwn(data.teams[team]||{},a)?a:'';b=Object.hasOwn(data.teams[team]||{},b)?b:'';
  if(a&&b&&!legalNames(team,[a,b]))b='';return [a,b];
 }
 function legalNames(team,pair){return Boolean(data.teams[team])&&model.isLegalPair(pair.map(name=>({name,tier:data.teams[team][name]?.tier})));}
 function button(text,active,action,cls=''){
  const node=el('button',cls,text);node.type='button';node.setAttribute('aria-pressed',String(active));node.addEventListener('click',action);return node;
 }
 function badge(team,name){const node=el('span','grade-badge',tiers[data.teams[team][name].tier]);node.title=tierLabels[data.teams[team][name].tier];node.setAttribute('role','img');node.setAttribute('aria-label',node.title);return node;}
 function pairLabel(pair){const node=el('span','pair-label');pair.forEach((name,index)=>{if(index)node.append(el('span','pair-plus','+'));const person=el('span','pair-person');person.append(el('strong','',displayName(name)),badge('C',name));node.append(person);});return node;}
 function cVersion(){return definitions.profileVersion(names('C').map(name=>({id:'C:'+name,tier:data.teams.C[name].tier,profile:window.PLAYER_PROFILES.get('C',name)})));}
 function confirmed(){const plan=window.PLAYER_PROFILE_CLOUD?.lineup;return plan&&!pairing.validatePlan(data,plan).length?plan:null;}
 function view(){return state.view==='auto'?(confirmed()?'confirmed':'draft'):state.view;}
 function activePlan(){return view()==='confirmed'?confirmed():plans[state.variant]||plans[0];}
 function changeDraft(patch){Object.assign(state,patch,{view:'draft',variant:0});confirmationMessage='';render();}
 function receiveRecommendations(message){
  if(message.generation!==generation)return;
  calculating=false;recommendationError=message.error||'';plans=message.plans||[];
  if(plans.length){recommendationCache.set(requestKey,plans);if(recommendationCache.size>30)recommendationCache.delete(recommendationCache.keys().next().value);}
  state.variant=Math.min(state.variant,Math.max(0,plans.length-1));renderStrategy();writeHash();
 }
 function calculate(){
  const options={mode:state.mode,strategy:state.strategy,fixedPairs:state.fixedPairs},key=definitions.fingerprint({version:cVersion(),options});
  if(key===requestKey)return;requestKey=key;generation++;plans=[];recommendationError='';calculating=true;
  if(worker){worker.terminate();worker=null;}clearTimeout(timer);
  if(recommendationCache.has(key)){receiveRecommendations({generation,plans:recommendationCache.get(key)});return;}
  const currentGeneration=generation,profiles=window.PLAYER_PROFILES.all();
  timer=setTimeout(()=>{
   try{
    const instance=new Worker('pairing-worker.js');worker=instance;instance.onmessage=event=>receiveRecommendations(event.data);
    instance.onerror=()=>{instance.terminate();if(currentGeneration!==generation)return;if(worker===instance)worker=null;fallback();};
    instance.postMessage({generation:currentGeneration,profiles,options});
   }catch{fallback();}
   function fallback(){try{receiveRecommendations({generation:currentGeneration,plans:pairing.generate(data,profiles,options)});}catch(error){receiveRecommendations({generation:currentGeneration,error:error.message});}}
  },150);
 }
 function closeMenu(restore=false){$('site-menu').hidden=true;$('menu-toggle').setAttribute('aria-expanded','false');if(restore)$('menu-toggle').focus();}
 $('menu-toggle').addEventListener('click',()=>{const open=$('site-menu').hidden;$('site-menu').hidden=!open;$('menu-toggle').setAttribute('aria-expanded',String(open));});
 document.addEventListener('click',event=>{if(!$('site-menu').contains(event.target)&&!$('menu-toggle').contains(event.target))closeMenu();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('site-menu').hidden)closeMenu(true);});
 const tabs=[...document.querySelectorAll('.page-tab')];
 for(const [index,tab] of tabs.entries()){
  tab.addEventListener('click',()=>{state.page=tab.dataset.page;renderPage();writeHash();});
  tab.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();tabs[next].focus();tabs[next].click();});
 }
 function renderPage(){
  closeMenu();for(const tab of tabs){const selected=tab.dataset.page===state.page;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;$(tab.getAttribute('aria-controls')).hidden=!selected;}$('share').hidden=state.page==='players';
 }
 function populate(select,team,value,other,excluded=[]){
  select.replaceChildren(new Option(team?'선택하세요':'조를 먼저 선택하세요',''));select.disabled=!team;
  for(const name of names(team)){const option=new Option(displayName(name)+' · '+tiers[data.teams[team][name].tier],name);option.disabled=excluded.includes(name)||name===other||(Boolean(other)&&!legalNames(team,[name,other]));select.add(option);}select.value=value;
 }
 function renderFixedPairs(){
  $('fixed-pairs-editor').hidden=state.mode!=='partial';
  $('fixed-pairs-list').replaceChildren(...state.fixedPairs.map((pair,index)=>{const row=el('div','fixed-pair-row');row.append(pairLabel(pair),button('해제',false,()=>changeDraft({fixedPairs:state.fixedPairs.filter((_,i)=>i!==index)})));return row;}));
  const excluded=state.fixedPairs.flat();
  populate($('fixed-player1'),'C',$('fixed-player1').value,$('fixed-player2').value,excluded);
  populate($('fixed-player2'),'C',$('fixed-player2').value,$('fixed-player1').value,excluded);
  $('add-fixed-pair').disabled=state.fixedPairs.length>=3||!legalNames('C',[$('fixed-player1').value,$('fixed-player2').value]);
 }
 for(const id of ['fixed-player1','fixed-player2'])$(id).addEventListener('change',renderFixedPairs);
 $('add-fixed-pair').addEventListener('click',()=>{const pair=[$('fixed-player1').value,$('fixed-player2').value];if(!legalNames('C',pair))return;$('fixed-player1').value='';$('fixed-player2').value='';changeDraft({fixedPairs:[...state.fixedPairs,pair]});});
 function showConfirmed(){const saved=confirmed();if(!saved)return;Object.assign(state,{view:'confirmed',mode:saved.mode,strategy:saved.strategy,fixedPairs:saved.fixedPairs.map(item=>item.pair)});render();}
 $('view-confirmed').addEventListener('click',showConfirmed);
 $('view-draft').addEventListener('click',()=>{state.view='draft';render();});
 $('confirm-lineup').addEventListener('click',async()=>{
  const plan=plans[state.variant]||plans[0],cloud=window.PLAYER_PROFILE_CLOUD;if(!plan||calculating||plan.profileVersion!==cVersion())return;
  $('confirm-lineup').disabled=true;confirmationMessage='팀 출전표를 저장하고 있습니다.';$('lineup-status').textContent=confirmationMessage;
  try{await cloud.saveLineup(plan,cloud.lineup?.revision||0);confirmationMessage='팀 공통 출전표로 확정했습니다.';state.view='confirmed';}
  catch(error){confirmationMessage=error.message;}renderStrategy();writeHash();
 });
 function renderStrategy(){
  $('strategies').replaceChildren(...Object.entries(pairing.strategyLabels).map(([id,title])=>button(title,state.strategy===id,()=>changeDraft({strategy:id}),'strategy-button')));
  $('operation-modes').replaceChildren(...Object.entries(pairing.modeLabels).map(([id,title])=>button(title,state.mode===id,()=>changeDraft({mode:id}),'strategy-button')));
  renderFixedPairs();const plan=activePlan(),saved=confirmed(),cloud=window.PLAYER_PROFILE_CLOUD;
  $('recommendation-status').textContent=calculating?'선수 선호에 맞춰 추천안을 계산하고 있습니다.':recommendationError||'선수 정보가 바뀌면 추천안을 다시 계산합니다.';
  $('validation').textContent=plan?'편성 검증 통과':'편성 준비';
  $('view-draft').setAttribute('aria-pressed',String(view()==='draft'));$('view-confirmed').setAttribute('aria-pressed',String(view()==='confirmed'));
  $('view-confirmed').disabled=!saved;
  $('confirm-lineup').disabled=view()!=='draft'||calculating||!plans.length||cloud?.status!=='ready'||cloud?.pendingCount>0||!cloud?.lineupReady;
  $('confirm-lineup').textContent=saved?'이 추천안으로 확정표 교체':'이 추천안으로 출전표 확정';
  $('lineup-status').textContent=confirmationMessage||(cloud?.lineup&&!saved?'저장된 출전표가 규정을 만족하지 않습니다. 새 추천안으로 교체하세요.':view()==='confirmed'&&saved
   ?'팀 확정표 · '+pairing.modeLabels[saved.mode]+' · '+pairing.strategyLabels[saved.strategy]+(saved.profileVersion!==cVersion()?' · 선수 정보가 변경되었습니다. 확정표는 유지됩니다.':'')
   :cloud?.status!=='ready'||!cloud?.lineupReady?'추천안을 볼 수 있습니다. 팀 공유 저장소 연결 후 출전표를 확정할 수 있어요.':'추천안 · 팀 확정표와 별도로 비교할 수 있습니다.');
  $('balance-variants-block').hidden=view()!=='draft'||plans.length<2;
  $('balance-variants').replaceChildren(...plans.map((item,index)=>button(item.title,state.variant===index,()=>{state.variant=index;renderStrategy();writeHash();},'balance-variant')));
  $('strategy-description').textContent=plan?.description||'';
  const pairs=plan?model.summarizePairs(plan.matches):[];$('pair-summary-count').textContent=pairs.length+'개 페어';
  $('strategy-pairs').replaceChildren(...pairs.map(item=>{const card=el('div','strategy-pair-card');card.append(pairLabel(item.pair),el('p','muted small',item.matches.length+'경기 · '+item.matches.map(id=>'C'+id).join(', ')));return card;}));
  if(plan?.reasons?.length){const notes=el('div','recommendation-reasons');for(const reason of plan.reasons)notes.append(el('p','muted small',reason));$('strategy-pairs').append(notes);}
  $('filters').replaceChildren(...['all','A','B','D'].map(team=>button(team==='all'?'전체':team+'조',state.filter===team,()=>{state.filter=team;renderStrategy();writeHash();})));
  renderSchedule(plan);
 }
 function renderSchedule(plan){
  $('matches').replaceChildren();$('counts').replaceChildren();if(!plan)return;
  const table=el('table','schedule-matrix');table.append(el('caption','sr-only',plan.title+' 시간대별 코트 출전표'));
  const head=el('thead'),headRow=el('tr');for(const title of ['시간','1코트','2코트','3코트','4코트']){const th=el('th','',title);th.scope='col';headRow.append(th);}head.append(headRow);table.append(head);
  const body=el('tbody'),times=[...new Set(plan.matches.filter(match=>state.filter==='all'||match.team===state.filter).map(match=>match.time))].sort();
  for(const time of times){
   const matches=plan.matches.filter(match=>match.time===time&&(state.filter==='all'||match.team===state.filter)),row=el('tr'),th=el('th','matrix-time');th.scope='row';th.append(el('strong','',time),el('span','muted small','~ '+matches[0].endTime));row.append(th);
   for(let court=1;court<=4;court++){
    const cell=el('td'),match=matches.find(item=>item.court===court);cell.dataset.court=String(court);
    if(match){const choice=button('',false,()=>{state.own1=match.pair[0];state.own2=match.pair[1];if(state.team!==match.team){state.p1='';state.p2='';}state.team=match.team;state.page='analysis';render();$('our-player1').focus();},'matrix-match');
     choice.dataset.match=match.id;choice.setAttribute('aria-label',time+' '+court+'코트 '+match.pair.map(displayName).join(' + ')+' vs '+match.team+'조, 페어 분석');
     choice.append(el('span','matrix-pair-names',match.pair.map(displayName).join(' ')),el('span','matrix-vs','vs'),el('span','matrix-opponent',match.team+'조'));cell.append(choice);
    }else{cell.className='matrix-empty';cell.textContent='—';}row.append(cell);
   }body.append(row);
  }table.append(body);$('matches').append(table);
  const counts=el('div','count-grid');for(const name of names('C'))counts.append(el('span','',displayName(name)+' · '+plan.matches.filter(match=>match.pair.includes(name)).length+'경기'));$('counts').append(counts);
 }
 function playerCard(name,team){
  const profile=window.PLAYER_PROFILES.get(team,name),card=el('div','player');card.append(el('strong','',displayName(name)),badge(team,name));
  const rows=team==='C'?[
   ['선호 리턴 자리',definitions.positions[profile.position]],['편한 위치',definitions.courtPreferences[profile.courtPreference]],['성향',definitions.styles[profile.style]],
   ['잘 맞는 파트너',profile.partnerRoles.map(role=>definitions.partnerRoles[role]).join(', ')||'미선택'],['특징',profile.traits.join(', ')||'미입력'],['경기·휴식',definitions.restPreferences[profile.restPreference]]
  ]:[['성향',definitions.styles[profile.style]],...Object.entries(definitions.keywordKinds).map(([kind,title])=>[title,profile.keywords.filter(item=>item.kind===kind).map(item=>item.text).join(', ')||'미입력'])];
  for(const [title,text] of rows)card.append(el('p','',title+' · '+text));return card;
 }
 function listSection(title,items){const section=el('section','analysis-notes');section.append(el('h3','',title));const list=el('ul');for(const text of items)list.append(el('li','',text));section.append(list);return section;}
 function analysisInput(){
  if(!legalNames('C',[state.own1,state.own2])||!legalNames(state.team,[state.p1,state.p2]))return null;
  const ownPlayerIds=[state.own1,state.own2].map(name=>'C:'+name).sort(),opponentPlayerIds=[state.p1,state.p2].map(name=>state.team+':'+name).sort();
  const players=[...ownPlayerIds,...opponentPlayerIds].map(id=>{const split=id.indexOf(':'),team=id.slice(0,split),name=id.slice(split+1);return {id,tier:data.teams[team][name].tier,profile:window.PLAYER_PROFILES.get(team,name)};});
  const expectedProfileHash=definitions.profileVersion(players);return {ownPlayerIds,opponentPlayerIds,expectedProfileHash,key:definitions.fingerprint({ownPlayerIds,opponentPlayerIds,expectedProfileHash})};
 }
 function renderAnalysis(){
  populate($('our-player1'),'C',state.own1,state.own2);populate($('our-player2'),'C',state.own2,state.own1);$('analysis-team').value=state.team;
  populate($('opponent1'),state.team,state.p1,state.p2);populate($('opponent2'),state.team,state.p2,state.p1);
  const container=$('analysis-result');container.replaceChildren();const input=analysisInput();
  if(aiState?.status==='loading'&&aiState.inputKey!==input?.key){aiGeneration++;if(aiUnsubscribe){aiUnsubscribe();aiUnsubscribe=null;}clearTimeout(aiWaitTimer);aiState.status='stale';}
  if(!input){container.append(el('p','empty','우리 페어와 상대 페어를 선택해 주세요.'));return;}
  const panel=el('section','analysis-result-panel');panel.append(el('h2','analysis-title',[state.own1,state.own2].map(displayName).join(' + ')+' vs '+state.team+'조 '+[state.p1,state.p2].map(displayName).join(' + ')));
  const snapshots=el('div','analysis-snapshots');
  for(const [team,pair,title] of [['C',[state.own1,state.own2],'우리 페어'],[state.team,[state.p1,state.p2],'상대 페어']]){const section=el('section','pair-snapshot'),cards=el('div','players');section.append(el('h3','',title));for(const name of pair)cards.append(playerCard(name,team));section.append(cards);snapshots.append(section);}panel.append(snapshots);
  const cloud=window.PLAYER_PROFILE_CLOUD,action=el('div','ai-actions'),start=button(aiState?.status==='loading'&&aiState.inputKey===input.key?'분석 중…':'Gemini AI 분석',false,requestAnalysis,'primary-button');start.id='ai-analyze';
  start.disabled=cloud?.status!=='ready'||cloud?.aiStatus!=='ready'||cloud?.pendingCount>0||(aiState?.status==='loading'&&aiState.inputKey===input.key);action.append(start);
  const status=el('p','muted small');status.setAttribute('role','status');
  status.textContent=aiState?.inputKey===input.key?(aiState.error||aiState.message||''):(aiState?'선택 또는 선수 정보가 변경되었습니다. 다시 분석해 주세요.':'버튼을 누르면 입력한 선호와 관찰을 바탕으로 공략을 생성합니다.');
  if(cloud?.status!=='ready')status.textContent='팀 공유 저장소 연결 후 AI 분석을 사용할 수 있습니다.';
  else if(cloud?.aiStatus!=='ready')status.textContent='현재는 입력한 관찰을 바탕으로 기본 공략을 볼 수 있어요. Gemini 연결 후 AI 분석도 사용할 수 있습니다.';action.append(status);panel.append(action);
  if(aiState?.inputKey===input.key&&aiState.result){
   const result=aiState.result;panel.append(listSection('전체 운영 방향',[result.direction]));
   const tactics=el('section','analysis-plans');tactics.append(el('h3','','상대 패턴 대응과 공략'));
   for(const tip of result.tactics){const card=el('div','analysis-tip');card.append(el('h4','',tip.title),el('p','',tip.action),el('p','muted small','근거 · '+tip.basis));tactics.append(card);}panel.append(tactics);
   panel.append(listSection('우리 페어 역할',result.roles.map(role=>displayName(role.playerId.slice(2))+' · '+role.action)),listSection('초반 확인할 점',result.checks));
  }else{
   const notes=model.analyzeMatchup([state.own1,state.own2].map(name=>({name,profile:window.PLAYER_PROFILES.get('C',name)})),[state.p1,state.p2].map(name=>({name,profile:window.PLAYER_PROFILES.get(state.team,name)})));
   panel.append(el('p','muted small','기본 공략 · 입력한 관찰에 따른 규칙 기반 제안입니다.'));
   const tactics=el('section','analysis-plans');tactics.append(el('h3','','상대 패턴 대응과 공략'));
   for(const tip of notes.plans){const card=el('div','analysis-tip');card.append(el('h4','',tip.title),el('p','',tip.action),el('p','muted small','근거 · '+tip.basis));tactics.append(card);}panel.append(tactics);
   if(notes.roles.length)panel.append(listSection('함께 정할 역할',notes.roles));
   if(notes.checks.length)panel.append(listSection('초반 확인할 점',notes.checks));
  }
  const combo=data.combos[state.team].find(item=>item.pair.includes(state.p1)&&item.pair.includes(state.p2));
  if(combo?.points.length){const details=el('details','analysis-source-notes');details.append(el('summary','','기존 시트의 상대 공략 메모'),listSection('참고 메모',combo.points));panel.append(details);}container.append(panel);
 }
 async function requestAnalysis(){
  const input=analysisInput();if(!input)return;const token=++aiGeneration;clearTimeout(aiWaitTimer);if(aiUnsubscribe){aiUnsubscribe();aiUnsubscribe=null;}
  aiState={inputKey:input.key,status:'loading',message:'AI가 입력한 기록을 읽고 있습니다.'};renderAnalysis();
  const stillCurrent=()=>token===aiGeneration&&analysisInput()?.key===input.key;
  try{
   const {key,...request}=input,response=await window.PLAYER_PROFILE_CLOUD.analyzeMatchup(request);if(!stillCurrent())return;
   function accept(record){if(!stillCurrent())return;if(record.status==='ready'){clearTimeout(aiWaitTimer);aiState={inputKey:input.key,status:'ready',result:record.result,message:response.cached?'팀원이 생성한 분석을 불러왔습니다.':'AI 분석을 생성했습니다.'};if(aiUnsubscribe){aiUnsubscribe();aiUnsubscribe=null;}renderAnalysis();}
    else if(record.status==='error'){clearTimeout(aiWaitTimer);aiState={inputKey:input.key,status:'error',error:record.message||'분석에 실패했습니다. 다시 시도해 주세요.'};if(aiUnsubscribe){aiUnsubscribe();aiUnsubscribe=null;}renderAnalysis();}}
   if(response.status==='ready')accept(response);else{aiWaitTimer=setTimeout(()=>{if(stillCurrent()){if(aiUnsubscribe){aiUnsubscribe();aiUnsubscribe=null;}aiState={inputKey:input.key,status:'error',error:'분석 시간이 오래 걸렸습니다. 다시 시도해 주세요.'};renderAnalysis();}},90000);aiState.message='같은 분석을 생성하고 있습니다. 완료되면 함께 표시됩니다.';renderAnalysis();aiUnsubscribe=window.PLAYER_PROFILE_CLOUD.subscribeAnalysis(response.analysisKey,accept,error=>{if(stillCurrent()){clearTimeout(aiWaitTimer);if(aiUnsubscribe){aiUnsubscribe();aiUnsubscribe=null;}aiState={inputKey:input.key,status:'error',error:'분석을 불러오지 못했습니다. 다시 시도해 주세요.'};renderAnalysis();}});}
  }catch(error){if(stillCurrent()){aiState={inputKey:input.key,status:'error',error:error.message||'AI 분석에 실패했습니다. 다시 시도해 주세요.'};renderAnalysis();}}
 }
 for(const [id,field] of [['our-player1','own1'],['our-player2','own2'],['opponent1','p1'],['opponent2','p2']])$(id).addEventListener('change',()=>{state[field]=$(id).value;[state.own1,state.own2]=cleanPair('C',state.own1,state.own2);[state.p1,state.p2]=cleanPair(state.team,state.p1,state.p2);renderAnalysis();writeHash();});
 $('analysis-team').addEventListener('change',()=>{state.team=$('analysis-team').value;state.p1='';state.p2='';renderAnalysis();writeHash();});
 function render(){calculate();renderStrategy();renderAnalysis();renderPage();writeHash();}
 window.addEventListener('hashchange',()=>{readHash();render();});window.addEventListener('playerprofileschange',()=>{confirmationMessage='';render();});
 window.addEventListener('playerprofilecloudstatuschange',()=>{renderStrategy();renderAnalysis();});
 window.addEventListener('teamlineupchange',()=>{if(state.view==='auto'&&confirmed()){const saved=confirmed();Object.assign(state,{mode:saved.mode,strategy:saved.strategy,fixedPairs:saved.fixedPairs.map(item=>item.pair)});}render();});
 $('share').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);$('share-status').textContent='현재 선택 링크를 복사했습니다.';$('share-fallback').hidden=true;}catch{$('share-fallback').hidden=false;$('share-url').value=location.href;$('share-url').focus();$('share-url').select();$('share-status').textContent='아래 링크를 복사해 공유하세요.';}});
 readHash();render();
})();
