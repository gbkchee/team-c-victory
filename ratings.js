'use strict';
(() => {
 const skills={
  serve:'서브',forehand:'포핸드',backhand:'백핸드',forehandVolley:'포발리',backhandVolley:'백발리',
  lob:'로브',slice:'슬라이스',smash:'스매시',coverage:'코트커버',stamina:'체력',mental:'멘탈'
 };
 const positions={'':'미선택',fore:'포',back:'백',either:'상관없음'};
 const styles={attack:'공격형',defense:'수비형',unknown:'모르겠음'};
 const partnerRoles={
  cover:'뒤에서 커버',attack:'전위에서 공격',connect:'안정적으로 연결',
  tactics:'코스·작전 같이 정하기',encourage:'격려·분위기 잡기',either:'상관없음'
 };
 const restPreferences={'':'미선택',continuous:'연속 출전 (예열된 채 해야 함)',rest:'쉬면 좋음',condition:'당일 컨디션에 따라 다르다'};
 const opponentPositions={fore:'포잡이',back:'백잡이',unknown:'모르겠음'};
 const opponentStyles={attack:'공격형',defense:'수비형',allround:'올라운더',unknown:'모르겠음'};
 const keywordKinds={strong:'강점',weak:'약점',note:'특징'};
 const keywordSuggestions={
  strong:['서브','포핸드','백핸드','포발리','백발리','로브','슬라이스','스매시','코트커버'],
  weak:['포핸드','백핸드','포발리','백발리','몸쪽 공','높은 공','낮은 공','로브 처리','좌우 이동'],
  note:['장신','슬라이스서브','빠른 발','네트 자주 붙음']
 };
 const traitSuggestions=['왼손잡이','장신','슬라이스서브','킥서브','네트에 자주 붙음','베이스라인 선호','긴 랠리가 편함','파트너와 콜을 많이 함','초반에 몸이 늦게 풀림'];
 const cleanText=text=>text.normalize('NFC').trim().replace(/\s+/g,' ');
 function cleanTraits(raw){
  if(!Array.isArray(raw))return [];
  const result=[];
  for(const item of raw){
   if(typeof item!=='string')continue;
   const text=cleanText(item).slice(0,40);
   if(text&&!result.includes(text))result.push(text);
   if(result.length===20)break;
  }
  return result;
 }
 function cleanKeywords(raw){
  const seen=new Set(),result=[];
  for(const item of raw){
   if(!item||typeof item.kind!=='string'||!Object.hasOwn(keywordKinds,item.kind)||typeof item.text!=='string')continue;
   const text=cleanText(item.text).slice(0,40),key=item.kind+':'+text;
   if(!text||seen.has(key))continue;
   seen.add(key);result.push({kind:item.kind,text});if(result.length===20)break;
  }
  return result;
 }
 const cleanChoices=(raw,options)=>Object.keys(options).filter(key=>Array.isArray(raw)&&raw.includes(key));
 const cleanChoice=(raw,options,fallback)=>typeof raw==='string'&&Object.hasOwn(options,raw)?raw:fallback;
 function cleanProfile(raw,team,initialKeywords=[]){
  if(team==='C'){
   const roles=cleanChoices(raw?.partnerRoles,partnerRoles);
   return {
    position:cleanChoice(raw?.position,positions,''),
    style:cleanChoice(raw?.style,styles,'unknown'),
    confidentSkills:cleanChoices(raw?.confidentSkills,skills),
    rustySkills:cleanChoices(raw?.rustySkills,skills),
    partnerRoles:roles.length>1?roles.filter(role=>role!=='either'):roles,
    restPreference:cleanChoice(raw?.restPreference,restPreferences,''),
    traits:cleanTraits(raw?.traits)
   };
  }
  return {
   tendency:cleanChoice(raw?.tendency,opponentPositions,'unknown'),
   style:cleanChoice(raw?.style,opponentStyles,'unknown'),
   keywords:cleanKeywords(Array.isArray(raw?.keywords)?raw.keywords:initialKeywords)
  };
 }
 const model={skills,positions,styles,partnerRoles,restPreferences,opponentPositions,opponentStyles,keywordKinds,keywordSuggestions,traitSuggestions,cleanText,cleanProfile};
 if(typeof module==='object'&&module.exports)module.exports=model;
 else window.PLAYER_PROFILE_MODEL=model;
})();
if(typeof document!=='undefined')(() => {
 const root=document.getElementById('ratings-panel');if(!root)return;
 const model=window.PLAYER_PROFILE_MODEL;
 const {skills,positions,styles,partnerRoles,restPreferences,opponentPositions,opponentStyles,keywordKinds,keywordSuggestions,traitSuggestions,cleanText,cleanProfile}=model;
 const data=window.BOARD_DATA;
 const tiers={forty:'포티',thirty:'써티',love:'러브'},tierSymbols={forty:'4️⃣',thirty:'3️⃣',love:'🫶'},tierOrder={forty:0,thirty:1,love:2};
 const collator=new Intl.Collator('ko'),displayName=name=>name.replace(/\s*\(시트:.*\)$/,'');
 const roster=Object.entries(data.teams).flatMap(([team,players])=>Object.keys(players).map(name=>({
  id:team+':'+name,team,name,displayName:displayName(name),tier:players[name].tier
 }))).sort((a,b)=>a.team.localeCompare(b.team)||(tierOrder[a.tier]??3)-(tierOrder[b.tier]??3)||collator.compare(a.displayName,b.displayName));
 const allowed=new Set(roster.map(player=>player.id)),storageKey='courtside.player-profiles.v3';
 const oldStorageKeys=['courtside.player-ratings.v2','courtside.player-pentagons.v1'];
 let profiles={},sharedTraitSuggestions=[],saveAvailable=true,current='',lastTrigger=null;
 const $=id=>document.getElementById(id),person=id=>roster.find(player=>player.id===id);
 const label=id=>{const player=person(id);return player.team+'조 '+player.displayName;};
 const tier=id=>tiers[person(id).tier]||'등급 미확인',tierSymbol=id=>tierSymbols[person(id).tier]||'❔';
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
 function initialKeywords(id){
  const player=person(id);if(!player||player.team==='C')return [];
  const info=data.teams[player.team][player.name];
  return [
   ...info.strong.map(text=>({kind:'strong',text})),
   ...info.weak.map(text=>({kind:'weak',text})),
   ...info.note.split(' · ').filter(text=>text&&!text.includes('정보 없음')).map(text=>({kind:'note',text}))
  ];
 }
 try{
  let stored=localStorage.getItem(storageKey);
  for(const key of oldStorageKeys)if(stored===null)stored=localStorage.getItem(key);
  const saved=JSON.parse(stored??'{}');
  if(saved&&typeof saved==='object'&&!Array.isArray(saved)){
   for(const [id,raw] of Object.entries(saved))if(allowed.has(id))profiles[id]=cleanProfile(raw,person(id).team,initialKeywords(id));
  }
 }catch{saveAvailable=false;}
 const profile=id=>profiles[id]||cleanProfile(null,person(id).team,initialKeywords(id));
 window.PLAYER_PROFILES={get:(team,name)=>allowed.has(team+':'+name)?profile(team+':'+name):cleanProfile(null,team)};
 function tierBadge(id){
  const badge=el('span','grade-badge',tierSymbol(id));
  badge.title=tier(id);badge.setAttribute('role','img');badge.setAttribute('aria-label',tier(id));return badge;
 }
 function savedStatus(){
  const cloud=window.PLAYER_PROFILE_CLOUD;
  const status=cloud?.status==='ready'?'팀원과 실시간으로 공유 중'
   :cloud?.status==='connecting'?'팀 공유 저장소 연결 중 · 이 브라우저에도 임시 저장'
   :cloud?.status==='error'?'팀 공유 저장소 연결 실패 · 이 브라우저에 임시 저장'
   :saveAvailable?'팀 공유 저장소에 연결 중입니다.':'저장할 수 없어 현재 창에서만 유지됩니다.';
  $('profile-save-status').textContent=status;
  const menuStatus=$('cloud-status');if(menuStatus)menuStatus.textContent=status;
 }
 function persist(){
  try{localStorage.setItem(storageKey,JSON.stringify(profiles));saveAvailable=true;}catch{saveAvailable=false;}
  savedStatus();
  refreshRosterCard(current);
  window.dispatchEvent(new CustomEvent('playerprofileschange',{detail:{team:person(current).team,name:person(current).name}}));
 }
 function update(patch){profiles[current]=cleanProfile({...profile(current),...patch},person(current).team,initialKeywords(current));persist();}
 window.addEventListener('playerprofilescloudchange',event=>{
  const incoming=event.detail?.profiles;
  if(!incoming||typeof incoming!=='object')return;
  profiles=incoming;
  try{localStorage.setItem(storageKey,JSON.stringify(profiles));saveAvailable=true;}catch{saveAvailable=false;}
  savedStatus();renderRoster();
  if(root.open)render();
  window.dispatchEvent(new CustomEvent('playerprofileschange',{detail:{cloudRefresh:true}}));
 });
 window.addEventListener('playerprofilecloudstatuschange',savedStatus);
 window.addEventListener('playertraitssuggestionschange',event=>{
  sharedTraitSuggestions=Array.isArray(event.detail?.suggestions)?event.detail.suggestions:[];
  if(root.open&&person(current)?.team==='C')renderTraits();
 });
 function choiceField(title,field,options,multiple=false,help='',stack=false){
  const group=el('fieldset','profile-field'),legend=el('legend','',title),choices=el('div','profile-choices'+(stack?' profile-choices-stack':''));
  group.append(legend);if(help)group.append(el('p','muted small',help));
  const inputs=[];
  for(const [value,name] of Object.entries(options)){
   if(value==='')continue;
   const label=el('label','profile-choice'),input=el('input','profile-choice-input');
   input.type=multiple?'checkbox':'radio';input.name='profile-'+field;input.value=value;input.id='profile-'+field+'-'+value;
   input.checked=multiple?profile(current)[field].includes(value):profile(current)[field]===value;
   input.addEventListener('change',()=>{
    if(multiple){
     let selected=inputs.filter(item=>item.checked).map(item=>item.value);
     if(field==='partnerRoles'){
      if(value==='either'&&input.checked)selected=['either'];
      else if(value!=='either'&&input.checked)selected=selected.filter(item=>item!=='either');
     }
     update({[field]:selected});
    }else update({[field]:value});
    for(const item of inputs)item.checked=multiple?profile(current)[field].includes(item.value):profile(current)[field]===item.value;
   });
   inputs.push(input);label.append(input,el('span','profile-choice-label',name));choices.append(label);
  }
  group.append(choices);return group;
 }
 function renderTeamFields(){
  const fields=$('team-profile-fields');fields.replaceChildren(
   choiceField('선호 포지션','position',positions),
   choiceField('게임 스타일','style',styles),
   choiceField('요즘 자신 있는','confidentSkills',skills,true,'복수 선택 · 요즘 편하게 하는 플레이만 골라 주세요. 비워 둬도 괜찮아요.'),
   choiceField('집 나갔어요 😭','rustySkills',skills,true,'요즘 감이 잘 안 오거나 어려운 플레이를 골라 주세요. 비워 두어도 괜찮아요.')
  );
  renderTraits();
  const preferences=el('div','profile-fields profile-fields-group');preferences.id='team-profile-preferences';
  preferences.append(
   choiceField('경기·휴식 선호','restPreference',restPreferences,false,'경기 당일 바꿔도 괜찮아요.',true),
   choiceField('파트너에게 바라는 역할','partnerRoles',partnerRoles,true,'복수 선택 · 함께 경기할 때 도움받고 싶은 역할을 골라 주세요.')
  );
  fields.append(preferences);
 }
function renderTraits(){
  const draft=$('profile-trait-text')?.value||'',parent=$('team-profile-fields');
  $('team-traits')?.remove();
  const section=el('section','team-traits keyword-section');section.id='team-traits';section.setAttribute('aria-label','나의 플레이 특징');
  section.append(el('h3','','나의 플레이 특징'),el('p','muted small','복수 입력 · 본인의 플레이 특징을 자유롭게 알려 주세요. 특징은 40자 이내, 최대 20개까지 추가할 수 있어요.'));
  const list=el('div','rating-keywords'),traits=profile(current).traits;
  for(const [index,text] of traits.entries()){
   const chip=el('span','keyword-chip'),remove=el('button','keyword-remove','×');
   remove.type='button';remove.setAttribute('aria-label',text+' 특징 삭제');
   remove.addEventListener('click',()=>{
    update({traits:profile(current).traits.filter(item=>item!==text)});renderTraits();
    $('profile-trait-status').textContent='특징을 삭제했습니다.';
    const buttons=$('team-traits').querySelectorAll('.keyword-remove');
    (buttons[Math.min(index,buttons.length-1)]||$('profile-trait-text')).focus();
   });
   chip.append(el('span','',text),remove);list.append(chip);
  }
  if(!traits.length)list.append(el('p','muted small','아직 입력한 특징이 없습니다.'));
  const form=el('form','profile-keyword-form'),label=el('label','','특징 직접 입력'),input=el('input'),add=el('button','','추가');
  input.type='text';input.id='profile-trait-text';input.maxLength=40;input.autocomplete='off';input.value=draft;
  input.placeholder='예: 왼손잡이, 파트너와 콜을 많이 함';label.htmlFor=input.id;label.append(input);add.type='submit';form.append(label,add);
  const status=el('p','muted small');status.id='profile-trait-status';status.setAttribute('role','status');
  function addTrait(text,clearDraft){
   text=cleanText(text);const all=profile(current).traits;
   if(!text){status.textContent='특징을 입력하세요.';return;}
   if(text.length>40){status.textContent='특징은 40자 이내로 입력하세요.';return;}
   if(all.includes(text)){status.textContent='이미 등록한 특징입니다.';return;}
   if(all.length>=20){status.textContent='특징은 선수당 20개까지 입력할 수 있습니다.';return;}
   update({traits:[...all,text]});if(clearDraft)input.value='';renderTraits();
   $('profile-trait-status').textContent='특징을 추가했습니다.';$('profile-trait-text').focus();
  }
  form.addEventListener('submit',event=>{event.preventDefault();addTrait(input.value,true);});
  const suggestions=el('div','keyword-suggestions');suggestions.setAttribute('aria-label','나의 플레이 특징 빠른 추가');
  for(const text of [...new Set([...traitSuggestions,...sharedTraitSuggestions])]){
   const button=el('button','keyword-suggestion','＋ '+text);button.type='button';button.disabled=traits.includes(text);
   button.addEventListener('click',()=>addTrait(text,false));suggestions.append(button);
  }
  section.append(list,form,el('p','muted small','빠른 추가'),suggestions,status);
  const preferences=parent.querySelector('.profile-fields-group');
  parent.insertBefore(section,preferences||null);
 }
 function renderOpponentFields(){
  $('opponent-profile-fields').replaceChildren(
   choiceField('포·백 성향','tendency',opponentPositions),
   choiceField('게임 스타일','style',opponentStyles)
  );
  renderKeywords();
 }
 function renderKeywords(){
  const drafts=Object.fromEntries(Object.keys(keywordKinds).map(kind=>[kind,$('profile-keyword-text-'+kind)?.value||'']));
  const groups=$('opponent-keywords');groups.replaceChildren();
  for(const [kind,title] of Object.entries(keywordKinds)){
   const section=el('section','keyword-section'),list=el('div','rating-keywords');
   section.append(el('h3','',title));
   const keywords=profile(current).keywords.filter(keyword=>keyword.kind===kind);
   for(const keyword of keywords){
    const chip=el('span','keyword-chip'),remove=el('button','keyword-remove','×');
    remove.type='button';remove.setAttribute('aria-label',title+' '+keyword.text+' 키워드 삭제');
    remove.addEventListener('click',()=>{
     update({keywords:profile(current).keywords.filter(item=>item.kind!==kind||item.text!==keyword.text)});
     renderKeywords();$('profile-keyword-status-'+kind).textContent='키워드를 삭제했습니다.';
    });
    chip.append(el('span','',keyword.text),remove);list.append(chip);
   }
   if(!keywords.length)list.append(el('p','muted small','아직 기록된 '+title+'이 없습니다.'));
   const form=el('form','profile-keyword-form'),inputLabel=el('label','',title+' 키워드 추가'),input=el('input'),add=el('button','','추가');
   input.type='text';input.id='profile-keyword-text-'+kind;input.maxLength=40;input.autocomplete='off';input.value=drafts[kind];
   input.placeholder={strong:'포핸드, 코스 공략 등',weak:'몸쪽 공, 높은 공 등',note:'장신, 슬라이스서브 등'}[kind];
   inputLabel.htmlFor=input.id;inputLabel.append(input);add.type='submit';form.append(inputLabel,add);
   const status=el('p','muted small');status.id='profile-keyword-status-'+kind;status.setAttribute('role','status');
   function addKeyword(text){
    text=cleanText(text);const all=profile(current).keywords;
    if(!text){status.textContent='키워드를 입력하세요.';return;}
    if(text.length>40){status.textContent='키워드는 40자 이내로 입력하세요.';return;}
    if(all.length>=20){status.textContent='키워드는 선수당 총 20개까지 입력할 수 있습니다.';return;}
    if(all.some(item=>item.kind===kind&&item.text===text)){status.textContent='이미 등록한 키워드입니다.';return;}
    update({keywords:[...all,{kind,text}]});input.value='';renderKeywords();
    $('profile-keyword-status-'+kind).textContent='키워드를 추가했습니다.';$('profile-keyword-text-'+kind).focus();
   }
   form.addEventListener('submit',event=>{event.preventDefault();addKeyword(input.value);});
   const suggestions=el('div','keyword-suggestions');suggestions.setAttribute('aria-label',title+' 키워드 빠른 추가');
   for(const text of keywordSuggestions[kind]){
    const button=el('button','keyword-suggestion','＋ '+text);button.type='button';
    button.disabled=keywords.some(item=>item.text===text);
    button.addEventListener('click',()=>addKeyword(text));suggestions.append(button);
   }
   section.append(list,form,el('p','muted small','빠른 추가'),suggestions,status);groups.append(section);
  }
 }
 function render(){
  const own=person(current).team==='C';
  $('rating-player-info').replaceChildren(el('span','',label(current)),tierBadge(current));
  $('profile-help').textContent=own
   ?'본인이 원하는 경기 방식을 알려 주세요. 선택하지 않은 항목이 있어도 괜찮아요.'
   :'실제로 본 플레이를 기록해 주세요. 잘 모르면 모르겠음으로 남겨 주세요. 키워드는 40자 이내, 선수당 총 20개까지 추가할 수 있어요.';
  $('team-profile-section').hidden=!own;$('opponent-profile-section').hidden=own;
  $('team-profile-fields').replaceChildren();$('opponent-profile-fields').replaceChildren();$('opponent-keywords').replaceChildren();
  if(own)renderTeamFields();else renderOpponentFields();
  $('profile-reset').textContent=own?'선택 선수의 입력 초기화':'입력 초기화 · 키워드는 시트 기록으로 복원';
  savedStatus();
 }
 function renderRoster(){
  const groups=$('player-roster');groups.replaceChildren();
  $('roster-total').textContent=Object.keys(data.teams).length+'개 조 · '+roster.length+'명';
  for(const team of ['C','A','B','D']){
   const players=roster.filter(player=>player.team===team),section=el('section','roster-team');
   section.id='roster-'+team;section.setAttribute('aria-labelledby','roster-heading-'+team);
   const heading=el('div','roster-team-heading'),list=el('ul','roster-players');
   const title=el('h3','',team+'조');title.id='roster-heading-'+team;title.tabIndex=-1;
   heading.append(title,el('span','roster-count','선수 '+players.length+'명'));section.append(heading);
   for(const player of players){
    const item=el('li'),button=el('button','roster-player');button.type='button';button.dataset.player=player.id;
    button.setAttribute('aria-pressed',String(player.id===current));button.setAttribute('aria-controls','ratings-panel');button.setAttribute('aria-haspopup','dialog');
    button.setAttribute('aria-label',label(player.id)+', '+tier(player.id)+', '+(team==='C'?'경기 선호 입력':'상대 선수 분석'));
    fillRosterCard(button,player.id);
    button.addEventListener('click',()=>{
     current=player.id;lastTrigger=button;render();
     groups.querySelectorAll('.roster-player').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.player===current)));
     root.showModal();document.body.classList.add('player-dialog-open');$('rating-player-info').focus({preventScroll:true});
    });
    item.append(button);list.append(item);
   }
   section.append(list);groups.append(section);
  }
 }
 function fillRosterCard(button,id){
  const player=person(id),info=profile(id),identity=el('span','roster-identity');
  identity.append(el('strong','roster-name',player.displayName),tierBadge(id));
  const divider=el('span','roster-divider');divider.setAttribute('aria-hidden','true');
  const highlights=el('span','roster-highlights');
  const rows=player.team==='C'
   ?[['자신 있는',info.confidentSkills.map(key=>skills[key]).join(', ')||'미선택','strong'],['집 나갔어요 😭',info.rustySkills.map(key=>skills[key]).join(', ')||'미선택','weak'],['특징',info.traits.join(', ')||'아직 입력 전','note']]
   :[['강점',info.keywords.filter(item=>item.kind==='strong').map(item=>item.text).join(', ')||'정보 없음','strong'],['약점',info.keywords.filter(item=>item.kind==='weak').map(item=>item.text).join(', ')||'정보 없음','weak']];
  for(const [title,text,kind] of rows){
   const row=el('span','roster-highlight roster-highlight-'+kind),value=el('span','roster-highlight-value',text);
   value.title=text;row.append(el('span','roster-highlight-label',title),value);highlights.append(row);
  }
  button.setAttribute('aria-description',rows.map(([title,text])=>title+' · '+text).join('. '));
  button.replaceChildren(identity,divider,highlights);
 }
 function refreshRosterCard(id){
  const card=[...$('player-roster').querySelectorAll('.roster-player')].find(button=>button.dataset.player===id);
  if(card)fillRosterCard(card,id);
 }
 const shortcuts=[...$('group-shortcuts').querySelectorAll('button')];
 for(const shortcut of shortcuts)shortcut.addEventListener('click',()=>{
  const section=$('roster-'+shortcut.dataset.group);
  shortcuts.forEach(button=>button.setAttribute('aria-pressed',String(button===shortcut)));
  $('roster-heading-'+shortcut.dataset.group).focus({preventScroll:true});
  section.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
 });
 $('rating-close').addEventListener('click',()=>root.close());
 root.addEventListener('close',()=>{
  document.body.classList.remove('player-dialog-open');
  if(lastTrigger?.isConnected&&lastTrigger.getClientRects().length)lastTrigger.focus({preventScroll:true});
 });
 root.addEventListener('click',event=>{
  if(event.target!==root)return;
  const rect=root.getBoundingClientRect();
  if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)root.close();
 });
 window.addEventListener('hashchange',()=>{
  const params=new URLSearchParams(window.location.hash.slice(1));
  if(root.open&&(['strategy','analysis'].includes(params.get('page'))||(!params.has('page')&&params.has('strategy'))))root.close();
 });
 $('profile-reset').addEventListener('click',()=>{delete profiles[current];persist();render();});
 savedStatus();renderRoster();
 window.PLAYER_PROFILES.all=()=>JSON.parse(JSON.stringify(profiles));
 window.dispatchEvent(new CustomEvent('playerprofilesready'));
})();
