'use strict';
(function(root){
 const profilesModel=typeof module==='object'&&module.exports?require('./profile-model.js'):root.PLAYER_PROFILE_MODEL;
 const algorithmVersion='pairing-v2';
 const modeLabels={fixed:'전체 고정',free:'자유 조합',partial:'일부 고정'};
 const strategyLabels={balance:'밸런스',win:'강강 조합'};
 const pairOf=value=>Array.isArray(value)?value:value?.pair;
 const pairKey=pair=>[...pair].sort().join('\u0000');
 const textCompare=(a,b)=>a<b?-1:a>b?1:0;
 function legalPair(data,pair){return Array.isArray(pair)&&pair.length===2&&pair[0]!==pair[1]&&pair.every(name=>Object.hasOwn(data.teams.C,name))&&!pair.every(name=>data.teams.C[name].tier==='love');}
 function validatePlan(data,plan,fixedPairs=plan?.fixedPairs||[]){
  const errors=[],names=Object.keys(data.teams.C),counts=Object.fromEntries(names.map(name=>[name,0])),slots=new Map(),ids=new Set();
  if(!Array.isArray(plan?.matches)||plan.matches.length!==20)return ['20경기 출전표가 필요합니다.'];
  // Previously confirmed stamina plans remain readable, but are no longer recommended.
  if(!Object.hasOwn(modeLabels,plan.mode)||(!Object.hasOwn(strategyLabels,plan.strategy)&&plan.strategy!=='stamina'))errors.push('운영 모드 또는 전략이 올바르지 않습니다.');
  if(!Array.isArray(fixedPairs)){errors.push('고정 페어 목록이 올바르지 않습니다.');fixedPairs=[];}
  const locks=fixedPairs.map(pairOf),locked=new Map();
  for(const pair of locks){
   if(!legalPair(data,pair)){errors.push('고정 페어가 올바르지 않습니다.');continue;}
   for(const name of pair){if(locked.has(name))errors.push('고정 페어에 중복 선수가 있습니다.');locked.set(name,pairKey(pair));}
  }
  if(plan.mode==='partial'&&(locks.length<1||locks.length>3))errors.push('일부 고정은 1~3개 페어를 지정하세요.');
  if(plan.mode==='free'&&locks.length)errors.push('자유 조합에는 고정 페어를 지정할 수 없습니다.');
  for(const match of plan.matches){
   const reference=data.schedule.find(slot=>slot.id===match?.id);
   if(!reference||ids.has(match.id)){errors.push('경기 번호 누락 또는 중복');continue;}ids.add(match.id);
   if(['time','endTime','team','court'].some(key=>match[key]!==reference[key]))errors.push('공식 시간·코트·상대 조를 유지해야 합니다.');
   if(!legalPair(data,match.pair)){errors.push('같은 선수 또는 러브끼리 페어를 구성할 수 없습니다.');continue;}
   const used=slots.get(match.time)||new Set();
   for(const name of match.pair){counts[name]++;if(used.has(name))errors.push('동시간 중복 출전: '+name);used.add(name);if(locked.has(name)&&locked.get(name)!==pairKey(match.pair))errors.push('고정 페어가 변경되었습니다.');}slots.set(match.time,used);
  }
  for(const name of names)if(counts[name]!==5)errors.push(name+'은 정확히 5경기 출전해야 합니다.');
  if(plan.mode==='fixed'&&new Set(plan.matches.filter(match=>legalPair(data,match?.pair)).map(match=>pairKey(match.pair))).size!==4)errors.push('전체 고정은 네 페어를 유지해야 합니다.');
  return [...new Set(errors)];
 }
 function partitions(data,fixedPairs=[]){
  const names=Object.keys(data.teams.C),locks=fixedPairs.map(pairOf),used=new Set();
  for(const pair of locks){
   if(!legalPair(data,pair))throw new Error('러브끼리 또는 같은 선수는 고정 페어로 지정할 수 없습니다.');
   for(const name of pair){if(used.has(name))throw new Error('한 선수를 여러 고정 페어에 지정할 수 없습니다.');used.add(name);}
  }
  const result=[];
  function walk(left,pairs){
   if(!left.length){result.push([...locks,...pairs].map(pair=>[...pair].sort()).sort((a,b)=>pairKey(a)<pairKey(b)?-1:1));return;}
   const first=left[0];
   for(let index=1;index<left.length;index++)if(legalPair(data,[first,left[index]]))walk(left.filter((_,i)=>i!==0&&i!==index),[...pairs,[first,left[index]]]);
  }
  walk(names.filter(name=>!used.has(name)),[]);return result;
 }
 function restViolations(data,matches,rawProfiles){
  const violations=[];
  for(const name of Object.keys(data.teams.C)){
   const profile=profilesModel.cleanProfile(rawProfiles['C:'+name]||rawProfiles[name],'C');
   if(profile.restPreference!=='rest')continue;
   const appearances=matches.filter(match=>match.pair.includes(name)).sort((a,b)=>textCompare(a.time,b.time));
   let run=0,end='';
   for(const match of appearances){run=match.time===end?run+1:1;end=match.endTime;if(run>2){violations.push(name);break;}}
  }
  return violations;
 }
 function opponentViolations(data,matches){
  return Object.keys(data.teams.C).filter(name=>['A','B','D'].some(team=>{
   const count=matches.filter(match=>match.team===team&&match.pair.includes(name)).length;return count<1||count>2;
  }));
 }
 function generateStrategy(data,rawProfiles,options={}){
  const mode=options.mode||'fixed',strategy=options.strategy||'balance',locks=mode==='partial'?(options.fixedPairs||[]).map(pairOf):[];
  if(!Object.hasOwn(modeLabels,mode)||!Object.hasOwn(strategyLabels,strategy))throw new Error('운영 모드 또는 전략을 선택하세요.');
  if(mode==='partial'&&(locks.length<1||locks.length>3))throw new Error('고정할 페어를 1~3개 지정하세요.');
  const combinations=partitions(data,locks);
  if(!combinations.length)throw new Error('남은 선수들로 러브 금지 조건을 지킬 수 없습니다. 고정 페어를 바꿔 주세요.');
  const names=Object.keys(data.teams.C),indexOf=Object.fromEntries(names.map((name,index)=>[name,index]));
  const profiles=Object.fromEntries(names.map(name=>[name,profilesModel.cleanProfile(rawProfiles['C:'+name]||rawProfiles[name],'C')]));
  const version=profilesModel.profileVersion(names.map(name=>({id:'C:'+name,tier:data.teams.C[name].tier,profile:profiles[name]})));
  const grades={forty:3,thirty:2,love:1},qualities=new Map(),lockedNames=new Set(locks.flat());
  function quality(pair){
   const key=pairKey(pair);if(qualities.has(key))return qualities.get(key);
   const [a,b]=pair.map(name=>profiles[name]);let fit=0;
   const conflict=['fore','back'].includes(a.position)&&a.position===b.position?1:0;
   if((a.position==='fore'&&b.position==='back')||(a.position==='back'&&b.position==='fore'))fit+=3;
   if((a.courtPreference==='net'&&b.courtPreference==='baseline')||(a.courtPreference==='baseline'&&b.courtPreference==='net'))fit+=2;
   if((a.style==='attack'&&b.style==='defense')||(a.style==='defense'&&b.style==='attack'))fit+=1;
   for(const [own,other] of [[a,b],[b,a]]){
    if(own.partnerRoles.includes('cover')&&other.courtPreference==='baseline')fit+=2;
    if(own.partnerRoles.includes('attack')&&other.courtPreference==='net')fit+=2;
    for(const [role,trait] of [['connect','안정적 연결'],['tactics','전술가'],['encourage','칭찬과 응원']])if(own.partnerRoles.includes(role)&&other.traits.includes(trait))fit++;
   }
   const grade=pair.reduce((sum,name)=>sum+grades[data.teams.C[name].tier],0),q={conflict,fit,grade,key};qualities.set(key,q);return q;
  }
  const allowed=[];
  for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){
   const pair=[names[i],names[j]];
   if(legalPair(data,pair)&&(!pair.some(name=>lockedNames.has(name))||locks.some(lock=>pairKey(lock)===pairKey(pair))))allowed.push(quality(pair));
  }
  allowed.sort((a,b)=>b.grade-a.grade||a.conflict-b.conflict||b.fit-a.fit||(a.key<b.key?-1:1));
  const anchor=allowed[0].key;
  const groups=[...new Set(data.schedule.map(match=>match.time))].sort().map(time=>data.schedule.filter(match=>match.time===time));
  const restMask=names.reduce((mask,name)=>profiles[name].restPreference==='rest'?mask|(1<<indexOf[name]):mask,0);
  const continuousMask=names.reduce((mask,name)=>profiles[name].restPreference==='continuous'?mask|(1<<indexOf[name]):mask,0);
  const bitCount=value=>{let count=0;for(;value;value&=value-1)count++;return count;};
  const pairMask=pair=>pair.reduce((mask,name)=>mask|(1<<indexOf[name]),0);
  const adjacent=groups.map((group,index)=>index>0&&groups[index-1][0].endTime===group[0].time);
  function restCost(matches){
   if(!restMask&&!continuousMask)return 0;
   let previous=0,twice=0,seen=0,cost=0;
   for(const [index,group] of groups.entries()){
    if(!adjacent[index]){previous=0;twice=0;}
    const active=group.reduce((mask,slot)=>mask|pairMask(matches[slot.id-1].pair),0);
    if(active&twice&restMask)return Infinity;
    cost+=bitCount(active&previous&restMask)+bitCount(active&~previous&seen&continuousMask);
    twice=active&previous;seen|=active;previous=active;
   }
   return cost;
  }
  function metrics(matches){
   let conflicts=0,squares=0,fit=0,anchorCount=0;
   for(const match of matches){const q=quality(match.pair);conflicts+=q.conflict;squares+=q.grade*q.grade;fit+=q.fit;if(q.key===anchor)anchorCount++;}
   return {conflicts,squares,fit,anchorCount,rest:restCost(matches),variation:new Set(matches.map(match=>pairKey(match.pair))).size>4};
  }
  const baseVector=m=>strategy==='win'?[-m.anchorCount,m.conflicts,-m.fit,m.squares,m.rest]:[m.conflicts,m.squares,-m.fit,m.rest];
  const vector=m=>[mode!=='fixed'&&names.length-lockedNames.size>=4&&!m.variation?1:0,...baseVector(m)];
  function compare(a,b){const av=vector(a),bv=vector(b);for(let i=0;i<av.length;i++)if(av[i]!==bv[i])return av[i]-bv[i];return 0;}
  const layoutCache=new Map();
  function arrange(pairs){
   const order=[0,1,2,3],pairRest=pairs.map(pair=>pair.filter(name=>profiles[name].restPreference==='rest').length),pairContinuous=pairs.map(pair=>pair.filter(name=>profiles[name].restPreference==='continuous').length);
   order.sort((a,b)=>pairRest[a]-pairRest[b]||pairContinuous[a]-pairContinuous[b]||a-b);
   const rest=order.map(index=>pairRest[index]),continuous=order.map(index=>pairContinuous[index]);
   if(!rest.some(Boolean)&&!continuous.some(Boolean))return data.schedule.map((_,index)=>index%4);
   const cacheKey=rest.join('')+continuous.join('');if(layoutCache.has(cacheKey))return layoutCache.get(cacheKey).map(index=>order[index]);
   const restPairs=rest.reduce((mask,count,index)=>count?mask|(1<<index):mask,0);
   const teamIndex={A:0,B:1,D:2};
   let states=new Map([['000000000000:0:0',{counts:[0,0,0,0],opponents:Array(12).fill(0),mask:0,twice:0,cost:0,path:[]}]]);
   for(const [groupIndex,group] of groups.entries()){
    const next=new Map(),choices=[];
    for(let a=0;a<4;a++)if(group.length===1)choices.push([a]);else for(let b=0;b<4;b++)if(a!==b)choices.push([a,b]);
    for(const current of states.values())for(const choice of choices){
     if(choice.some(index=>current.counts[index]>=5))continue;
     const opponents=[...current.opponents];
     for(let slot=0;slot<choice.length;slot++)opponents[choice[slot]*3+teamIndex[group[slot].team]]++;
     if(opponents.some(count=>count>2))continue;
     const counts=[...current.counts],mask=choice.reduce((mask,index)=>mask|(1<<index),0),previous=adjacent[groupIndex]?current.mask:0;
     if(adjacent[groupIndex]&&(mask&current.twice&restPairs))continue;
     const twice=mask&previous&restPairs;let cost=current.cost;
     for(const index of choice){cost+=previous&(1<<index)?rest[index]:current.counts[index]>0?continuous[index]:0;counts[index]++;}
     const key=opponents.join('')+':'+mask+':'+twice,existing=next.get(key);
     if(!existing||cost<existing.cost)next.set(key,{counts,opponents,mask,twice,cost,path:[...current.path,...choice]});
    }
    states=next;
   }
   const best=[...states.values()].filter(item=>item.counts.every(count=>count===5)).sort((a,b)=>a.cost-b.cost||textCompare(a.path.join(''),b.path.join('')))[0];
   if(!best)return null;
   layoutCache.set(cacheKey,best.path);return best.path.map(index=>order[index]);
  }
  let candidates=combinations.map(pairs=>{
   const layout=arrange(pairs);if(!layout)return null;
   const matches=data.schedule.map((slot,index)=>({...slot,pair:pairs[layout[index]]}));
   return {matches,metrics:metrics(matches)};
  }).filter(Boolean).sort((a,b)=>compare(a.metrics,b.metrics)||textCompare(signature(a.matches),signature(b.matches)));
  if(!candidates.length)throw new Error('상대 조 분산과 휴식 선수의 연속 출전 제한을 함께 만족할 수 없습니다. 고정 페어를 조정해 주세요.');
  function signature(matches){const counts=new Map();for(const match of matches){const key=pairKey(match.pair);counts.set(key,(counts.get(key)||0)+1);}return [...counts].sort().map(([key,count])=>key+':'+count).join('|');}
  if(mode!=='fixed'){
   const seeds=candidates.slice(0,12),improvements=[];
   for(const seed of seeds){
    let current=seed;
    for(let round=0;round<20;round++){
     let best=current;
     const occupied=new Map(groups.map(group=>[group[0].time,group.reduce((mask,slot)=>mask|pairMask(current.matches[slot.id-1].pair),0)]));
     const opponentCounts=Object.fromEntries(names.map(name=>[name,Object.fromEntries(['A','B','D'].map(team=>[team,current.matches.filter(match=>match.team===team&&match.pair.includes(name)).length]))]));
     function canExchange(first,second,a,b){
      return first.team===second.team||(!a.some(name=>!b.includes(name)&&opponentCounts[name][second.team]>=2)&&!b.some(name=>!a.includes(name)&&opponentCounts[name][first.team]>=2));
     }
     for(let i=0;i<20;i++)for(let j=i+1;j<20;j++)for(let ai=0;ai<2;ai++)for(let bj=0;bj<2;bj++){
      const first=current.matches[i],second=current.matches[j],a=first.pair[ai],b=second.pair[bj];
      if(a===b||lockedNames.has(a)||lockedNames.has(b))continue;
      if(!canExchange(first,second,[a],[b]))continue;
      if(first.time!==second.time&&(((occupied.get(first.time)&~(1<<indexOf[a]))&(1<<indexOf[b]))||((occupied.get(second.time)&~(1<<indexOf[b]))&(1<<indexOf[a]))))continue;
      const pair1=[...first.pair],pair2=[...second.pair];pair1[ai]=b;pair2[bj]=a;
      if(!legalPair(data,pair1)||!legalPair(data,pair2))continue;
      const old1=quality(first.pair),old2=quality(second.pair),new1=quality(pair1),new2=quality(pair2);
      const matches=[...current.matches];matches[i]={...first,pair:pair1};matches[j]={...second,pair:pair2};
      const rest=restCost(matches);if(!Number.isFinite(rest))continue;
      const m={conflicts:current.metrics.conflicts-old1.conflict-old2.conflict+new1.conflict+new2.conflict,
       squares:current.metrics.squares-old1.grade**2-old2.grade**2+new1.grade**2+new2.grade**2,
       fit:current.metrics.fit-old1.fit-old2.fit+new1.fit+new2.fit,
       anchorCount:current.metrics.anchorCount-Number(old1.key===anchor)-Number(old2.key===anchor)+Number(new1.key===anchor)+Number(new2.key===anchor),rest,variation:new Set(matches.map(match=>pairKey(match.pair))).size>4};
      if(compare(m,best.metrics)<0)best={matches,metrics:m};
     }
     // Move complete pairs too: single-player exchanges alone can trap late-game layouts.
     for(let i=0;i<20;i++)for(let j=i+1;j<20;j++){
      const first=current.matches[i],second=current.matches[j];if(first.time===second.time)continue;
      if(!canExchange(first,second,first.pair,second.pair))continue;
      const a=pairMask(first.pair),b=pairMask(second.pair);
      if(((occupied.get(first.time)&~a)&b)||((occupied.get(second.time)&~b)&a))continue;
      const matches=[...current.matches];matches[i]={...first,pair:second.pair};matches[j]={...second,pair:first.pair};
      const rest=restCost(matches);if(!Number.isFinite(rest))continue;
      const m={...current.metrics,rest};if(compare(m,best.metrics)<0)best={matches,metrics:m};
     }
     if(best===current)break;current=best;improvements.push(current);
    }
   }
   candidates=[...candidates,...improvements].sort((a,b)=>compare(a.metrics,b.metrics)||textCompare(signature(a.matches),signature(b.matches)));
  }
  const distinct=new Set(),selected=[];
  for(const candidate of candidates){const key=signature(candidate.matches);if(distinct.has(key))continue;distinct.add(key);selected.push(candidate);if(selected.length===(strategy==='balance'?2:1))break;}
  const descriptions={balance:'등급 구성과 리턴 자리·역할 선호의 균형을 맞춘 안입니다.',win:'공식 등급이 높은 두 선수를 함께 배치하는 안입니다. 실제 실력이나 승률을 의미하지 않습니다.'};
  return selected.map((candidate,index)=>{
   const reasons=[];
   if(candidate.metrics.conflicts)reasons.push('리턴 자리 선호가 겹치는 경기가 있습니다. 경기 전에 자리를 조율하세요.');else reasons.push('확인된 리턴 자리 선호가 서로 충돌하는 경기는 없습니다.');
   if(names.some(name=>!profiles[name].position||!profiles[name].courtPreference))reasons.push('미입력은 실력이나 약점으로 추정하지 않았습니다. 편한 위치를 함께 확인하세요.');
   if(mode==='partial')reasons.push('지정한 '+locks.length+'개 페어는 함께 5경기 출전합니다. 나머지 인원은 자유 조합입니다.');
   reasons.push('모든 선수가 A·B·D조를 만나고, 같은 상대 조와는 최대 2경기 출전합니다.');
   if(restMask)reasons.push('쉬었다가를 선택한 선수는 최대 2경기까지만 연속 출전합니다.');
   const plan={id:mode+'-'+strategy+'-'+(index+1),title:strategy==='balance'?'밸런스 '+(index+1)+'안':'강강 조합',description:descriptions[strategy],mode,strategy,
    matches:candidate.matches.map(match=>({...match,pair:[...match.pair].sort()})),fixedPairs:(mode==='fixed'?[...new Map(candidate.matches.map(match=>[pairKey(match.pair),match.pair])).values()]:locks).map(pair=>({pair:[...pair].sort()})),
    reasons,profileVersion:version,algorithmVersion};
   const errors=validatePlan(data,plan);if(errors.length)throw new Error(errors.join(' / '));
   if(restViolations(data,plan.matches,profiles).length)throw new Error('휴식 선호의 연속 출전 제한을 만족하지 못했습니다.');
   if(opponentViolations(data,plan.matches).length)throw new Error('상대 조별 출전 분산 조건을 만족하지 못했습니다.');return plan;
  });
 }
 function generate(data,rawProfiles={},options={}){
  return [...generateStrategy(data,rawProfiles,{...options,strategy:'balance'}),...generateStrategy(data,rawProfiles,{...options,strategy:'win'})];
 }
 const model={algorithmVersion,modeLabels,strategyLabels,pairKey,legalPair,partitions,validatePlan,restViolations,opponentViolations,generate};
 if(typeof module==='object'&&module.exports)module.exports=model;else root.PAIRING_MODEL=model;
})(typeof window==='undefined'?globalThis:window);
