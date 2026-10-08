'use strict';
const {AnalysisError}=require('./analysis-service.cjs');
function createFirestoreStore(db,model,data,serverTimestamp){
 const store={
 async loadPlayers(ids){
  const references=ids.map(id=>db.doc('playerProfilesV2/'+id));
  const cIds=ids.filter(id=>id.startsWith('C:'));
  const snapshots=await db.getAll(...references,...cIds.map(id=>db.doc('playerTraits/'+id)));
  const traits=new Map(cIds.map((id,index)=>[id,snapshots[ids.length+index].data()?.items||[]]));
  return ids.map((id,index)=>{
   if(!snapshots[index].exists)throw new AnalysisError('failed-precondition','선수 정보를 팀 저장소에 저장한 뒤 다시 분석해 주세요.');
   const split=id.indexOf(':'),team=id.slice(0,split),name=id.slice(split+1);return {id,tier:data.teams[team][name].tier,profile:model.cleanProfile({...snapshots[index].data().profile,traits:traits.get(id)||[]},team)};
  });
 },
 async claim({analysisKey,version,modelName,promptVersion,now,day,limit,attempt}){
  const target=db.doc('matchupAnalyses/'+analysisKey),usage=db.doc('aiUsage/'+day);
  return db.runTransaction(async transaction=>{
   const [existing,budget]=await Promise.all([transaction.get(target),transaction.get(usage)]),record=existing.data();
   if(record?.status==='ready')return record;
   if(record?.status==='pending'&&record.leaseUntil>now)return {status:'pending'};
   const count=budget.data()?.count||0;
   if(!Number.isInteger(limit)||limit<1||count>=limit)throw new AnalysisError('resource-exhausted','오늘의 신규 AI 분석 한도에 도달했습니다. 저장된 분석은 계속 사용할 수 있습니다.','daily-limit');
   transaction.set(usage,{count:count+1,updatedAt:serverTimestamp()});
   transaction.set(target,{status:'pending',attempt,leaseUntil:now+90000,profileVersion:version,modelName,promptVersion,updatedAt:serverTimestamp()});
   return {status:'claimed'};
  });
 },
 async complete(key,attempt,record){await store.finish(key,attempt,record);},
 async fail(key,attempt,record){await store.finish(key,attempt,record);},
 async finish(key,attempt,record){
  const target=db.doc('matchupAnalyses/'+key);
  await db.runTransaction(async transaction=>{const snapshot=await transaction.get(target);if(snapshot.data()?.attempt===attempt)transaction.set(target,{...record,updatedAt:serverTimestamp()});});
 }
};
 return store;
}
module.exports={createFirestoreStore};
