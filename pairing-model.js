'use strict';
(function(root){
 const profilesModel=typeof module==='object'&&module.exports?require('./profile-model.js'):root.PLAYER_PROFILE_MODEL;
 const algorithmVersion='pairing-v6';
 const modeLabels={fixed:'전체 고정',free:'자유 조합',partial:'일부 고정'};
 const strategyLabels={balance:'밸런스',win:'강강 조합',return:'리턴 자리 적합'};
 const pairOf=value=>Array.isArray(value)?value:value?.pair;
 const pairKey=pair=>[...pair].sort().join('\u0000');
 const textCompare=(a,b)=>a<b?-1:a>b?1:0;
 function legalPair(data,pair){return Array.isArray(pair)&&pair.length===2&&pair[0]!==pair[1]&&pair.every(name=>Object.hasOwn(data.teams.C,name))&&!pair.every(name=>data.teams.C[name].tier==='love');}
 function validateLegacyPlan(data,plan,fixedPairs=plan?.fixedPairs||[]){
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
  // Keep previously confirmed plans readable; apply the new cap to newly generated plans.
  if(plan.mode==='free'&&plan.algorithmVersion===algorithmVersion){
   const pairCounts=new Map();
   for(const match of plan.matches)if(legalPair(data,match?.pair)){const key=pairKey(match.pair);pairCounts.set(key,(pairCounts.get(key)||0)+1);}
   if([...pairCounts.values()].some(count=>count>3))errors.push('자유 조합에서 같은 페어는 최대 3경기까지 함께 출전할 수 있습니다.');
  }
  if(plan.algorithmVersion===algorithmVersion&&unevenDistribution(data,plan.matches))errors.push('연속 출전·휴식은 최대 2타임, 시간대별 선수 간 출전 횟수 차이는 최대 1경기여야 합니다.');
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
 function unevenDistribution(data,matches){
  const groups=[...new Set(data.schedule.map(match=>match.time))].sort().map(time=>data.schedule.find(match=>match.time===time));
  const names=Object.keys(data.teams.C),counts=Array(names.length).fill(0),play=Array(names.length).fill(0),idle=Array(names.length).fill(0);
  for(const [index,group] of groups.entries()){
   const active=new Set(matches.filter(match=>match?.time===group.time).flatMap(match=>Array.isArray(match.pair)?match.pair:[]));
   for(const [player,name] of names.entries()){
    if(index&&groups[index-1].endTime!==group.time){play[player]=0;idle[player]=0;}
    if(active.has(name)){counts[player]++;play[player]++;idle[player]=0;}
    else{play[player]=0;idle[player]++;}
    if(play[player]>2||idle[player]>2)return true;
   }
   if(Math.max(...counts)-Math.min(...counts)>1)return true;
  }
  return false;
 }
 function opponentViolations(data,matches){
  return Object.keys(data.teams.C).filter(name=>['A','B','D'].some(team=>{
   const count=matches.filter(match=>match.team===team&&match.pair.includes(name)).length;return count<1||count>2;
  }));
 }
 function requestedPairs(data,values,mode){
  if(!Array.isArray(values))throw new Error('지정 페어 목록이 올바르지 않습니다.');
  if(mode==='free'&&values.length)throw new Error('자유 조합에는 지정 페어를 넣을 수 없습니다.');
  if(mode==='partial'&&(values.length<1||values.length>20))throw new Error('일부 지정은 1~20개 페어를 지정하세요.');
  const seen=new Set(),degrees=new Map(),pairs=[];
  for(const value of values){
   const pair=pairOf(value);
   if(!legalPair(data,pair))throw new Error('지정 페어에는 서로 다른 C조 선수 2명이 필요하며 러브끼리는 구성할 수 없습니다.');
   const key=pairKey(pair);if(seen.has(key))throw new Error('같은 지정 페어를 중복해서 넣을 수 없습니다.');seen.add(key);
   for(const name of pair){const count=(degrees.get(name)||0)+1;if(count>5)throw new Error(name+'의 지정 페어는 최대 5개입니다.');degrees.set(name,count);}
   pairs.push([...pair].sort());
  }
  return pairs.sort((a,b)=>textCompare(pairKey(a),pairKey(b)));
 }
 function validatePlan(data,plan,fixedPairs=plan?.fixedPairs||[],automatic=true){
  const errors=[],names=Object.keys(data.teams.C),counts=Object.fromEntries(names.map(name=>[name,0])),seen=new Set(),ids=new Set(),times=new Map();
  if(!Array.isArray(plan?.matches)||plan.matches.length!==20)return ['20경기 출전표가 필요합니다.'];
  if(!['free','partial'].includes(plan.mode))errors.push('현재 대회는 자유 조합 또는 일부 지정의 서로 다른 20페어만 사용할 수 있습니다.');
  if(!Object.hasOwn(strategyLabels,plan.strategy))errors.push('운영 전략이 올바르지 않습니다.');
  let locks=[];try{locks=requestedPairs(data,fixedPairs,plan.mode);}catch(error){errors.push(error.message);}
  const valid=[];
  for(const match of plan.matches){
   const reference=data.schedule.find(slot=>slot.id===match?.id);
   if(!reference||ids.has(match?.id)){errors.push('경기 번호 누락 또는 중복');continue;}ids.add(match.id);
   if(['time','endTime','team','court'].some(key=>match[key]!==reference[key]))errors.push('공식 시간·코트·상대 조를 유지해야 합니다.');
   if(!legalPair(data,match.pair)){errors.push('같은 선수 또는 러브끼리 페어를 구성할 수 없습니다.');continue;}
   const key=pairKey(match.pair);if(seen.has(key))errors.push('20개 페어는 모두 달라야 하며 같은 페어는 정확히 1경기만 출전해야 합니다.');seen.add(key);
   const active=times.get(reference.time)||new Set();
   for(const name of match.pair){counts[name]++;if(active.has(name))errors.push('동시간 중복 출전: '+name);active.add(name);}times.set(reference.time,active);
   valid.push({...reference,pair:match.pair});
  }
  for(const name of names)if(counts[name]!==5)errors.push(name+'은 정확히 5경기 출전해야 합니다.');
  for(const pair of locks)if(!seen.has(pairKey(pair)))errors.push('지정 페어는 정확히 1경기 포함해야 합니다: '+pair.join(' · '));
  if(automatic&&unevenDistribution(data,valid))errors.push('연속 출전·휴식은 최대 2타임, 시간대별 선수 간 출전 횟수 차이는 최대 1경기여야 합니다.');
  if(automatic&&opponentViolations(data,valid).length)errors.push('모든 선수는 A·B·D조를 각각 1~2경기 만나야 합니다.');
  return [...new Set(errors)];
 }
 function validateLineup(data,plan,fixedPairs=plan?.fixedPairs||[]){return validatePlan(data,plan,fixedPairs,false);}
 function consecutivePlayDetails(data,matches){
  const groups=[...new Set(data.schedule.map(match=>match.time))].sort().map(time=>data.schedule.find(match=>match.time===time));
  return Object.keys(data.teams.C).flatMap(name=>{
   let run=0,longest=0;
   for(const [index,group] of groups.entries()){
    if(index&&groups[index-1].endTime!==group.time)run=0;
    run=matches.some(match=>match.time===group.time&&match.pair.includes(name))?run+1:0;longest=Math.max(longest,run);
   }
   return longest>=3?[{name,count:longest}]:[];
  });
 }
 function consecutivePlayWarnings(data,matches){return consecutivePlayDetails(data,matches).map(({name,count})=>name+'가 연속 '+count+'경기 출전합니다.');}
 function swapPairs(data,plan,firstMatchId,secondMatchId){
  const originalErrors=validateLineup(data,plan);if(originalErrors.length)throw new Error(originalErrors.join(' / '));
  if(firstMatchId===secondMatchId)throw new Error('서로 다른 두 경기를 선택하세요.');
  const clone=JSON.parse(JSON.stringify(plan)),first=clone.matches.find(match=>match.id===firstMatchId),second=clone.matches.find(match=>match.id===secondMatchId);
  if(!first||!second)throw new Error('교환할 경기 번호를 찾을 수 없습니다.');
  [first.pair,second.pair]=[second.pair,first.pair];
  const errors=validateLineup(data,clone);if(errors.length)throw new Error('페어 교환 불가: '+errors.join(' / '));
  clone.reasons=[...(Array.isArray(clone.reasons)?clone.reasons:[]).filter(reason=>!reason.includes('모든 선수는 A·B·D조')), '수동 교환한 출전표입니다. 동시간 중복 출전은 허용하지 않으며 연속 출전은 경고로 안내합니다.'];
  clone.reasons=[...new Set(clone.reasons)];return clone;
 }
 // Search complete official time groups. Prefix balance and player run limits are
 // checked before descending, while pending requested edges reserve player capacity.
 function generateUnique(data,rawProfiles={},options={}){
  const mode=options.mode||'free',strategy=options.strategy||'balance';
  if(!['free','partial'].includes(mode)||!Object.hasOwn(strategyLabels,strategy))throw new Error('운영 모드 또는 전략을 선택하세요.');
  const locks=requestedPairs(data,mode==='partial'?(options.fixedPairs||[]):[],mode),names=Object.keys(data.teams.C);
  if(names.length!==8||data.schedule.length!==20)throw new Error('C조 8명과 공식 20경기 일정이 필요합니다.');
  const profiles=names.map(name=>profilesModel.cleanProfile(rawProfiles['C:'+name]||rawProfiles[name],'C'));
  const version=profilesModel.profileVersion(names.map((name,index)=>({id:'C:'+name,tier:data.teams.C[name].tier,profile:profiles[index]})));
  const grades={forty:3,thirty:2,love:1},edges=[],edgeByKey=new Map();
  for(let a=0;a<8;a++)for(let b=a+1;b<8;b++)if(legalPair(data,[names[a],names[b]])){
   const pair=[names[a],names[b]],left=profiles[a],right=profiles[b],grade=grades[data.teams.C[names[a]].tier]+grades[data.teams.C[names[b]].tier];
   let fit=0;const conflict=['fore','back'].includes(left.position)&&left.position===right.position?1:0;
   if(['fore','back'].includes(left.position)&&['fore','back'].includes(right.position)&&left.position!==right.position)fit+=3;
   if(['net','baseline'].includes(left.courtPreference)&&['net','baseline'].includes(right.courtPreference)&&left.courtPreference!==right.courtPreference)fit+=2;
   if(['attack','defense'].includes(left.style)&&['attack','defense'].includes(right.style)&&left.style!==right.style)fit++;
   for(const [own,other] of [[left,right],[right,left]]){
    if(own.partnerRoles.includes('cover')&&other.courtPreference==='baseline')fit+=2;
    if(own.partnerRoles.includes('attack')&&other.courtPreference==='net')fit+=2;
    for(const [role,trait] of [['connect','안정적 연결'],['tactics','전술가'],['encourage','칭찬과 응원']])if(own.partnerRoles.includes(role)&&other.traits.includes(trait))fit++;
   }
   const edge={a,b,pair,mask:(1<<a)|(1<<b),bit:1<<edges.length,conflict,fit,grade};edge.score=strategy==='return'?conflict*100-fit*12+grade:strategy==='balance'?conflict*100+grade*grade*3-fit*4:-(grade>=5?150:0)+conflict*30-fit*3-grade*grade;
   edgeByKey.set(pairKey(pair),edge);edges.push(edge);
  }
  const lockEdges=locks.map(pair=>edgeByKey.get(pairKey(pair))),lockMask=lockEdges.reduce((mask,edge)=>mask|edge.bit,0);
  // Enumerate degree-five simple graphs first: this proves requested-pair graph
  // infeasibility and identifies when every legal completion has the same pair set.
  const graphMasks=[],degrees=Array(8).fill(0);
  for(const edge of lockEdges){degrees[edge.a]++;degrees[edge.b]++;}
  function completeGraph(player,mask){
   if(player===8){if(degrees.every(degree=>degree===5))graphMasks.push(mask);return;}
   const needed=5-degrees[player],available=edges.filter(edge=>edge.a===player&&!(mask&edge.bit)&&degrees[edge.b]<5);
   function choose(start,left,current){
    if(!left){completeGraph(player+1,current);return;}
    if(available.length-start<left)return;
    for(let index=start;index<=available.length-left;index++){const edge=available[index];degrees[player]++;degrees[edge.b]++;choose(index+1,left-1,current|edge.bit);degrees[player]--;degrees[edge.b]--;}
   }
   if(needed>=0)choose(0,needed,mask);
  }
  completeGraph(0,lockMask);
  if(!graphMasks.length)throw new Error('지정 페어를 포함하면서 서로 다른 20페어·전원 5경기·러브끼리 금지를 만족하는 조합이 없습니다. 지정 페어를 조정하세요.');
  const groups=[...new Set(data.schedule.map(match=>match.time))].sort().map(time=>data.schedule.filter(match=>match.time===time));
  const teamIndex={A:0,B:1,D:2},all=255;
  const choices=groups.map(group=>{
   const result=[];
   for(const first of edges){
    if(group.length===1){result.push({edges:[first],mask:first.mask,bits:first.bit,score:first.score});continue;}
    for(const second of edges)if(!(first.mask&second.mask)&&(group[0].team!==group[1].team||first.bit<second.bit))result.push({edges:[first,second],mask:first.mask|second.mask,bits:first.bit|second.bit,score:first.score+second.score});
   }
   return result;
  });
  const suffixSlots=groups.map((_,index)=>groups.slice(index).reduce((sum,group)=>sum+group.length,0));
  const signature=matches=>matches.map(match=>pairKey(match.pair)).sort().join('|');
  const selected=[],excludedPairs=options.excludePairs||[],excludedSignatures=new Set(options.excludedSignatures||[]);
  for(const composition of excludedPairs){
   if(!Array.isArray(composition)||composition.length!==20)throw new Error('제외할 페어 구성은 서로 다른 20페어여야 합니다.');
   const pairs=requestedPairs(data,composition,'partial');excludedSignatures.add(pairs.map(pairKey).sort(textCompare).join('|'));
  }
  const distinct=new Set(excludedSignatures);
  const graphScore=mask=>edges.reduce((score,edge)=>score+((mask&edge.bit)?edge.score:0),0);
  const graphSignature=mask=>edges.filter(edge=>mask&edge.bit).map(edge=>pairKey(edge.pair)).sort().join('|');
  let graphs=graphMasks.filter(mask=>!distinct.has(graphSignature(mask))).sort((a,b)=>graphScore(a)-graphScore(b)||a-b);
  if(options.restorePairs){
   const savedMask=options.restorePairs.reduce((mask,pair)=>mask|edgeByKey.get(pairKey(pair)).bit,0);
   graphs=graphs.filter(mask=>mask===savedMask);
  }
  const paging=options.paging===true;
  const scope=profilesModel.fingerprint({algorithmVersion,version,mode,strategy,locks:locks.map(pairKey).sort(),excluded:[...distinct].sort(textCompare),schedule:data.schedule,players:names.map(name=>({name,tier:data.teams.C[name].tier}))});
  let start=0;
  if(paging&&options.cursor!=null){
   let cursor;try{cursor=JSON.parse(options.cursor);}catch{}
   if(!cursor||cursor.version!==1||cursor.scope!==scope||!Number.isSafeInteger(cursor.index)||cursor.index<0||cursor.index>graphs.length||cursor.check!==profilesModel.fingerprint({scope,index:cursor.index})){
    const error=new Error('추천 목록의 조건이 바뀌었거나 이어보기 정보가 올바르지 않습니다. 처음부터 다시 불러오세요.');error.code='PAIRING_STALE_CURSOR';throw error;
   }
   start=cursor.index;
  }
  const target=Math.min(options.restorePairs?1:paging?options.limit:strategy==='balance'?2:1,graphs.length-start);
  if(!target)return paging?{plans:[],nextCursor:null,hasMore:false}:[];
  let exhausted=false,consumed=start;
  // Fixed seeds make the bounded search and its tie breaks reproducible.
  const scanEnd=Math.min(start+24,graphs.length);
  for(let attempt=start;attempt<scanEnd&&selected.length<target;attempt++){
   const graph=graphs[attempt];consumed=attempt+1;
   let nodes=0;const counts=Array(8).fill(0),opponents=Array(24).fill(0),path=[];
   const ordered=choices.map((list,g)=>list.filter(choice=>(choice.bits&graph)===choice.bits).sort((a,b)=>{
    const noise=choice=>{let h=(attempt+1)*2654435761+g*374761393;for(const edge of choice.edges)h=Math.imul(h^(edge.bit+attempt*97),1597334677);return (h>>>0)%1000;};
    return (a.score+noise(a)*(.3+attempt*.07))-(b.score+noise(b)*(.3+attempt*.07))||a.bits-b.bits;
   }));
   function walk(groupIndex,used,previous,twice,offTwice,cost){
    if(++nodes>180000){exhausted=true;return false;}
    if(groupIndex===groups.length){
     if((used&lockMask)!==lockMask||counts.some(count=>count!==5)||opponents.some(count=>count<1||count>2))return false;
     const matches=data.schedule.map((slot,index)=>({...slot,pair:[...path[index].pair].sort()})),key=signature(matches);
     if(distinct.has(key))return false;
     distinct.add(key);selected.push({matches,cost,graphIndex:attempt});return true;
    }
    const group=groups[groupIndex],adjacent=groupIndex>0&&groups[groupIndex-1][0].endTime===group[0].time;
    const pending=lockMask&~used,pendingDegrees=Array(8).fill(0);let pendingCount=0;
    for(const edge of lockEdges)if(pending&edge.bit){pendingDegrees[edge.a]++;pendingDegrees[edge.b]++;pendingCount++;}
    if(pendingCount>suffixSlots[groupIndex]||pendingDegrees.some((degree,index)=>degree>5-counts[index]))return false;
    const preference=choice=>{
     let penalty=0;
     if(adjacent)for(let player=0;player<8;player++)if(choice.mask&(1<<player)){
      if((previous&(1<<player))&&profiles[player].restPreference==='rest')penalty++;
      if(!(previous&(1<<player))&&counts[player]&&profiles[player].restPreference==='continuous')penalty++;
     }
     return penalty;
    };
    const ranked=ordered[groupIndex].map((choice,index)=>({choice,rank:index+preference(choice)*3})).sort((a,b)=>a.rank-b.rank);
    for(const {choice} of ranked){
     if(nodes>180000)break;
     if(choice.bits&used)continue;
     const active=choice.mask,inactive=all^active;
     if(adjacent&&((active&twice)||(inactive&offTwice)))continue;
     let valid=true,min=6,max=-1,rest=0;
     for(let player=0;player<8;player++){
      const on=Number(Boolean(active&(1<<player))),next=counts[player]+on;
      if(next>5){valid=false;break;}
      // A player's remaining places must still accommodate every requested edge.
      let consumed=0;for(const edge of choice.edges)if((pending&edge.bit)&&(edge.mask&(1<<player)))consumed++;
      if(pendingDegrees[player]-consumed>5-next){valid=false;break;}
      min=Math.min(min,next);max=Math.max(max,next);
      if(on&&adjacent){if((previous&(1<<player))&&profiles[player].restPreference==='rest')rest++;if(!(previous&(1<<player))&&counts[player]&&profiles[player].restPreference==='continuous')rest++;}
     }
     if(!valid||max-min>1)continue;
     for(let slot=0;slot<choice.edges.length;slot++){
      const edge=choice.edges[slot],team=teamIndex[group[slot].team];
      if(opponents[edge.a*3+team]>=2||opponents[edge.b*3+team]>=2){valid=false;break;}
     }
     if(!valid)continue;
     for(let slot=0;slot<choice.edges.length;slot++){
      const edge=choice.edges[slot],team=teamIndex[group[slot].team];counts[edge.a]++;counts[edge.b]++;opponents[edge.a*3+team]++;opponents[edge.b*3+team]++;path.push(edge);
     }
     if(walk(groupIndex+1,used|choice.bits,active,adjacent?active&previous:0,adjacent?inactive&~previous:0,cost+choice.score+rest))return true;
     for(let slot=choice.edges.length-1;slot>=0;slot--){const edge=choice.edges[slot],team=teamIndex[group[slot].team];counts[edge.a]--;counts[edge.b]--;opponents[edge.a*3+team]--;opponents[edge.b*3+team]--;path.pop();}
    }
    return false;
   }
   walk(0,0,0,0,0,0);
  }
  if(!paging&&!selected.length&&graphs.length>24)exhausted=true;
  if(!paging&&!selected.length){
   const error=new Error(exhausted?'탐색 한도 안에서 지정 페어와 모든 일정 조건을 만족하는 편성을 찾지 못했습니다. 지정 페어를 줄이거나 조정하세요.':'지정 페어와 서로 다른 20페어·전원 5경기·연속 출전/휴식 최대 2타임·누적 출전 차이 1·상대 조별 1~2경기를 함께 만족하는 추가 편성을 찾지 못했습니다.');
   error.code=exhausted?'PAIRING_SEARCH_LIMIT':'PAIRING_NO_SCHEDULE';throw error;
  }
  const plans=(paging?selected:selected.sort((a,b)=>a.cost-b.cost||textCompare(signature(a.matches),signature(b.matches)))).map((candidate,index)=>{
   const conflicts=candidate.matches.filter(match=>edgeByKey.get(pairKey(match.pair)).conflict).length;
   const plan={id:mode+'-'+strategy+'-'+(paging?candidate.graphIndex+1:index+1),title:strategy==='balance'||strategy==='return'?(strategy==='return'?'리턴 자리 추천':'밸런스 '+(paging?candidate.graphIndex+1:index+1)+'안'):'강강 조합',description:strategy==='return'?'포·백 리턴 자리와 파트너 역할 적합도를 우선한 안입니다.':strategy==='balance'?'공식 등급 구성과 리턴 자리·역할 선호의 균형을 맞춘 안입니다.':'높은 공식 등급의 페어와 역할 선호를 반영한 안입니다. 실제 승률을 뜻하지 않습니다.',mode,strategy,matches:candidate.matches,fixedPairs:locks.map(pair=>({pair:[...pair]})),profileVersion:version,algorithmVersion,
    reasons:[conflicts?'리턴 자리 선호가 겹치는 '+conflicts+'경기는 경기 전에 자리를 조율하세요.':'확인된 리턴 자리 선호가 겹치는 경기는 없습니다.','서로 다른 20페어가 각각 1경기 출전하고 모든 선수는 정확히 5경기 출전합니다.',...(mode==='partial'?['지정한 '+locks.length+'개 페어를 각각 1경기 포함하며 다른 페어에도 같은 선수가 참여합니다.']:[]),'모든 선수는 A·B·D조를 각각 1~2경기 만나고 연속 출전·휴식은 최대 2타임, 매 시간대 누적 출전 횟수 차이는 최대 1경기입니다.']};
   const errors=validatePlan(data,plan);if(errors.length)throw new Error(errors.join(' / '));return plan;
  });
  if(!paging)return plans;
  const hasMore=consumed<graphs.length;
  if(hasMore&&selected.length<target)exhausted=true;
  return {plans,hasMore,nextCursor:hasMore?JSON.stringify({version:1,scope,index:consumed,check:profilesModel.fingerprint({scope,index:consumed})}):null,...(exhausted?{searchLimited:true}:{} )};
 }
 function generatePage(data,rawProfiles={},options={}){
  const limit=options.limit===undefined?2:options.limit;
  if(!Number.isSafeInteger(limit)||limit<1||limit>20)throw new Error('한 번에 추천할 페어 구성은 1~20개여야 합니다.');
  return generateUnique(data,rawProfiles,{mode:options.mode||'free',fixedPairs:options.fixedPairs,cursor:options.cursor,strategy:options.strategy||'balance',excludePairs:options.excludePairs,limit,paging:true});
 }
 function restorePairSet(data,rawProfiles={},pairs,options={}){
  if(!Array.isArray(pairs)||pairs.length!==20)throw new Error('즐겨찾기에는 서로 다른 20개 페어 구성이 필요합니다.');
  const saved=requestedPairs(data,pairs,'partial'),mode=options.mode||'free';
  const locks=requestedPairs(data,mode==='partial'?(options.fixedPairs||[]):[],mode),savedKeys=new Set(saved.map(pairKey));
  if(locks.some(pair=>!savedKeys.has(pairKey(pair))))throw new Error('현재 일부 고정에 지정한 페어가 이 즐겨찾기 구성에 없습니다. 지정 페어를 바꾼 뒤 불러오세요.');
  const plans=generateUnique(data,rawProfiles,{mode,fixedPairs:locks,strategy:options.strategy||'balance',restorePairs:saved});
  if(!plans.length)throw new Error('즐겨찾기 페어 구성을 현재 대회 조건에 맞춰 불러올 수 없습니다.');
  return {...plans[0],id:mode+'-saved-'+profilesModel.fingerprint(saved),title:'불러온 페어 구성'};
 }

 function generateStrategy(data,rawProfiles,options={}){
  if((options.mode||'free')!=='fixed')return generateUnique(data,rawProfiles,options);
  const mode=options.mode||'fixed',strategy=options.strategy||'balance',locks=[];
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
  const anchor=allowed[0].key,strongGrade=allowed[0].grade;
  const groups=[...new Set(data.schedule.map(match=>match.time))].sort().map(time=>data.schedule.filter(match=>match.time===time));
  const restMask=names.reduce((mask,name)=>profiles[name].restPreference==='rest'?mask|(1<<indexOf[name]):mask,0);
  const continuousMask=names.reduce((mask,name)=>profiles[name].restPreference==='continuous'?mask|(1<<indexOf[name]):mask,0);
  const bitCount=value=>{let count=0;for(;value;value&=value-1)count++;return count;};
  const pairMask=pair=>pair.reduce((mask,name)=>mask|(1<<indexOf[name]),0);
  const adjacent=groups.map((group,index)=>index>0&&groups[index-1][0].endTime===group[0].time);
  function timingMetrics(matches){
   const allPlayers=(1<<names.length)-1,counts=Array(names.length).fill(0);
   let previous=0,twice=0,offOnce=0,offTwice=0,seen=0,rest=0;
   for(const [index,group] of groups.entries()){
    if(!adjacent[index]){previous=0;twice=0;offOnce=0;offTwice=0;}
    const active=group.reduce((mask,slot)=>mask|pairMask(matches[slot.id-1].pair),0);
    const inactive=allPlayers&~active;
    if((active&twice)||(inactive&offTwice))return {rest:Infinity};
    rest+=bitCount(active&previous&restMask)+bitCount(active&~previous&seen&continuousMask);
    for(let player=0;player<names.length;player++)if(active&(1<<player))counts[player]++;
    if(Math.max(...counts)-Math.min(...counts)>1)return {rest:Infinity};
    offTwice=inactive&offOnce;offOnce=inactive;
    twice=active&previous;seen|=active;previous=active;
   }
   return {rest};
  }
  function metrics(matches){
   let conflicts=0,squares=0,fit=0,anchorCount=0,strongCount=0;
   for(const match of matches){const q=quality(match.pair);conflicts+=q.conflict;squares+=q.grade*q.grade;fit+=q.fit;if(q.key===anchor)anchorCount++;if(q.grade===strongGrade)strongCount++;}
   return {conflicts,squares,fit,anchorCount,strongCount,...timingMetrics(matches),...pairMetrics(matches)};
  }
  function pairMetrics(matches){
   const counts=new Map();for(const match of matches){const key=pairKey(match.pair);counts.set(key,(counts.get(key)||0)+1);}
   return {variation:counts.size>4,repeatExcess:[...counts.values()].reduce((sum,count)=>sum+Math.max(0,count-3),0)};
  }
  const baseVector=m=>strategy==='win'?[-m.anchorCount,mode==='free'?-m.strongCount:0,m.conflicts,-m.fit,m.squares,m.rest]:[m.conflicts,m.squares,-m.fit,m.rest];
  const vector=m=>[mode==='free'?m.repeatExcess:0,mode!=='fixed'&&names.length-lockedNames.size>=4&&!m.variation?1:0,...baseVector(m)];
  function compare(a,b){const av=vector(a),bv=vector(b);for(let i=0;i<av.length;i++)if(av[i]!==bv[i])return av[i]-bv[i];return 0;}
  const layoutCache=new Map();
  function arrange(pairs){
   const order=[0,1,2,3],pairRest=pairs.map(pair=>pair.filter(name=>profiles[name].restPreference==='rest').length),pairContinuous=pairs.map(pair=>pair.filter(name=>profiles[name].restPreference==='continuous').length);
   order.sort((a,b)=>pairRest[a]-pairRest[b]||pairContinuous[a]-pairContinuous[b]||a-b);
   const rest=order.map(index=>pairRest[index]),continuous=order.map(index=>pairContinuous[index]);
   const cacheKey=rest.join('')+continuous.join('');if(layoutCache.has(cacheKey))return layoutCache.get(cacheKey).map(index=>order[index]);
   const teamIndex={A:0,B:1,D:2};
   let states=new Map([['000000000000:0:0:0',{counts:[0,0,0,0],opponents:Array(12).fill(0),mask:0,twice:0,offTwice:0,cost:0,path:[]}]]);
   for(const [groupIndex,group] of groups.entries()){
    const next=new Map(),choices=[];
    for(let a=0;a<4;a++)if(group.length===1)choices.push([a]);else for(let b=0;b<4;b++)if(a!==b)choices.push([a,b]);
    for(const current of states.values())for(const choice of choices){
     if(choice.some(index=>current.counts[index]>=5))continue;
     const opponents=[...current.opponents];
     for(let slot=0;slot<choice.length;slot++)opponents[choice[slot]*3+teamIndex[group[slot].team]]++;
     if(opponents.some(count=>count>2))continue;
     const counts=[...current.counts],mask=choice.reduce((mask,index)=>mask|(1<<index),0),previous=adjacent[groupIndex]?current.mask:0;
     const inactive=15&~mask;
     if(adjacent[groupIndex]&&((mask&current.twice)||(inactive&current.offTwice)))continue;
     const twice=mask&previous,offTwice=adjacent[groupIndex]?inactive&~current.mask:0;let cost=current.cost;
     for(const index of choice){cost+=previous&(1<<index)?rest[index]:current.counts[index]>0?continuous[index]:0;counts[index]++;}
     if(Math.max(...counts)-Math.min(...counts)>1)continue;
     const key=opponents.join('')+':'+mask+':'+twice+':'+offTwice,existing=next.get(key);
     if(!existing||cost<existing.cost)next.set(key,{counts,opponents,mask,twice,offTwice,cost,path:[...current.path,...choice]});
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
  if(!candidates.length)throw new Error('출전·휴식 분산과 상대 조 조건을 함께 만족할 수 없습니다. 고정 페어를 조정해 주세요.');
  function signature(matches){const counts=new Map();for(const match of matches){const key=pairKey(match.pair);counts.set(key,(counts.get(key)||0)+1);}return [...counts].sort().map(([key,count])=>key+':'+count).join('|');}
  const distinct=new Set(),selected=[];
  for(const candidate of candidates){const key=signature(candidate.matches);if(distinct.has(key))continue;distinct.add(key);selected.push(candidate);if(selected.length===(strategy==='balance'?2:1))break;}
  const descriptions={balance:'등급 구성과 리턴 자리·역할 선호의 균형을 맞춘 안입니다.',win:'공식 등급이 높은 두 선수를 함께 배치하는 안입니다. 실제 실력이나 승률을 의미하지 않습니다.'};
  return selected.map((candidate,index)=>{
   const reasons=[];
   if(candidate.metrics.conflicts)reasons.push('리턴 자리 선호가 겹치는 경기가 있습니다. 경기 전에 자리를 조율하세요.');else reasons.push('확인된 리턴 자리 선호가 서로 충돌하는 경기는 없습니다.');
   if(names.some(name=>!profiles[name].position||!profiles[name].courtPreference))reasons.push('미입력은 실력이나 약점으로 추정하지 않았습니다. 편한 위치를 함께 확인하세요.');
   if(mode==='partial')reasons.push('지정한 '+locks.length+'개 페어는 함께 5경기 출전합니다. 나머지 인원은 자유 조합입니다.');
   if(mode==='free')reasons.push('같은 페어는 전체 출전표에서 최대 3경기까지만 함께 출전합니다.');
   reasons.push('모든 선수가 A·B·D조를 만나고, 같은 상대 조와는 최대 2경기 출전합니다.');
   reasons.push('모든 선수의 연속 출전·휴식은 최대 2타임이고, 매 시간대까지의 선수 간 출전 횟수 차이는 최대 1경기입니다. 경기·휴식 선호는 이 범위에서만 참고합니다.');
   const plan={id:mode+'-'+strategy+'-'+(index+1),title:strategy==='balance'?'밸런스 '+(index+1)+'안':'강강 조합',description:descriptions[strategy],mode,strategy,
    matches:candidate.matches.map(match=>({...match,pair:[...match.pair].sort()})),fixedPairs:(mode==='fixed'?[...new Map(candidate.matches.map(match=>[pairKey(match.pair),match.pair])).values()]:locks).map(pair=>({pair:[...pair].sort()})),
    reasons,profileVersion:version,algorithmVersion};
   const errors=validateLegacyPlan(data,plan);if(errors.length)throw new Error(errors.join(' / '));
   if(restViolations(data,plan.matches,profiles).length)throw new Error('휴식 선호의 연속 출전 제한을 만족하지 못했습니다.');
   if(opponentViolations(data,plan.matches).length)throw new Error('상대 조별 출전 분산 조건을 만족하지 못했습니다.');return plan;
  });
 }
 function generate(data,rawProfiles={},options={}){
  const balance=generateStrategy(data,rawProfiles,{...options,strategy:'balance'});
  const excludedSignatures=balance.map(plan=>plan.matches.map(match=>pairKey(match.pair)).sort().join('|'));
  try{return [...balance,...generateStrategy(data,rawProfiles,{...options,strategy:'win',excludedSignatures})];}
  catch(error){
   if(!balance.length||!['PAIRING_SEARCH_LIMIT','PAIRING_NO_SCHEDULE'].includes(error.code))throw error;
   return balance.map(plan=>({...plan,reasons:[...plan.reasons,'추가 강강 후보를 찾지 못해 확인된 밸런스 후보를 제공합니다. '+error.message]}));
  }
 }
 const model={algorithmVersion,modeLabels,strategyLabels,pairKey,legalPair,partitions,validatePlan,validateLineup,consecutivePlayDetails,consecutivePlayWarnings,restViolations,opponentViolations,swapPairs,generatePage,restorePairSet,generate};
 if(typeof module==='object'&&module.exports)module.exports=model;else root.PAIRING_MODEL=model;
})(typeof window==='undefined'?globalThis:window);
