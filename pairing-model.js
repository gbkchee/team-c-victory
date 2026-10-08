'use strict';
(function(root){
 const profilesModel=typeof module==='object'&&module.exports?require('./profile-model.js'):root.PLAYER_PROFILE_MODEL;
 const algorithmVersion='pairing-v1';
 const modeLabels={fixed:'전체 고정',free:'자유 조합',partial:'일부 고정'};
 const strategyLabels={balance:'밸런스형',win:'필승카드형',stamina:'체력안배형'};
 const pairOf=value=>Array.isArray(value)?value:value?.pair;
 const pairKey=pair=>[...pair].sort().join('\u0000');
 const textCompare=(a,b)=>a<b?-1:a>b?1:0;
 function legalPair(data,pair){return Array.isArray(pair)&&pair.length===2&&pair[0]!==pair[1]&&pair.every(name=>Object.hasOwn(data.teams.C,name))&&!pair.every(name=>data.teams.C[name].tier==='love');}
 function validatePlan(data,plan,fixedPairs=plan?.fixedPairs||[]){
  const errors=[],names=Object.keys(data.teams.C),counts=Object.fromEntries(names.map(name=>[name,0])),slots=new Map(),ids=new Set();
  if(!Array.isArray(plan?.matches)||plan.matches.length!==20)return ['20경기 출전표가 필요합니다.'];
  if(!Object.hasOwn(modeLabels,plan.mode)||!Object.hasOwn(strategyLabels,plan.strategy))errors.push('운영 모드 또는 전략이 올바르지 않습니다.');
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
 function generate(data,rawProfiles,options={}){
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
  function restCost(matches){
   if(!restMask&&!continuousMask)return 0;
   let previous=0,seen=0,cost=0;
   for(const group of groups){
    const active=group.reduce((mask,slot)=>mask|pairMask(matches[slot.id-1].pair),0);
    cost+=bitCount(active&previous&restMask)+bitCount(active&~previous&seen&continuousMask);
    seen|=active;previous=active;
   }
   return cost;
  }
  function metrics(matches){
   let conflicts=0,squares=0,fit=0,anchorCount=0;
   for(const match of matches){const q=quality(match.pair);conflicts+=q.conflict;squares+=q.grade*q.grade;fit+=q.fit;if(q.key===anchor)anchorCount++;}
   return {conflicts,squares,fit,anchorCount,rest:restCost(matches),variation:new Set(matches.map(match=>pairKey(match.pair))).size>4};
  }
  const baseVector=m=>strategy==='win'?[-m.anchorCount,m.conflicts,-m.fit,m.squares,m.rest]:strategy==='stamina'?[m.rest,m.conflicts,m.squares,-m.fit]:[m.conflicts,m.squares,-m.fit,m.rest];
  const vector=m=>[mode!=='fixed'&&names.length-lockedNames.size>=4&&!m.variation?1:0,...baseVector(m)];
  function compare(a,b){const av=vector(a),bv=vector(b);for(let i=0;i<av.length;i++)if(av[i]!==bv[i])return av[i]-bv[i];return 0;}
  const layoutCache=new Map();
  function arrange(pairs){
   const rest=pairs.map(pair=>pair.filter(name=>profiles[name].restPreference==='rest').length),continuous=pairs.map(pair=>pair.filter(name=>profiles[name].restPreference==='continuous').length);
   if(!rest.some(Boolean)&&!continuous.some(Boolean))return data.schedule.map((_,index)=>index%4);
   const cacheKey=rest.join('')+continuous.join('');if(layoutCache.has(cacheKey))return layoutCache.get(cacheKey);
   let states=new Map([['0000:0',{counts:[0,0,0,0],mask:0,cost:0,path:[]}]]);
   for(const group of groups){
    const next=new Map(),choices=[];
    for(let a=0;a<4;a++)if(group.length===1)choices.push([a]);else for(let b=0;b<4;b++)if(a!==b)choices.push([a,b]);
    for(const current of states.values())for(const choice of choices){
     if(choice.some(index=>current.counts[index]>=5))continue;
     const counts=[...current.counts],mask=choice.reduce((mask,index)=>mask|(1<<index),0);let cost=current.cost;
     for(const index of choice){cost+=current.mask&(1<<index)?rest[index]:current.counts[index]>0?continuous[index]:0;counts[index]++;}
     const key=counts.join('')+':'+mask,existing=next.get(key);
     if(!existing||cost<existing.cost)next.set(key,{counts,mask,cost,path:[...current.path,...choice]});
    }
    states=next;
   }
   const best=[...states.values()].filter(item=>item.counts.every(count=>count===5)).sort((a,b)=>a.cost-b.cost||textCompare(a.path.join(''),b.path.join('')))[0];
   if(!best)throw new Error('시간표에 고정 페어를 배치할 수 없습니다.');
   layoutCache.set(cacheKey,best.path);return best.path;
  }
  let candidates=combinations.map(pairs=>{
   const layout=arrange(pairs),matches=data.schedule.map((slot,index)=>({...slot,pair:pairs[layout[index]]}));
   return {matches,metrics:metrics(matches)};
  }).sort((a,b)=>compare(a.metrics,b.metrics)||textCompare(signature(a.matches),signature(b.matches)));
  function signature(matches){const counts=new Map();for(const match of matches){const key=pairKey(match.pair);counts.set(key,(counts.get(key)||0)+1);}return [...counts].sort().map(([key,count])=>key+':'+count).join('|');}
  if(mode!=='fixed'){
   const seeds=candidates.slice(0,12),improvements=[];
   for(const seed of seeds){
    let current=seed;
    for(let round=0;round<20;round++){
     let best=current;
     const occupied=new Map(groups.map(group=>[group[0].time,group.reduce((mask,slot)=>mask|pairMask(current.matches[slot.id-1].pair),0)]));
     for(let i=0;i<20;i++)for(let j=i+1;j<20;j++)for(let ai=0;ai<2;ai++)for(let bj=0;bj<2;bj++){
      const first=current.matches[i],second=current.matches[j],a=first.pair[ai],b=second.pair[bj];
      if(a===b||lockedNames.has(a)||lockedNames.has(b))continue;
      if(first.time!==second.time&&(((occupied.get(first.time)&~(1<<indexOf[a]))&(1<<indexOf[b]))||((occupied.get(second.time)&~(1<<indexOf[b]))&(1<<indexOf[a]))))continue;
      const pair1=[...first.pair],pair2=[...second.pair];pair1[ai]=b;pair2[bj]=a;
      if(!legalPair(data,pair1)||!legalPair(data,pair2))continue;
      const old1=quality(first.pair),old2=quality(second.pair),new1=quality(pair1),new2=quality(pair2);
      const matches=[...current.matches];matches[i]={...first,pair:pair1};matches[j]={...second,pair:pair2};
      const m={conflicts:current.metrics.conflicts-old1.conflict-old2.conflict+new1.conflict+new2.conflict,
       squares:current.metrics.squares-old1.grade**2-old2.grade**2+new1.grade**2+new2.grade**2,
       fit:current.metrics.fit-old1.fit-old2.fit+new1.fit+new2.fit,
       anchorCount:current.metrics.anchorCount-Number(old1.key===anchor)-Number(old2.key===anchor)+Number(new1.key===anchor)+Number(new2.key===anchor),rest:restCost(matches),variation:new Set(matches.map(match=>pairKey(match.pair))).size>4};
      if(compare(m,best.metrics)<0)best={matches,metrics:m};
     }
     if(best===current)break;current=best;improvements.push(current);
    }
   }
   candidates=[...candidates,...improvements].sort((a,b)=>compare(a.metrics,b.metrics)||textCompare(signature(a.matches),signature(b.matches)));
  }
  const distinct=new Set(),selected=[];
  for(const candidate of candidates){const key=signature(candidate.matches);if(distinct.has(key))continue;distinct.add(key);selected.push(candidate);if(selected.length===(strategy==='balance'?3:1))break;}
  const descriptions={balance:'리턴 자리와 등급 구성이 고르게 맞도록 역할 선호를 함께 비교했습니다.',win:'공식 등급과 선호 조합을 참고한 주력 페어를 우선했습니다. 실제 승률을 의미하지 않습니다.',stamina:'연속 출전과 중간 휴식 희망을 시간표에서 최대한 맞췄습니다.'};
  return selected.map((candidate,index)=>{
   const reasons=[];
   if(candidate.metrics.conflicts)reasons.push('리턴 자리 선호가 겹치는 경기가 있습니다. 경기 전에 자리를 조율하세요.');else reasons.push('확인된 리턴 자리 선호가 서로 충돌하는 경기는 없습니다.');
   if(names.some(name=>!profiles[name].position||!profiles[name].courtPreference))reasons.push('미입력은 실력이나 약점으로 추정하지 않았습니다. 편한 위치를 함께 확인하세요.');
   if(mode==='partial')reasons.push('지정한 '+locks.length+'개 페어는 함께 5경기 출전합니다. 나머지 인원은 자유 조합입니다.');
   if(restMask||continuousMask)reasons.push(candidate.metrics.rest?'일부 휴식 선호는 동시에 만족하기 어려워 조율이 필요합니다.':'입력한 연속 출전·휴식 희망에 맞춘 배치입니다.');
   const plan={id:mode+'-'+strategy+'-'+(index+1),title:strategyLabels[strategy]+' '+(index+1)+'안',description:descriptions[strategy],mode,strategy,
    matches:candidate.matches.map(match=>({...match,pair:[...match.pair].sort()})),fixedPairs:(mode==='fixed'?[...new Map(candidate.matches.map(match=>[pairKey(match.pair),match.pair])).values()]:locks).map(pair=>({pair:[...pair].sort()})),
    reasons,profileVersion:version,algorithmVersion};
   const errors=validatePlan(data,plan);if(errors.length)throw new Error(errors.join(' / '));return plan;
  });
 }
 const model={algorithmVersion,modeLabels,strategyLabels,pairKey,legalPair,partitions,validatePlan,generate};
 if(typeof module==='object'&&module.exports)module.exports=model;else root.PAIRING_MODEL=model;
})(typeof window==='undefined'?globalThis:window);
