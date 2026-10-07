'use strict';
(() => {
 const axes=[
  {key:'serve',name:'서브',help:'넣는 안정성, 더블폴트, 코스·구질 활용을 봅니다.'},
  {key:'forehand',name:'포핸드',help:'포핸드 연결의 안정성, 방향과 깊이 조절을 봅니다.'},
  {key:'backhand',name:'백핸드',help:'백핸드 연결의 안정성, 방향과 깊이 조절을 봅니다.'},
  {key:'forehandVolley',name:'포발리',help:'포핸드 발리로 연결하고 원하는 코스로 보내는 정도를 봅니다.'},
  {key:'backhandVolley',name:'백발리',help:'백핸드 발리로 연결하고 원하는 코스로 보내는 정도를 봅니다.'},
  {key:'slice',name:'슬라이스',help:'공을 낮게 연결하고 속도·깊이를 조절해 활용하는 정도를 봅니다.'},
  {key:'lob',name:'로브',help:'전위 뒤로 띄우는 높이·깊이 조절과 수비 상황 활용을 봅니다.'},
  {key:'smash',name:'스매시',help:'높은 공에 자리 잡고 안정적으로 연결하거나 마무리하는 정도를 봅니다.'},
  {key:'coverage',name:'코트커버',help:'반응·이동과 자기 구역, 파트너의 빈 공간을 커버하는 정도를 봅니다.'},
  {key:'stamina',name:'체력',help:'한 경기와 여러 경기에서 움직임을 유지하는 정도를 봅니다.'},
  {key:'mental',name:'멘탈',help:'실수나 중요한 점수 뒤에도 집중과 침착함을 유지하는 정도를 봅니다.'}
 ];
 const legacyKeys=['serve','stroke','volley','coverage','stamina'];
 const positions={'':'미선택',fore:'포',back:'백',either:'상관없음'};
 const styles={attack:'공격형',defense:'수비형',unknown:'모르겠음'};
 const keywordKinds={strong:'강점',weak:'약점',note:'특징'};
 const validScore=value=>Number.isFinite(value)&&value>=1&&value<=5&&Number.isInteger(value*2);
 function cleanKeywords(raw){
  const seen=new Set(),result=[];
  for(const item of raw){
   if(!item||!Object.hasOwn(keywordKinds,item.kind)||typeof item.text!=='string')continue;
   const text=item.text.normalize('NFC').trim().replace(/\s+/g,' ').slice(0,40),key=item.kind+':'+text;
   if(!text||seen.has(key))continue;
   seen.add(key);result.push({kind:item.kind,text});if(result.length===20)break;
  }
  return result;
 }
 function cleanProfile(raw,initialKeywords=[]){
  const ratings=Object.fromEntries(axes.map(axis=>[axis.key,null]));
  // Preserve original combined scores without guessing the newly split skills.
  const saved=raw?.ratings&&typeof raw.ratings==='object'&&!Array.isArray(raw.ratings)
   ?raw.ratings
   :Array.isArray(raw?.scores)&&raw.scores.length===legacyKeys.length
    ?Object.fromEntries(legacyKeys.map((key,index)=>[key,raw.scores[index]])):{};
  for(const key of new Set([...axes.map(axis=>axis.key),...legacyKeys])){
   if(Object.hasOwn(saved,key))ratings[key]=validScore(saved[key])?saved[key]:null;
  }
  return {
   ratings,
   position:Object.hasOwn(positions,raw?.position)?raw.position:'',
   style:Object.hasOwn(styles,raw?.style)?raw.style:'unknown',
   keywords:cleanKeywords(Array.isArray(raw?.keywords)?raw.keywords:initialKeywords)
  };
 }
 const model={axes,positions,styles,keywordKinds,validScore,cleanProfile};
 if(typeof module==='object'&&module.exports)module.exports=model;
 else window.PLAYER_RATINGS_MODEL=model;
})();
if(typeof document!=='undefined')(() => {
 const root=document.getElementById('ratings-panel');if(!root)return;
 const {axes,positions,styles,keywordKinds,cleanProfile}=window.PLAYER_RATINGS_MODEL;
 const data=window.BOARD_DATA;
 const tiers={forty:'포티',thirty:'써티',love:'러브'};
 const tierSymbols={forty:'4️⃣',thirty:'3️⃣',love:'🫶'};
 const tierOrder={forty:0,thirty:1,love:2};
 const collator=new Intl.Collator('ko');
 const displayName=name=>name.replace(/\s*\(시트:.*\)$/,'');
 const roster=Object.entries(data.teams).flatMap(([team,players])=>Object.keys(players).map(name=>({
  id:team+':'+name,team,name,displayName:displayName(name),tier:players[name].tier
 }))).sort((a,b)=>a.team.localeCompare(b.team)||(tierOrder[a.tier]??3)-(tierOrder[b.tier]??3)||collator.compare(a.displayName,b.displayName));
 const allowed=new Set(roster.map(player=>player.id));
 const storageKey='courtside.player-ratings.v2',legacyStorageKey='courtside.player-pentagons.v1';
 let profiles={},saveAvailable=true,current='',compare='',lastTrigger=null;
 const $=id=>document.getElementById(id);
 const person=id=>roster.find(player=>player.id===id);
 const label=id=>{const player=person(id);return player.team+'조 '+player.displayName;};
 const tier=id=>tiers[person(id).tier]||'등급 미확인';
 const tierSymbol=id=>tierSymbols[person(id).tier]||'❔';
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
 function initialKeywords(id){
  const player=person(id);if(!player)return [];
  const info=data.teams[player.team][player.name];
  return [
   ...info.strong.map(text=>({kind:'strong',text})),
   ...info.weak.map(text=>({kind:'weak',text})),
   ...info.note.split(' · ').filter(text=>text&&!text.includes('정보 없음')).map(text=>({kind:'note',text}))
  ];
 }
 try{
  const saved=JSON.parse(localStorage.getItem(storageKey)??localStorage.getItem(legacyStorageKey)??'{}');
  if(saved&&typeof saved==='object'&&!Array.isArray(saved)){
   for(const [id,raw] of Object.entries(saved))if(allowed.has(id))profiles[id]=cleanProfile(raw,initialKeywords(id));
  }
 }catch{saveAvailable=false;}
 const profile=id=>profiles[id]||cleanProfile(null,initialKeywords(id));
 function tierBadge(id){
  const badge=el('span','grade-badge',tierSymbol(id));
  badge.title=tier(id);badge.setAttribute('role','img');badge.setAttribute('aria-label',tier(id));return badge;
 }
 function persist(){
  try{localStorage.setItem(storageKey,JSON.stringify(profiles));saveAvailable=true;}catch{saveAvailable=false;}
  $('rating-save-status').textContent=saveAvailable?'이 브라우저에 저장했습니다.':'이 환경에서는 저장할 수 없어 현재 창에서만 유지됩니다.';
 }
 function update(patch){profiles[current]={...profile(current),...patch};persist();drawComparison();}
 function populateComparison(){
  const select=$('rating-compare');select.replaceChildren();select.add(new Option('비교 안 함',''));
  for(const team of ['C','A','B','D']){
   const group=el('optgroup');group.label=team+'조';
   for(const player of roster.filter(item=>item.team===team)){
    const option=new Option(player.displayName+' · '+tierSymbol(player.id),player.id);
    option.title=tier(player.id);option.setAttribute('aria-label',player.displayName+' · '+tier(player.id));
    option.disabled=player.id===current;group.append(option);
   }
   select.append(group);
  }
  select.value=compare;
 }
 function drawComparison(){
  const panel=$('rating-comparison-panel');panel.replaceChildren();panel.hidden=!compare;if(!compare)return;
  const own=profile(current),other=profile(compare),table=el('table','rating-comparison');
  table.append(el('caption','',label(current)+' · '+label(compare)+' 비교'));
  const head=el('thead'),heading=el('tr');
  ['항목',person(current).displayName,person(compare).displayName].forEach(text=>{
   const cell=el('th','',text);cell.scope='col';heading.append(cell);
  });
  head.append(heading);table.append(head);
  const rows=[
   ['대회 등급',tier(current),tier(compare)],
   ...axes.map(axis=>[axis.name,own.ratings[axis.key]??'미입력',other.ratings[axis.key]??'미입력']),
   ['선호 포지션',positions[own.position],positions[other.position]],
   ['게임 스타일',styles[own.style],styles[other.style]],
   ['키워드',... [own,other].map(item=>item.keywords.map(keyword=>keywordKinds[keyword.kind]+': '+keyword.text).join(', ')||'정보 없음')]
  ];
  const body=el('tbody');
  for(const [name,a,b] of rows){
   const row=el('tr'),heading=el('th','',name),first=el('td'),second=el('td');heading.scope='row';
   if(name==='대회 등급'){first.append(tierBadge(current));second.append(tierBadge(compare));}
   else{first.textContent=a;second.textContent=b;}
   row.append(heading,first,second);body.append(row);
  }
  table.append(body);panel.append(table);
 }
 function renderKeywords(){
  const list=$('rating-keywords');list.replaceChildren();
  profile(current).keywords.forEach((keyword,index)=>{
   const chip=el('span','keyword-chip keyword-'+keyword.kind),remove=el('button','keyword-remove','×');
   remove.type='button';remove.setAttribute('aria-label',keyword.text+' 키워드 삭제');
   remove.addEventListener('click',()=>{
    update({keywords:profile(current).keywords.filter((_,i)=>i!==index)});renderKeywords();
    $('rating-keyword-status').textContent='키워드를 삭제했습니다.';
   });
   chip.append(el('span','',keywordKinds[keyword.kind]+' · '+keyword.text),remove);list.append(chip);
  });
  if(!profile(current).keywords.length)list.append(el('p','muted small','기록된 키워드가 없습니다. 알고 있는 특징을 추가하세요.'));
 }
 function renderSliders(){
  const controls=$('rating-inputs');controls.replaceChildren();
  axes.forEach(axis=>{
   const row=el('div','rating-input'),heading=el('div','rating-input-heading');
   const name=el('label','rating-axis-name',axis.name),output=el('output','rating-value');
   const slider=el('input','rating-slider'),clear=el('button','rating-clear','미입력으로');
   slider.type='range';slider.min='1';slider.max='5';slider.step='0.5';slider.id='rating-axis-'+axis.key;
   name.htmlFor=slider.id;output.setAttribute('for',slider.id);clear.type='button';clear.setAttribute('aria-label',axis.name+' 점수 미입력으로 변경');
   function refresh(){
    const value=profile(current).ratings[axis.key];
    slider.value=String(value??1);slider.classList.toggle('is-unrated',value===null);
    slider.style.setProperty('--rating-fill',value===null?'0%':((value-1)/4*100)+'%');
    slider.setAttribute('aria-valuetext',value===null?'미입력':String(value)+'점');
    output.textContent=value??'미입력';output.classList.toggle('is-unrated',value===null);clear.disabled=value===null;
   }
   function commit(value){
    update({ratings:{...profile(current).ratings,[axis.key]:value}});refresh();
   }
   slider.addEventListener('input',()=>commit(Number(slider.value)));
   // The first notch can be selected even when the untouched thumb is already at 1.
   slider.addEventListener('pointerup',()=>{if(profile(current).ratings[axis.key]===null)commit(Number(slider.value));});
   slider.addEventListener('keyup',event=>{
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)&&profile(current).ratings[axis.key]===null)commit(Number(slider.value));
   });
   clear.addEventListener('click',()=>{commit(null);slider.focus();});
   const ticks=el('div','rating-ticks');ticks.setAttribute('aria-hidden','true');
   for(let value=1;value<=5;value+=0.5)ticks.append(el('span','',String(value)));
   heading.append(name,output,clear);row.append(heading,slider,ticks);controls.append(row);refresh();
  });
 }
 function render(){
  populateComparison();
  $('rating-player-info').replaceChildren(el('span','',label(current)),tierBadge(current));
  $('rating-keyword-text').value='';$('rating-keyword-status').textContent='';renderSliders();renderKeywords();
  for(const [id,field,options] of [['rating-position','position',positions],['rating-style','style',styles]]){
   const select=$(id);select.replaceChildren();Object.entries(options).forEach(([value,name])=>select.add(new Option(name,value)));
   select.value=profile(current)[field];
  }
  drawComparison();
 }
 function renderRoster(){
  const groups=$('player-roster');groups.replaceChildren();
  for(const team of ['A','B','C','D']){
   const players=roster.filter(player=>player.team===team),section=el('section','roster-team');
   const heading=el('div','roster-team-heading'),list=el('ul','roster-players');
   heading.append(el('h3','',team+'조'),el('span','roster-count',players.length+'명'));section.append(heading);
   players.forEach(player=>{
    const item=el('li'),button=el('button','roster-player');button.type='button';button.dataset.player=player.id;
    button.setAttribute('aria-pressed',String(player.id===current));button.setAttribute('aria-controls','ratings-panel');button.setAttribute('aria-haspopup','dialog');
    button.setAttribute('aria-label',label(player.id)+', '+tier(player.id)+', 능력치 확인 및 수정');
    const separator=el('span','roster-separator','|');separator.setAttribute('aria-hidden','true');
    button.append(el('strong','roster-name',player.displayName),separator,tierBadge(player.id));
    button.addEventListener('click',()=>{
     current=player.id;if(compare===current)compare='';lastTrigger=button;render();
     groups.querySelectorAll('.roster-player').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.player===current)));
     root.showModal();document.body.classList.add('player-dialog-open');$('rating-player-info').focus({preventScroll:true});
    });
    item.append(button);list.append(item);
   });
   section.append(list);groups.append(section);
  }
 }
 $('rating-axis-help').replaceChildren(...axes.map(axis=>el('li','',axis.name+': '+axis.help)));
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
 window.addEventListener('hashchange',()=>{if(root.open&&$('page-players').hidden)root.close();});
 $('rating-compare').addEventListener('change',()=>{compare=$('rating-compare').value;drawComparison();});
 $('rating-position').addEventListener('change',()=>update({position:$('rating-position').value}));
 $('rating-style').addEventListener('change',()=>update({style:$('rating-style').value}));
 $('rating-reset').addEventListener('click',()=>{delete profiles[current];persist();render();});
 $('rating-keyword-form').addEventListener('submit',event=>{
  event.preventDefault();
  const input=$('rating-keyword-text'),text=input.value.normalize('NFC').trim().replace(/\s+/g,' ');
  const kind=$('rating-keyword-kind').value,keywords=profile(current).keywords,status=$('rating-keyword-status');
  if(!text){status.textContent='키워드를 입력하세요.';return;}
  if(text.length>40){status.textContent='키워드는 40자 이내로 입력하세요.';return;}
  if(keywords.length>=20){status.textContent='키워드는 선수당 20개까지 입력할 수 있습니다.';return;}
  if(keywords.some(keyword=>keyword.text===text&&keyword.kind===kind)){status.textContent='이미 등록한 키워드입니다.';return;}
  update({keywords:[...keywords,{kind,text}]});renderKeywords();input.value='';status.textContent='키워드를 추가했습니다.';input.focus();
 });
 $('rating-save-status').textContent=saveAvailable?'입력값은 내 브라우저에 저장되며 공유 링크에 포함되지 않습니다.':'이 환경에서는 저장할 수 없어 현재 창에서만 유지됩니다.';
 renderRoster();
})();
