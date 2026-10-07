'use strict';
(() => {
const root=document.getElementById('ratings-panel');if(!root)return;
const data=window.BOARD_DATA;
const axes=['서브','스트로크','발리','코트커버','체력'];
const positions={'':'미선택',fore:'포',back:'백',either:'상관없음'};
const styles={attack:'공격형',defense:'수비형',unknown:'모르겠음'};
const roster=Object.entries(data.teams).flatMap(([team,players])=>Object.keys(players).map(name=>({id:`${team}:${name}`,team,name})));
const allowed=new Set(roster.map(p=>p.id)),storageKey='courtside.player-pentagons.v1';
let profiles={},saveAvailable=true,current=roster[0].id,compare='';
function cleanProfile(p){
 const raw=Array.isArray(p?.scores)&&p.scores.length===5?p.scores:Array(5).fill(null);
 return {scores:raw.map(v=>Number.isInteger(v)&&v>=1&&v<=5?v:null),position:Object.hasOwn(positions,p?.position)?p.position:'',style:Object.hasOwn(styles,p?.style)?p.style:'unknown'};
}
try{
 const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');
 if(saved&&typeof saved==='object')for(const [id,p] of Object.entries(saved))if(allowed.has(id))profiles[id]=cleanProfile(p);
}catch{saveAvailable=false;}
const $=id=>document.getElementById(id);
const profile=id=>profiles[id]||cleanProfile(null);
const person=id=>roster.find(p=>p.id===id);
const label=id=>{const p=person(id);return `${p.team}조 ${p.name}`;};
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
function persist(){
 try{localStorage.setItem(storageKey,JSON.stringify(profiles));saveAvailable=true;}catch{saveAvailable=false;}
 $('rating-save-status').textContent=saveAvailable?'이 브라우저에 저장했습니다.':'이 환경에서는 저장할 수 없어 현재 창에서만 유지됩니다.';
}
function update(patch){profiles[current]={...profile(current),...patch};persist();draw();}
function populate(select,selected,empty,exclude){
 select.replaceChildren();if(empty)select.add(new Option('비교 안 함',''));
 for(const team of ['C','A','B','D']){const group=document.createElement('optgroup');group.label=`${team}조`;
  roster.filter(p=>p.team===team).forEach(p=>{const option=new Option(p.name,p.id);option.disabled=p.id===exclude;group.append(option);});select.append(group);
 }select.value=selected;
}
function svgNode(tag,attrs,text){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
function point(index,radius){const angle=-Math.PI/2+index*2*Math.PI/5;return [170+Math.cos(angle)*radius,155+Math.sin(angle)*radius];}
function polygon(rs){return rs.map((r,i)=>point(i,r).map(v=>v.toFixed(2)).join(',')).join(' ');}
function draw(){
 const svg=svgNode('svg',{viewBox:'0 0 340 310',class:'radar',role:'img','aria-label':`${label(current)}의 항목별 5각형${compare?`, ${label(compare)}와 비교`:''}`});
 for(let level=1;level<=5;level++)svg.append(svgNode('polygon',{points:polygon(Array(5).fill(level*20)),fill:'none',stroke:'#d9e2d7','stroke-width':1}));
 axes.forEach((name,i)=>{const [x,y]=point(i,100),[tx,ty]=point(i,130);svg.append(svgNode('line',{x1:170,y1:155,x2:x,y2:y,stroke:'#d9e2d7'}));svg.append(svgNode('text',{x:tx,y:ty,'text-anchor':'middle','dominant-baseline':'middle',fill:'#486256','font-size':12},name));});
 const legend=el('div','radar-legend');
 for(const [id,color] of [[current,'#1f6651'],[compare,'#b7722c']])if(id){
  const p=profile(id),v=p.scores,complete=v.every(n=>n!==null),item=el('span','',`${label(id)} · ${v.filter(n=>n!==null).length}/5 입력`);item.style.color=color;legend.append(item);
  if(complete)svg.append(svgNode('polygon',{points:polygon(v.map(n=>n*20)),fill:color,'fill-opacity':'.15',stroke:color,'stroke-width':2.5}));
  v.forEach((n,i)=>{if(n!==null){const [x,y]=point(i,n*20);svg.append(svgNode('circle',{cx:x,cy:y,r:4,fill:color}));}});
 }
 const chart=$('rating-chart');chart.replaceChildren(svg,legend,el('p','muted small','1 = 보완 필요 · 3 = 보통 · 5 = 강점. 5개 항목을 모두 입력하면 5각형이 연결됩니다.'));
 const own=profile(current);chart.append(el('p','rating-preferences',`${label(current)} · 선호 포지션: ${positions[own.position]} · 성향: ${styles[own.style]}`));
 if(compare){const table=el('table','rating-comparison');table.append(el('caption','',`${label(current)} · ${label(compare)} 비교`));
  const head=el('thead'),hr=el('tr');['항목',person(current).name,person(compare).name].forEach(t=>{const th=el('th','',t);th.scope='col';hr.append(th);});head.append(hr);table.append(head);
  const body=el('tbody'),other=profile(compare);
  const rows=[...axes.map((name,i)=>[name,own.scores[i]??'미입력',other.scores[i]??'미입력']),['선호 포지션',positions[own.position],positions[other.position]],['플레이 성향',styles[own.style],styles[other.style]]];
  rows.forEach(([name,a,b])=>{const tr=el('tr'),th=el('th','',name);th.scope='row';tr.append(th,el('td','',a),el('td','',b));body.append(tr);});table.append(body);chart.append(table);
 }
}
function render(){
 populate($('rating-player'),current,false);populate($('rating-compare'),compare,true,current);
 const controls=$('rating-inputs');controls.replaceChildren();
 axes.forEach((name,i)=>{
  const row=el('label','rating-input',name),select=el('select');select.id=`rating-axis-${i}`;select.add(new Option('미입력',''));
  for(let n=1;n<=5;n++)select.add(new Option(`${n}${n===1?' · 보완 필요':n===3?' · 보통':n===5?' · 강점':''}`,String(n)));
  select.value=profile(current).scores[i]??'';
  select.addEventListener('change',()=>{const v=[...profile(current).scores];v[i]=select.value?Number(select.value):null;update({scores:v});});row.append(select);controls.append(row);
 });
 for(const [id,field,options] of [['rating-position','position',positions],['rating-style','style',styles]]){
  const select=$(id);select.replaceChildren();Object.entries(options).forEach(([v,name])=>select.add(new Option(name,v)));select.value=profile(current)[field];
 }draw();
}
$('rating-player').addEventListener('change',()=>{current=$('rating-player').value;if(compare===current)compare='';render();});
$('rating-compare').addEventListener('change',()=>{compare=$('rating-compare').value;draw();});
$('rating-position').addEventListener('change',()=>update({position:$('rating-position').value}));
$('rating-style').addEventListener('change',()=>update({style:$('rating-style').value}));
$('rating-reset').addEventListener('click',()=>{delete profiles[current];persist();render();});
$('rating-save-status').textContent=saveAvailable?'입력값은 내 브라우저에 저장되며 공유 링크에 포함되지 않습니다.':'이 환경에서는 저장할 수 없어 현재 창에서만 유지됩니다.';
render();
})();
