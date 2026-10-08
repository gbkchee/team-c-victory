'use strict';
if(typeof module==='object'&&module.exports)module.exports=require('./profile-model.js');
if(typeof document!=='undefined')(() => {
 const root=document.getElementById('ratings-panel');if(!root)return;
 const model=window.PLAYER_PROFILE_MODEL;
 const {positions,courtPreferences,styles,partnerRoles,restPreferences,opponentStyles,keywordKinds,keywordSuggestions,traitSuggestions,cleanText,cleanProfile}=model;
 const data=window.BOARD_DATA;
 const tiers={forty:'포티',thirty:'써티',love:'러브'},tierSymbols={forty:'4️⃣',thirty:'3️⃣',love:'🫶'},tierOrder={forty:0,thirty:1,love:2};
 const collator=new Intl.Collator('ko'),displayName=name=>name.replace(/\s*\(시트:.*\)$/,'');
 const roster=Object.entries(data.teams).flatMap(([team,players])=>Object.keys(players).map(name=>({
  id:team+':'+name,team,name,displayName:displayName(name),tier:players[name].tier
 }))).sort((a,b)=>a.team.localeCompare(b.team)||(tierOrder[a.tier]??3)-(tierOrder[b.tier]??3)||collator.compare(a.displayName,b.displayName));
 const allowed=new Set(roster.map(player=>player.id)),storageKey='courtside.player-profiles.v4';
 const oldStorageKeys=['courtside.player-profiles.v3','courtside.player-ratings.v2','courtside.player-pentagons.v1'];
 let profiles={},sharedTraitSuggestions=[],sharedKeywordSuggestions={},saveAvailable=true,current='';
 const $=id=>document.getElementById(id),person=id=>roster.find(player=>player.id===id);
 const label=id=>{const player=person(id);return player.team+'조 '+player.displayName;};
 const tier=id=>tiers[person(id).tier]||'등급 미확인',tierSymbol=id=>tierSymbols[person(id).tier]||'❔';
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
 const editor=$('player-profile-editor'),detailPage=$('player-detail-page'),main=$('main-content'),header=$('site-header');
 const mobile=window.matchMedia('(max-width: 767px)');
 let editorOpen=false,listScroll=0,previousScrollRestoration='auto',silentDialogCloses=0,returning=false,navigationGeneration=0;
 function routePlayer(){
  const params=new URLSearchParams(location.hash.slice(1)),id=params.get('player');
  return (!params.get('page')||params.get('page')==='players')&&allowed.has(id)?id:null;
 }
 function closeDialogSilently(){if(root.open){silentDialogCloses++;root.close();}}
 function presentEditor(){
  if(mobile.matches){
   closeDialogSilently();detailPage.append(editor);detailPage.hidden=false;main.hidden=true;header.hidden=true;
   document.body.classList.remove('player-dialog-open');document.body.classList.add('player-detail-open');
   $('rating-back').hidden=false;$('rating-close').hidden=true;
  }else{
   root.append(editor);detailPage.hidden=true;main.hidden=false;header.hidden=false;
   document.body.classList.remove('player-detail-open');document.body.classList.add('player-dialog-open');
   $('rating-back').hidden=true;$('rating-close').hidden=false;
   if(!root.open)root.showModal();
  }
 }
 function openEditor(id,fromRoute=false){
  if(!allowed.has(id))return;
  const wasOpen=editorOpen;
  if(!wasOpen){
   listScroll=fromRoute&&Number.isFinite(history.state?.teamcRosterScroll)?history.state.teamcRosterScroll:window.scrollY||0;
   previousScrollRestoration=history.scrollRestoration||'auto';history.scrollRestoration='manual';
  }
  navigationGeneration++;returning=false;current=id;editorOpen=true;render();
  $('player-roster').querySelectorAll('.roster-player').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.player===current)));
  if(mobile.matches&&!fromRoute){
   const params=new URLSearchParams(location.hash.slice(1));params.set('page','players');params.set('player',current);
   history.pushState({...history.state,teamcPlayerEntry:true,teamcRosterScroll:listScroll},'','#'+params);
  }
  presentEditor();root.scrollTop=0;
  if(mobile.matches)window.scrollTo({top:0,behavior:'instant'});
  $('rating-player-info').focus({preventScroll:true});
 }
 function hideEditor(){
  if(!editorOpen)return;
  const active=document.activeElement;if(editor.contains(active))active.blur?.();
  editorOpen=false;returning=false;closeDialogSilently();root.append(editor);
  detailPage.hidden=true;main.hidden=false;header.hidden=false;
  document.body.classList.remove('player-dialog-open');document.body.classList.remove('player-detail-open');
  $('rating-back').hidden=true;$('rating-close').hidden=false;
  const generation=++navigationGeneration,scroll=listScroll,restoration=previousScrollRestoration;
  history.scrollRestoration=restoration;
  setTimeout(()=>{
   if(editorOpen||generation!==navigationGeneration)return;
   const page=new URLSearchParams(location.hash.slice(1)).get('page');
   if(!page||page==='players'){
    window.scrollTo({top:scroll,behavior:'instant'});
    const trigger=[...$('player-roster').querySelectorAll('.roster-player')].find(button=>button.dataset.player===current);
    if(trigger?.getClientRects().length)trigger.focus({preventScroll:true});
   }
  },0);
 }
 function returnToRoster(){
  if(!editorOpen||returning)return;
  if(routePlayer()&&history.state?.teamcPlayerEntry){returning=true;history.back();return;}
  if(routePlayer()){
   const params=new URLSearchParams(location.hash.slice(1)),state={...history.state};params.delete('player');delete state.teamcPlayerEntry;delete state.teamcRosterScroll;
   history.replaceState(state,'','#'+params);
  }
  hideEditor();
 }
 function syncPlayerRoute(){
  const id=routePlayer();
  if(id){if(!editorOpen||id!==current)openEditor(id,true);}
  else if(editorOpen)hideEditor();
 }
 mobile.addEventListener?.('change',()=>{renderRoster();if(editorOpen)presentEditor();});
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
 window.PLAYER_PROFILES={has:id=>allowed.has(id),get:(team,name)=>allowed.has(team+':'+name)?profile(team+':'+name):cleanProfile(null,team)};
 function tierBadge(id){
  const badge=el('span','grade-badge',tierSymbol(id));
  badge.title=tier(id);badge.setAttribute('role','img');badge.setAttribute('aria-label',tier(id));return badge;
 }
 function savedStatus(){
  const cloud=window.PLAYER_PROFILE_CLOUD;
  const status=cloud?.status==='ready'?(cloud.message||'팀원과 실시간으로 공유 중')
   :cloud?.status==='connecting'?'팀 공유 저장소 연결 중 · 이 브라우저에도 임시 저장'
   :cloud?.status==='error'?(cloud.message||'팀 공유 저장소 연결 실패 · 이 브라우저에 임시 저장')
   :saveAvailable?'팀 공유 저장소에 연결 중입니다.':'저장할 수 없어 현재 창에서만 유지됩니다.';
  $('profile-save-status').textContent=status;
  const menuStatus=$('cloud-status');if(menuStatus)menuStatus.textContent=status;
 }
 function persist(fields=null){
  try{localStorage.setItem(storageKey,JSON.stringify(profiles));saveAvailable=true;}catch{saveAvailable=false;}
  savedStatus();
  refreshRosterCard(current);
  window.dispatchEvent(new CustomEvent('playerprofileschange',{detail:{team:person(current).team,name:person(current).name,fields}}));
 }
 function update(patch){profiles[current]=cleanProfile({...profile(current),...patch},person(current).team,initialKeywords(current));persist(Object.keys(patch));}
 window.addEventListener('playerprofilescloudchange',event=>{
  const incoming=event.detail?.profiles;
  if(!incoming||typeof incoming!=='object')return;
  profiles=incoming;
  try{localStorage.setItem(storageKey,JSON.stringify(profiles));saveAvailable=true;}catch{saveAvailable=false;}
  savedStatus();renderRoster();
  if(editorOpen)render(true);
  window.dispatchEvent(new CustomEvent('playerprofileschange',{detail:{cloudRefresh:true}}));
 });
 window.addEventListener('playerprofilecloudstatuschange',savedStatus);
 window.addEventListener('playertraitssuggestionschange',event=>{
  sharedTraitSuggestions=Array.isArray(event.detail?.suggestions)?event.detail.suggestions:[];
  if(editorOpen&&person(current)?.team==='C')preserveDrafts(renderTraits);
 });
 window.addEventListener('playerkeywordsuggestionschange',event=>{
  sharedKeywordSuggestions=event.detail?.suggestions||{};
  if(editorOpen&&person(current)?.team!=='C')preserveDrafts(renderKeywords);
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
   choiceField('선호 리턴 자리','position',positions),
   choiceField('편한 플레이 위치','courtPreference',courtPreferences),
   choiceField('플레이 성향','style',styles),
   choiceField('잘 맞는 파트너','partnerRoles',partnerRoles,true,'복수 선택 · 함께 경기할 때 편한 역할을 골라 주세요.')
  );
  renderTraits();
  const preferences=el('div','profile-fields profile-fields-group');
  preferences.append(choiceField('경기·휴식 선호','restPreference',restPreferences));fields.append(preferences);
 }
