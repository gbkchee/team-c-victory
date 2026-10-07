'use strict';
(() => {
const data=window.BOARD_DATA, $=id=>document.getElementById(id);
const errors=validateBoard(data);
if(errors.length){$('validation').textContent='편성 검증 실패';$('matches').textContent=errors.join(' / ');return;}
$('validation').textContent='4개 전략 · 검증 완료';
let state={strategy:'balance',match:1,filter:'all',p1:'',p2:''};
const selections=new Map();
const strategy=()=>data.strategies.find(s=>s.id===state.strategy);
const match=()=>strategy().matches.find(m=>m.id===state.match);
const key=()=>`${state.strategy}:${state.match}`;
function readHash(){
 const q=new URLSearchParams(location.hash.slice(1));
 const s=data.strategies.find(s=>s.id===q.get('strategy'))||data.strategies[0];
 const m=s.matches.find(m=>m.id===Number(q.get('match')))||s.matches[0];
 const filter=['A','B','D'].includes(q.get('filter'))?q.get('filter'):'all';
 state={strategy:s.id,match:m.id,filter:filter==='all'||filter===m.team?filter:'all',p1:'',p2:''};
 const names=Object.keys(data.teams[m.team]);
 if(names.includes(q.get('p1')))state.p1=q.get('p1');
 if(names.includes(q.get('p2'))&&q.get('p2')!==state.p1)state.p2=q.get('p2');
 selections.set(key(),[state.p1,state.p2]);
}
function writeHash(){
 const q=new URLSearchParams({strategy:state.strategy,match:String(state.match),filter:state.filter});
 if(state.p1)q.set('p1',state.p1);if(state.p2)q.set('p2',state.p2);
 try{history.replaceState(null,'',`#${q}`);}catch{}
}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function button(text,active,action,cls){const b=el('button',cls,text);b.type='button';b.setAttribute('aria-pressed',String(active));b.addEventListener('click',action);return b;}
function restoreSelection(){[state.p1,state.p2]=selections.get(key())||['',''];}
function playerCard(name,team){
 const p=data.teams[team][name], card=el('div','player');card.append(el('strong','',name));
 card.append(el('p','strength',`강점 · ${p.strong.join(', ')||'정보 없음'}`));
 card.append(el('p','weakness',`약점 · ${p.weak.join(', ')||'정보 없음'}`));
 if(p.note)card.append(el('p','',p.note));return card;
}
function ownPlan(m){
 const notes=['중앙 공과 로브 담당, 콜을 경기 전에 정하세요.'];
 const ps=m.pair.map(n=>data.teams.C[n]);
 if(ps.some(p=>p.weak.some(w=>w.includes('체력'))))notes.push('체력 부담을 확인하며 포인트 사이 호흡과 수분을 챙기세요.');
 if(ps.some(p=>p.weak.some(w=>w.includes('늦게 풀림')||w.includes('긴장'))))notes.push('충분히 워밍업하고 초반에는 큰 목표로 리턴을 연결하세요.');
 if(ps.some(p=>p.weak.some(w=>w.includes('서브 에러'))))notes.push('서브는 무리한 속도보다 성공률을 우선하세요.');
 if(m.pair.includes('숭')&&m.pair.includes('만두'))notes.push('숭의 백핸드·백발리와 만두의 포핸드·포발리 역할을 활용하세요.');
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
 const panel=el('div','tactics');panel.append(el('h3','',`${state.p1} + ${state.p2} · 대응 포인트`));const list=el('ul');
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
 renderOpponents();writeHash();
}
for(const [id,field] of [['opponent1','p1'],['opponent2','p2']])$(id).addEventListener('change',()=>{state[field]=$(id).value;selections.set(key(),[state.p1,state.p2]);renderOpponents();writeHash();});
window.addEventListener('hashchange',()=>{readHash();render();});
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
