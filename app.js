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
 let state={},plans=[],selectedPlan=null,pendingSharedPairs=null,nextCursor=null,cursorExcludePairs=[],hasMore=false,searchLimited=false,worker=null,generation=0,recommendationRequest=0,requestKey='',selectionTargetKey='',recommendationError='',calculating=false,timer=null,confirmationMessage='';
 const recommendationCache=new Map(),editedPlans=new Map();let playerDetailTrigger=null,confirmedDraft=null,savingLineup=false,aiState=null,aiGeneration=0,aiUnsubscribe=null,aiWaitTimer=null;
 function canonicalPairs(value){
  const pairs=Array.isArray(value)?value:value?.matches?.map(match=>match.pair);
  if(!Array.isArray(pairs)||pairs.length!==20||pairs.some(pair=>!pairing.legalPair(data,pair)))return null;
  const result=pairs.map(pair=>[...pair].sort()).sort((a,b)=>pairing.pairKey(a).localeCompare(pairing.pairKey(b))),keys=result.map(pair=>pairing.pairKey(pair));
  if(new Set(keys).size!==20||names('C').some(name=>result.filter(pair=>pair.includes(name)).length!==5))return null;
  return result;
 }
 function compositionKey(value){const pairs=canonicalPairs(value);return pairs?definitions.fingerprint(pairs):'';}
 function readHash(){
  const q=navigation.params();let fixed=[],sharedPairs=null;
  try{const parsed=JSON.parse(q.get('fixed')||'[]');if(Array.isArray(parsed)&&parsed.length<=20&&parsed.every(item=>pairing.legalPair(data,item)))fixed=parsed;}catch{}
  try{sharedPairs=canonicalPairs(JSON.parse(q.get('pairs')||'null'));}catch{}
  const legacyVariant=q.has('strategy')?(q.get('strategy')==='win'?2:Math.min(1,Number(q.get('variant')||0))):Number(q.get('variant')||0);
  state={page:['players','strategy','analysis'].includes(q.get('page'))?q.get('page'):'players',
   mode:['free','partial'].includes(q.get('mode'))?q.get('mode'):'free',fixedPairs:fixed,variant:Math.max(0,Math.min(1,legacyVariant)||0),sharedPairs,
   view:['draft','confirmed'].includes(q.get('view'))?q.get('view'):'auto',filter:['A','B','D'].includes(q.get('filter'))?q.get('filter'):'all',team:['A','B','D'].includes(q.get('team'))?q.get('team'):'',
   p1:q.get('p1')||'',p2:q.get('p2')||''};
  [state.p1,state.p2]=cleanPair(state.team,state.p1,state.p2);
 }
 function writeHash(push=false){
  const q=new URLSearchParams({page:state.page,mode:state.mode,variant:String(state.variant),view:state.view,filter:state.filter});
  if(state.mode==='partial')q.set('fixed',JSON.stringify(state.fixedPairs));
  const shared=pendingSharedPairs||canonicalPairs(selectedPlan)||state.sharedPairs;if(shared)q.set('pairs',JSON.stringify(shared));
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
 function asset(src,width,height){const image=el('img');image.src='assets/'+src;image.width=width;image.height=height;image.alt='';return image;}
 function badge(team,name,compact=false){const tier=data.teams[team][name].tier,node=el('span',compact?'grade-badge pair-grade':'grade-badge',tiers[tier]);node.title=tierLabels[data.teams[team][name].tier];node.setAttribute('role','img');node.setAttribute('aria-label',node.title);return node;}
 function pairLabel(pair,plan=null){
  const label=button('',false,()=>showPairDetail(pair,label),'pair-label pair-unit');label.title='리턴 자리와 페어 설명';label.setAttribute('aria-label',pair.map(displayName).join(' × ')+' 리턴 자리와 페어 설명');pair.forEach((name,index)=>{if(index)label.append(el('span','pair-separator','×'));const member=el('span','pair-member');member.append(el('strong','',displayName(name)),badge('C',name,true));label.append(member);});return label;
 }
 let pairDetailTrigger=null;
 function assessPair(inputPair,rawProfiles){
  const pair=[...inputPair].sort();
  const profiles=pair.map(name=>definitions.cleanProfile(rawProfiles[name],'C')),positions=profiles.map(profile=>profile.position),explicit=position=>['fore','back'].includes(position),opposite=position=>position==='fore'?'back':'fore';
  let assigned=['fore','back'],positionReason='자리 정보가 부족해 임시로 나눴습니다. 경기 전에 포·백을 함께 조율해 주세요.';
  if(explicit(positions[0])&&explicit(positions[1])&&positions[0]!==positions[1]){assigned=[...positions];positionReason='두 선수의 포·백 리턴 자리 선호를 모두 반영했습니다.';}
  else if(explicit(positions[0])&&positions[0]===positions[1]){assigned=[positions[0],opposite(positions[0])];positionReason='두 선수의 리턴 자리 선호가 겹칩니다. 임시 배치이므로 경기 전에 조율해 주세요.';}
  else if(explicit(positions[0])){assigned=[positions[0],opposite(positions[0])];positionReason=displayName(pair[0])+'의 자리 선호를 반영했습니다. '+displayName(pair[1])+'의 반대 자리 배치는 임시 제안입니다.';}
  else if(explicit(positions[1])){assigned=[opposite(positions[1]),positions[1]];positionReason=displayName(pair[1])+'의 자리 선호를 반영했습니다. '+displayName(pair[0])+'의 반대 자리 배치는 임시 제안입니다.';}
  if(positions.every(position=>position==='either'))positionReason='두 선수 모두 리턴 자리는 상관없음으로 입력해 포·백을 나눠 제안합니다.';
  else if(explicit(positions[0])&&positions[1]==='either')positionReason=displayName(pair[0])+'의 자리 선호와 '+displayName(pair[1])+'의 상관없음 응답을 반영했습니다.';
  else if(positions[0]==='either'&&explicit(positions[1]))positionReason=displayName(pair[1])+'의 자리 선호와 '+displayName(pair[0])+'의 상관없음 응답을 반영했습니다.';
  else if(positions.includes('either')&&!positions.some(explicit))positionReason='상관없음 응답을 참고해 포·백을 나눴습니다. 자리 미입력 선수의 배치는 경기 전에 확인해 주세요.';
  const reasons=[positionReason],matches=[];
  if(profiles.every(p=>['net','baseline'].includes(p.courtPreference))&&profiles[0].courtPreference!==profiles[1].courtPreference)matches.push('네트·베이스라인 선호가 달라 앞뒤 역할을 나누기 좋습니다.');
  if(profiles.every(p=>['attack','defense'].includes(p.style))&&profiles[0].style!==profiles[1].style)matches.push('공격·수비 성향이 달라 서로 다른 역할을 제안할 수 있습니다.');
  for(const [i,j] of [[0,1],[1,0]]){
   const own=profiles[i],other=profiles[j],owner=displayName(pair[i]),partner=displayName(pair[j]);
   if(own.partnerRoles.includes('cover')&&other.courtPreference==='baseline')matches.push(owner+'의 뒤 커버 파트너 선호와 '+partner+'의 베이스라인 선호가 맞습니다.');
   if(own.partnerRoles.includes('attack')&&other.courtPreference==='net')matches.push(owner+'의 전위 공격 파트너 선호와 '+partner+'의 네트 선호가 맞습니다.');
   for(const [role,trait] of [['connect','안정적 연결'],['tactics','전술가'],['encourage','칭찬과 응원']])if(own.partnerRoles.includes(role)&&other.traits.includes(trait))matches.push(owner+'이 원하는 '+trait+' 역할을 '+partner+'의 특징에서 확인했습니다.');
  }
  reasons.push(...matches.slice(0,2));
  if(!matches.length)reasons.push('입력된 선호에서 추가 역할 보완 근거는 확인되지 않았습니다. 실제 호흡을 함께 확인해 주세요.');
  if(!profiles.some(p=>explicit(p.position)||p.position==='either'||['net','baseline'].includes(p.courtPreference)||['attack','defense'].includes(p.style)||p.partnerRoles.some(role=>role!=='either')||p.traits.length))reasons[1]='입력된 선호 정보가 적어 포·백과 역할을 함께 확인해 주세요.';
  const provisional=!(explicit(positions[0])&&explicit(positions[1])&&positions[0]!==positions[1]||explicit(positions[0])&&positions[1]==='either'||positions[0]==='either'&&explicit(positions[1]));
  return {pair,positions:Object.fromEntries(pair.map((name,index)=>[name,assigned[index]])),reasons,provisional};
 }
 function currentPairAssessment(pair){return assessPair(pair,Object.fromEntries(pair.map(name=>[name,window.PLAYER_PROFILES.get('C',name)])));}
 function showPairDetail(inputPair,trigger){
  const {pair,positions,reasons}=currentPairAssessment(inputPair);
  $('pair-detail-title').textContent=pair.map(displayName).join(' × ');
  $('pair-detail-positions').textContent='리턴 자리 제안 · '+[...pair].sort((a,b)=>positions[a]===positions[b]?0:positions[a]==='fore'?-1:1).map(name=>displayName(name)+' '+(positions[name]==='fore'?'포 (듀스코트)':'백 (애드코트)')).join(' / ');
  $('pair-detail-reasons').replaceChildren(...reasons.map(reason=>el('li','',reason)));pairDetailTrigger=trigger;$('pair-detail-dialog').showModal();$('pair-detail-close').focus();
 }
 $('pair-detail-close').addEventListener('click',()=>$('pair-detail-dialog').close());
 $('pair-detail-dialog').addEventListener('click',event=>{if(event.target===$('pair-detail-dialog'))$('pair-detail-dialog').close();});
 $('pair-detail-dialog').addEventListener('close',()=>{if(pairDetailTrigger?.isConnected)pairDetailTrigger.focus();pairDetailTrigger=null;});
 function showPlayerMatch(plan,name,trigger){
  const matches=plan.matches.filter(match=>match.pair.includes(name)).sort((a,b)=>a.time.localeCompare(b.time)||a.court-b.court);
  $('player-match-title').textContent=displayName(name)+' · 전체 '+matches.length+'경기';
  $('player-match-games').replaceChildren(...matches.map(match=>el('li','',match.time+' '+[name,match.pair.find(player=>player!==name)].map(displayName).join(' × ')+' vs '+match.team+'조 ('+match.court+'코트)')));
  playerDetailTrigger=trigger;$('player-match-dialog').showModal();$('player-match-close').focus();
 }
 $('player-match-close').addEventListener('click',()=>$('player-match-dialog').close());
 $('player-match-dialog').addEventListener('click',event=>{if(event.target===$('player-match-dialog'))$('player-match-dialog').close();});
 $('player-match-dialog').addEventListener('close',()=>{if(playerDetailTrigger?.isConnected)playerDetailTrigger.focus();playerDetailTrigger=null;});
 function cVersion(){return definitions.profileVersion(names('C').map(name=>({id:'C:'+name,tier:data.teams.C[name].tier,profile:window.PLAYER_PROFILES.get('C',name)})));}
 function confirmed(){const plan=window.PLAYER_PROFILE_CLOUD?.lineup;return plan&&!pairing.validateLineup(data,plan).length?plan:null;}
 function view(){return state.view==='auto'?'draft':state.view;}
 function draftKey(plan=selectedPlan){return requestKey+':'+compositionKey(plan);}
 function activePlan(){if(scheduleReadOnly)return confirmed()||plans[0]||null;return view()==='confirmed'?(confirmedDraft?.plan||confirmed()):(editedPlans.get(draftKey())?.plan||selectedPlan);}
 function activeEdit(){if(scheduleReadOnly)return null;return view()==='confirmed'?confirmedDraft:editedPlans.get(draftKey());}
 function lineupRevision(){return window.PLAYER_PROFILE_CLOUD?.lineup?.revision||0;}
 function lineupFingerprint(){return definitions.fingerprint(window.PLAYER_PROFILE_CLOUD?.lineup||null);}
 function planFingerprint(plan){return definitions.fingerprint(plan);}
 function changeDraft(patch){Object.assign(state,patch,{view:'draft',variant:0,sharedPairs:null});selectionTargetKey='';confirmationMessage='';render();}
 function receiveRecommendations(message){
  if(message.generation!==generation||message.requestId!==recommendationRequest)return;
  calculating=false;recommendationError=message.error||message.selectionError||'';
  if(message.error){pendingSharedPairs=null;renderStrategy();return;}
  if(message.page){
   if(message.action==='initial'||message.action==='page'){
    plans=message.page.plans.slice(0,5);cursorExcludePairs=message.page.excludePairs||[];
   }else if(message.action==='more'){for(const plan of message.page.plans){if(plans.length<5&&!plans.some(item=>compositionKey(item)===compositionKey(plan)))plans.push(plan);}visibleRecommendation=Math.max(0,plans.length-1);}
   nextCursor=message.page.nextCursor;hasMore=message.page.hasMore&&plans.length<5;searchLimited=Boolean(message.page.searchLimited);
   if(!selectedPlan)selectedPlan=message.selectedPlan||plans[0]||null;
  }
  if(message.plan){selectedPlan=message.plan;state.view='draft';state.variant=0;confirmationMessage='공유한 페어 구성으로 현재 선수 정보에 맞춰 출전표를 만들었습니다. 확정·저장하면 팀에 공유됩니다.';}
  pendingSharedPairs=null;
  if(selectedPlan){state.sharedPairs=canonicalPairs(selectedPlan);selectionTargetKey=compositionKey(selectedPlan);}
  renderStrategy();writeHash();
 }
 function calculate(){
  const options={mode:state.mode,fixedPairs:state.fixedPairs},key=definitions.fingerprint({algorithm:pairing.algorithmVersion,version:cVersion(),options});
  if(key===requestKey){
   const sharedKey=compositionKey(state.sharedPairs);
   if(sharedKey&&sharedKey!==compositionKey(selectedPlan)&&sharedKey!==selectionTargetKey){selectionTargetKey=sharedKey;requestRecommendations({action:'restore',pairs:state.sharedPairs,fromShare:true});}
   return;
  }
  if(editedPlans.size||confirmedDraft)confirmationMessage='선수 정보 또는 운영 조건이 변경되어 저장하지 않은 경기 교환 초안을 비웠습니다. 확정표는 유지됩니다.';
  requestKey=key;generation++;visibleRecommendation=0;plans=[];selectedPlan=null;pendingSharedPairs=null;nextCursor=null;cursorExcludePairs=[];hasMore=false;searchLimited=false;editedPlans.clear();confirmedDraft=null;recommendationError='';
  selectionTargetKey=compositionKey(state.sharedPairs);
  requestRecommendations({action:'initial',initial:true,sharedPairs:state.sharedPairs});
 }
 function pairsetList(plansToRead){return plansToRead.map(plan=>canonicalPairs(plan)).filter(Boolean);}
 function requestRecommendations({action='more',initial=false,pairs=null,sharedPairs=null,fromShare=false}={}){
  if(action==='more'&&plans.length>=5)return;
  if(worker){worker.terminate();worker=null;}clearTimeout(timer);
  if(fromShare)pendingSharedPairs=pairs;
  calculating=true;recommendationError='';const currentGeneration=generation,requestId=++recommendationRequest,profiles=window.PLAYER_PROFILES.all();
  const options={mode:state.mode,fixedPairs:state.fixedPairs,cursor:initial?null:nextCursor,limit:action==='initial'?1:1,excludePairs:action==='initial'?[]:action==='more'?cursorExcludePairs:undefined};
  const cacheKey=definitions.fingerprint({requestKey,action,pairs,sharedPairs,options});
  if(recommendationCache.has(cacheKey)){receiveRecommendations({...recommendationCache.get(cacheKey),generation:currentGeneration,requestId,action,fromShare});return;}
  const receive=message=>{
   if(currentGeneration!==generation||requestId!==recommendationRequest)return;
   if(!message.error){recommendationCache.set(cacheKey,message);if(recommendationCache.size>60)recommendationCache.delete(recommendationCache.keys().next().value);}
   receiveRecommendations({...message,generation:currentGeneration,requestId,action,fromShare});
  };
  timer=setTimeout(()=>{
   try{
    const instance=new Worker('pairing-worker.js?v=20261022-19');worker=instance;instance.onmessage=event=>{instance.terminate();if(worker===instance)worker=null;receive(event.data);};
    instance.onerror=()=>{instance.terminate();if(currentGeneration!==generation)return;if(worker===instance)worker=null;fallback();};
    instance.postMessage({generation:currentGeneration,requestId,action,profiles,options,pairs,sharedPairs});
   }catch{fallback();}
   function fallback(){
    try{
     if(action==='restore'){receive({plan:pairing.restorePairSet(data,profiles,pairs,options)});return;}
     if(action==='initial'){
      const strong=pairing.generatePage(data,profiles,{...options,strategy:'win',limit:1,cursor:null});
      const exclusions=[...options.excludePairs,...pairsetList(strong.plans)];
      const fit=pairing.generatePage(data,profiles,{...options,strategy:'return',excludePairs:exclusions,limit:1,cursor:null});
      let restored=null,selectionError='';if(sharedPairs)try{restored=pairing.restorePairSet(data,profiles,sharedPairs,options);}catch(error){selectionError='공유 페어 구성을 불러오지 못했습니다. '+error.message;}
      receive({page:{plans:[...strong.plans,...fit.plans],nextCursor:fit.nextCursor,hasMore:fit.hasMore,searchLimited:fit.searchLimited,excludePairs:exclusions},selectedPlan:restored,selectionError});return;
     }
     const page=pairing.generatePage(data,profiles,{...options,strategy:'return',limit:1});let restored=null,selectionError='';
     if(sharedPairs)try{restored=pairing.restorePairSet(data,profiles,sharedPairs,options);}catch(error){selectionError='공유 페어 구성을 불러오지 못했습니다. '+error.message;}
     receive({page:{...page,excludePairs:options.excludePairs||[]},selectedPlan:restored,selectionError});
    }catch(error){receive({error:error.message,code:error.code});}
   }
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
  document.querySelector('.brand img').src=state.page==='players'?'assets/roster-club-emblem.svg':state.page==='strategy'?'assets/pair-main-diamond.svg':'assets/club-emblem.svg';
  const brandImage=document.querySelector('.brand img');brandImage.width=state.page==='strategy'?12:28;brandImage.height=state.page==='strategy'?12:28;const menuImage=$('menu-toggle').querySelector('img');menuImage.src=state.page==='analysis'?'assets/analysis-ellipsis.svg':state.page==='strategy'?'assets/pair-main-menu.svg':'assets/ellipsis.svg';menuImage.width=state.page==='analysis'?44:state.page==='strategy'?22:24;menuImage.height=menuImage.width;
  closeMenu();for(const tab of tabs){const selected=tab.dataset.page===state.page;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;$(tab.getAttribute('aria-controls')).hidden=!selected;}$('share').hidden=state.page==='players';
 }
 function populate(select,team,value,other,excluded=[]){
  select.replaceChildren(new Option(team?'선택하세요':'조를 먼저 선택하세요',''));select.disabled=!team;
  for(const name of names(team)){const option=new Option(displayName(name)+' · '+tiers[data.teams[team][name].tier],name);option.disabled=excluded.includes(name)||name===other||(Boolean(other)&&!legalNames(team,[name,other]));select.add(option);}select.value=value;
 }
 function renderFixedPairs(){
  $('mode-player-count').textContent='C조 · '+names('C').length+'명';
  $('fixed-pairs-editor').hidden=state.mode!=='partial';$('fixed-pairs-guide').hidden=state.mode!=='partial';
  $('fixed-pairs-list').replaceChildren(...state.fixedPairs.map((pair,index)=>{const row=el('div','fixed-pair-row'),label=el('span','fixed-pair-names');pair.forEach((name,member)=>{if(member)label.append(el('span','fixed-pair-separator','×'));label.append(el('strong','',displayName(name)));});const remove=button('해제',false,()=>{changeDraft({fixedPairs:state.fixedPairs.filter((_,i)=>i!==index)});$('fixed-player1').focus();},'fixed-pair-remove');remove.setAttribute('aria-label',pair.map(displayName).join(' × ')+' 지정 해제');row.append(label,remove);return row;}));
  populate($('fixed-player1'),'C',$('fixed-player1').value,$('fixed-player2').value);
  populate($('fixed-player2'),'C',$('fixed-player2').value,$('fixed-player1').value);
  const error=requestedPairError([$('fixed-player1').value,$('fixed-player2').value]);
  $('add-fixed-pair').disabled=Boolean(error);$('fixed-pair-status').textContent=error==='두 선수를 선택하세요.'?'':error;
 }
 function requestedPairError(pair){
  if(!pair.every(Boolean))return '두 선수를 선택하세요.';
  if(!legalNames('C',pair))return '서로 다른 선수로 선택하세요. 러브끼리는 조합할 수 없습니다.';
  if(state.fixedPairs.length>=20)return '최대 20개 페어를 지정할 수 있습니다.';
  if(state.fixedPairs.some(item=>item.every(name=>pair.includes(name))))return '이미 지정한 페어입니다.';
  if(pair.some(name=>state.fixedPairs.filter(item=>item.includes(name)).length>=5))return '한 선수는 최대 5개의 지정 페어에 포함될 수 있습니다.';
  return '';
 }
 for(const id of ['fixed-player1','fixed-player2'])$(id).addEventListener('change',renderFixedPairs);
 $('add-fixed-pair').addEventListener('click',()=>{const pair=[$('fixed-player1').value,$('fixed-player2').value];if(requestedPairError(pair))return;$('fixed-player1').value='';$('fixed-player2').value='';changeDraft({fixedPairs:[...state.fixedPairs,pair]});$('fixed-player1').focus();});
 function showConfirmed(){if(!confirmed()&&!confirmedDraft)return;state.view='confirmed';render();}
 $('view-confirmed').addEventListener('click',showConfirmed);
 $('view-draft').addEventListener('click',()=>{state.view='draft';render();});
 $('confirm-lineup').addEventListener('click',async()=>{
  const plan=activePlan(),cloud=window.PLAYER_PROFILE_CLOUD,edit=activeEdit(),sourceView=view(),sourceKey=draftKey();
  if(!plan||savingLineup||cloud?.status!=='ready'||cloud.pendingCount>0||!cloud.lineupReady||(!edit&&sourceView!=='draft')||(sourceView==='draft'&&(calculating||plan.profileVersion!==cVersion())))return;
  const expectedRevision=edit?edit.baseRevision:lineupRevision();savingLineup=true;
  $('confirm-lineup').disabled=true;confirmationMessage='팀 출전표를 저장하고 있습니다.';$('lineup-status').textContent=confirmationMessage;
  try{await cloud.saveLineup(plan,expectedRevision);if(sourceView==='confirmed'){if(confirmedDraft===edit)confirmedDraft=null;}else if(editedPlans.get(sourceKey)===edit)editedPlans.delete(sourceKey);confirmationMessage='팀 공통 출전표로 확정했습니다.';state.view='confirmed';}
  catch(error){confirmationMessage=error.message;}finally{savingLineup=false;}renderStrategy();writeHash();if(confirmationMessage==='팀 공통 출전표로 확정했습니다.'&&$('schedule-dialog').open)closeSchedule(true);
 });
 let visibleRecommendation=0,scheduleReadOnly=false,scheduleEmpty=false,scheduleSession=null,scheduleTrigger=null;
 function openSchedule(shared,trigger,editShared=false){
  if($('schedule-dialog').open)closeSchedule(false);
  const previousView=state.view;scheduleTrigger=trigger;scheduleReadOnly=shared;scheduleEmpty=shared&&!confirmed();
  state.view=shared||editShared?'confirmed':'draft';
  const key=draftKey();scheduleSession={previousView,view:view(),key,requestKey,edit:editedPlans.get(key),confirmedDraft,committed:false};
  renderStrategy();$('schedule-dialog').showModal();document.body.classList.add('schedule-modal-open');$('schedule-close').focus();
 }
 function closeSchedule(committed=false){if(savingLineup)return;if(officialRecordEditor)$('official-record-dialog').close();if(scheduleSession)scheduleSession.committed=committed;clearDrag();$('schedule-dialog').close();finishScheduleSession();}
 function finishScheduleSession(){
  const session=scheduleSession;if(!session)return;scheduleSession=null;
  if(session&&!session.committed&&session.requestKey===requestKey){if(session.view==='confirmed')confirmedDraft=session.confirmedDraft;else if(session.edit)editedPlans.set(session.key,session.edit);else editedPlans.delete(session.key);}
  if(session&&!session.committed&&session.requestKey===requestKey)state.view=session.previousView;document.body.classList.remove('schedule-modal-open');scheduleReadOnly=false;scheduleEmpty=false;renderStrategy();writeHash();if(scheduleTrigger?.isConnected)scheduleTrigger.focus();else if(scheduleTrigger?.classList.contains('pair-option-select'))[...$('pair-options').querySelectorAll('.pair-option')].find(card=>card.dataset.selected==='true')?.querySelector('.pair-option-select')?.focus();scheduleTrigger=null;
 }
 $('schedule-dialog').addEventListener('close',()=>{if(!$('schedule-dialog').open)finishScheduleSession();});
 $('schedule-dialog').addEventListener('cancel',event=>{event.preventDefault();closeSchedule(false);});
 for(const id of ['schedule-close','schedule-cancel','schedule-readonly-close'])$(id).addEventListener('click',()=>closeSchedule(false));
 for(const id of ['open-team-schedule','open-team-schedule-bottom'])$(id).addEventListener('click',()=>openSchedule(true,$(id)));
 $('open-schedule-management').addEventListener('click',()=>openSchedule(false,$('open-schedule-management'),Boolean(confirmed())));
 $('open-shared-composition').addEventListener('click',()=>openSchedule(false,$('open-shared-composition')));
 $('schedule-confirm').addEventListener('click',()=>$('confirm-lineup').click());
 function syncScheduleDialog(plan){
  if(scheduleReadOnly)scheduleEmpty=!confirmed()&&!plans[0];const read=scheduleReadOnly,empty=scheduleEmpty,cloud=window.PLAYER_PROFILE_CLOUD;
  $('schedule-dialog').dataset.readonly=String(read);$('schedule-dialog-title').textContent=read?'우리 팀 출전표':'출전표 편집';
  $('schedule-dialog-badge').textContent=read?(confirmed()?'C조 편성 확정본':'기본 출전표 · 추천 조합 1'):'미저장 초안';
  $('schedule-dialog-subtitle').textContent=read?(confirmed()?'팀원이 확정한 최신 공유 출전표':(plans[0]?'아직 확정된 출전표가 없어 추천 조합 1의 기본 출전표를 보여드립니다.':'공식 대진을 먼저 표시합니다. C조 기본 출전표는 준비 중입니다.')):(plan?(plans.findIndex(item=>compositionKey(item)===compositionKey(plan))<0?'공유받은 페어 구성':'추천 조합 '+(plans.findIndex(item=>compositionKey(item)===compositionKey(plan))+1)):'출전표 준비')+' · 확정 전에는 팀 출전표에 반영되지 않아요';
  $('schedule-empty').hidden=!empty;$('schedule-empty').textContent=empty?(cloud?.status!=='ready'?'팀 공유 저장소 연결 상태를 확인하고 있습니다. 연결 후 최신 확정표를 확인하세요.':!cloud?.lineupReady?'팀 출전표를 불러오고 있습니다.':'기본 출전표를 계산하고 있습니다. 잠시 기다려 주세요.') :'';
  $('schedule-content').hidden=empty&&!read;$('schedule-shared-note').hidden=!read||empty;$('schedule-shared-note').querySelector('span').textContent=confirmed()?'서버에 저장된 최신 팀 출전표입니다.':'기본 출전표는 미확정 상태이며 자동 저장하지 않습니다.';
  $('schedule-guide-icon').src='assets/'+(read?'schedule-users.svg':'schedule-move.svg');
  $('schedule-guide-title').textContent=read?'전체 공식 경기와 출전 기록을 함께 확인하세요':'드래그로 페어를 교환하세요';
  $('schedule-guide-text').textContent=read?(confirmed()?'C조 편성은 읽기 전용입니다. 경기를 눌러 각 팀의 실제 출전 선수를 기록하세요.':'C조는 원본 추천 1의 예정 편성입니다. 경기를 눌러 실제 출전을 별도로 기록하세요. 기본 표는 자동 저장하지 않습니다.'):'모바일은 손잡이를 길게 누른 뒤 이동하세요. 같은 시간 중복 출전은 적용하지 않습니다.';
  $('schedule-cancel').hidden=read;$('schedule-confirm').hidden=read;$('schedule-confirm').disabled=$('confirm-lineup').disabled;
  $('schedule-readonly-close').hidden=!read;
  $('schedule-footer-title').textContent=read?(confirmed()?'서버에 저장된 팀 공유 출전표':'추천 조합 1 · 기본 출전표'):'확정하면 팀 서버에 저장하고 팝업을 닫아요';
  $('schedule-footer-description').textContent=read?'C조 편성은 변경하지 않습니다. 실제 출전 기록은 경기별로 별도 저장합니다.':'확정 전 편집은 초안이며, 취소하면 팀 출전표는 바뀌지 않아요.';
  $('schedule-save-status').textContent=confirmationMessage||'';
 }
 const collapsedPlayerCards=new Set();
 function renderRecommendationPlayers(card,plan){
  const layout=el('div','recommendation-players');layout.setAttribute('aria-label','선수별 페어 제안');
  for(const [playerIndex,name] of names('C').entries()){
   const detail=el('section','recommendation-player-card');detail.dataset.player=name;
   const games=plan.matches.filter(match=>match.pair.includes(name)).sort((a,b)=>a.time.localeCompare(b.time)||a.court-b.court),heading=el('div','recommendation-player-heading');
   const info=button('',false,()=>showPlayerMatch(plan,name,info),'recommendation-player-info');info.title='경기 정보';info.setAttribute('aria-label',displayName(name)+' 전체 경기 정보');const title=el('h4','');title.append(el('strong','',displayName(name)),badge('C',name,true));info.append(title);heading.append(info,el('span','recommendation-player-count','총 '+games.length+'경기'));
   const content=el('div','recommendation-player-body'),collapseKey=compositionKey(plan)+':'+name;content.id=card.getAttribute('aria-labelledby')+'-member-'+playerIndex;content.hidden=collapsedPlayerCards.has(collapseKey);
   const toggle=button('',false,()=>{content.hidden=!content.hidden;if(content.hidden)collapsedPlayerCards.add(collapseKey);else collapsedPlayerCards.delete(collapseKey);toggle.setAttribute('aria-expanded',String(!content.hidden));toggle.setAttribute('aria-label',displayName(name)+' 페어 '+(content.hidden?'펼치기':'접기'));},'recommendation-player-toggle');toggle.setAttribute('aria-expanded',String(!content.hidden));toggle.setAttribute('aria-controls',content.id);toggle.setAttribute('aria-label',displayName(name)+' 페어 '+(content.hidden?'펼치기':'접기'));const chevron=el('img');chevron.src='assets/pair-card-chevron.svg';chevron.width=16;chevron.height=16;chevron.alt='';toggle.append(chevron);heading.append(toggle);detail.append(heading);
   const columns=el('div','recommendation-pair-columns');columns.append(el('span','','함께할 선수'),el('span','','포·백 제안'));content.append(columns);
   const list=el('ul','recommendation-player-pairs');
   for(const game of games){
    const partner=game.pair.find(player=>player!==name),ordered=[name,partner],assessment=currentPairAssessment(ordered),row=el('li',''),pair=button('',false,()=>showPairDetail(ordered,pair),'recommendation-pair-row');pair.dataset.pair=JSON.stringify(ordered);
    pair.append(el('strong','recommendation-partner-name',displayName(partner)));const proposal=el('span','recommendation-pair-proposal');const raw=ordered.map(player=>definitions.cleanProfile(window.PLAYER_PROFILES.get('C',player),'C')),hasMissing=raw.some(profile=>!['fore','back','either'].includes(profile.position));
    if(hasMissing){proposal.append(el('span','suggestion-position','포·백 미지정'));pair.dataset.unspecified='true';}
    else{proposal.append(el('span','suggestion-position',[...ordered].sort((a,b)=>assessment.positions[a]===assessment.positions[b]?0:assessment.positions[a]==='fore'?-1:1).map(player=>displayName(player)+' ('+(assessment.positions[player]==='fore'?'포':'백')+')').join(' · ')),el('span','suggestion-kind',assessment.provisional?'임시 제안':'제안'));}
    pair.setAttribute('aria-label',displayName(partner)+' · '+proposal.textContent+' · 페어 설명');pair.append(proposal);row.append(pair);list.append(row);
   }
   content.append(list);detail.append(content);layout.append(detail);
  }card.append(layout);
 }
 function renderStrategy(){
  if(!scheduleReadOnly&&view()==='confirmed'&&!confirmed()&&!confirmedDraft)state.view='draft';
  $('operation-modes').replaceChildren(...Object.entries(pairing.modeLabels).filter(([id])=>id!=='fixed').map(([id,title])=>button(title,state.mode===id,()=>changeDraft({mode:id}),'strategy-button')));
  for(const node of $('operation-modes').querySelectorAll('button'))if(node.getAttribute('aria-pressed')==='true')node.append(asset('pair-main-mode-check.svg',17,17));
  renderFixedPairs();const plan=activePlan(),saved=confirmed(),cloud=window.PLAYER_PROFILE_CLOUD;
  $('recommendation-status').textContent=calculating?'선수 선호에 맞춰 페어 구성을 계산하고 있습니다. 선택한 출전표는 유지됩니다.':recommendationError||(searchLimited?'이번 탐색 한도에서 시간표를 찾지 못한 구성이 있습니다. 다른 페어 보기로 다음 구성을 확인하세요.':hasMore?'':'현재 조건에서 더 보여드릴 새로운 페어 구성이 없습니다.');
  $('recommendation-status').hidden=!$('recommendation-status').textContent;
  $('view-draft').setAttribute('aria-pressed',String(view()==='draft'));$('view-confirmed').setAttribute('aria-pressed',String(view()==='confirmed'));
  $('view-confirmed').disabled=!saved&&!confirmedDraft;
  const edited=activeEdit(),conflict=edited&&edited.baseRevision!==lineupRevision();
  $('confirm-lineup').disabled=savingLineup||!plan||(view()==='confirmed'?!edited:calculating||plan.profileVersion!==cVersion())||cloud?.status!=='ready'||cloud?.pendingCount>0||!cloud?.lineupReady;
  $('confirm-lineup').textContent=edited?'변경한 출전표 확정·저장':saved?'이 추천안으로 확정표 교체':'이 추천안으로 출전표 확정';
  $('lineup-status').textContent=confirmationMessage||(edited?(conflict?'다른 팀원이 확정표를 변경했습니다. 이 초안은 이전 확정표를 기준으로 하므로 저장할 수 없습니다. 변경 취소 후 최신 표를 확인하세요.':'경기 교환을 이 브라우저의 초안에 적용했습니다. 변경한 출전표 확정·저장을 눌러 팀에 공유하세요.')+(view()==='confirmed'&&plan.profileVersion!==cVersion()?' 선수 정보가 바뀌기 전 확정표를 편집 중이며, 이 표의 선수 정보 기준을 유지해 저장합니다.':''):cloud?.lineup&&!saved?'저장된 출전표가 현재 규정을 만족하지 않습니다. 새 추천안으로 교체하세요.':view()==='confirmed'&&saved
   ?'팀 확정표 · '+pairing.modeLabels[saved.mode]+' · '+(pairing.strategyLabels[saved.strategy]||'이전 추천안')+(saved.profileVersion!==cVersion()?' · 선수 정보가 변경되었습니다. 확정표는 유지됩니다.':'')+(saved.algorithmVersion!==pairing.algorithmVersion?' · 이전 편성 기준입니다. 새 추천안으로 교체할 수 있어요.':'')
   :cloud?.status!=='ready'||!cloud?.lineupReady?'추천안을 볼 수 있습니다. 팀 공유 저장소 연결 후 출전표를 확정할 수 있어요.':'추천안 · 팀 확정표와 별도로 비교할 수 있습니다.');
  if(plan){const warnings=pairing.consecutivePlayWarnings(data,plan.matches).join(' ');if(warnings&&!$('lineup-status').textContent.includes(warnings))$('lineup-status').textContent+=' '+warnings;}
  $('discard-lineup-edits').hidden=!edited;
  $('open-shared-composition').hidden=!selectedPlan||plans.some(item=>compositionKey(item)===compositionKey(selectedPlan));
  $('pair-options').replaceChildren(...plans.map((original,index)=>{const item=editedPlans.get(draftKey(original))?.plan||original;
   const selected=view()==='draft'&&compositionKey(selectedPlan)===compositionKey(item),card=el('section','pair-option');card.dataset.selected=String(selected);card.hidden=index!==Math.min(visibleRecommendation,plans.length-1);card.dataset.pairs=JSON.stringify(canonicalPairs(item));
   const heading=el('h3','','추천 조합 '+(index+1));heading.id='pair-option-title-'+index;card.setAttribute('aria-labelledby',heading.id);const header=el('div','pair-option-heading');const scheduleButton=button('이 안의 출전표 보기',selected,()=>{selectedPlan=original;state.sharedPairs=canonicalPairs(original);selectionTargetKey=compositionKey(original);state.variant=index;state.view='draft';visibleRecommendation=index;confirmationMessage='';renderStrategy();writeHash();openSchedule(false,[...$('pair-options').querySelectorAll('.pair-option-select')][index]);},'pair-option-select');scheduleButton.append(asset('pair-main-arrow.svg',14,14));header.append(heading,scheduleButton);
   const navigation=el('div','recommendation-navigation'),previous=button('이전 추천',false,()=>{visibleRecommendation=Math.max(0,index-1);renderStrategy();},'recommendation-prev'),next=button('다음 추천',false,()=>{if(index<plans.length-1){visibleRecommendation=index+1;renderStrategy();}else if(hasMore&&!calculating&&plans.length<5){requestRecommendations();renderStrategy();}},'recommendation-next');previous.disabled=index===0;previous.insertBefore(asset('pair-main-prev.svg',14,14),previous.children[0]);next.append(asset('pair-main-next.svg',14,14));next.disabled=calculating||index===plans.length-1&&!hasMore;navigation.append(previous,el('span','','총 20페어 · 8명 각 5경기'),next);const controls=el('div','pair-option-controls');controls.append(header,navigation);card.append(controls,el('h4','player-partners-title','선수별 파트너'),el('p','player-partners-description','같은 페어가 두 선수의 카드에 각각 표시됩니다. 전체 페어는 중복 없이 20개입니다.'));renderRecommendationPlayers(card,item);return card;
  }));
  $('confirmed-pairs-block').hidden=view()!=='confirmed';
  const pairs=plan?model.summarizePairs(plan.matches):[];$('pair-summary-count').textContent='8명 모두 5경기';
  $('strategy-pairs').replaceChildren(...pairs.map(item=>{const card=el('div','strategy-pair-card');card.append(pairLabel(item.pair,plan));return card;}));
  if(plan?.reasons?.length){const notes=el('div','recommendation-reasons');for(const reason of plan.reasons)notes.append(el('p','muted small',reason));$('strategy-pairs').append(notes);}
  $('filters').replaceChildren(...['all','A','B','D'].map(team=>button(team==='all'?'전체':team+'조',state.filter===team,()=>{state.filter=team;renderStrategy();writeHash();})));
  $('selected-plan-label').textContent=plan?(view()==='confirmed'?'팀 확정표':'선택한 안')+' · '+plan.title+(edited?' · 변경 초안 (미저장)':''):'';
  syncScheduleDialog(plan);renderSchedule(plan);
 }
 let scheduleDrag=null,dragScrollTimer=null;
 function dragSnapshot(id,node){return {id,node,view:view(),key:draftKey(),requestKey,profileVersion:cVersion(),planFingerprint:planFingerprint(activePlan()),lineupFingerprint:lineupFingerprint(),baseRevision:activeEdit()?.baseRevision??lineupRevision()};}
 function currentDragPlan(drag){const plan=activePlan();return plan&&drag.view===view()&&drag.key===draftKey()&&drag.requestKey===requestKey&&drag.profileVersion===cVersion()&&drag.planFingerprint===planFingerprint(plan)&&drag.lineupFingerprint===lineupFingerprint()?plan:null;}
 function dragCell(node){while(node&&node!==document){if(node.classList?.contains('matrix-match'))return node;node=node.parentNode;}return null;}
 function clearDrag(){
  if(!scheduleDrag)return;clearTimeout(scheduleDrag.timer);clearTimeout(dragScrollTimer);dragScrollTimer=null;
  const drag=scheduleDrag;scheduleDrag=null;drag.node.draggable=true;
  for(const node of $('matches').querySelectorAll('.matrix-match')){node.classList.remove('drag-source');node.classList.remove('drop-valid');node.classList.remove('drop-invalid');}
  document.body.classList.remove('schedule-dragging');
  if(drag.pointerId!==undefined&&drag.node.hasPointerCapture?.(drag.pointerId))drag.node.releasePointerCapture(drag.pointerId);
 }
 function activateDrag(drag){if(scheduleDrag!==drag||!currentDragPlan(drag)){clearDrag();return;}drag.active=true;drag.node.classList.add('drag-source');document.body.classList.add('schedule-dragging');$('schedule-drag-status').textContent='교환할 경기 위로 옮겨 놓으세요.';}
 function dragPreview(target){
  if(!scheduleDrag?.active)return null;
  for(const node of $('matches').querySelectorAll('.matrix-match')){node.classList.remove('drop-valid');node.classList.remove('drop-invalid');}
  scheduleDrag.target=target;scheduleDrag.result=null;
  if(!target||String(target.dataset.match)===String(scheduleDrag.id))return null;
  const plan=currentDragPlan(scheduleDrag);
  if(!plan){$('schedule-drag-status').textContent='출전표나 선수 정보가 변경되어 교환을 취소했습니다.';clearDrag();return null;}
  const id=plan.matches.find(match=>String(match.id)===String(target.dataset.match))?.id;
  try{const result=pairing.swapPairs(data,plan,scheduleDrag.id,id);target.classList.add('drop-valid');scheduleDrag.result=result;$('schedule-drag-status').textContent='놓으면 두 페어를 교환합니다. '+pairing.consecutivePlayWarnings(data,result.matches).map(text=>'💦 '+text).join(' ');return result;}
  catch(error){target.classList.add('drop-invalid');$('schedule-drag-status').textContent=error.message;return null;}
 }
 function finishDrag(target){
  const drag=scheduleDrag;if(!drag?.active){clearDrag();return;}
  const result=dragPreview(target);clearDrag();if(result)applyManualSwap(result,drag,drag.id);
 }
 function edgeScroll(y){
  clearTimeout(dragScrollTimer);if(!scheduleDrag?.active||!Number.isFinite(y))return;
  const scroller=$('schedule-dialog').open?$('schedule-scroll'):null,rect=scroller?.getBoundingClientRect(),top=rect?.top||0,bottom=rect?.bottom||(window.innerHeight||0),delta=y<top+64?-18:bottom&&y>bottom-64?18:0;if(!delta)return;
  if(scroller){if(scroller.scrollBy)scroller.scrollBy({top:delta,behavior:'instant'});else scroller.scrollTop=(scroller.scrollTop||0)+delta;}else window.scrollBy?.({top:delta,behavior:'instant'});
  dragScrollTimer=setTimeout(()=>{if(!scheduleDrag?.active)return;if(!Number.isFinite(scheduleDrag.x)||!Number.isFinite(scheduleDrag.y))return;const target=dragCell(document.elementFromPoint?.(scheduleDrag.x,scheduleDrag.y));dragPreview(target);edgeScroll(scheduleDrag?.y??y);},50);
 }
 function installScheduleDrag(node,match){
  if(scheduleReadOnly)return;node.draggable=true;node.dataset.editable='true';node.title='끌어서 다른 경기와 페어 교환 · 모바일은 손잡이를 길게 누른 뒤 이동';
  node.addEventListener('dragstart',event=>{if(event.target?.tagName==='IMG'){event.preventDefault();return;}if(scheduleDrag?.pointerId!==undefined){event.preventDefault();return;}clearDrag();const drag=dragSnapshot(match.id,node);scheduleDrag=drag;activateDrag(drag);if(!drag.active){event.preventDefault();return;}event.dataTransfer?.setData('text/plain',String(match.id));if(event.dataTransfer)event.dataTransfer.effectAllowed='move';});
  node.addEventListener('dragover',event=>{if(!scheduleDrag?.active)return;scheduleDrag.x=event.clientX;scheduleDrag.y=event.clientY;const result=dragPreview(node);if(result){event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';}else if(event.dataTransfer)event.dataTransfer.dropEffect='none';edgeScroll(event.clientY);});
  node.addEventListener('dragleave',event=>{if(scheduleDrag?.active&&!node.contains(event.relatedTarget))dragPreview(null);});
  node.addEventListener('drop',event=>{if(!scheduleDrag?.active)return;event.preventDefault();finishDrag(node);});
  node.addEventListener('dragend',()=>{clearDrag();});
  node.addEventListener('pointerdown',event=>{
   if(event.pointerType!=='touch')return;if(event.isPrimary===false){clearDrag();return;}clearDrag();node.draggable=false;const drag={...dragSnapshot(match.id,node),pointerId:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,active:false};scheduleDrag=drag;
   drag.timer=setTimeout(()=>{activateDrag(drag);if(drag.active){node.setPointerCapture?.(event.pointerId);}},350);
  });
  node.addEventListener('lostpointercapture',event=>{if(scheduleDrag?.node===node&&scheduleDrag.pointerId!==undefined&&scheduleDrag.pointerId===event.pointerId){clearDrag();}});
  node.addEventListener('contextmenu',event=>{event.preventDefault();});
  node.addEventListener('selectstart',event=>{event.preventDefault();});
 }
 document.addEventListener('dragover',event=>{if(!scheduleDrag?.active||scheduleDrag.pointerId!==undefined||dragCell(event.target))return;scheduleDrag.x=event.clientX;scheduleDrag.y=event.clientY;dragPreview(null);if(event.dataTransfer)event.dataTransfer.dropEffect='none';edgeScroll(event.clientY);});
 document.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'&&event.isPrimary===false){clearDrag();}});
 document.addEventListener('touchstart',event=>{if(event.touches?.length>1){clearDrag();}},{passive:true});
 document.addEventListener('pointermove',event=>{
  const drag=scheduleDrag;if(!drag||drag.pointerId!==event.pointerId)return;
  drag.x=event.clientX;drag.y=event.clientY;
  if(!drag.active){if(Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>8)clearDrag();return;}
  event.preventDefault();dragPreview(dragCell(document.elementFromPoint?.(event.clientX,event.clientY)||event.target));edgeScroll(event.clientY);
 },{passive:false});
 document.addEventListener('touchmove',event=>{if(scheduleDrag?.active&&scheduleDrag.pointerId!==undefined)event.preventDefault();},{passive:false});
 document.addEventListener('pointerup',event=>{if(scheduleDrag?.pointerId!==event.pointerId)return;const target=dragCell(document.elementFromPoint?.(event.clientX,event.clientY)||event.target);finishDrag(target);});
 document.addEventListener('pointercancel',event=>{if(scheduleDrag?.pointerId===undefined||scheduleDrag.pointerId!==event.pointerId)return;clearDrag();});
 window.addEventListener('blur',()=>{clearDrag();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){clearDrag();}});
 function applyManualSwap(result,context,matchId){
  const edit={plan:result,baseRevision:context.baseRevision};if(context.view==='confirmed')confirmedDraft=edit;else editedPlans.set(context.key,edit);
  document.querySelector('.pairing-settings').open=true;
  confirmationMessage='페어 교환을 초안에 적용했습니다. 출전표 확정·저장으로 공유하세요. '+pairing.consecutivePlayWarnings(data,result.matches).map(text=>'💦 '+text).join(' ');
  renderStrategy();writeHash();
  $('schedule-drag-status').textContent='페어를 교환했습니다. '+pairing.consecutivePlayWarnings(data,result.matches).map(text=>'💦 '+text).join(' ');
  [...$('matches').querySelectorAll('.matrix-match')].find(node=>String(node.dataset.match)===String(matchId))?.focus();
 }
 let officialRecordEditor=null;
 const observedName=id=>displayName(id.slice(2));
 function recordConnectionMessage(cloud){const error=cloud?.opponentRecordsError;if(error)return /permission-denied/.test(error)?'경기 기록 접근 권한이 없어 저장할 수 없습니다. 서버 권한 설정을 확인한 뒤 다시 연결해 주세요.':'경기 기록 연결 오류 ('+error+'). 다시 연결한 뒤 저장해 주세요.';return cloud?.opponentRecordsReady?'':'공유 경기 기록에 연결 중입니다. 연결이 끝나면 저장할 수 있습니다.';}
 function officialRecords(){return window.PLAYER_PROFILE_CLOUD?.opponentRecords||{};}
 function renderTournamentSchedule(plan){
  const cloud=window.PLAYER_PROFILE_CLOUD,records=officialRecords(),status=$('tournament-record-status');status.hidden=false;
  status.textContent=cloud?.opponentRecordsError?recordConnectionMessage(cloud):cloud?.opponentRecordsReady?'경기를 눌러 실제 출전 선수를 기록하세요. 예정 편성은 경기 기록에 포함되지 않습니다.':'공유 경기 기록에 연결 중입니다. 예정 편성과 공식 대진을 먼저 표시합니다.';
  $('retry-tournament-records').hidden=!cloud?.opponentRecordsError;
  const rows=data.tournamentSchedule.filter(match=>state.filter==='all'||match.sides.some(side=>side.team===state.filter)),times=[...new Set(rows.map(match=>match.time))].sort(),table=el('table','schedule-matrix tournament-matrix'),head=el('thead'),headRow=el('tr');for(const title of ['시간','1코트','2코트','3코트','4코트'])headRow.append(el('th','',title));head.append(headRow);table.append(head);const body=el('tbody'),warnings=new Map(pairing.consecutivePlayDetails(data,plan?.matches||[]).map(item=>[item.name,item.count]));
  for(const time of times){const row=el('tr'),reference=rows.find(match=>match.time===time),clock=el('th','matrix-time');clock.scope='row';clock.append(el('strong','',time),el('span','small','~ '+reference.endTime));row.append(clock);
   for(let court=1;court<=4;court++){const cell=el('td'),match=rows.find(item=>item.time===time&&item.court===court);if(!match){cell.className='matrix-empty';cell.textContent='—';}else{
    const open=button('',false,()=>openOfficialRecord(match,open),'official-match');open.dataset.officialMatch=match.id;open.setAttribute('aria-label',time+' '+court+'코트 '+match.sides.map(side=>side.team+side.number).join(' vs ')+' 실제 출전 기록');
    for(const [index,side] of match.sides.entries()){if(index)open.append(el('span','official-vs','vs'));const line=el('span','official-team-line');line.append(el('strong','official-team-label',side.team+side.number));const pair=records[match.id]?.[side.team],planned=side.team==='C'?plan?.matches.find(game=>game.id===side.number):null;
     if(side.team==='C'&&planned){const own=el('span','matrix-match official-c-plan');own.dataset.match=planned.id;own.setAttribute('aria-readonly','true');own.draggable=false;const label=el('span','matrix-pair-names');for(const [position,name] of planned.pair.entries()){if(position)label.append(el('span','matrix-pair-separator','×'));const member=el('span','matrix-player');member.append(el('span','matrix-player-name',displayName(name)));if(warnings.has(name)){const warning=el('span','matrix-run-warning','💦');warning.title=displayName(name)+'가 연속 '+warnings.get(name)+'경기 출전합니다.';warning.setAttribute('role','img');warning.setAttribute('aria-label',warning.title);member.append(warning);}label.append(member);}own.append(label);line.append(own);}
     if(pair){const actual=el('span','official-observed',pair.map(observedName).join(' · '));line.append(actual);}open.append(line);
    }cell.append(open);
   }row.append(cell);}body.append(row);
  }table.append(body);$('matches').append(table);
 }
 function openOfficialRecord(match,trigger){
  const cloud=window.PLAYER_PROFILE_CLOUD;officialRecordEditor={match,trigger,revisions:{...cloud?.opponentRecordRevisions},selections:Object.fromEntries(match.sides.map(side=>[side.team,[...(officialRecords()[match.id]?.[side.team]||['',''])]])),messages:{},saving:new Set()};renderOfficialRecord();$('official-record-dialog').showModal();$('official-record-close').focus();
 }
 function renderOfficialRecord(){
  const editor=officialRecordEditor;if(!editor)return;const cloud=window.PLAYER_PROFILE_CLOUD,match=editor.match,records=officialRecords();$('official-record-title').textContent=match.time+' · '+match.court+'코트 · '+match.sides.map(side=>side.team+side.number).join(' vs ');
  $('official-record-connection').textContent=recordConnectionMessage(cloud);$('official-record-retry').hidden=!cloud?.opponentRecordsError;
  $('official-record-body').replaceChildren(...match.sides.map(side=>{const team=side.team,section=el('section','record-team');section.dataset.team=team;section.append(el('h3','',team+'조 실제 출전'),el('p','record-limit',team==='B'?'선수당 최대 6경기 · 같은 페어 재출전·러브끼리 금지':'선수당 최대 5경기 · 같은 페어 재출전·러브끼리 금지'));
   const saved=records[match.id]?.[team];section.append(el('p','record-saved',saved?'저장됨 · '+saved.map(observedName).join(' · '):'미입력 · 예정 선수는 기록으로 간주하지 않습니다.'));
   const fields=el('div','record-fields'),selection=editor.selections[team];for(let index=0;index<2;index++){const label=el('label','',team+'조 선수 '+(index+1)),select=el('select');select.id='record-'+team+'-'+index;select.append(new Option('선택하세요',''));for(const name of names(team)){const id=team+':'+name,other=selection[1-index],option=new Option(displayName(name)+' · '+tiers[data.teams[team][name].tier],id);option.disabled=id===other||Boolean(other)&&!model.isLegalPair([id,other].map(player=>({name:player,tier:data.teams[team][player.slice(2)]?.tier})));select.append(option);}select.value=selection[index];select.disabled=editor.saving.has(team);select.addEventListener('change',()=>{editor.selections[team][index]=select.value;renderOfficialRecord();$('record-'+team+'-'+index)?.focus();});label.append(select);fields.append(label);}section.append(fields);
   const revision=cloud?.opponentRecordRevisions?.[team]||0,stale=(editor.revisions[team]||0)!==revision&&!editor.saving.has(team),unready=!cloud?.opponentRecordsReady||Boolean(cloud?.opponentRecordsError),actions=el('div','record-actions'),save=button(team+'조 기록 저장',false,()=>saveOfficialRecord(team,false)),clear=button(team+'조 기록 삭제',false,()=>saveOfficialRecord(team,true));save.disabled=unready||stale||editor.saving.has(team)||!selection.every(Boolean);clear.disabled=unready||stale||editor.saving.has(team)||!saved;actions.append(save,clear);section.append(actions);section.append(el('p','record-team-status',editor.messages[team]||(stale?'다른 기기에서 이 팀 기록을 변경했습니다. 닫고 다시 열어 최신 기록을 확인하세요.':unready?recordConnectionMessage(cloud):'')));
   if(!saved&&cloud?.opponentRecordsReady&&!cloud?.opponentRecordsError&&window.TOURNAMENT_MODEL){try{const prediction=window.TOURNAMENT_MODEL.candidates(data,records,match.id,team),candidates=el('div','record-candidates');candidates.append(el('strong','','남은 페어 후보 '+prediction.count+'개'),el('p','','입력된 경기 기록 기준 · 기록 '+prediction.knownCount+'/20경기 · 미입력 '+prediction.unknownCount+'경기'));
    if(prediction.showPairs){const list=el('ul','record-candidate-list');for(const pair of prediction.pairs)list.append(el('li','',pair.map(observedName).join(' × ')));candidates.append(list);if(!prediction.count)candidates.append(el('p','','조건을 만족하는 후보가 없습니다. 출전 기록을 확인해 주세요.'));}
    else candidates.append(el('p','','후보가 5개 이하일 때 목록을 표시합니다. 미입력 경기 기록을 추가해 주세요.'));section.append(candidates);
   }catch{section.append(el('p','record-team-status','경기 기록을 확인한 뒤 후보를 다시 계산해 주세요.'));}}
   return section;}));
 }
 async function saveOfficialRecord(team,clear){
  const editor=officialRecordEditor,cloud=window.PLAYER_PROFILE_CLOUD;if(!editor||editor.saving.has(team))return;editor.saving.add(team);editor.messages[team]='저장 중입니다.';renderOfficialRecord();
  try{const result=await cloud.saveOpponentRecord(editor.match.id,team,clear?null:editor.selections[team],editor.revisions[team]||0);editor.revisions[team]=result.revision;editor.messages[team]=clear?'기록을 삭제했습니다.':'실제 출전 선수를 저장했습니다.';if(clear)editor.selections[team]=['',''];}
  catch(error){editor.messages[team]=error.message||'기록을 저장하지 못했습니다.';}finally{editor.saving.delete(team);if(officialRecordEditor===editor)renderOfficialRecord();renderSchedule(activePlan());}
 }
 $('official-record-close').addEventListener('click',()=>$('official-record-dialog').close());
 $('official-record-dialog').addEventListener('close',()=>{const editor=officialRecordEditor;officialRecordEditor=null;const target=[...$('matches').querySelectorAll('.official-match')].find(node=>node.dataset.officialMatch===editor?.match.id);if(target)target.focus();else $('schedule-close').focus();});
 $('official-record-retry').addEventListener('click',()=>window.PLAYER_PROFILE_CLOUD?.retryOpponentRecords?.());
 $('retry-tournament-records').addEventListener('click',()=>window.PLAYER_PROFILE_CLOUD?.retryOpponentRecords?.());
 window.addEventListener('opponentrecordschange',()=>{if(scheduleReadOnly)renderSchedule(activePlan());if(officialRecordEditor)renderOfficialRecord();});
 function renderSchedule(plan){
  $('schedule-drag-status').textContent='';
  clearDrag();$('matches').replaceChildren();
  $('tournament-record-status').hidden=true;$('retry-tournament-records').hidden=true;if(scheduleReadOnly&&data.tournamentSchedule&&window.TOURNAMENT_MODEL){renderTournamentSchedule(plan);return;}
  if(!plan)return;
  const runWarnings=new Map(pairing.consecutivePlayDetails(data,plan.matches).map(item=>[item.name,item.count]));
  const table=el('table','schedule-matrix');table.append(el('caption','sr-only',plan.title+' 시간대별 코트 출전표'));
  const head=el('thead'),headRow=el('tr');for(const title of ['시간','1코트','2코트','3코트','4코트']){const th=el('th','',title);th.scope='col';headRow.append(th);}head.append(headRow);table.append(head);
  const body=el('tbody'),times=[...new Set(plan.matches.filter(match=>state.filter==='all'||match.team===state.filter).map(match=>match.time))].sort();
  for(const time of times){
   const matches=plan.matches.filter(match=>match.time===time&&(state.filter==='all'||match.team===state.filter)),row=el('tr'),th=el('th','matrix-time');th.scope='row';th.append(el('strong','',time),el('span','muted small','~ '+matches[0].endTime));row.append(th);
   for(let court=1;court<=4;court++){
    const cell=el('td'),match=matches.find(item=>item.court===court);cell.dataset.court=String(court);
    if(match){const choice=el('div','matrix-match');choice.tabIndex=0;choice.setAttribute('role','group');installScheduleDrag(choice,match);choice.setAttribute('aria-readonly',String(scheduleReadOnly));
     choice.dataset.match=match.id;choice.setAttribute('aria-label',time+' '+court+'코트 '+match.pair.map(displayName).join(' + ')+' vs '+match.team+'조');
     const pairNames=el('span','matrix-pair-names');for(const name of match.pair){const player=el('span','matrix-player');player.append(el('span','matrix-player-name',displayName(name)));if(runWarnings.has(name)){const warning=el('span','matrix-run-warning','💦');warning.title=displayName(name)+'가 연속 '+runWarnings.get(name)+'경기 출전합니다.';warning.setAttribute('role','img');warning.setAttribute('aria-label',warning.title);player.append(warning);choice.setAttribute('aria-label',choice.getAttribute('aria-label')+'. '+warning.title);}pairNames.append(player);}if(!scheduleReadOnly){const handle=el('span','matrix-drag-handle'),icon=asset('schedule-grip.svg',13,13);handle.title='길게 누른 뒤 끌어서 페어 교환';handle.setAttribute('aria-hidden','true');icon.draggable=false;icon.setAttribute('draggable','false');handle.append(icon);choice.append(handle);}const pairInfo=el('span','matrix-pair-info'),meta=el('span','matrix-pair-meta');meta.append(el('span','matrix-opponent',match.team+'조'));pairInfo.append(pairNames,meta);choice.append(pairInfo);cell.append(choice);
    }else{cell.className='matrix-empty';cell.textContent='—';}row.append(cell);
   }body.append(row);
  }table.append(body);$('matches').append(table);
 }
 $('discard-lineup-edits').addEventListener('click',()=>{if(view()==='confirmed')confirmedDraft=null;else editedPlans.delete(draftKey());confirmationMessage='변경 초안을 취소했습니다.';renderStrategy();});


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
 function canAnalyzeWithAI(){
  const cloud=window.PLAYER_PROFILE_CLOUD;
  return cloud?.status==='ready'&&cloud?.aiStatus==='ready'&&typeof cloud.analyzeMatchup==='function';
 }
 function renderAnalysis(){
  for(const choice of $('analysis-teams').querySelectorAll('button'))choice.setAttribute('aria-pressed',String(choice.dataset.team===state.team));
  populate($('opponent1'),state.team,state.p1,state.p2);populate($('opponent2'),state.team,state.p2,state.p1);
  const container=$('analysis-result');container.replaceChildren();container.hidden=true;const input=analysisInput(),cloud=window.PLAYER_PROFILE_CLOUD,aiAvailable=canAnalyzeWithAI();
  if(aiState&&aiState.status!=='stale'&&aiState.inputKey!==input?.key){aiGeneration++;if(aiUnsubscribe){aiUnsubscribe();aiUnsubscribe=null;}clearTimeout(aiWaitTimer);aiState.status='stale';}
  const selectionStatus=$('analysis-selection-status');selectionStatus.hidden=Boolean(input);
  selectionStatus.textContent=!state.team?'상대 조를 선택해 주세요':state.p1||state.p2?'상대 선수 한 명을 더 선택해 주세요':'상대 선수 두 명을 선택해 주세요';
  const active=aiState&&aiState.inputKey===input?.key&&aiState.status!=='stale'?aiState:null,loading=active?.status==='loading',done=Boolean(active?.result);
  container.setAttribute('aria-busy',String(loading));
  const start=$('ai-analyze');start.replaceChildren();
  if(loading){const spinner=el('img','ai-spinner');spinner.src='assets/ai-spinner.svg';spinner.width=16;spinner.height=16;spinner.alt='';start.append(spinner);}
  start.append(el('span','',loading?'AI 분석 중':active?.status==='error'?'다시 시도':'분석하기 🧑‍🔬'));
  start.disabled=!input||(aiAvailable&&cloud.pendingCount>0)||loading;
  const status=$('analysis-ai-status');status.textContent=active?.error?active.error+' 기본 관찰 요약을 표시합니다.':active?.message||'';
  $('analysis-ai-panel').dataset.status=active?.status||'idle';
  if(!input)status.textContent=!state.team?'상대 조와 두 선수를 먼저 선택해 주세요.':'상대 선수 두 명을 모두 선택하면 이용할 수 있어요.';
  else if(!active&&aiState)status.textContent='선택 또는 관찰 기록이 변경되었습니다. 다시 분석해 주세요.';
  else if(!active)status.textContent=aiAvailable?'분석하기를 누르면 AI 분석을 보여드려요.':'분석하기를 누르면 기본 관찰 요약을 보여드려요.';
  if(input&&aiAvailable&&cloud.pendingCount>0&&!loading)status.textContent='관찰 기록을 저장하고 있습니다. 저장이 끝나면 분석할 수 있어요.';
  if(!input||!active||loading)return;
  container.hidden=false;
  const opponents=[state.p1,state.p2].map(name=>({name:displayName(name),tier:data.teams[state.team][name].tier,profile:window.PLAYER_PROFILES.get(state.team,name)}));
  const basic=model.analyzeOpponentPair(opponents),result=done?active.result:basic;
  const heading=el('div','observation-heading');heading.append(el('h2','',done?'AI 분석 · 완료':'기본 관찰 요약'),el('p','muted small',done?'관찰 기록 기반 제안 · 실제 경기에서 확인해 주세요.':'입력한 기록에 맞춘 복식 참고 자료'));container.append(heading);
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
  const input=analysisInput();if(!input||$('ai-analyze').disabled)return;const token=++aiGeneration;clearTimeout(aiWaitTimer);if(aiUnsubscribe){aiUnsubscribe();aiUnsubscribe=null;}
  if(!canAnalyzeWithAI()){aiState={inputKey:input.key,status:'basic',message:'입력한 관찰 기록으로 기본 요약을 정리했습니다.'};renderAnalysis();return;}
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
 window.addEventListener('playerprofileschange',()=>{confirmationMessage='';if(selectedPlan?.profileVersion!==cVersion())state.sharedPairs=null;render();});
 window.addEventListener('playerprofilecloudstatuschange',()=>{renderStrategy();renderAnalysis();});
  window.addEventListener('teamlineupchange',render);
 $('share').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(navigation.href());$('share-status').textContent='현재 선택 링크를 복사했습니다.';$('share-fallback').hidden=true;}catch{$('share-fallback').hidden=false;$('share-url').value=navigation.href();$('share-url').focus();$('share-url').select();$('share-status').textContent='아래 링크를 복사해 공유하세요.';}});
 readHash();render();
})();
