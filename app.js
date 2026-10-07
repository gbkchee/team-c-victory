'use strict';
(() => {
const data=window.BOARD_DATA, $=id=>document.getElementById(id);
const errors=validateBoard(data);
if(errors.length){$('validation').textContent='편성 검증 실패';$('matches').textContent=errors.join(' / ');return;}
$('validation').textContent='4개 전략 · 검증 완료';
let state={page:'players',strategy:'balance',match:1,filter:'all',p1:'',p2:''};
const pageTabs=[...document.querySelectorAll('.page-tab')];
const selections=new Map();
const strategy=()=>data.strategies.find(s=>s.id===state.strategy);
const match=()=>strategy().matches.find(m=>m.id===state.match);
const key=()=>`${state.strategy}:${state.match}`;
function readHash(){
 const q=new URLSearchParams(location.hash.slice(1));
 const s=data.strategies.find(s=>s.id===q.get('strategy'))||data.strategies[0];
 const m=s.matches.find(m=>m.id===Number(q.get('match')))||s.matches[0];
 const filter=['A','B','D'].includes(q.get('filter'))?q.get('filter'):'all';
 const page=['players','strategy'].includes(q.get('page'))?q.get('page'):q.has('strategy')?'strategy':'players';
 state={page,strategy:s.id,match:m.id,filter:filter==='all'||filter===m.team?filter:'all',p1:'',p2:''};
 const names=Object.keys(data.teams[m.team]);
 if(names.includes(q.get('p1')))state.p1=q.get('p1');
 if(names.includes(q.get('p2'))&&q.get('p2')!==state.p1)state.p2=q.get('p2');
 selections.set(key(),[state.p1,state.p2]);
}
function writeHash(){
 const q=new URLSearchParams({page:state.page,strategy:state.strategy,match:String(state.match),filter:state.filter});
 if(state.p1)q.set('p1',state.p1);if(state.p2)q.set('p2',state.p2);
 try{history.replaceState(null,'',`#${q}`);}catch{}
}
function renderPage(){
 pageTabs.forEach(tab=>{
  const active=tab.dataset.page===state.page;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
  $(tab.getAttribute('aria-controls')).hidden=!active;
 });
 $('share').hidden=state.page!=='strategy';
}
pageTabs.forEach((tab,index)=>{
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
});
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function button(text,active,action,cls){const b=el('button',cls,text);b.type='button';b.setAttribute('aria-pressed',String(active));b.addEventListener('click',action);return b;}
function restoreSelection(){[state.p1,state.p2]=selections.get(key())||['',''];}
function playerCard(name,team){
 const p=data.teams[team][name],profile=window.PLAYER_PROFILES.get(team,name),model=window.PLAYER_PROFILE_MODEL,card=el('div','player');card.append(el('strong','',name.replace(/\s*\(시트:.*\)$/,'')));
 const tier=el('span','grade-badge player-tier',{forty:'4️⃣',thirty:'3️⃣',love:'🫶'}[p.tier]||'❔'),label={forty:'포티',thirty:'써티',love:'러브'}[p.tier]||'등급 미확인';
 tier.title=label;tier.setAttribute('role','img');tier.setAttribute('aria-label',label);card.append(tier);
 if(team==='C'){
  card.append(el('p','',`선호 포지션 · ${model.positions[profile.position]}`),el('p','',`게임 스타일 · ${model.styles[profile.style]}`));
  card.append(el('p','strength',`요즘 자신 있는 · ${profile.confidentSkills.map(key=>model.skills[key]).join(', ')||'아직 선택 전'}`));
  card.append(el('p','',`파트너에게 바라는 역할 · ${profile.partnerRoles.map(key=>model.partnerRoles[key]).join(', ')||'아직 선택 전'}`));
  card.append(el('p','',`경기·휴식 · ${model.restPreferences[profile.restPreference]}`));
 }else{
  card.append(el('p','',`포·백 성향 · ${model.opponentPositions[profile.tendency]}`),el('p','',`게임 스타일 · ${model.opponentStyles[profile.style]}`));
  for(const [kind,title] of Object.entries(model.keywordKinds))card.append(el('p',kind==='strong'?'strength':kind==='weak'?'weakness':'',`${title} · ${profile.keywords.filter(item=>item.kind===kind).map(item=>item.text).join(', ')||'정보 없음'}`));
 }return card;
}
function ownPlan(m){
 const notes=['서로 원하는 파트너 역할을 확인하고, 중앙 공·로브 담당과 콜을 경기 전에 정하세요.'];
 const ps=m.pair.map(name=>window.PLAYER_PROFILES.get('C',name));
 if(ps.some(p=>p.restPreference==='rest'))notes.push('중간 휴식을 선호하는 선수가 있어 경기 사이 회복 시간을 함께 확인하세요.');
 if(ps.some(p=>p.restPreference==='continuous'))notes.push('예열된 상태를 유지할 수 있도록 대기 중에도 가볍게 몸을 풀어 주세요.');
 if(ps.some(p=>p.restPreference==='condition'))notes.push('오늘 컨디션과 휴식 필요 여부를 함께 확인하세요.');
 return notes.join(' ');
}
function submissionTime(time){const [h,m]=time.split(':').map(Number);const n=h*60+m-10;return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
function renderOpponents(){
 const m=match(), names=Object.keys(data.teams[m.team]);
 for(const [id,value,other] of [['opponent1',state.p1,state.p2],['opponent2',state.p2,state.p1]]){
  const select=$(id);select.replaceChildren(new Option('선택하세요',''));
  names.forEach(name=>{const option=new Option(name,name);option.disabled=name===other;select.add(option);});select.value=value;
 }
 $('opponent-detail').replaceChildren();$('tactics').replaceChildren();
 if(!state.p1||!state.p2){$('tactics').append(el('p','empty',`${m.team}조 선수 2명을 선택하면 조합별 대응 포인트가 표시됩니다.`));return;}
 const cards=el('div','players');cards.append(playerCard(state.p1,m.team),playerCard(state.p2,m.team));$('opponent-detail').append(cards);
 const combo=data.combos[m.team].find(c=>c.pair.includes(state.p1)&&c.pair.includes(state.p2));
 const panel=el('div','tactics');panel.append(el('h3','',`${state.p1} + ${state.p2} · 대응 포인트`),el('p','muted small','기존 시트 기준의 공략 메모입니다. 새 키워드에 따른 자동 분석은 아직 연결되지 않았습니다.'));const list=el('ul');
 (combo?.points.length?combo.points:['정보 없음 · 초반 중앙 깊은 공으로 특성을 확인하세요.']).forEach(t=>list.append(el('li','',t)));panel.append(list);$('tactics').append(panel);
}
function render(){
 $('strategies').replaceChildren();
 data.strategies.forEach(s=>{const b=button('',state.strategy===s.id,()=>{state.strategy=s.id;restoreSelection();render();},'strategy-button');b.append(el('strong','',s.title),el('span','',s.subtitle));$('strategies').append(b);});
 $('strategy-description').textContent=strategy().description;
 $('filters').replaceChildren();
 ['all','A','B','D'].forEach(f=>$('filters').append(button(f==='all'?'전체':`${f}조`,state.filter===f,()=>{state.filter=f;if(f!=='all'&&match().team!==f){state.match=strategy().matches.find(m=>m.team===f).id;restoreSelection();}render();})));
 $('matches').replaceChildren();
 strategy().matches.filter(m=>state.filter==='all'||m.team===state.filter).forEach(m=>{
  const b=button('',state.match===m.id,()=>{state.match=m.id;restoreSelection();render();},'match-button');b.dataset.match=String(m.id);b.setAttribute('aria-label',`C${m.id}, ${m.time}, ${m.pair.join(' + ')}, 상대 ${m.team}조`);
  const top=el('span','match-top');top.append(el('span','',`C${m.id} · ${m.time}`),el('span','',`vs ${m.team}`));b.append(top,el('span','match-pair',m.pair.join(' + ')));$('matches').append(b);
 });
 const m=match();$('match-detail').replaceChildren(el('span','badge',`C${m.id} · ${m.time} · vs ${m.team}조`),el('h2','detail-title',m.pair.join(' + ')),el('p','muted small',`${submissionTime(m.time)}까지 출전 선수 제출 · 양팀 제출 후 공개`));
 const cards=el('div','players');m.pair.forEach(p=>cards.append(playerCard(p,'C')));$('match-detail').append(cards,el('p','own-plan',ownPlan(m)));
 const counts=el('div','count-grid');Object.keys(data.teams.C).forEach(p=>counts.append(el('span','',`${p} · ${strategy().matches.filter(m=>m.pair.includes(p)).length}경기`)));$('counts').replaceChildren(counts);
 renderOpponents();renderPage();writeHash();
}
for(const [id,field] of [['opponent1','p1'],['opponent2','p2']])$(id).addEventListener('change',()=>{state[field]=$(id).value;selections.set(key(),[state.p1,state.p2]);renderOpponents();writeHash();});
window.addEventListener('hashchange',()=>{readHash();render();});
window.addEventListener('playerprofileschange',()=>render());
$('share').addEventListener('click',async()=>{
 if(!/^https?:$/.test(location.protocol)){
  $('share-status').textContent='이 HTML 파일을 카카오톡 채팅방에 첨부해 공유하세요. 파일에서 선택한 상태는 받는 사람에게 전달되지 않습니다.';
  $('share-fallback').hidden=true;
  return;
 }
 try{await navigator.clipboard.writeText(location.href);$('share-status').textContent='현재 전략·경기·상대 선택 링크를 복사했습니다.';$('share-fallback').hidden=true;}
 catch{$('share-fallback').hidden=false;$('share-url').value=location.href;$('share-url').focus();$('share-url').select();$('share-status').textContent='아래 링크를 복사해 공유하세요.';}
});
readHash();render();
if($('interactive-app')){
 $('interactive-app').hidden=false;
 $('document-view').hidden=true;
 $('view-toggle').hidden=false;
 $('share').hidden=false;
 if(!/^https?:$/.test(location.protocol))$('share').textContent='파일 공유 안내';
 $('view-toggle').addEventListener('click',()=>{
  const showDocument=$('document-view').hidden;
  $('document-view').hidden=!showDocument;
  $('interactive-app').hidden=showDocument;
  $('view-toggle').textContent=showDocument?'선택형 보드로 돌아가기':'전체 문서 펼쳐보기';
 });
}
})();
