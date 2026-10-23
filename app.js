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
  const route=navigation.params(),sharedRoute=route.get('page')==='schedule'&&route.get('schedule')!=='edit';
  const q=new URLSearchParams(sharedRoute?(navigation.state()?.teamcScheduleContext||route.toString()):route.toString());
  for(const [key,value] of route)q.set(key,value);
  let fixed=[],sharedPairs=null;
  try{const parsed=JSON.parse(q.get('fixed')||'[]');if(Array.isArray(parsed)&&parsed.length<=20&&parsed.every(item=>pairing.legalPair(data,item)))fixed=parsed;}catch{}
  try{sharedPairs=canonicalPairs(JSON.parse(q.get('pairs')||'null'));}catch{}
  const legacyVariant=q.has('strategy')?(q.get('strategy')==='win'?2:Math.min(4,Number(q.get('variant')||0))):Number(q.get('variant')||0);
  state={page:['players','strategy','analysis','schedule'].includes(q.get('page'))?q.get('page'):(q.has('player')?'players':'schedule'),
   schedule:q.get('schedule')==='edit'?'edit':'shared',origin:['players','strategy','analysis'].includes(q.get('origin'))?q.get('origin'):'strategy',
   mode:['free','partial'].includes(q.get('mode'))?q.get('mode'):'free',fixedPairs:fixed,variant:Math.max(0,Math.min(4,legacyVariant)||0),sharedPairs,
   view:['draft','confirmed'].includes(q.get('view'))?q.get('view'):'auto',filter:['A','B','D'].includes(q.get('filter'))?q.get('filter'):'all',team:['A','B','D'].includes(q.get('team'))?q.get('team'):'',
   p1:q.get('p1')||'',p2:q.get('p2')||''};
  [state.p1,state.p2]=cleanPair(state.team,state.p1,state.p2);
 }
 function writeHash(push=false){
  let q=new URLSearchParams({page:state.page,mode:state.mode,variant:String(state.variant),view:state.view,filter:state.filter});
  if(state.page==='schedule'){q.set('schedule',state.schedule);q.set('origin',state.origin);}
  if(state.mode==='partial')q.set('fixed',JSON.stringify(state.fixedPairs));
  const shared=pendingSharedPairs||canonicalPairs(selectedPlan)||state.sharedPairs;if(shared)q.set('pairs',JSON.stringify(shared));
  for(const key of ['team','p1','p2'])if(state[key])q.set(key,state[key]);
  const player=navigation.params().get('player');
  if(state.page==='players'&&window.PLAYER_PROFILES.has(player))q.set('player',player);
  const entry={...navigation.state()};
  if(state.page!=='schedule'){delete entry.teamcScheduleEntry;delete entry.teamcScheduleReturn;}
  if(!q.has('player')){delete entry.teamcPlayerEntry;delete entry.teamcRosterScroll;}
  if(state.page==='schedule'&&state.schedule==='shared'){
   // Browser history preserves editing context; shared links only describe the shared view.
   entry.teamcScheduleContext=q.toString();q=new URLSearchParams({page:'schedule'});
   if(state.filter!=='all')q.set('filter',state.filter);
  }else delete entry.teamcScheduleContext;
  navigation.write(q,{push,state:entry});
 }
 function navigatePage(page){
  if(state.page===page)return;
  if(page==='schedule'){openSchedule(true,$('tab-schedule'));return;}
  if(state.page==='schedule'){
   const previousView=scheduleSession?.previousView;finishScheduleSession();if(previousView)state.view=previousView;
   scheduleTrigger=null;scheduleReturn=null;
  }
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
  if(scheduleSession){scheduleSession.requestKey=requestKey;scheduleSession.edits=new Map();scheduleSession.confirmedDraft=null;}
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
  $('site-header').hidden=(state.page==='schedule'&&state.schedule==='edit')||document.body.classList.contains('player-detail-open');$('schedule-dialog').hidden=state.page!=='schedule';
  document.querySelector('.brand img').src=state.page==='players'?'assets/roster-club-emblem.svg':state.page==='strategy'?'assets/pair-main-diamond.svg':'assets/club-emblem.svg';
  const brandImage=document.querySelector('.brand img');brandImage.width=state.page==='strategy'?12:28;brandImage.height=state.page==='strategy'?12:28;const menuImage=$('menu-toggle').querySelector('img');menuImage.src=state.page==='analysis'?'assets/analysis-ellipsis.svg':state.page==='strategy'?'assets/pair-main-menu.svg':'assets/ellipsis.svg';menuImage.width=state.page==='analysis'?44:state.page==='strategy'?22:24;menuImage.height=menuImage.width;
  closeMenu();for(const tab of tabs){const selected=tab.dataset.page===state.page&&(state.page!=='schedule'||state.schedule==='shared');tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;$(tab.getAttribute('aria-controls')).hidden=tab.dataset.page==='schedule'?state.page!=='schedule':!selected;}$('share').hidden=state.page==='players';
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
  const plan=activePlan(),cloud=window.PLAYER_PROFILE_CLOUD,edit=activeEdit(),sourceView=view(),sourceKey=draftKey(),savingSession=scheduleSession;
  if(!plan||savingLineup||cloud?.status!=='ready'||cloud.pendingCount>0||!cloud.lineupReady||(!edit&&sourceView!=='draft')||(sourceView==='draft'&&(calculating||plan.profileVersion!==cVersion())))return;
  const expectedRevision=edit?edit.baseRevision:lineupRevision();savingLineup=true;
  $('confirm-lineup').disabled=true;confirmationMessage='팀 출전표를 저장하고 있습니다.';$('lineup-status').textContent=confirmationMessage;
  try{await cloud.saveLineup(plan,expectedRevision);if(sourceView==='confirmed'){if(confirmedDraft===edit)confirmedDraft=null;}else if(editedPlans.get(sourceKey)===edit)editedPlans.delete(sourceKey);confirmationMessage='팀 공통 출전표로 확정했습니다.';if(savingSession)savingSession.committed=true;if(!savingSession||scheduleSession===savingSession)state.view='confirmed';}
  catch(error){confirmationMessage=error.message;}finally{savingLineup=false;}renderStrategy();writeHash();if(confirmationMessage==='팀 공통 출전표로 확정했습니다.'&&state.page==='schedule'&&scheduleSession===savingSession)closeSchedule(true);
 });
 let visibleRecommendation=0,scheduleReadOnly=false,scheduleEmpty=false,scheduleSession=null,scheduleTrigger=null,scheduleReturn=null;
 function beginScheduleSession(shared,previousView=state.view){
  scheduleReadOnly=shared;scheduleEmpty=shared&&!confirmed();
  scheduleSession={previousView,requestKey,edits:new Map(editedPlans),confirmedDraft,committed:false};
 }
 function openSchedule(shared,trigger,editShared=false){
  if(state.page==='schedule')return;
  writeHash();const returnTo={hash:navigation.params().toString(),scroll:window.scrollY||0,visibleRecommendation};
  scheduleReturn=returnTo;scheduleTrigger=trigger;const previousView=state.view;
  state.origin=state.page;state.page='schedule';state.schedule=shared?'shared':'edit';state.view=shared||editShared?'confirmed':'draft';
  beginScheduleSession(shared,previousView);renderPage();renderStrategy();
  writeHash(true);
  const entry={...navigation.state(),teamcScheduleEntry:true,teamcScheduleReturn:returnTo};
  navigation.write(navigation.params(),{state:entry});window.scrollTo(0,0);(shared?$('tab-schedule'):$('schedule-close')).focus();
 }
 function closeSchedule(committed=false){
  if(savingLineup)return;if(scheduleSession)scheduleSession.committed=committed;
  if(navigation.state()?.teamcScheduleEntry){navigation.back();return;}
  const origin=state.origin,previousView=scheduleSession?.previousView;finishScheduleSession();state.page=origin;if(!committed&&previousView)state.view=previousView;render();window.scrollTo(0,0);
 }
 function finishScheduleSession(){
  const session=scheduleSession;if(!session)return;scheduleSession=null;
  if(officialRecordEditor)$('official-record-dialog').close();if($('cheer-dialog').open)$('cheer-dialog').close();clearDrag();
  if(!session.committed&&session.requestKey===requestKey){confirmedDraft=session.confirmedDraft;editedPlans.clear();for(const [key,edit] of session.edits)editedPlans.set(key,edit);}
  scheduleReadOnly=false;scheduleEmpty=false;
 }
 for(const id of ['schedule-close','schedule-cancel'])$(id).addEventListener('click',()=>closeSchedule(false));
 for(const id of ['open-team-schedule-bottom'])$(id).addEventListener('click',()=>openSchedule(true,$(id)));
 $('open-schedule-management').addEventListener('click',()=>openSchedule(false,$('open-schedule-management'),Boolean(confirmed())));
 $('open-shared-composition').addEventListener('click',()=>openSchedule(false,$('open-shared-composition')));
 $('schedule-confirm').addEventListener('click',()=>$('confirm-lineup').click());
 // Short Korean paraphrases of the player statements reviewed with the team.
 const cheerSources={
  federer:'https://home.dartmouth.edu/news/2024/06/2024-commencement-address-roger-federer',
  nadal:'https://www.atptour.com/en/news/nadal-honoured-university-of-madrid-march-2026',
  djokovic:'https://www.atptour.com/en/news/15-love-novak-djokovic-feature',
  alcarazSmile:'https://www.rolandgarros.com/en-us/article/rg2023-alcaraz-musetti-fourth-round-report',
  alcarazNerves:'https://www.atptour.com/en/news/alcaraz-indian-wells-2023',
  gauff:'https://www.asapsports.com/show_interview.php?id=190280',
  osakaFight:'https://ausopen.com/articles/news/osaka-kvitova-win-openers-brisbane',
  osakaTrust:'https://www.wtatennis.com/news/4320705/grand-slam-champs-raducanu-osaka-set-second-round-showdown-in-washington',
  kingPressure:'https://www.billiejeanking.com/tennis/',
  kingAdapt:'https://www.billiejeanking.com/battle-of-the-sexes/',
  zheng:'https://www.wtatennis.com/news/3494780/still-chasing-her-major-breakthrough-zheng-qinwen-fights-to-stay-focused',
  rybakina:'https://www.wtatennis.com/news/2667774/wimbledon-quarterfinal-preview-halep-anisimova-take-slam-rivalry-to-grass',
  kudermetova:'https://www.wtatennis.com/news/4121520/kudermetova-sisters-both-notch-upsets-to-book-quarterfinal-spots-in-seoul',
  serena:'https://www.thenationalnews.com/sport/the-fall-and-rise-of-maturing-serena-williams-1.632294',
  barty:'https://www.usopen.org/en_US/news/articles/2019-08-26/2019-08-26_2019-08-26_ashleigh_barty_bounces_back_to_rally_past_zarina_diyas.html',
  serenaLearn:'https://www.tennis.com/news/articles/serena-s-best-quotes-from-her-ted-talk'
 };
 const tennisCheers=[
  ['🎾','놓친 건 한 포인트일 뿐. 다음 포인트로 가자.','로저 페더러','federer'],
  ['(ง •̀_•́)ง','상대도 자신을 의심한다. 나만 흔들리는 게 아니다.','로저 페더러','federer'],
  ['🔥','최고의 컨디션이 아니어도 이길 방법은 찾을 수 있다.','로저 페더러','federer'],
  ['🌱','인내와 자기 자신을 믿는 힘도 연습해서 키우는 재능이다.','로저 페더러','federer'],
  ['🔥','실수는 받아들이고, 계속 나아지면 된다.','라파엘 나달','nadal'],
  ['💪','힘든 순간에도 긍정적으로 노력하자. 변화는 거기서 시작된다.','라파엘 나달','nadal'],
  ['🎾','큰 변화보다 매일 조금씩 나아지는 것이 중요하다.','라파엘 나달','nadal'],
  ['✨','내 꿈과 희망을 다른 사람이 빼앗게 두지 말자.','노박 조코비치','djokovic'],
  ['٩(ˊᗜˋ*)و','웃고 즐기자. 그게 내 테니스의 열쇠다.','카를로스 알카라스','alcarazSmile'],
  ['🔥','긴장하는 건 당연하다. 중요한 건 그 긴장을 다루는 것이다.','카를로스 알카라스','alcarazNerves'],
  ['💛','다른 누군가가 되려 하지 말고, 최고의 내가 되자.','코코 고프','gauff'],
  ['💪','잘 안 풀리는 날 어떻게 버티는지가 챔피언을 만든다.','코코 고프','gauff'],
  ['🎾','나를 믿고, 매 포인트 끝까지 싸우자.','오사카 나오미','osakaFight'],
  ['🌷','나를 더 믿되, 스스로를 너무 압박하지는 말자.','오사카 나오미','osakaTrust'],
  ['👑','압박감은 특권이다.','빌리 진 킹','kingPressure'],
  ['🔄','챔피언은 상황에 맞춰 바꿀 줄 안다.','빌리 진 킹','kingAdapt'],
  ['🎯','지금 이 순간, 한 포인트씩, 공 하나씩 집중하자.','정친원','zheng'],
  ['🎾','한 포인트씩 풀어가며 내 서브에 집중하자.','엘레나 리바키나','rybakina'],
  ['୧(๑•̀ᗝ•́)૭','경기 중에는 나 자신을 더 응원하자. 더 긍정적으로!','폴리나 쿠데르메토바','kudermetova'],
  ['🔥','챔피언을 보여주는 건 승리 횟수보다 넘어지고 다시 일어나는 힘이다.','세리나 윌리엄스','serena'],
  ['🤝','테니스도 팀 스포츠다. 성공은 함께 만들어간다.','로저 페더러','federer'],
  ['💪','쉬워 보이는 플레이 뒤에는 보이지 않는 노력이 있다.','로저 페더러','federer'],
  ['🎯','끝난 포인트는 내려놓고, 다음 포인트에 온전히 집중하자.','로저 페더러','federer'],
  ['💛','서로에게 친절하게, 코트에서는 즐겁게.','로저 페더러','federer'],
  ['🔥','좋아하는 마음과 헌신이 꾸준히 나아갈 힘이 된다.','노박 조코비치','djokovic'],
  ['🎾','가진 것을 지켜야 한다는 생각으로 스스로를 압박하지 말자.','노박 조코비치','djokovic'],
  ['(ง •̀_•́)ง','결과를 모두 통제할 수는 없어도, 내 태도는 내가 정할 수 있다.','코코 고프','gauff'],
  ['💪','중요한 순간일수록, 내가 할 줄 아는 샷을 믿고 치자.','코코 고프','gauff'],
  ['🌱','출발이 좋지 않아도, 인내하며 내 패턴을 되찾을 수 있다.','애슐리 바티','barty'],
  ['✨','패배에서 배우되, 과거에 머물지 말고 현재를 살자.','세리나 윌리엄스','serenaLearn']
 ];
 const cheerOrder=tennisCheers.map((_,index)=>index);
 for(let index=cheerOrder.length-1;index>0;index--){const other=Math.floor(Math.random()*(index+1));[cheerOrder[index],cheerOrder[other]]=[cheerOrder[other],cheerOrder[index]];}
 const cheerMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
 let cheerIndex=0,cheerTimer=null,cheerPaused=cheerMotion.matches,cheerHovered=false,cheerFocused=false,cheerTransition=null;
 function finishCheerTransition(){
  if(!cheerTransition)return;
  const transition=cheerTransition;cheerTransition=null;
  for(const animation of transition.animations)animation.cancel();transition.outgoing.remove();$('cheer-viewport').style.height='';
 }
 function showCheer(step=0){
  finishCheerTransition();
  const message=$('cheer-message'),viewport=$('cheer-viewport');let outgoing=null;
  if(step&&!cheerMotion.matches&&!$('schedule-cheer').hidden&&typeof message.animate==='function'){
   outgoing=message.cloneNode(true);outgoing.removeAttribute('id');for(const node of outgoing.querySelectorAll('[id]'))node.removeAttribute('id');
   outgoing.className+=' cheer-outgoing';outgoing.setAttribute('aria-hidden','true');outgoing.inert=true;
  }
  cheerIndex=(cheerIndex+step+cheerOrder.length)%cheerOrder.length;
  const [emoji,text,player,source]=tennisCheers[cheerOrder[cheerIndex]],author=$('cheer-author');
  $('cheer-emoji').textContent=emoji;$('cheer-text').textContent=text;author.textContent='['+player+']';
  if(outgoing){
   viewport.append(outgoing);viewport.style.height=Math.max(message.getBoundingClientRect().height,outgoing.getBoundingClientRect().height)+'px';
   const timing={duration:450,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'},transition={outgoing,animations:[
    outgoing.animate([{transform:'translateY(0)',opacity:1},{transform:'translateY(-110%)',opacity:0}],timing),
    message.animate([{transform:'translateY(110%)',opacity:0},{transform:'translateY(0)',opacity:1}],timing)
   ]};cheerTransition=transition;
   void Promise.allSettled(transition.animations.map(animation=>animation.finished)).then(()=>{if(cheerTransition===transition)finishCheerTransition();});
  }
 }
 function syncCheerRotation(){
  const stopped=cheerPaused||cheerHovered||cheerFocused||document.hidden||state.page!=='schedule'||!scheduleReadOnly||Boolean(officialRecordEditor)||$('cheer-dialog').open;
  $('cheer-pause').textContent=cheerPaused?'▶':'Ⅱ';$('cheer-pause').setAttribute('aria-label',cheerPaused?'응원 문구 자동 넘기기 재생':'응원 문구 자동 넘기기 일시정지');
  $('cheer-pause').setAttribute('aria-pressed',String(cheerPaused));
  if(stopped){clearTimeout(cheerTimer);cheerTimer=null;finishCheerTransition();return;}
  if(cheerTimer===null)cheerTimer=setTimeout(()=>{cheerTimer=null;showCheer(1);syncCheerRotation();},5000);
 }
 showCheer();
 $('cheer-pause').addEventListener('click',()=>{cheerPaused=!cheerPaused;syncCheerRotation();});
 $('schedule-cheer').addEventListener('mouseenter',()=>{cheerHovered=true;syncCheerRotation();});
 $('schedule-cheer').addEventListener('mouseleave',()=>{cheerHovered=false;syncCheerRotation();});
 $('schedule-cheer').addEventListener('focusin',()=>{cheerFocused=true;syncCheerRotation();});
 $('schedule-cheer').addEventListener('focusout',event=>{cheerFocused=$('schedule-cheer').contains(event.relatedTarget);syncCheerRotation();});
 document.addEventListener('visibilitychange',syncCheerRotation);
 window.addEventListener('pagehide',()=>{clearTimeout(cheerTimer);cheerTimer=null;finishCheerTransition();});
 window.addEventListener('pageshow',syncCheerRotation);
 cheerMotion.addEventListener?.('change',()=>{if(cheerMotion.matches)cheerPaused=true;syncCheerRotation();});
 function openCheerDialog(){
  if($('cheer-dialog').open)return;
  $('cheer-list').replaceChildren(...tennisCheers.map(([emoji,text,player,source])=>{
   const item=el('li'),quote=el('span','',emoji+' '+text),attribution=el('span','cheer-attribution'),link=el('a','','['+player+']');
   link.href=cheerSources[source];link.target='_blank';link.rel='noopener noreferrer';link.title='선수 발언 원문 출처 보기';
   attribution.append(el('span','',' - '),link);item.append(quote,attribution);return item;
  }));
  $('cheer-dialog').showModal();syncCheerRotation();$('cheer-close').focus();
 }
 $('cheer-open').addEventListener('click',openCheerDialog);
 $('schedule-cheer').addEventListener('click',event=>{if(event.target===$('schedule-cheer'))openCheerDialog();});
 $('cheer-close').addEventListener('click',()=>$('cheer-dialog').close());
 $('cheer-dialog').addEventListener('close',()=>{if(state.page==='schedule'&&scheduleReadOnly)$('cheer-open').focus({preventScroll:true});syncCheerRotation();});
 function syncScheduleDialog(plan){
  if(scheduleReadOnly)scheduleEmpty=!confirmed()&&!plans[0];const read=scheduleReadOnly,empty=scheduleEmpty,cloud=window.PLAYER_PROFILE_CLOUD;
  $('schedule-close').hidden=read;$('schedule-dialog').setAttribute('role',read?'tabpanel':'region');$('schedule-dialog').setAttribute('aria-labelledby',read?'tab-schedule':'schedule-dialog-title');
  $('schedule-header').hidden=false;$('schedule-analysis-hint').hidden=true;$('schedule-guide').hidden=read;$('schedule-cheer').hidden=!read;syncCheerRotation();
  $('schedule-dialog').dataset.readonly=String(read);$('schedule-dialog-title').textContent=read?'최강 C조 대진표 🔥':'출전표 편집';
  $('schedule-dialog-badge').textContent=read?(confirmed()?'':'기본 출전표 · 추천 조합 1'):'미저장 초안';
  $('schedule-dialog-subtitle').textContent=read?(confirmed()?'':(plans[0]?'아직 확정된 출전표가 없어 추천 조합 1의 기본 출전표를 보여드립니다.':'공식 대진을 먼저 표시합니다. C조 기본 출전표는 준비 중입니다.')):(plan?(plans.findIndex(item=>compositionKey(item)===compositionKey(plan))<0?'공유받은 페어 구성':'추천 조합 '+(plans.findIndex(item=>compositionKey(item)===compositionKey(plan))+1)):'출전표 준비')+' · 확정 전에는 팀 출전표에 반영되지 않아요';
  for(const id of ['schedule-dialog-badge','schedule-dialog-subtitle'])$(id).hidden=!$(id).textContent;
  $('schedule-empty').hidden=!empty;$('schedule-empty').textContent=empty?(cloud?.status!=='ready'?'팀 공유 저장소 연결 상태를 확인하고 있습니다. 연결 후 최신 확정표를 확인하세요.':!cloud?.lineupReady?'팀 출전표를 불러오고 있습니다.':'기본 출전표를 계산하고 있습니다. 잠시 기다려 주세요.') :'';
  $('schedule-content').hidden=empty&&!read;$('schedule-footer').hidden=read;
  $('schedule-guide-icon').src='assets/'+(read?'schedule-users.svg':'schedule-move.svg');
  $('schedule-guide-title').textContent=read?'전체 공식 경기와 대진표를 확인하세요':'드래그로 페어를 교환하세요';
  $('schedule-guide-text').textContent=read?'경기를 눌러 대진을 입력하고, C조 경기의 상대 AI 분석을 확인하세요.':'모바일은 셀을 길게 누른 뒤 이동하세요. 같은 시간 중복 출전은 적용하지 않습니다.';
  $('schedule-cancel').hidden=read;$('schedule-confirm').hidden=read;$('schedule-confirm').disabled=$('confirm-lineup').disabled;
  $('schedule-footer-title').textContent='확정하면 팀 서버에 저장하고 이전 화면으로 돌아가요';
  $('schedule-footer-description').textContent='확정 전 편집은 초안이며, 취소하면 팀 출전표는 바뀌지 않아요.';
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
  const drag=scheduleDrag;scheduleDrag=null;drag.node.draggable=true;drag.ghost?.remove();
  for(const node of $('matches').querySelectorAll('.matrix-match')){node.classList.remove('drag-source');node.classList.remove('drop-valid');node.classList.remove('drop-invalid');}
  document.body.classList.remove('schedule-dragging');
  if(drag.pointerId!==undefined&&drag.node.hasPointerCapture?.(drag.pointerId))drag.node.releasePointerCapture(drag.pointerId);
 }
 function moveDragGhost(drag){if(drag.ghost&&Number.isFinite(drag.x)&&Number.isFinite(drag.y))drag.ghost.setAttribute('style','left:'+drag.x+'px;top:'+Math.max(70,drag.y-12)+'px');}
 function activateDrag(drag){if(scheduleDrag!==drag||!currentDragPlan(drag)){clearDrag();return;}drag.active=true;if(drag.pointerId!==undefined||drag.touchId!==undefined){const match=currentDragPlan(drag).matches.find(item=>String(item.id)===String(drag.id));drag.ghost=el('div','schedule-drag-ghost');drag.ghost.setAttribute('aria-hidden','true');drag.ghost.append(el('strong','',match.pair.map(displayName).join(' × ')),el('span','',match.team+'조'));document.body.append(drag.ghost);moveDragGhost(drag);}drag.node.classList.add('drag-source');document.body.classList.add('schedule-dragging');$('schedule-drag-status').textContent='교환할 경기 위로 옮겨 놓으세요.';}
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
  const bottom=window.innerHeight||0,delta=y<64?-18:bottom&&y>bottom-64?18:0;if(!delta)return;
  window.scrollBy?.({top:delta,behavior:'instant'});
  dragScrollTimer=setTimeout(()=>{if(!scheduleDrag?.active)return;if(!Number.isFinite(scheduleDrag.x)||!Number.isFinite(scheduleDrag.y))return;const target=dragCell(document.elementFromPoint?.(scheduleDrag.x,scheduleDrag.y));dragPreview(target);edgeScroll(scheduleDrag?.y??y);},50);
 }
 function installScheduleDrag(node,match){
  if(scheduleReadOnly)return;node.draggable=true;node.dataset.editable='true';node.title='끌어서 다른 경기와 페어 교환 · 모바일은 셀을 길게 누른 뒤 이동';
  node.addEventListener('dragstart',event=>{if(event.target?.tagName==='IMG'){event.preventDefault();return;}if(scheduleDrag?.pointerId!==undefined||scheduleDrag?.touchId!==undefined){event.preventDefault();return;}clearDrag();const drag=dragSnapshot(match.id,node);scheduleDrag=drag;activateDrag(drag);if(!drag.active){event.preventDefault();return;}event.dataTransfer?.setData('text/plain',String(match.id));if(event.dataTransfer)event.dataTransfer.effectAllowed='move';});
  node.addEventListener('dragover',event=>{if(!scheduleDrag?.active)return;scheduleDrag.x=event.clientX;scheduleDrag.y=event.clientY;const result=dragPreview(node);if(result){event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';}else if(event.dataTransfer)event.dataTransfer.dropEffect='none';edgeScroll(event.clientY);});
  node.addEventListener('dragleave',event=>{if(scheduleDrag?.active&&!node.contains(event.relatedTarget))dragPreview(null);});
  node.addEventListener('drop',event=>{if(!scheduleDrag?.active)return;event.preventDefault();finishDrag(node);});
  node.addEventListener('dragend',()=>{clearDrag();});
  node.addEventListener('pointerdown',event=>{
   if(event.pointerType!=='touch')return;if(event.isPrimary===false){clearDrag();return;}clearDrag();node.draggable=false;const drag={...dragSnapshot(match.id,node),pointerId:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,active:false};scheduleDrag=drag;
   drag.timer=setTimeout(()=>{activateDrag(drag);if(drag.active){node.setPointerCapture?.(event.pointerId);}},350);
  });
  node.addEventListener('touchstart',event=>{if(event.touches?.length!==1){clearDrag();return;}const touch=event.touches[0];clearDrag();node.draggable=false;const drag={...dragSnapshot(match.id,node),touchId:touch.identifier,x:touch.clientX,y:touch.clientY,startX:touch.clientX,startY:touch.clientY,active:false};scheduleDrag=drag;drag.timer=setTimeout(()=>activateDrag(drag),350);},{passive:true});
  node.addEventListener('lostpointercapture',event=>{if(scheduleDrag?.node===node&&scheduleDrag.pointerId!==undefined&&scheduleDrag.pointerId===event.pointerId){clearDrag();}});
  node.addEventListener('contextmenu',event=>{event.preventDefault();});
  node.addEventListener('selectstart',event=>{event.preventDefault();});
 }
 document.addEventListener('dragover',event=>{if(!scheduleDrag?.active||scheduleDrag.pointerId!==undefined||scheduleDrag.touchId!==undefined||dragCell(event.target))return;scheduleDrag.x=event.clientX;scheduleDrag.y=event.clientY;dragPreview(null);if(event.dataTransfer)event.dataTransfer.dropEffect='none';edgeScroll(event.clientY);});
 document.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'&&event.isPrimary===false){clearDrag();}});
 document.addEventListener('touchstart',event=>{if(event.touches?.length>1){clearDrag();}},{passive:true});
 document.addEventListener('pointermove',event=>{
  const drag=scheduleDrag;if(!drag||drag.pointerId!==event.pointerId)return;
  drag.x=event.clientX;drag.y=event.clientY;
  if(!drag.active){if(Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>8)clearDrag();return;}
  event.preventDefault();moveDragGhost(drag);dragPreview(dragCell(document.elementFromPoint?.(event.clientX,event.clientY)||event.target));edgeScroll(event.clientY);
 },{passive:false});
 document.addEventListener('touchmove',event=>{const drag=scheduleDrag;if(!drag)return;if(drag.touchId===undefined){if(drag.active&&drag.pointerId!==undefined)event.preventDefault();return;}if(event.touches?.length!==1){clearDrag();return;}const touch=[...event.touches].find(item=>item.identifier===drag.touchId);if(!touch){clearDrag();return;}drag.x=touch.clientX;drag.y=touch.clientY;if(!drag.active){if(Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>8)clearDrag();return;}event.preventDefault();moveDragGhost(drag);dragPreview(dragCell(document.elementFromPoint?.(drag.x,drag.y)||event.target));edgeScroll(drag.y);},{passive:false});
 document.addEventListener('touchend',event=>{const drag=scheduleDrag;if(drag?.touchId===undefined)return;const touch=[...(event.changedTouches||[])].find(item=>item.identifier===drag.touchId);if(!touch)return;if(event.touches?.length){clearDrag();return;}if(drag.active)event.preventDefault();finishDrag(dragCell(document.elementFromPoint?.(touch.clientX,touch.clientY)||event.target));},{passive:false});
 document.addEventListener('touchcancel',()=>{if(scheduleDrag?.touchId!==undefined)clearDrag();});
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
  status.textContent=cloud?.opponentRecordsError?recordConnectionMessage(cloud):cloud?.opponentRecordsReady?'':'공유 경기 기록에 연결 중입니다. 예정 편성과 공식 대진을 먼저 표시합니다.';
  status.hidden=!status.textContent;
  $('retry-tournament-records').hidden=!cloud?.opponentRecordsError;
  const rows=data.tournamentSchedule.filter(match=>state.filter==='all'||match.sides.some(side=>side.team===state.filter)),times=[...new Set(rows.map(match=>match.time))].sort(),table=el('table','schedule-matrix tournament-matrix'),head=el('thead'),headRow=el('tr');for(const title of ['시간','1코트','2코트','3코트','4코트'])headRow.append(el('th','',title));head.append(headRow);table.append(head);const body=el('tbody'),warnings=new Map(pairing.consecutivePlayDetails(data,plan?.matches||[]).map(item=>[item.name,item.count]));
  for(const time of times){const row=el('tr'),reference=rows.find(match=>match.time===time),clock=el('th','matrix-time');clock.scope='row';clock.append(el('strong','',time),el('span','small','~ '+reference.endTime));row.append(clock);
   for(let court=1;court<=4;court++){const cell=el('td'),match=rows.find(item=>item.time===time&&item.court===court);if(!match){cell.className='matrix-empty';cell.textContent='—';}else{
    const open=button('',false,()=>openOfficialRecord(match,open),'official-match');open.dataset.officialMatch=match.id;open.setAttribute('aria-label',time+' '+court+'코트 '+match.sides.map(side=>side.team+side.number).join(' vs ')+' 실제 출전 기록');
    for(const [index,side] of [...match.sides].sort((a,b)=>a.team==='C'?-1:b.team==='C'?1:0).entries()){if(index)open.append(el('span','official-vs','vs'));const line=el('span','official-team-line');line.dataset.team=side.team;if(side.team!=='C')line.append(el('strong','official-team-label',side.team+side.number));const pair=records[match.id]?.[side.team],planned=side.team==='C'?plan?.matches.find(game=>game.id===side.number):null;
     if(side.team==='C'&&(planned||pair)){const displayedPair=pair?pair.map(id=>id.slice(2)):planned.pair;const own=el('span','matrix-match official-c-plan');own.dataset.match=planned?.id??side.number;own.setAttribute('aria-readonly','true');own.draggable=false;const label=el('span','matrix-pair-names');for(const [position,name] of displayedPair.entries()){if(position)label.append(el('span','matrix-pair-separator','×'));const member=el('span','matrix-player');member.append(el('span','matrix-player-name',displayName(name)));if(!pair&&warnings.has(name)){const warning=el('span','matrix-run-warning','💦');warning.title=displayName(name)+'가 연속 '+warnings.get(name)+'경기 출전합니다.';warning.setAttribute('role','img');warning.setAttribute('aria-label',warning.title);member.append(warning);}label.append(member);}own.append(label);line.append(own);}
     if(pair&&side.team!=='C'){const actual=el('span','official-observed');for(const id of pair){const member=el('span',side.team==='C'?'official-own-name':'official-opponent-name',observedName(id));member.title=observedName(id);actual.append(member);}line.append(actual);}open.append(line);
    }cell.append(open);cell.className='official-match-cell';cell.addEventListener('click',event=>{if(event.target===cell)openOfficialRecord(match,open);});
   }row.append(cell);}body.append(row);
  }table.append(body);$('matches').append(table);
 }
 function openOfficialRecord(match,trigger){
  const cloud=window.PLAYER_PROFILE_CLOUD;officialRecordEditor={match,trigger,revisions:{...cloud?.opponentRecordRevisions},selections:Object.fromEntries(match.sides.map(side=>[side.team,[...(officialRecords()[match.id]?.[side.team]||['',''])]])),messages:{},saving:new Set(),analyses:{}};renderOfficialRecord();$('official-record-dialog').showModal();syncCheerRotation();$('official-record-close').focus();
 }
 function renderOfficialRecord(){
  const editor=officialRecordEditor;if(!editor)return;const cloud=window.PLAYER_PROFILE_CLOUD,match=editor.match,records=officialRecords();$('official-record-title').textContent=match.time+' · '+match.court+'코트 · '+match.sides.map(side=>side.team+side.number).join(' vs ');
  $('official-record-description').textContent=match.sides.some(side=>side.team==='C')?'상대 선수를 선택해 대진을 저장하고 AI 분석을 확인하세요.':'실제 출전 선수를 선택해 대진을 저장하세요.';
  $('official-record-connection').textContent=recordConnectionMessage(cloud);$('official-record-retry').hidden=!cloud?.opponentRecordsError;
  $('official-record-body').replaceChildren(...match.sides.filter(side=>side.team!=='C').map(side=>{const team=side.team,section=el('section','record-team');section.dataset.team=team;section.append(el('h3','',team+'조 실제 출전'),el('p','record-limit',team==='B'?'선수당 최대 6경기 · 같은 페어 재출전·러브끼리 금지':'선수당 최대 5경기 · 같은 페어 재출전·러브끼리 금지'));
   const saved=records[match.id]?.[team];section.append(el('p','record-saved',saved?'저장됨 · '+saved.map(observedName).join(' · '):'미입력 · 예정 선수는 기록으로 간주하지 않습니다.'));
   const fields=el('div','record-fields'),selection=editor.selections[team];for(let index=0;index<2;index++){const label=el('label','',team+'조 선수 '+(index+1)),select=el('select');select.id='record-'+team+'-'+index;select.append(new Option('선택하세요',''));for(const name of names(team)){const id=team+':'+name,other=selection[1-index],option=new Option(displayName(name)+' · '+tiers[data.teams[team][name].tier],id);option.disabled=id===other||Boolean(other)&&!model.isLegalPair([id,other].map(player=>({name:player,tier:data.teams[team][player.slice(2)]?.tier})));select.append(option);}select.value=selection[index];select.disabled=editor.saving.has(team);select.addEventListener('change',()=>{editor.selections[team][index]=select.value;clearRecordAnalysis(editor,team);renderOfficialRecord();$('record-'+team+'-'+index)?.focus();});label.append(select);fields.append(label);}section.append(fields);
   const revision=cloud?.opponentRecordRevisions?.[team]||0,stale=(editor.revisions[team]||0)!==revision&&!editor.saving.has(team),unready=!cloud?.opponentRecordsReady||Boolean(cloud?.opponentRecordsError),actions=el('div','record-actions'),save=button(team+'조 기록 저장',false,()=>saveOfficialRecord(team,false));save.disabled=unready||stale||editor.saving.has(team)||!selection.every(Boolean);const input=recordAnalysisInput(editor,team);let analysis=editor.analyses[team];
   if(analysis&&analysis.inputKey!==input?.key){clearRecordAnalysis(editor,team);analysis=null;}
   actions.append(save);if(match.sides.some(side=>side.team==='C')){
   const analyze=button(analysis?.status==='loading'?'AI 분석 중':'상대 분석 보기',false,()=>requestRecordAnalysis(team));analyze.id='record-analyze-'+team;analyze.setAttribute('aria-controls','record-analysis-'+team);analyze.disabled=!input||analysis?.status==='loading'||Boolean(cloud?.pendingCount);
   actions.append(analyze);}
   section.append(actions);section.append(el('p','record-team-status',editor.messages[team]||(stale?'다른 기기에서 이 팀 기록을 변경했습니다. 닫고 다시 열어 최신 기록을 확인하세요.':unready?recordConnectionMessage(cloud):'')));
   if(!saved&&cloud?.opponentRecordsReady&&!cloud?.opponentRecordsError&&window.TOURNAMENT_MODEL){try{const prediction=window.TOURNAMENT_MODEL.candidates(data,records,match.id,team),candidates=el('div','record-candidates');candidates.append(el('strong','','남은 페어 후보 '+prediction.count+'개'),el('p','','입력된 경기 기록 기준 · 기록 '+prediction.knownCount+'/20경기 · 미입력 '+prediction.unknownCount+'경기'));
    if(prediction.showPairs){const list=el('ul','record-candidate-list');for(const pair of prediction.pairs)list.append(el('li','',pair.map(observedName).join(' × ')));candidates.append(list);if(!prediction.count)candidates.append(el('p','','조건을 만족하는 후보가 없습니다. 출전 기록을 확인해 주세요.'));}
    else candidates.append(el('p','','후보가 5개 이하일 때 목록을 표시합니다. 미입력 경기 기록을 추가해 주세요.'));section.append(candidates);
   }catch{section.append(el('p','record-team-status','경기 기록을 확인한 뒤 후보를 다시 계산해 주세요.'));}}
   const result=el('div','record-analysis');result.id='record-analysis-'+team;result.hidden=!analysis;result.setAttribute('aria-busy',String(analysis?.status==='loading'));
   if(analysis){const status=el('p','record-analysis-status',analysis.message);status.setAttribute('role','status');result.append(status);
    if(analysis.result)appendAnalysisResult(result,team,editor.selections[team].map(id=>id.slice(2)),analysis.result,analysis.status==='ready');
   }
   section.append(result);return section;}));
 }
 function recordAnalysisInput(editor,team){
  if(!editor.match.sides.some(side=>side.team==='C'))return null;
  return matchupAnalysisInput(team,(editor.selections[team]||[]).map(id=>id.slice(2)));
 }
 function clearRecordAnalysis(editor,team){
  const analysis=editor.analyses[team];if(!analysis)return;clearTimeout(analysis.timer);analysis.unsubscribe?.();delete editor.analyses[team];
 }
 async function requestRecordAnalysis(team){
  const editor=officialRecordEditor,cloud=window.PLAYER_PROFILE_CLOUD,input=editor&&recordAnalysisInput(editor,team);
  if(!input||editor.analyses[team]?.status==='loading'||cloud?.pendingCount)return;
  clearRecordAnalysis(editor,team);
  const analysis={inputKey:input.key,status:'loading',message:'AI가 선택한 선수의 관찰 기록을 분석하고 있습니다.'};editor.analyses[team]=analysis;
  const current=()=>officialRecordEditor===editor&&editor.analyses[team]===analysis&&analysis.status==='loading'&&recordAnalysisInput(editor,team)?.key===input.key;
  function finish(status,message,result){
   if(!current())return;clearTimeout(analysis.timer);analysis.unsubscribe?.();analysis.unsubscribe=null;
   Object.assign(analysis,{status,message,result});renderOfficialRecord();
  }
  function fail(message){
   if(!current())return;
   const opponents=editor.selections[team].map(id=>({name:observedName(id),tier:data.teams[team][id.slice(2)].tier,profile:window.PLAYER_PROFILES.get(team,id.slice(2))}));
   finish('error',message+' 기본 관찰 요약을 표시합니다.',model.analyzeOpponentPair(opponents));
  }
  renderOfficialRecord();
  if(!canAnalyzeWithAI()){fail('AI에 연결되지 않았습니다. 연결 후 다시 시도해 주세요.');return;}
  analysis.timer=setTimeout(()=>fail('분석 시간이 오래 걸렸습니다. 다시 시도해 주세요.'),90000);
  try{
   const {key,...request}=input,response=await cloud.analyzeMatchup(request);if(!current())return;
   const accept=record=>{
    if(record.status==='ready')finish('ready',response.cached?'저장된 AI 분석을 불러왔습니다.':'AI 분석을 생성했습니다.',record.result);
    else if(record.status==='error')fail(record.message||'AI 분석에 실패했습니다. 다시 시도해 주세요.');
   };
   if(response.status==='ready'||response.status==='error')accept(response);
   else{analysis.message='같은 분석을 생성하고 있습니다. 완료되면 표시됩니다.';renderOfficialRecord();analysis.unsubscribe=cloud.subscribeAnalysis(response.analysisKey,accept,()=>fail('분석을 불러오지 못했습니다. 다시 시도해 주세요.'));if(!current()){analysis.unsubscribe?.();analysis.unsubscribe=null;}}
  }catch(error){fail(error.message||'AI 분석에 실패했습니다. 다시 시도해 주세요.');}
 }
 async function saveOfficialRecord(team,clear){
  const editor=officialRecordEditor,cloud=window.PLAYER_PROFILE_CLOUD;if(!editor||editor.saving.has(team))return;editor.saving.add(team);editor.messages[team]='저장 중입니다.';renderOfficialRecord();
  try{const result=await cloud.saveOpponentRecord(editor.match.id,team,clear?null:editor.selections[team],editor.revisions[team]||0);editor.revisions[team]=result.revision;editor.messages[team]=clear?'기록을 삭제했습니다.':'실제 출전 선수를 저장했습니다.';if(clear){editor.selections[team]=['',''];clearRecordAnalysis(editor,team);}}
  catch(error){editor.messages[team]=error.message||'기록을 저장하지 못했습니다.';}finally{editor.saving.delete(team);if(officialRecordEditor===editor)renderOfficialRecord();renderSchedule(activePlan());}
 }
 $('official-record-close').addEventListener('click',()=>$('official-record-dialog').close());
 $('official-record-dialog').addEventListener('close',()=>{const editor=officialRecordEditor;if(editor)for(const team of Object.keys(editor.analyses))clearRecordAnalysis(editor,team);officialRecordEditor=null;syncCheerRotation();const target=[...$('matches').querySelectorAll('.official-match')].find(node=>node.dataset.officialMatch===editor?.match.id);if(target)target.focus();else $('schedule-close').focus();});
 $('official-record-retry').addEventListener('click',()=>window.PLAYER_PROFILE_CLOUD?.retryOpponentRecords?.());
 $('retry-tournament-records').addEventListener('click',()=>window.PLAYER_PROFILE_CLOUD?.retryOpponentRecords?.());
 window.addEventListener('opponentrecordschange',()=>{if(scheduleReadOnly)renderSchedule(activePlan());if(officialRecordEditor)renderOfficialRecord();});
 function renderSchedule(plan){
  $('schedule-drag-status').textContent='';
  clearDrag();$('matches').replaceChildren();
  $('tournament-record-status').hidden=true;$('retry-tournament-records').hidden=true;
  if(scheduleReadOnly){
   if(data.tournamentSchedule&&window.TOURNAMENT_MODEL)renderTournamentSchedule(plan);
   else{$('tournament-record-status').hidden=false;$('tournament-record-status').textContent='전체 경기 정보를 불러오지 못했습니다. 새로고침해 주세요.';}
   return;
  }
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
     const pairNames=el('span','matrix-pair-names');for(const name of match.pair){const player=el('span','matrix-player');player.append(el('span','matrix-player-name',displayName(name)));if(runWarnings.has(name)){const warning=el('span','matrix-run-warning','💦');warning.title=displayName(name)+'가 연속 '+runWarnings.get(name)+'경기 출전합니다.';warning.setAttribute('role','img');warning.setAttribute('aria-label',warning.title);player.append(warning);choice.setAttribute('aria-label',choice.getAttribute('aria-label')+'. '+warning.title);}pairNames.append(player);}const pairInfo=el('span','matrix-pair-info'),meta=el('span','matrix-pair-meta');meta.append(el('span','matrix-opponent',match.team+'조'));pairInfo.append(pairNames,meta);choice.append(pairInfo);cell.append(choice);
    }else{cell.className='matrix-empty';cell.textContent='—';}row.append(cell);
   }body.append(row);
  }table.append(body);$('matches').append(table);
 }
 $('discard-lineup-edits').addEventListener('click',()=>{if(view()==='confirmed')confirmedDraft=null;else editedPlans.delete(draftKey());confirmationMessage='변경 초안을 취소했습니다.';renderStrategy();});


 function analysisInput(){return matchupAnalysisInput(state.team,[state.p1,state.p2]);}
 function matchupAnalysisInput(team,pair){
  if(team==='C'||!legalNames(team,pair))return null;
  const opponentPlayerIds=pair.map(name=>team+':'+name).sort();
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
  appendAnalysisResult(container,state.team,[state.p1,state.p2],active.result,done);
 }
 function appendAnalysisResult(container,team,pair,analysisResult,done){
  const opponents=pair.map(name=>({name:displayName(name),tier:data.teams[team][name].tier,profile:window.PLAYER_PROFILES.get(team,name)}));
  const result=analysisResult||model.analyzeOpponentPair(opponents);
  const heading=el('div','observation-heading');heading.append(el('h2','',done?'AI 분석 · 완료':'기본 관찰 요약'),el('p','muted small',done?'관찰 기록 기반 제안 · 실제 경기에서 확인해 주세요.':'입력한 기록에 맞춘 복식 참고 자료'));container.append(heading);
  const overview=observationSection('상대 페어 한눈에 보기','관찰 기록 · '+team+'조');
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
 window.addEventListener('teamcroutechange',()=>{
  const leaving=state.page==='schedule'&&navigation.params().get('page')!=='schedule',returnTo=leaving?navigation.state()?.teamcScheduleReturn:null;
  const sessionReturn=leaving?scheduleReturn:null;
  if(leaving)finishScheduleSession();readHash();
  if(state.page==='schedule'&&!scheduleSession){scheduleReturn=navigation.state()?.teamcScheduleReturn||null;beginScheduleSession(state.schedule==='shared');}
  if(leaving&&sessionReturn)visibleRecommendation=sessionReturn.visibleRecommendation;
  render();
  if(leaving){const restore=sessionReturn||returnTo;if(restore)window.scrollTo(0,restore.scroll||0);if(scheduleTrigger?.isConnected)scheduleTrigger.focus({preventScroll:true});else if(scheduleTrigger?.classList.contains('pair-option-select'))[...$('pair-options').querySelectorAll('.pair-option')].find(card=>!card.hidden)?.querySelector('.pair-option-select')?.focus({preventScroll:true});scheduleTrigger=null;scheduleReturn=null;}
 });
 window.addEventListener('playerprofileschange',()=>{confirmationMessage='';if(selectedPlan?.profileVersion!==cVersion())state.sharedPairs=null;render();if(officialRecordEditor)renderOfficialRecord();});
 window.addEventListener('playerprofilecloudstatuschange',()=>{renderStrategy();renderAnalysis();if(officialRecordEditor)renderOfficialRecord();});
  window.addEventListener('teamlineupchange',render);
 $('share').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(navigation.href());$('share-status').textContent='현재 선택 링크를 복사했습니다.';$('share-fallback').hidden=true;}catch{$('share-fallback').hidden=false;$('share-url').value=navigation.href();$('share-url').focus();$('share-url').select();$('share-status').textContent='아래 링크를 복사해 공유하세요.';}});
 readHash();calculate();if(state.page==='schedule'){scheduleReturn=navigation.state()?.teamcScheduleReturn||null;beginScheduleSession(state.schedule==='shared');}render();
})();
