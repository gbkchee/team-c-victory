(function(root){
'use strict';
const teamNames=['A','B','C','D'];
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);
const roster=(data,team)=>Object.keys(data.teams[team]||{}).map(name=>team+':'+name);
const playerCap=(data,team,id)=>team==='B'?6:5;
const pairKey=pair=>[...pair].sort().join('|');
const matchesFor=(data,team)=>data.tournamentSchedule.filter(match=>match.sides.some(side=>side.team===team)).sort((a,b)=>a.sides.find(s=>s.team===team).number-b.sides.find(s=>s.team===team).number);
function validateRecords(data,records){
 const errors=[],counts={},used=new Set(),occupied=new Set();
 if(!records||typeof records!=='object'||Array.isArray(records))return ['경기 기록 형식을 확인해 주세요.'];
 for(const [matchId,sides] of Object.entries(records)){
  const match=data.tournamentSchedule.find(row=>row.id===matchId);
  if(!match||!sides||typeof sides!=='object'||Array.isArray(sides)){errors.push('공식 경기 정보를 확인해 주세요.');continue;}
  for(const [team,pair] of Object.entries(sides)){
   if(!match.sides.some(side=>side.team===team)){errors.push('해당 경기의 참가 팀을 확인해 주세요.');continue;}
   if(!Array.isArray(pair)||pair.length!==2||pair[0]===pair[1]||!pair.every(id=>roster(data,team).includes(id))){errors.push(team+'팀 등록 선수 2명을 선택해 주세요.');continue;}
   if(pair.every(id=>data.teams[team][id.slice(2)].tier==='love'))errors.push('러브·러브 조합은 출전할 수 없습니다.');
   const key=team+':'+pairKey(pair);
   if(used.has(key))errors.push(team+'팀에서 이미 출전한 조합입니다.');used.add(key);
   for(const id of pair){
    counts[id]=(counts[id]||0)+1;
    if(counts[id]>playerCap(data,team,id))errors.push(id.slice(2)+' 선수의 출전 횟수를 초과합니다.');
    const slot=match.time+':'+id;
    if(occupied.has(slot))errors.push(id.slice(2)+' 선수는 같은 시간 두 코트에 출전할 수 없습니다.');occupied.add(slot);
   }
  }
 }
 return [...new Set(errors)];
}
function withRecord(records,matchId,team,pair){
 const next={...records,[matchId]:{...records[matchId]}};
 if(pair===null)delete next[matchId][team];else next[matchId][team]=[...pair];
 if(!Object.keys(next[matchId]).length)delete next[matchId];
 return next;
}
function candidates(data,records,matchId,team,options={}){
 const match=data.tournamentSchedule.find(row=>row.id===matchId);
 if(!match?.sides.some(side=>side.team===team))return {pairs:[],count:0,showPairs:false,knownCount:0,unknownCount:20,conditional:true,errors:['공식 경기 정보를 확인해 주세요.']};
 const base=options.editing===false?records:withRecord(records,matchId,team,null),errors=validateRecords(data,base);
 const players=roster(data,team),pairs=[];
 if(!errors.length)for(let a=0;a<players.length;a++)for(let b=a+1;b<players.length;b++){
  // Completed target sides have no future candidate; editing may retain their current pair.
  const next=withRecord(base,matchId,team,[players[a],players[b]]);
  if(options.editing===false&&records[matchId]?.[team])continue;
  if(!validateRecords(data,next).length)pairs.push([players[a],players[b]]);
 }
 const knownCount=matchesFor(data,team).filter(row=>own(records[row.id],team)).length;
 const recorded=options.editing===false&&own(records[matchId],team);
 return {pairs,count:pairs.length,showPairs:!errors.length&&!recorded&&pairs.length<=5,knownCount,unknownCount:20-knownCount,conditional:true,errors};
}
function encodeTeam(data,records,team){
 const appearances=Object.fromEntries(roster(data,team).map(id=>[id,[]])),slots={},pairKeys={};
 for(const match of matchesFor(data,team)){
  const pair=records[match.id]?.[team];if(!pair)continue;
  const number=match.sides.find(side=>side.team===team).number;
  for(const id of pair)appearances[id].push(number);
  slots[String(number)]={players:[...pair].sort()};pairKeys[String(number)]=pairKey(pair);
 }
 return {slots,pairKeys,appearances};
}
function decodeTeam(data,team,record){
 if(!record)return {};
 if(!record.slots||typeof record.slots!=='object'||Array.isArray(record.slots))throw new Error('공유 경기 기록 형식을 확인해 주세요.');
 const result={};
 matchesFor(data,team).forEach(match=>{const number=match.sides.find(side=>side.team===team).number,pair=record.slots[String(number)]?.players;if(pair===undefined)return;if(!Array.isArray(pair)||pair.length!==2)throw new Error('공유 경기 기록 형식을 확인해 주세요.');result[match.id]={[team]:[...pair]};});
 const errors=validateRecords(data,result);if(errors.length)throw new Error(errors.join(' / '));
 return result;
}
function createFirestoreStore({data,db,doc,runTransaction,serverTimestamp}){
 return {save:async(matchId,team,pair,expectedRevision,uid)=>{
  if(!uid)throw Object.assign(new Error('로그인 후 기록할 수 있습니다.'),{code:'unauthenticated'});
  const targetMatch=data.tournamentSchedule.find(match=>match.id===matchId);
  if(!teamNames.includes(team)||!targetMatch?.sides.some(side=>side.team===team)||!Number.isInteger(expectedRevision)||expectedRevision<0)throw Object.assign(new Error('공식 경기와 기록 버전을 확인해 주세요.'),{code:'invalid-argument'});
  return runTransaction(db,async transaction=>{
   const target=doc(db,'tournamentObservations',team),snapshot=await transaction.get(target),current=snapshot.exists()?snapshot.data():null;
   const revision=current?.revision||0;
   if(revision!==expectedRevision)throw Object.assign(new Error('다른 팀원이 경기 기록을 변경했습니다. 최신 기록을 확인한 뒤 다시 저장해 주세요.'),{code:'conflict'});
   const next=withRecord(decodeTeam(data,team,current),matchId,team,pair),errors=validateRecords(data,next);
   if(errors.length)throw Object.assign(new Error(errors.join(' / ')),{code:'invalid-argument'});
   transaction.set(target,{...encodeTeam(data,next,team),changedSlot:String(targetMatch.sides.find(side=>side.team===team).number),revision:revision+1,updatedAt:serverTimestamp(),updatedBy:uid});
   return {records:next,revision:revision+1};
  });
 }};
}
const api={roster,playerCap,pairKey,matchesFor,validateRecords,withRecord,candidates,encodeTeam,decodeTeam,createFirestoreStore};
if(typeof module==='object'&&module.exports)module.exports=api;else root.TOURNAMENT_MODEL=api;
})(typeof window==='undefined'?globalThis:window);
