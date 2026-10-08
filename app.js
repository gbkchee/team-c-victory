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

 const references=typeof module==='object'&&module.exports?require('./tactics-data.js'):window.OPPONENT_TACTICS;
 function analyzeOpponentPair(opponents){
  const cautions=[],responses=[],tactics=[],seen={cautions:new Map(),responses:new Map(),tactics:new Map()};
  function add(field,key,tip){const existing=seen[field].get(key);if(existing){existing.basis+=' / '+tip.basis;return;}seen[field].set(key,tip);({cautions,responses,tactics})[field].push(tip);}
  const observations=opponents.flatMap(player=>player.profile.keywords.map(keyword=>({player,keyword}))).sort((a,b)=>({weak:0,pattern:1,note:2})[a.keyword.kind]-({weak:0,pattern:1,note:2})[b.keyword.kind]);
  for(const {player,keyword} of observations){
   const basis=player.name+' · '+keyword.text,rule=references.match(keyword.kind,keyword.text);
   if(rule){
    if(rule.caution)add('cautions',rule.id,{title:rule.title,action:rule.caution,basis,sourceIds:rule.sourceIds});
    add('responses',rule.id,{title:rule.title,action:rule.response,basis,sourceIds:rule.sourceIds});
    if(rule.tactic)add('tactics',rule.id,{title:rule.title,action:rule.tactic,basis,sourceIds:rule.sourceIds});
   }else if(keyword.kind==='pattern')add('cautions',player.name+':'+keyword.text,{title:player.name+' · '+keyword.text,action:'기록된 패턴에 같은 방식으로 반복 대응하지 말고 실제 전개에 맞춰 코스를 조절하세요.',basis});
   else if(keyword.kind==='weak')add('tactics',player.name+':'+keyword.text,{title:player.name+' · '+keyword.text,action:'기록된 상황을 무리 없는 범위에서 만들어보세요. 같은 반응이 반복될 때 활용하세요.',basis});
  }
  if(!cautions.length)cautions.push({title:'무리한 결정구 주의',action:'어려운 공에서 한 번에 끝내려 하지 말고 깊이와 코스로 전개하세요.',basis:'일반 복식 원칙 · 주의사항에 대응하는 기록 없음',sourceIds:['positioning']});
  if(!responses.length)responses.push({...references.general});
  if(!tactics.length)tactics.push({title:'짧거나 뜨는 공에서 전개',action:'상대가 짧거나 높게 돌려주는 공에서 공격하세요. 아직 특정 선수의 약점으로 볼 기록은 부족해요.',basis:'어려워하는 공·상황 기록 없음',sourceIds:['threeShots']});
  const styles={attack:'공격형',balance:'밸런스형',defense:'수비형'};
  const summary=opponents.map(player=>player.name+' · '+(styles[player.profile.style]||'성향 미입력')).join(' / ');
  return {summary,cautions:cautions.slice(0,5),responses:responses.slice(0,5),tactics:tactics.slice(0,5)};
 }
 const model={isLegalPair,summarizePairs,analyzeOpponentPair};
 if(typeof module==='object'&&module.exports)module.exports=model;
 else window.MATCHUP_MODEL=model;
})();
if(typeof document!=='undefined')(() => {
 const data=window.BOARD_DATA,$=id=>document.getElementById(id),model=window.MATCHUP_MODEL,pairing=window.PAIRING_MODEL,definitions=window.PLAYER_PROFILE_MODEL,navigation=window.TEAM_NAVIGATION;
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
 const displayName=name=>name.replace(/\s*\(시트:.*\)$/,'');
 const tiers={forty:'4️⃣',thirty:'3️⃣',love:'🫶'},tierLabels={forty:'포티',thirty:'써티',love:'러브'},tierOrder={forty:0,thirty:1,love:2};
 const names=team=>Object.keys(data.teams[team]||{}).sort((a,b)=>tierOrder[data.teams[team][a].tier]-tierOrder[data.teams[team][b].tier]||a.localeCompare(b,'ko'));
 let state={},plans=[],worker=null,generation=0,requestKey='',recommendationError='',calculating=false,timer=null,confirmationMessage='';
 const recommendationCache=new Map();let aiState=null,aiGeneration=0,aiUnsubscribe=null,aiWaitTimer=null;
 function readHash(){
  const q=navigation.params();let fixed=[];
  try{const parsed=JSON.parse(q.get('fixed')||'[]');if(Array.isArray(parsed)&&parsed.length<=3&&parsed.every(item=>pairing.legalPair(data,item)))fixed=parsed;}catch{}
  const legacyVariant=q.has('strategy')?(q.get('strategy')==='win'?2:Math.min(1,Number(q.get('variant')||0))):Number(q.get('variant')||0);
  state={page:['players','strategy','analysis'].includes(q.get('page'))?q.get('page'):'players',
   mode:Object.hasOwn(pairing.modeLabels,q.get('mode'))?q.get('mode'):'fixed',fixedPairs:fixed,variant:Math.max(0,Math.min(2,legacyVariant)||0),
   view:['draft','confirmed'].includes(q.get('view'))?q.get('view'):'auto',filter:['A','B','D'].includes(q.get('filter'))?q.get('filter'):'all',team:['A','B','D'].includes(q.get('team'))?q.get('team'):'',
   p1:q.get('p1')||'',p2:q.get('p2')||''};
  [state.p1,state.p2]=cleanPair(state.team,state.p1,state.p2);
 }
 function writeHash(push=false){
  const q=new URLSearchParams({page:state.page,mode:state.mode,variant:String(state.variant),view:state.view,filter:state.filter});
  if(state.mode==='partial')q.set('fixed',JSON.stringify(state.fixedPairs));
  for(const key of ['team','p1','p2'])if(state[key])q.set(key,state[key]);
  const player=navigation.params().get('player');
  if(state.page==='players'&&window.PLAYER_PROFILES.has(player))q.set('player',player);
  const entry={...navigation.state()};
  if(!q.has('player')){delete entry.teamcPlayerEntry;delete entry.teamcRosterScroll;}
  navigation.write(q,{push,state:entry});
 }
 function navigatePage(page){
  if(state.page===page)return;
  // Leaving an editor must leave a roster entry behind, not a stale player detail.
  const previous=navigation.params();
  if(previous.has('player')){
   previous.delete('player');const entry={...navigation.state()};delete entry.teamcPlayerEntry;delete entry.teamcRosterScroll;
   navigation.write(previous,{state:entry});
  }
  state.page=page;renderPage();writeHash(true);
  window.dispatchEvent(new CustomEvent('teamcroutechange'));
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
 function view(){return state.view==='auto'?'draft':state.view;}
 function activePlan(){return view()==='confirmed'?confirmed():plans[state.variant]||plans[0];}
 function changeDraft(patch){Object.assign(state,patch,{view:'draft',variant:0});confirmationMessage='';render();}
 function receiveRecommendations(message){
  if(message.generation!==generation)return;
  calculating=false;recommendationError=message.error||'';plans=message.plans||[];
  if(plans.length){recommendationCache.set(requestKey,plans);if(recommendationCache.size>30)recommendationCache.delete(recommendationCache.keys().next().value);}
  state.variant=Math.min(state.variant,Math.max(0,plans.length-1));renderStrategy();writeHash();
 }
 function calculate(){
  const options={mode:state.mode,fixedPairs:state.fixedPairs},key=definitions.fingerprint({algorithm:pairing.algorithmVersion,version:cVersion(),options});
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
  tab.addEventListener('click',()=>navigatePage(tab.dataset.page));
  tab.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();tabs[next].focus();tabs[next].click();});
 }
 function renderPage(){
  document.body.dataset.page=state.page;
  document.querySelector('.brand img').src=state.page==='players'?'assets/roster-club-emblem.svg':'assets/club-emblem.svg';
  const menuImage=$('menu-toggle').querySelector('img');menuImage.src=state.page==='analysis'?'assets/analysis-ellipsis.svg':'assets/ellipsis.svg';menuImage.width=state.page==='analysis'?44:24;menuImage.height=state.page==='analysis'?44:24;
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
 function showConfirmed(){const saved=confirmed();if(!saved)return;Object.assign(state,{view:'confirmed',mode:saved.mode,fixedPairs:saved.fixedPairs.map(item=>item.pair)});render();}
 $('view-confirmed').addEventListener('click',showConfirmed);
 $('view-draft').addEventListener('click',()=>{state.view='draft';render();});
 $('confirm-lineup').addEventListener('click',async()=>{
  const plan=plans[state.variant]||plans[0],cloud=window.PLAYER_PROFILE_CLOUD;if(!plan||calculating||plan.profileVersion!==cVersion())return;
  $('confirm-lineup').disabled=true;confirmationMessage='팀 출전표를 저장하고 있습니다.';$('lineup-status').textContent=confirmationMessage;
  try{await cloud.saveLineup(plan,cloud.lineup?.revision||0);confirmationMessage='팀 공통 출전표로 확정했습니다.';state.view='confirmed';}
  catch(error){confirmationMessage=error.message;}renderStrategy();writeHash();
 });
 function renderStrategy(){
  $('operation-modes').replaceChildren(...Object.entries(pairing.modeLabels).map(([id,title])=>button(title,state.mode===id,()=>changeDraft({mode:id}),'strategy-button')));
  renderFixedPairs();const plan=activePlan(),saved=confirmed(),cloud=window.PLAYER_PROFILE_CLOUD;
  $('recommendation-status').textContent=calculating?'선수 선호에 맞춰 추천안을 계산하고 있습니다.':recommendationError||(plans.length&&plans.length<3?'고정 조건 때문에 다른 밸런스 조합을 만들 수 없어 가능한 안만 표시합니다.':'선수 정보가 바뀌면 추천안을 다시 계산합니다.');
  $('validation').textContent=plan?'편성 검증 통과':'편성 준비';
  $('view-draft').setAttribute('aria-pressed',String(view()==='draft'));$('view-confirmed').setAttribute('aria-pressed',String(view()==='confirmed'));
  $('view-confirmed').disabled=!saved;
  $('confirm-lineup').disabled=view()!=='draft'||calculating||!plans.length||cloud?.status!=='ready'||cloud?.pendingCount>0||!cloud?.lineupReady;
  $('confirm-lineup').textContent=saved?'이 추천안으로 확정표 교체':'이 추천안으로 출전표 확정';
  $('lineup-status').textContent=confirmationMessage||(cloud?.lineup&&!saved?'저장된 출전표가 규정을 만족하지 않습니다. 새 추천안으로 교체하세요.':view()==='confirmed'&&saved
   ?'팀 확정표 · '+pairing.modeLabels[saved.mode]+' · '+(pairing.strategyLabels[saved.strategy]||'이전 추천안')+(saved.profileVersion!==cVersion()?' · 선수 정보가 변경되었습니다. 확정표는 유지됩니다.':'')+(saved.algorithmVersion!==pairing.algorithmVersion?' · 이전 편성 기준입니다. 새 추천안으로 교체할 수 있어요.':'')
   :cloud?.status!=='ready'||!cloud?.lineupReady?'추천안을 볼 수 있습니다. 팀 공유 저장소 연결 후 출전표를 확정할 수 있어요.':'추천안 · 팀 확정표와 별도로 비교할 수 있습니다.');
  $('pair-options').replaceChildren(...plans.map((item,index)=>{
   const selected=view()==='draft'&&state.variant===index,card=el('section','pair-option');card.dataset.selected=String(selected);
   const heading=el('h3','',item.title);heading.id='pair-option-title-'+index;card.setAttribute('aria-labelledby',heading.id);card.append(heading,el('p','muted small',item.description));
   const list=el('ul','pair-option-pairs');
   for(const pair of model.summarizePairs(item.matches)){const row=el('li','');row.append(pairLabel(pair.pair),el('span','pair-match-count',pair.matches.length+'경기'));list.append(row);}
   card.append(list,button(selected?'선택됨 · 출전표 표시 중':'이 안의 출전표 보기',selected,()=>{state.variant=index;state.view='draft';renderStrategy();writeHash();},'pair-option-select'));return card;
  }));
  $('confirmed-pairs-block').hidden=view()!=='confirmed';
  const pairs=plan?model.summarizePairs(plan.matches):[];$('pair-summary-count').textContent='8명 모두 5경기';
  $('strategy-pairs').replaceChildren(...pairs.map(item=>{const card=el('div','strategy-pair-card');card.append(pairLabel(item.pair),el('p','pair-match-count',item.matches.length+'경기'));return card;}));
  if(plan?.reasons?.length){const notes=el('div','recommendation-reasons');for(const reason of plan.reasons)notes.append(el('p','muted small',reason));$('strategy-pairs').append(notes);}
  $('filters').replaceChildren(...['all','A','B','D'].map(team=>button(team==='all'?'전체':team+'조',state.filter===team,()=>{state.filter=team;renderStrategy();writeHash();})));
  $('selected-plan-label').textContent=plan?(view()==='confirmed'?'팀 확정표':'선택한 안')+' · '+plan.title:'';
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
    if(match){const choice=button('',false,()=>{if(state.team!==match.team){state.p1='';state.p2='';}state.team=match.team;navigatePage('analysis');$('opponent1').focus();},'matrix-match');
     choice.dataset.match=match.id;choice.setAttribute('aria-label',time+' '+court+'코트 '+match.pair.map(displayName).join(' + ')+' vs '+match.team+'조, 페어 분석');
     choice.append(el('span','matrix-pair-names',match.pair.map(displayName).join(' ')),el('span','matrix-vs','vs'),el('span','matrix-opponent',match.team+'조'));cell.append(choice);
    }else{cell.className='matrix-empty';cell.textContent='—';}row.append(cell);
   }body.append(row);
  }table.append(body);$('matches').append(table);
  const counts=el('div','count-grid');for(const name of names('C'))counts.append(el('span','',displayName(name)+' · '+plan.matches.filter(match=>match.pair.includes(name)).length+'경기'));$('counts').append(counts);
 }

 function analysisInput(){
  if(!legalNames(state.team,[state.p1,state.p2]))return null;
  const opponentPlayerIds=[state.p1,state.p2].map(name=>state.team+':'+name).sort();
  const players=opponentPlayerIds.map(id=>{const split=id.indexOf(':'),team=id.slice(0,split),name=id.slice(split+1);return {id,tier:data.teams[team][name].tier,profile:window.PLAYER_PROFILES.get(team,name)};});
  const expectedProfileHash=definitions.analysisVersion(players);
  return {opponentPlayerIds,expectedProfileHash,key:definitions.fingerprint({opponentPlayerIds,expectedProfileHash})};
 }
 function observationSection(title,source){
  const section=el('section','observation-section');section.append(el('h3','',title),el('p','observation-source',source));return section;
 }
 function appendTips(section,tips){
  for(const tip of tips){const card=el('div','observation-tip');card.append(el('h4','',tip.title),el('p','observation-basis','근거 관찰 · '+tip.basis),el('p','',tip.action));
   if(tip.sourceIds?.length){const links=el('p','muted small');for(const id of tip.sourceIds){const source=window.OPPONENT_TACTICS.sources[id];if(!source)continue;const link=el('a','',source.title);link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';links.append(link,el('span','',' '));}card.append(links);}section.append(card);}
 }
 function renderAnalysis(){
  for(const choice of $('analysis-teams').querySelectorAll('button'))choice.setAttribute('aria-pressed',String(choice.dataset.team===state.team));
  populate($('opponent1'),state.team,state.p1,state.p2);populate($('opponent2'),state.team,state.p2,state.p1);
  const container=$('analysis-result');container.replaceChildren();const input=analysisInput(),cloud=window.PLAYER_PROFILE_CLOUD;
  if(aiState?.status==='loading'&&aiState.inputKey!==input?.key){aiGeneration++;if(aiUnsubscribe){aiUnsubscribe();aiUnsubscribe=null;}clearTimeout(aiWaitTimer);aiState.status='stale';}
  const selectionStatus=$('analysis-selection-status');selectionStatus.hidden=Boolean(input);
  selectionStatus.textContent=!state.team?'상대 조를 선택해 주세요':state.p1||state.p2?'상대 선수 한 명을 더 선택해 주세요':'상대 선수 두 명을 선택해 주세요';
  const active=aiState?.inputKey===input?.key?aiState:null,loading=active?.status==='loading',done=Boolean(active?.result);
  const start=$('ai-analyze');start.replaceChildren();
  if(loading){const spinner=el('img','ai-spinner');spinner.src='assets/ai-spinner.svg';spinner.width=16;spinner.height=16;spinner.alt='';start.append(spinner);}
  start.append(el('span','',loading?'AI 상세 분석 · 분석 중':active?.status==='error'?'다시 시도':'AI 상세 분석'));
  start.disabled=!input||cloud?.status!=='ready'||cloud?.aiStatus!=='ready'||cloud?.pendingCount>0||loading;
  const status=$('analysis-ai-status');status.textContent=active?.error||active?.message||'';
  $('analysis-ai-panel').dataset.status=active?.status||'idle';
  if(!input)status.textContent=!state.team?'상대 조와 두 선수를 먼저 선택해 주세요.':'상대 선수 두 명을 모두 선택하면 이용할 수 있어요.';
  else if(!active&&cloud?.status!=='ready')status.textContent='팀 공유 저장소 연결 후 AI 상세 분석을 사용할 수 있어요. 기본 관찰 요약은 계속 볼 수 있어요.';
  else if(!active&&cloud?.aiStatus!=='ready')status.textContent='현재는 기본 관찰 요약을 볼 수 있어요. AI 연결 설정 후 상세 분석도 사용할 수 있어요.';
  else if(!active&&aiState)status.textContent='선택 또는 관찰 기록이 변경되었습니다. 다시 분석해 주세요.';
  if(!input)return;
  const opponents=[state.p1,state.p2].map(name=>({name:displayName(name),tier:data.teams[state.team][name].tier,profile:window.PLAYER_PROFILES.get(state.team,name)}));
  const basic=model.analyzeOpponentPair(opponents),result=done?active.result:basic;
  if(done){const compact=observationSection('기본 관찰 요약','관찰 기록 · '+state.team+'조');for(const player of opponents){const p=player.profile;compact.append(el('p','',player.name+' · '+p.keywords.filter(item=>item.kind==='pattern'||item.kind==='weak').map(item=>item.text).join(' / ')));}container.append(compact);}
  const heading=el('div','observation-heading');heading.append(el('h2','',done?'AI 상세 분석 · 완료':'기본 관찰 요약'),el('p','muted small',done?'관찰 기록 기반 제안 · 실제 경기에서 확인해 주세요.':'입력한 기록에 맞춘 복식 참고 자료 · AI 호출 없이 바로 표시'));container.append(heading);
  const overview=observationSection('상대 페어 한눈에 보기','관찰 기록 · '+state.team+'조');
  for(const player of opponents){
   const card=el('div','opponent-observation'),identity=el('div','opponent-observation-heading'),tier=player.tier;
   identity.append(el('strong','',player.name),el('span','',tierLabels[tier]+' '+tiers[tier]));card.append(identity);
   const p=player.profile;for(const [title,value] of [['플레이 성향',p.style==='unknown'?'미선택, 확인 필요':definitions.styles[p.style]],['주요 특징',p.keywords.filter(item=>item.kind==='note').map(item=>item.text).join(', ')],['플레이·패턴',p.keywords.filter(item=>item.kind==='pattern').map(item=>item.text).join(', ')],['어려워하는 상황',p.keywords.filter(item=>item.kind==='weak').map(item=>item.text).join(', ')]])card.append(el('p','',title+' · '+(value||'관찰 기록 없음, 확인 필요')));
   overview.append(card);
  }
  overview.append(el('p','opponent-pair-summary',result.summary));container.append(overview);
  for(const [title,source,tips] of [['주의할 점','관찰 기록 기반',result.cautions],['대응방안',done?'관찰 기록과 복식 참고 자료 기반':'입력에 맞춘 복식 참고 자료',result.responses],['공략할 상황','실제 반응에 맞춰 활용하세요',result.tactics]]){
   const section=observationSection(title,source);appendTips(section,tips);container.append(section);
  }

 }
 $('ai-analyze').addEventListener('click',requestAnalysis);
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

 for(const [id,field] of [['opponent1','p1'],['opponent2','p2']])$(id).addEventListener('change',()=>{state[field]=$(id).value;[state.p1,state.p2]=cleanPair(state.team,state.p1,state.p2);renderAnalysis();writeHash();});
 for(const choice of $('analysis-teams').querySelectorAll('button'))choice.addEventListener('click',()=>{if(state.team!==choice.dataset.team){state.team=choice.dataset.team;state.p1='';state.p2='';}renderAnalysis();writeHash();});
 function render(){renderPage();calculate();renderStrategy();renderAnalysis();writeHash();}
 window.addEventListener('teamcroutechange',()=>{readHash();render();});
 window.addEventListener('playerprofileschange',()=>{confirmationMessage='';render();});
 window.addEventListener('playerprofilecloudstatuschange',()=>{renderStrategy();renderAnalysis();});
  window.addEventListener('teamlineupchange',render);
 $('share').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(navigation.href());$('share-status').textContent='현재 선택 링크를 복사했습니다.';$('share-fallback').hidden=true;}catch{$('share-fallback').hidden=false;$('share-url').value=navigation.href();$('share-url').focus();$('share-url').select();$('share-status').textContent='아래 링크를 복사해 공유하세요.';}});
 readHash();render();
})();
