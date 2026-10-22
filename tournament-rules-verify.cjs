'use strict';
// Run only through a local Firestore emulator; no production project is accepted.
const assert=require('node:assert/strict'),data=require('./data.js'),model=require('./tournament-model.js');
const host=process.env.FIRESTORE_EMULATOR_HOST,project='demo-teamc-observations';
if(!host||!/^127\.0\.0\.1:\d+$/.test(host))throw new Error('Set FIRESTORE_EMULATOR_HOST to a local emulator before running this gate.');
const base='http://'+host+'/v1/projects/'+project+'/databases/(default)/documents';
const encode=value=>typeof value==='string'?{stringValue:value}:typeof value==='number'?{integerValue:String(value)}:Array.isArray(value)?{arrayValue:{values:value.map(encode)}}:{mapValue:{fields:Object.fromEntries(Object.entries(value).map(([key,item])=>[key,encode(item)]))}};
const segment=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const token=segment({alg:'none',typ:'JWT'})+'.'+segment({aud:project,iss:'https://securetoken.google.com/'+project,sub:'rules-test-user',user_id:'rules-test-user',iat:Math.floor(Date.now()/1000)-10,exp:Math.floor(Date.now()/1000)+3600,firebase:{sign_in_provider:'anonymous'}})+'.';
function complete(team){
 const matches=model.matchesFor(data,team),players=model.roster(data,team),loves=players.filter(id=>data.teams[team][id.slice(2)].tier==='love');
 const groups=[];for(const match of matches){const group=groups.at(-1);if(group&&group[0].time===match.time)group.push(match);else groups.push([match]);}
 const doubles=groups.filter(group=>group.length===2),singles=groups.filter(group=>group.length===1);
 // The eight-player schedule needs ten two-pair units. Two singles can share
 // a unit because their matches occur at different times.
 if(players.length===8){
  const units=[...doubles,...Array.from({length:singles.length/2},(_,index)=>[singles[index*2][0],singles[index*2+1][0]])];
  assert.equal(units.length,10);
  const rotating=players.slice(0,7),rounds=[];
  for(let round=0;round<7;round++){
   rounds.push([[players[7],rotating[0]],[rotating[1],rotating[6]],[rotating[2],rotating[5]],[rotating[3],rotating[4]]]);
   rotating.unshift(rotating.pop());
  }
  const selected=rounds.filter(round=>!round.some(pair=>pair.includes(loves[0])&&pair.includes(loves[1]))).slice(0,5);
  assert.equal(selected.length,5);
  const records={};for(let index=0;index<units.length;index++)for(let side=0;side<2;side++)records[units[index][side].id]={[team]:selected[Math.floor(index/2)][index%2*2+side]};
  assert.deepEqual(model.validateRecords(data,records),[]);return records;
 }
 // B has seven players: K7 minus the forbidden love pair is exactly twenty
 // unique pairs. Partition eight disjoint double slots; four slots are single.
 const edges=[];for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++)if(!(loves.includes(players[i])&&loves.includes(players[j])))edges.push([players[i],players[j]]);
 function assign(index,remaining,records){
  if(index===doubles.length){for(let i=0;i<singles.length;i++)records[singles[i][0].id]={[team]:remaining[i]};return records;}
  for(let i=0;i<remaining.length;i++)for(let j=i+1;j<remaining.length;j++)if(!remaining[i].some(id=>remaining[j].includes(id))){
   const next={...records,[doubles[index][0].id]:{[team]:remaining[i]},[doubles[index][1].id]:{[team]:remaining[j]}};
   const result=assign(index+1,remaining.filter((_,n)=>n!==i&&n!==j),next);if(result)return result;
  }
  return null;
 }
 const result=assign(0,edges,{});assert.ok(result,'complete '+team);assert.deepEqual(model.validateRecords(data,result),[]);return result;
}
async function write(team,document,expectedStatus=200){
 const payload={...document};delete payload.updatedAt;
 const fields=encode(payload).mapValue.fields;
 const response=await fetch(base+':commit',{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({writes:[{update:{name:'projects/'+project+'/databases/(default)/documents/tournamentObservations/'+team,fields},updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]}]})});
 const text=await response.text();assert.equal(response.status,expectedStatus,'write '+team+' '+text);return text;
}
const decode=value=>Object.hasOwn(value,'stringValue')?value.stringValue:Object.hasOwn(value,'integerValue')?Number(value.integerValue):Object.hasOwn(value,'arrayValue')?(value.arrayValue.values||[]).map(decode):Object.hasOwn(value,'mapValue')?Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([key,item])=>[key,decode(item)])):null;
async function get(team){const response=await fetch(base+'/tournamentObservations/'+team,{headers:{Authorization:'Bearer '+token}});if(response.status===404)return null;assert.equal(response.status,200,'read '+team);return decode({mapValue:{fields:(await response.json()).fields}});}
async function runTransaction(_db,callback){let pending=null;const transaction={get:async team=>{const current=await get(team);return {exists:()=>current!==null,data:()=>current};},set:(team,record)=>{pending={team,record};}};const result=await callback(transaction);assert.ok(pending);await write(pending.team,pending.record);return result;}
const store=model.createFirestoreStore({data,db:null,doc:(_db,_collection,team)=>team,runTransaction,serverTimestamp:()=>null});
async function main(){
 const first=model.matchesFor(data,'A')[0];
 await store.save(first.id,'A',model.candidates(data,{},first.id,'A').pairs[0],0,'rules-test-user');
 await store.save(first.id,'A',null,1,'rules-test-user');
 console.log('PASS real store first save and clear: A');
 // Seed the seven-player ledger with emulator admin access, then use normal rules.
 const bFirst=model.matchesFor(data,'B')[0],legacyRecords={[bFirst.id]:{B:['B:새벽','B:감자']}};
 const legacy={...model.encodeTeam(data,legacyRecords,'B'),changedSlot:'1',revision:1,updatedBy:'rules-test-user'};
 delete legacy.appearances['B:톡기'];
 const seeded=await fetch(base+'/tournamentObservations/B',{method:'PATCH',headers:{'content-type':'application/json',Authorization:'Bearer owner'},body:JSON.stringify({fields:encode(legacy).mapValue.fields})});
 assert.equal(seeded.status,200);
 await store.save(bFirst.id,'B',['B:새벽','B:감자'],1,'rules-test-user');
 assert.deepEqual((await get('B')).appearances['B:톡기'],[]);
 await store.save(bFirst.id,'B',['B:톡기','B:땡이'],2,'rules-test-user');
 assert.deepEqual((await get('B')).appearances['B:톡기'],[1]);
 const removed=await fetch(base+'/tournamentObservations/B',{method:'DELETE',headers:{Authorization:'Bearer owner'}});assert.equal(removed.status,200);
 console.log('PASS legacy B ledger upgrade and new Tokki pair through real rules');
 for(const team of ['A','B','C','D']){
  const records=complete(team),matches=model.matchesFor(data,team);let revision=team==='A'?2:0;
  for(const match of matches){await store.save(match.id,team,records[match.id][team],revision,'rules-test-user');revision++;}
  const document={...model.encodeTeam(data,records,team),changedSlot:'20',revision,updatedBy:'rules-test-user'};
  console.log('PASS real store full twenty observed sides: '+team);
  const nextRevision=document.revision+1;
  const tampered=structuredClone(document);tampered.revision=nextRevision;const id=Object.keys(tampered.appearances).find(key=>tampered.appearances[key].length);tampered.appearances[id].pop();await write(team,tampered,403);
  const duplicate=structuredClone(document);duplicate.revision=nextRevision;duplicate.changedSlot='2';duplicate.slots['2']=duplicate.slots['1'];duplicate.pairKeys['2']=duplicate.pairKeys['1'];await write(team,duplicate,403);
  const moved=structuredClone(document);moved.revision=nextRevision;moved.changedSlot='3';[moved.slots['1'],moved.slots['2']]=[moved.slots['2'],moved.slots['1']];[moved.pairKeys['1'],moved.pairKeys['2']]=[moved.pairKeys['2'],moved.pairKeys['1']];await write(team,moved,403);
  const reversed=structuredClone(document);reversed.revision=nextRevision;reversed.slots['20'].players.reverse();await write(team,reversed,403);
  const wrongType=structuredClone(document);wrongType.revision=nextRevision;wrongType.slots['20'].players={};await write(team,wrongType,403);
  await write(team,{...document,revision:document.revision},403);
  await write(team,{...document,revision:nextRevision,updatedBy:'another-user'},403);
  const invalidRecords=structuredClone(records),sameTime=Object.values(Object.groupBy(model.matchesFor(data,team),row=>row.time)).find(rows=>rows.length===2),first=sameTime[0].id,second=sameTime[1].id;
  invalidRecords[second][team]=[invalidRecords[first][team][0],model.roster(data,team).find(player=>!invalidRecords[first][team].includes(player))];
  const changedNumber=sameTime[1].sides.find(side=>side.team===team).number;
  await write(team,{...model.encodeTeam(data,invalidRecords,team),changedSlot:String(changedNumber),revision:nextRevision,updatedBy:'rules-test-user'},403);
  await store.save(matches[19].id,team,null,revision,'rules-test-user');
  console.log('PASS forged ledger, duplicate, stale revision, user, simultaneous rejected; real store clear accepted: '+team);
 }
 const unauthenticated=await fetch(base+'/tournamentObservations/A');assert.equal(unauthenticated.status,403);
 console.log('PASS Firestore runtime rules gate (local emulator only)');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
