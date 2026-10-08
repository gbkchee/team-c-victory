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
  const roles=[],checks=[];
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
  }
  return {roles,checks,plans:[]};
 }
 const model={isLegalPair,summarizePairs,analyzeMatchup};
 if(typeof module==='object'&&module.exports)module.exports=model;
 else window.MATCHUP_MODEL=model;
})();
if(typeof document!=='undefined')(() => {
 const data=window.BOARD_DATA,$=id=>document.getElementById(id),model=window.MATCHUP_MODEL;
 const errors=window.validateBoard(data);
 if(errors.length){$('validation').textContent='편성 검증 실패';$('matches').textContent=errors.join(' / ');return;}
 $('validation').textContent='3개 전략 · 밸런스 3안 검증 완료';
 const pageTabs=[...document.querySelectorAll('.page-tab')],collator=new Intl.Collator('ko'),tierOrder={forty:0,thirty:1,love:2};
 const menuToggle=$('menu-toggle'),siteMenu=$('site-menu');
 function closeMenu(restoreFocus=false){
  siteMenu.hidden=true;menuToggle.setAttribute('aria-expanded','false');
  if(restoreFocus)menuToggle.focus();
 }
 menuToggle.addEventListener('click',()=>{
  siteMenu.hidden=!siteMenu.hidden;menuToggle.setAttribute('aria-expanded',String(!siteMenu.hidden));
 });
 document.addEventListener('click',event=>{
  if(!siteMenu.hidden&&!siteMenu.contains(event.target)&&!menuToggle.contains(event.target))closeMenu();
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!siteMenu.hidden){event.preventDefault();closeMenu(true);}
 });
 const tierSymbols={forty:'4️⃣',thirty:'3️⃣',love:'🫶'},tierLabels={forty:'포티',thirty:'써티',love:'러브'};
 const displayName=name=>name.replace(/\s*\(시트:.*\)$/,'');
 let state={page:'players',strategy:'balance',balanceVariant:'balance-1',filter:'all',own1:'',own2:'',team:'',p1:'',p2:''};
 const strategy=()=>state.strategy==='balance'?data.balanceVariants.find(item=>item.id===state.balanceVariant):data.strategies.find(item=>item.id===state.strategy);
 const slot=id=>data.schedule.find(item=>item.id===id);
 const sortedNames=team=>Object.keys(data.teams[team]).sort((a,b)=>tierOrder[data.teams[team][a].tier]-tierOrder[data.teams[team][b].tier]||collator.compare(displayName(a),displayName(b)));
 const legalNames=(team,pair)=>model.isLegalPair(pair.map(name=>({name,tier:data.teams[team]?.[name]?.tier})));
 function cleanPair(team,a,b){
  a=Object.hasOwn(data.teams[team]||{},a)?a:'';b=Object.hasOwn(data.teams[team]||{},b)?b:'';
  if(a&&b&&!legalNames(team,[a,b]))b='';return [a,b];
 }
 function readHash(){
  const q=new URLSearchParams(location.hash.slice(1));
  const selected=data.strategies.find(item=>item.id===q.get('strategy'))||data.strategies[0];
  const variant=data.balanceVariants.find(item=>item.id===q.get('balance'))||data.balanceVariants[0];
  const selectedPlan=selected.id==='balance'?variant:selected;
  const oldMatch=q.has('match')?selectedPlan.matches.find(item=>item.id===Number(q.get('match'))):null;
  const team=['A','B','D'].includes(q.get('team'))?q.get('team'):oldMatch?.team||'';
  const own=q.has('own1')||q.has('own2')?cleanPair('C',q.get('own1'),q.get('own2')):oldMatch?.pair||['',''];
  const opponents=cleanPair(team,q.get('p1'),q.get('p2'));
  state={
   page:['players','strategy','analysis'].includes(q.get('page'))?q.get('page'):q.has('strategy')?'strategy':'players',
   strategy:selected.id,balanceVariant:variant.id,filter:['A','B','D'].includes(q.get('filter'))?q.get('filter'):'all',
   own1:own[0],own2:own[1],team,p1:opponents[0],p2:opponents[1]
  };
 }
 function writeHash(){
  const q=new URLSearchParams({page:state.page,strategy:state.strategy,filter:state.filter});
  if(state.strategy==='balance')q.set('balance',state.balanceVariant);
  for(const key of ['own1','own2','team','p1','p2'])if(state[key])q.set(key,state[key]);
  try{history.replaceState(null,'','#'+q);}catch{}
 }
 function renderPage(){
  closeMenu();
  for(const tab of pageTabs){
   const active=tab.dataset.page===state.page;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
   $(tab.getAttribute('aria-controls')).hidden=!active;
  }
  $('share').hidden=state.page==='players';
 }
 for(const [index,tab] of pageTabs.entries()){
  tab.addEventListener('click',()=>{state.page=tab.dataset.page;renderPage();writeHash();});
  tab.addEventListener('keydown',event=>{
   let next;
   if(event.key==='ArrowRight')next=(index+1)%pageTabs.length;
   else if(event.key==='ArrowLeft')next=(index+pageTabs.length-1)%pageTabs.length;
   else if(event.key==='Home')next=0;
   else if(event.key==='End')next=pageTabs.length-1;
   else return;
   event.preventDefault();pageTabs[next].focus();pageTabs[next].click();
  });
 }
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
 function button(text,active,action,cls){
  const node=el('button',cls,text);node.type='button';node.setAttribute('aria-pressed',String(active));node.addEventListener('click',action);return node;
 }
 function tierBadge(team,name){
  const tier=data.teams[team][name].tier,badge=el('span','grade-badge',tierSymbols[tier]);
  badge.title=tierLabels[tier];badge.setAttribute('role','img');badge.setAttribute('aria-label',tierLabels[tier]);return badge;
 }
 function pairLabel(team,pair){
  const label=el('span','pair-label');
  pair.forEach((name,index)=>{
   if(index)label.append(el('span','pair-plus','+'));
   const player=el('span','pair-person');player.append(el('strong','',displayName(name)),tierBadge(team,name));label.append(player);
  });return label;
 }
 function playerCard(name,team){
  const profile=window.PLAYER_PROFILES.get(team,name),definitions=window.PLAYER_PROFILE_MODEL,card=el('div','player');
  card.append(el('strong','',displayName(name)),tierBadge(team,name));
  if(team==='C'){
   for(const [title,text] of [
    ['선호 리턴 자리',definitions.positions[profile.position]],['편한 플레이 위치',definitions.courtPreferences[profile.courtPreference]],
    ['플레이 성향',definitions.styles[profile.style]],['잘 맞는 파트너',profile.partnerRoles.map(key=>definitions.partnerRoles[key]).join(', ')||'미선택'],
    ['특징',profile.traits.join(', ')||'아직 입력 전'],['경기·휴식',definitions.restPreferences[profile.restPreference]]
   ])card.append(el('p','',title+' · '+text));
  }else{
   card.append(el('p','','플레이 성향 · '+definitions.styles[profile.style]));
   for(const [kind,title] of Object.entries(definitions.keywordKinds))card.append(el('p',kind==='weak'?'weakness':'',title+' · '+(profile.keywords.filter(item=>item.kind===kind).map(item=>item.text).join(', ')||'정보 없음')));
  }
  return card;
 }
 function submissionTime(time){
  const [hour,minute]=time.split(':').map(Number),total=hour*60+minute-10;
  return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
 }
 function analyzeScheduledPair(match){
  state.own1=match.pair[0];state.own2=match.pair[1];
  if(state.team!==match.team){state.p1='';state.p2='';}
  state.team=match.team;state.page='analysis';render();$('our-player1').focus({preventScroll:true});
 }
 function renderStrategy(){
  $('strategies').replaceChildren();
  for(const item of data.strategies){
   const choice=button('',state.strategy===item.id,()=>{state.strategy=item.id;render();},'strategy-button');
   choice.append(el('strong','',item.title),el('span','',item.subtitle));$('strategies').append(choice);
  }
  $('balance-variants-block').hidden=state.strategy!=='balance';
  $('balance-variants').replaceChildren();
  for(const variant of data.balanceVariants){
   const choice=button('',state.balanceVariant===variant.id,()=>{state.balanceVariant=variant.id;render();},'balance-variant');
   choice.dataset.variant=variant.id;
   choice.append(el('strong','',variant.title),el('span','',variant.subtitle));$('balance-variants').append(choice);
  }
  $('strategy-description').textContent=strategy().description;
  const pairs=model.summarizePairs(strategy().matches);$('pair-summary-count').textContent=pairs.length+'개 페어';
  $('strategy-pairs').replaceChildren(...pairs.map(item=>{
   const card=el('div','strategy-pair-card');
   card.append(pairLabel('C',item.pair),el('p','muted small',item.matches.length+'경기 · '+item.matches.map(id=>'C'+id).join(', ')));return card;
  }));
  $('filters').replaceChildren();
  for(const team of ['all','A','B','D'])$('filters').append(button(team==='all'?'전체':team+'조',state.filter===team,()=>{state.filter=team;render();}));
  const times=new Map();
  for(const match of strategy().matches.filter(item=>state.filter==='all'||item.team===state.filter)){
   const group=times.get(match.time)||[];group.push(match);times.set(match.time,group);
  }
  const table=el('table','schedule-matrix');
  table.append(el('caption','sr-only',(state.strategy==='balance'?'밸런스형 '+strategy().title:strategy().title)+' 시간대별 코트 출전표'));
  const head=el('thead'),headRow=el('tr');
  for(const title of ['시간','1코트','2코트','3코트','4코트']){
   const cell=el('th','',title);cell.scope='col';headRow.append(cell);
  }
  head.append(headRow);table.append(head);
  const body=el('tbody');
  for(const [time,matches] of times){
   const row=el('tr');row.dataset.time=time;
   const timeCell=el('th','matrix-time');timeCell.scope='row';
   timeCell.append(el('strong','',time),el('span','muted small','~ '+slot(matches[0].id).endTime));row.append(timeCell);
   for(let court=1;court<=4;court++){
    const cell=el('td'),match=matches.find(item=>slot(item.id).court===court);cell.dataset.court=String(court);
    if(match){
     const pair=el('button','matrix-match');pair.type='button';pair.dataset.match=String(match.id);
     pair.setAttribute('aria-label',time+' '+court+'코트 C'+match.id+' '+match.pair.map(displayName).join(' + ')+' vs '+match.team+'조, 페어 분석');
     pair.append(el('span','matrix-pair-names',match.pair.map(displayName).join(' ')),el('span','matrix-vs','vs'),el('span','matrix-opponent',match.team+'조'));
     pair.addEventListener('click',()=>analyzeScheduledPair(match));cell.append(pair);
    }else{
     cell.className='matrix-empty';cell.textContent='—';cell.setAttribute('aria-label',time+' '+court+'코트 C조 출전 없음');
    }
    row.append(cell);
   }
   body.append(row);
  }
  table.append(body);$('matches').replaceChildren(table);
  const counts=el('div','count-grid');
  for(const name of sortedNames('C'))counts.append(el('span','',displayName(name)+' · '+strategy().matches.filter(match=>match.pair.includes(name)).length+'경기'));
  $('counts').replaceChildren(counts);
 }
 function populate(select,team,value,other){
  select.replaceChildren(new Option(team?'선택하세요':'조를 먼저 선택하세요',''));select.disabled=!team;
  if(team)for(const name of sortedNames(team)){
   const option=new Option(displayName(name)+' · '+tierSymbols[data.teams[team][name].tier],name);
   option.disabled=name===other||(Boolean(other)&&!legalNames(team,[name,other]));select.add(option);
  }
  select.value=value;
 }
 function resultList(title,items,cls){
  const section=el('section',cls||'analysis-notes');section.append(el('h3','',title));
  const list=el('ul');for(const text of items)list.append(el('li','',text));section.append(list);return section;
 }
 function renderAnalysis(){
  populate($('our-player1'),'C',state.own1,state.own2);populate($('our-player2'),'C',state.own2,state.own1);
  $('analysis-team').value=state.team;
  populate($('opponent1'),state.team,state.p1,state.p2);populate($('opponent2'),state.team,state.p2,state.p1);
  const result=$('analysis-result');result.replaceChildren();
  if(!legalNames('C',[state.own1,state.own2])||!state.team||!legalNames(state.team,[state.p1,state.p2])){
   const message=!state.own1||!state.own2?'C조 선수 두 명을 골라 우리 페어를 선택해 주세요.':!state.team?'상대 조를 선택해 주세요.':'상대 선수 두 명을 선택하면 결과가 표시됩니다.';
   result.append(el('p','empty',message));return;
  }
  const ownNames=[state.own1,state.own2],opponentNames=[state.p1,state.p2];
  const panel=el('section','analysis-result-panel');
  panel.append(el('h2','analysis-title',ownNames.map(displayName).join(' + ')+' vs '+state.team+'조 '+opponentNames.map(displayName).join(' + ')));
  panel.append(el('p','muted small','선택한 경기 선호와 관찰 키워드를 함께 보고 준비할 운영을 정리했습니다.'));
  const snapshots=el('div','analysis-snapshots');
  for(const [team,names,title] of [['C',ownNames,'우리 페어'],[state.team,opponentNames,'상대 페어']]){
   const section=el('section','pair-snapshot');section.append(el('h3','',title));
   const cards=el('div','players');for(const name of names)cards.append(playerCard(name,team));section.append(cards);snapshots.append(section);
  }
  panel.append(snapshots);
  const analysis=model.analyzeMatchup(
   ownNames.map(name=>({name:displayName(name),profile:window.PLAYER_PROFILES.get('C',name)})),
   opponentNames.map(name=>({name:displayName(name),profile:window.PLAYER_PROFILES.get(state.team,name)}))
  );
  const plans=el('section','analysis-plans');plans.append(el('h3','','시도해볼 공략'));
  for(const plan of analysis.plans){
   const card=el('div','analysis-tip');card.append(el('h4','',plan.title),el('p','',plan.text),el('p','muted small',plan.evidence));plans.append(card);
  }
  panel.append(plans,resultList('우리 페어 역할 분담',analysis.roles));
  if(analysis.checks.length)panel.append(resultList('경기 전에 함께 확인',analysis.checks));
  const combo=data.combos[state.team].find(item=>item.pair.includes(state.p1)&&item.pair.includes(state.p2));
  if(combo?.points.length){
   const notes=el('details','analysis-source-notes');notes.append(el('summary','','기존 시트의 상대 공략 메모'));
   notes.append(el('p','muted small','기존 시트에 기반한 참고 메모입니다. 새 관찰 기록과 함께 확인해 주세요.'));
   const list=el('ul');for(const text of combo.points)list.append(el('li','',text));notes.append(list);panel.append(notes);
  }
  result.append(panel);
 }
 function render(){renderStrategy();renderAnalysis();renderPage();writeHash();}
 for(const [id,field,team] of [['our-player1','own1','C'],['our-player2','own2','C'],['opponent1','p1',null],['opponent2','p2',null]]){
  $(id).addEventListener('change',()=>{
   state[field]=$(id).value;
   if(team)[state.own1,state.own2]=cleanPair('C',state.own1,state.own2);
   else [state.p1,state.p2]=cleanPair(state.team,state.p1,state.p2);
   renderAnalysis();writeHash();
  });
 }
 $('analysis-team').addEventListener('change',()=>{state.team=['A','B','D'].includes($('analysis-team').value)?$('analysis-team').value:'';state.p1='';state.p2='';renderAnalysis();writeHash();});
 window.addEventListener('hashchange',()=>{readHash();render();});
 window.addEventListener('playerprofileschange',()=>render());
 $('share').addEventListener('click',async()=>{
  if(!/^https?:$/.test(location.protocol)){
   $('share-status').textContent='HTML 파일을 첨부해 공유하세요. 선택 상태는 파일에 포함되지 않습니다.';$('share-fallback').hidden=true;return;
  }
  try{await navigator.clipboard.writeText(location.href);$('share-status').textContent='현재 화면의 선택 링크를 복사했습니다.';$('share-fallback').hidden=true;}
  catch{$('share-fallback').hidden=false;$('share-url').value=location.href;$('share-url').focus();$('share-url').select();$('share-status').textContent='아래 링크를 복사해 공유하세요.';}
 });
 readHash();render();
})();