function renderTraits(){
  const draft=$('profile-trait-text')?.value||'',parent=$('team-profile-fields');
  $('team-traits')?.remove();
  const section=el('section','team-traits keyword-section');section.id='team-traits';section.setAttribute('aria-label','특징');
  section.append(el('h3','','특징'),el('p','muted small','복수 입력 · 본인의 플레이 특징을 자유롭게 알려 주세요. 특징은 40자 이내, 최대 20개까지 추가할 수 있어요.'));
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
  const suggestions=el('div','keyword-suggestions');suggestions.setAttribute('aria-label','특징 빠른 추가');
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
   choiceField('플레이 성향','style',opponentStyles)
  );
  renderKeywords();
 }
 function renderKeywords(){
  const drafts=Object.fromEntries(Object.keys(keywordKinds).map(kind=>[kind,$('profile-keyword-text-'+kind)?.value||'']));
  const groups=$('opponent-keywords'),features=$('opponent-features');groups.replaceChildren();features.replaceChildren();
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
   input.placeholder={pattern:'서브 후 네트 접근, 포칭 등',weak:'몸쪽 공, 높은 백핸드 등',note:'왼손잡이, 슬라이스 서브 등'}[kind];
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
   for(const text of [...new Set([...keywordSuggestions[kind],...(sharedKeywordSuggestions[kind]||[])])]){
    const button=el('button','keyword-suggestion','＋ '+text);button.type='button';
    button.disabled=keywords.some(item=>item.text===text);
    button.addEventListener('click',()=>addKeyword(text));suggestions.append(button);
   }
   section.append(list,form,el('p','muted small','빠른 추가'),suggestions,status);(kind==='note'?features:groups).append(section);
  }
 }
 function preserveDrafts(operation){
  const drafts=[...editor.querySelectorAll('input')].filter(input=>input.type==='text').map(input=>({id:input.id,value:input.value}));
  const active=document.activeElement,focused=editor.contains(active)&&active.type==='text'?{id:active.id,start:active.selectionStart,end:active.selectionEnd}:null;
  operation();
  for(const draft of drafts){const input=$(draft.id);if(input)input.value=draft.value;}
  if(focused){const input=$(focused.id);if(input){input.focus({preventScroll:true});if(typeof focused.start==='number')input.setSelectionRange?.(focused.start,focused.end);}}
 }
 function render(keepDrafts=false){
  if(keepDrafts){preserveDrafts(()=>render());return;}
  const own=person(current).team==='C';
  $('rating-player-info').replaceChildren(el('span','',label(current)),tierBadge(current));
  $('profile-help').textContent=own
   ?'본인이 원하는 경기 방식을 알려 주세요. 선택하지 않은 항목이 있어도 괜찮아요.'
   :'실제로 본 플레이를 기록해 주세요. 잘 모르면 모르겠음으로 남겨 주세요. 키워드는 40자 이내, 선수당 총 20개까지 추가할 수 있어요.';
  $('team-profile-section').hidden=!own;$('opponent-profile-section').hidden=own;
  $('team-profile-fields').replaceChildren();$('opponent-profile-fields').replaceChildren();$('opponent-keywords').replaceChildren();$('opponent-features').replaceChildren();
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
    button.setAttribute('aria-pressed',String(player.id===current));button.setAttribute('aria-controls',mobile.matches?'player-detail-page':'ratings-panel');if(!mobile.matches)button.setAttribute('aria-haspopup','dialog');
    button.setAttribute('aria-label',label(player.id)+', '+tier(player.id)+', '+(team==='C'?'경기 선호 입력':'상대 선수 분석'));
    fillRosterCard(button,player.id);
    button.addEventListener('click',()=>{
     openEditor(player.id);
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
   ? [['리턴 자리',positions[info.position],'strong'],['편한 위치',courtPreferences[info.courtPreference],'note'],['특징',info.traits.join(', ')||'아직 입력 전','note']]
   :[['주로 쓰는',info.keywords.filter(item=>item.kind==='pattern').map(item=>item.text).join(', ')||'정보 없음','strong'],['어려워하는',info.keywords.filter(item=>item.kind==='weak').map(item=>item.text).join(', ')||'정보 없음','weak']];
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
 $('rating-close').addEventListener('click',returnToRoster);
 $('rating-back').addEventListener('click',returnToRoster);
 root.addEventListener('close',()=>{
  if(silentDialogCloses){silentDialogCloses--;return;}
  returnToRoster();
 });
 root.addEventListener('click',event=>{
  if(event.target!==root)return;
  const rect=root.getBoundingClientRect();
  if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)returnToRoster();
 });
 window.addEventListener('hashchange',syncPlayerRoute);
 window.addEventListener('popstate',syncPlayerRoute);
 $('profile-reset').addEventListener('click',()=>{delete profiles[current];persist();render();});
 savedStatus();renderRoster();
 window.PLAYER_PROFILES.all=()=>Object.fromEntries(roster.map(player=>[player.id,JSON.parse(JSON.stringify(profile(player.id)))]));
 syncPlayerRoute();
 window.dispatchEvent(new CustomEvent('playerprofilesready'));
})();
