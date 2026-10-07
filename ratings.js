'use strict';
(() => {
const root=document.getElementById('ratings-panel');if(!root)return;
const data=window.BOARD_DATA;
const axes=['서브','스트로크','발리','코트커버','체력'];
const levels={1:'잘 못 함',2:'자신 없음',3:'게임에서 사용',4:'게임에서 자신 있게 사용',5:'이 구역 최고 권위자'};
const tiers={forty:'포티',thirty:'써티',love:'러브'};
const tierSymbols={forty:'4️⃣',thirty:'3️⃣',love:'🫶'};
const keywordKinds={strong:'강점',weak:'약점',note:'특징'};
const positions={'':'미선택',fore:'포',back:'백',either:'상관없음'};
const styles={attack:'공격형',defense:'수비형',unknown:'모르겠음'};
const roster=Object.entries(data.teams).flatMap(([team,players])=>Object.keys(players).map(name=>({id:`${team}:${name}`,team,name})));
const allowed=new Set(roster.map(p=>p.id)),storageKey='courtside.player-pentagons.v1';
let profiles={},saveAvailable=true,current='',compare='';
function initialKeywords(id){
 const player=roster.find(p=>p.id===id);if(!player)return [];
 const info=data.teams[player.team][player.name];
 return [...info.strong.map(text=>({kind:'strong',text})),...info.weak.map(text=>({kind:'weak',text})),...info.note.split(' · ').filter(text=>text&&!text.includes('정보 없음')).map(text=>({kind:'note',text}))];
}
function cleanKeywords(raw){
 const seen=new Set(),result=[];
 for(const item of raw){
  if(!item||!Object.hasOwn(keywordKinds,item.kind)||typeof item.text!=='string')continue;
  const text=item.text.normalize('NFC').trim().replace(/\s+/g,' ').slice(0,40),key=`${item.kind}:${text}`;
  if(!text||seen.has(key))continue;
  seen.add(key);result.push({kind:item.kind,text});if(result.length===20)break;
 }return result;
}
function cleanProfile(p,id){
 const raw=Array.isArray(p?.scores)&&p.scores.length===5?p.scores:Array(5).fill(null);
 return {scores:raw.map(v=>Number.isInteger(v)&&v>=1&&v<=5?v:null),position:Object.hasOwn(positions,p?.position)?p.position:'',style:Object.hasOwn(styles,p?.style)?p.style:'unknown',keywords:cleanKeywords(Array.isArray(p?.keywords)?p.keywords:initialKeywords(id))};
}
try{
 const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');
 if(saved&&typeof saved==='object')for(const [id,p] of Object.entries(saved))if(allowed.has(id))profiles[id]=cleanProfile(p,id);
}catch{saveAvailable=false;}
const $=id=>document.getElementById(id);
const profile=id=>profiles[id]||cleanProfile(null,id);
const person=id=>roster.find(p=>p.id===id);
const label=id=>{const p=person(id);return `${p.team}조 ${p.name}`;};
const tier=id=>{const p=person(id);return tiers[data.teams[p.team][p.name].tier]||'등급 미확인';};
const tierSymbol=id=>{const p=person(id);return tierSymbols[data.teams[p.team][p.name].tier]||'❔';};
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
function tierBadge(id){const badge=el('span','badge grade-badge',tierSymbol(id));badge.title=tier(id);badge.setAttribute('role','img');badge.setAttribute('aria-label',tier(id));return badge;}
function persist(){
 try{localStorage.setItem(storageKey,JSON.stringify(profiles));saveAvailable=true;}catch{saveAvailable=false;}
 $('rating-save-status').textContent=saveAvailable?'이 브라우저에 저장했습니다.':'이 환경에서는 저장할 수 없어 현재 창에서만 유지됩니다.';
}
function update(patch){profiles[current]={...profile(current),...patch};persist();draw();}
function populate(select,selected,empty,exclude){
 select.replaceChildren();if(empty)select.add(new Option('비교 안 함',''));
 for(const team of ['C','A','B','D']){const group=document.createElement('optgroup');group.label=`${team}조`;
  roster.filter(p=>p.team===team).forEach(p=>{const option=new Option(`${p.name} · ${tierSymbol(p.id)}`,p.id);option.title=tier(p.id);option.setAttribute('aria-label',`${p.name} · ${tier(p.id)}`);option.disabled=p.id===exclude;group.append(option);});select.append(group);
 }select.value=selected;
}
function svgNode(tag,attrs,text){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
function point(index,radius){const angle=-Math.PI/2+index*2*Math.PI/5;return [170+Math.cos(angle)*radius,155+Math.sin(angle)*radius];}
function polygon(rs){return rs.map((r,i)=>point(i,r).map(v=>v.toFixed(2)).join(',')).join(' ');}
function draw(){
 const svg=svgNode('svg',{viewBox:'0 0 340 310',class:'radar',role:'img','aria-label':`${label(current)}의 항목별 5각형${compare?`, ${label(compare)}와 비교`:''}`});
 for(let level=1;level<=5;level++)svg.append(svgNode('polygon',{points:polygon(Array(5).fill(level*20)),fill:'none',stroke:'var(--line)','stroke-width':1}));
 axes.forEach((name,i)=>{const [x,y]=point(i,100),[tx,ty]=point(i,130);svg.append(svgNode('line',{x1:170,y1:155,x2:x,y2:y,stroke:'var(--line)'}));svg.append(svgNode('text',{x:tx,y:ty,'text-anchor':'middle','dominant-baseline':'middle',fill:'var(--muted)','font-size':12},name));});
 const legend=el('div','radar-legend');
 for(const [id,color] of [[current,'var(--navy)'],[compare,'var(--gold)']])if(id){
  const p=profile(id),v=p.scores,complete=v.every(n=>n!==null),item=el('span'),swatch=el('span','legend-swatch');swatch.style.backgroundColor=color;swatch.setAttribute('aria-hidden','true');item.append(swatch,el('span','',`${label(id)} · ${v.filter(n=>n!==null).length}/5 입력`));legend.append(item);
  if(complete){
   const points=polygon(v.map(n=>n*20));
   if(id===compare)svg.append(svgNode('polygon',{points,fill:color,'fill-opacity':'.15',stroke:'var(--navy)','stroke-width':4.5}));
   svg.append(svgNode('polygon',{points,fill:id===compare?'none':color,'fill-opacity':'.15',stroke:color,'stroke-width':2.5}));
  }
  v.forEach((n,i)=>{if(n!==null){const [x,y]=point(i,n*20);svg.append(svgNode('circle',{cx:x,cy:y,r:4,fill:color,stroke:'var(--navy)','stroke-width':1}));}});
 }
 const chart=$('rating-chart');chart.replaceChildren(svg,legend,el('p','muted small','5개 항목을 모두 입력하면 5각형이 연결됩니다. 미입력은 낮은 점수를 뜻하지 않습니다.'));
 const own=profile(current),preferences=el('p','rating-preferences');preferences.append(el('span','',`${label(current)} · `),tierBadge(current),el('span','',` · 선호 포지션: ${positions[own.position]} · 성향: ${styles[own.style]}`));chart.append(preferences);
 if(compare){const table=el('table','rating-comparison');table.append(el('caption','',`${label(current)} · ${label(compare)} 비교`));
  const head=el('thead'),hr=el('tr');['항목',person(current).name,person(compare).name].forEach(t=>{const th=el('th','',t);th.scope='col';hr.append(th);});head.append(hr);table.append(head);
  const body=el('tbody'),other=profile(compare);
  const rows=[['대회 등급',tier(current),tier(compare)],...axes.map((name,i)=>[name,own.scores[i]??'미입력',other.scores[i]??'미입력']),['선호 포지션',positions[own.position],positions[other.position]],['플레이 성향',styles[own.style],styles[other.style]],['키워드',own.keywords.map(k=>`${keywordKinds[k.kind]}: ${k.text}`).join(', ')||'정보 없음',other.keywords.map(k=>`${keywordKinds[k.kind]}: ${k.text}`).join(', ')||'정보 없음']];
  rows.forEach(([name,a,b])=>{const tr=el('tr'),th=el('th','',name);th.scope='row';const first=el('td'),second=el('td');if(name==='대회 등급'){first.append(tierBadge(current));second.append(tierBadge(compare));}else{first.textContent=a;second.textContent=b;}tr.append(th,first,second);body.append(tr);});table.append(body);chart.append(table);
 }
}
function renderKeywords(){
 const list=$('rating-keywords');list.replaceChildren();
 profile(current).keywords.forEach((keyword,index)=>{
  const chip=el('span',`keyword-chip keyword-${keyword.kind}`),remove=el('button','keyword-remove','×');remove.type='button';remove.setAttribute('aria-label',`${keyword.text} 키워드 삭제`);
  remove.addEventListener('click',()=>{update({keywords:profile(current).keywords.filter((_,i)=>i!==index)});renderKeywords();$('rating-keyword-status').textContent='키워드를 삭제했습니다.';});
  chip.append(el('span','',`${keywordKinds[keyword.kind]} · ${keyword.text}`),remove);list.append(chip);
 });
 if(!profile(current).keywords.length)list.append(el('p','muted small','기록된 키워드가 없습니다. 알고 있는 특징을 추가하세요.'));
}
function renderRoster(){
 const groups=$('player-roster');groups.replaceChildren();
 for(const team of ['A','B','C','D']){
  const players=roster.filter(p=>p.team===team),section=el('section','roster-team'),heading=el('div','roster-team-heading'),list=el('ul','roster-players');
  heading.append(el('h3','',`${team}조`),el('span','badge',`${players.length}명`));section.append(heading);
  players.forEach(player=>{
   const item=el('li'),button=el('button','roster-player');button.type='button';button.dataset.player=player.id;
   button.setAttribute('aria-pressed',String(player.id===current));button.setAttribute('aria-controls','ratings-panel');
   button.setAttribute('aria-label',`${team}조 ${player.name}, ${tier(player.id)}, 능력치 확인 및 수정`);
   button.append(el('strong','roster-name',player.name),tierBadge(player.id));
   button.addEventListener('click',()=>{
    current=player.id;if(compare===current)compare='';root.hidden=false;render();
    groups.querySelectorAll('.roster-player').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.player===current)));
    $('rating-player-info').focus({preventScroll:true});
    root.scrollIntoView({block:'start'});
   });item.append(button);list.append(item);
  });section.append(list);groups.append(section);
 }
}
function render(){
 populate($('rating-compare'),compare,true,current);
 $('rating-player-info').replaceChildren(el('strong','',label(current)),el('span','',' · 대회 등급 '),tierBadge(current),el('span','',' (공식 규정 기준)'));
 $('rating-keyword-text').value='';$('rating-keyword-status').textContent='';renderKeywords();
 const controls=$('rating-inputs');controls.replaceChildren();
 axes.forEach((name,i)=>{
  const row=el('label','rating-input',name),select=el('select');select.id=`rating-axis-${i}`;select.add(new Option('미입력',''));
  for(let n=1;n<=5;n++)select.add(new Option(`${n} · ${levels[n]}`,String(n)));
  select.value=profile(current).scores[i]??'';
  select.addEventListener('change',()=>{const v=[...profile(current).scores];v[i]=select.value?Number(select.value):null;update({scores:v});});row.append(select);controls.append(row);
 });
 for(const [id,field,options] of [['rating-position','position',positions],['rating-style','style',styles]]){
  const select=$(id);select.replaceChildren();Object.entries(options).forEach(([v,name])=>select.add(new Option(name,v)));select.value=profile(current)[field];
 }draw();
}
$('rating-compare').addEventListener('change',()=>{compare=$('rating-compare').value;draw();});
$('rating-position').addEventListener('change',()=>update({position:$('rating-position').value}));
$('rating-style').addEventListener('change',()=>update({style:$('rating-style').value}));
$('rating-reset').addEventListener('click',()=>{delete profiles[current];persist();render();});
$('rating-keyword-form').addEventListener('submit',event=>{
 event.preventDefault();const input=$('rating-keyword-text'),text=input.value.normalize('NFC').trim().replace(/\s+/g,' '),kind=$('rating-keyword-kind').value,keywords=profile(current).keywords,status=$('rating-keyword-status');
 if(!text){status.textContent='키워드를 입력하세요.';return;}
 if(text.length>40){status.textContent='키워드는 40자 이내로 입력하세요.';return;}
 if(keywords.length>=20){status.textContent='키워드는 선수당 20개까지 입력할 수 있습니다.';return;}
 if(keywords.some(k=>k.text===text&&k.kind===kind)){status.textContent='이미 등록한 키워드입니다.';return;}
 update({keywords:[...keywords,{kind,text}]});renderKeywords();input.value='';status.textContent='키워드를 추가했습니다.';input.focus();
});
$('rating-save-status').textContent=saveAvailable?'입력값은 내 브라우저에 저장되며 공유 링크에 포함되지 않습니다.':'이 환경에서는 저장할 수 없어 현재 창에서만 유지됩니다.';
renderRoster();
})();
