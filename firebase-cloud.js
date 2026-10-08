import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { collection, doc, getDocs, getFirestore, onSnapshot, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';

const app=initializeApp({
 apiKey:'AIzaSyDM-UxfDeXw1pFVrQ7MRzeMr051sfCXLP0',authDomain:'team-c-victory.firebaseapp.com',projectId:'team-c-victory',
 storageBucket:'team-c-victory.firebasestorage.app',messagingSenderId:'666605203672',appId:'1:666605203672:web:c76d72181d352a0b5167ad'
});
const auth=getAuth(app),db=getFirestore(app),functions=getFunctions(app,'asia-northeast3');
const refs={profiles:collection(db,'playerProfilesV2'),traits:collection(db,'playerTraits'),suggestions:collection(db,'traitSuggestions'),keywords:collection(db,'keywordSuggestions')};
const state={status:'connecting',pendingCount:0,lineup:null,lineupReady:false};
window.PLAYER_PROFILE_CLOUD=state;
let started=false,ready=false,migrating=false;
const records={profiles:new Map(),traits:new Map(),suggestions:new Map(),keywords:new Map()};
const received=new Set(),pending=new Map(),pendingFields=new Map(),queue=new Map(),writing=new Set();
const emit=(name,detail)=>window.dispatchEvent(new CustomEvent(name,{detail}));
function notifyStatus(status,error){
 state.status=status;state.pendingCount=pending.size;state.errorCode=error?.code||'';
 const messages={
  'auth/operation-not-allowed':'Firebase Authentication에서 익명 로그인을 켜 주세요.',
  'permission-denied':'Firestore 규칙을 최신 firestore.rules로 게시해 주세요.',
  'auth/unauthorized-domain':'Firebase Authentication 승인 도메인을 확인해 주세요.',
  'auth/invalid-api-key':'Firebase 웹 앱 설정값을 확인해 주세요.',
  'unavailable':'네트워크 연결을 확인해 주세요. 입력은 이 브라우저에 임시 저장됩니다.'
 };
 state.message=status==='ready'?(pending.size?'팀 공유 저장 중 · 이 브라우저에도 임시 저장':'팀원과 실시간으로 공유 중입니다.')
  :status==='connecting'?'팀 공유 저장소 연결 중 · 이 브라우저에도 임시 저장'
  :messages[state.errorCode]||`팀 공유 저장 실패 (${state.errorCode||'원인 코드 없음'}) · 이 브라우저에 임시 저장`;
 emit('playerprofilecloudstatuschange');
}
const teamOf=id=>id.split(':')[0];
const cloudProfile=raw=>{const profile={...raw};delete profile.traits;return profile;};
const equal=(a,b)=>window.PLAYER_PROFILE_MODEL.stableStringify(a)===window.PLAYER_PROFILE_MODEL.stableStringify(b);
function publishProfiles(){
 if(!ready)return;
 const profiles=window.PLAYER_PROFILES.all();
 for(const [id,record] of records.profiles){
  if(!window.PLAYER_PROFILES.has(id))continue;
  const raw={...record.profile,traits:records.traits.get(id)?.items||[]};
  let desired=pending.get(id);
  if(desired&&pendingFields.get(id)){desired={...raw,...Object.fromEntries([...pendingFields.get(id)].map(key=>[key,desired[key]]))};pending.set(id,desired);if(queue.has(id))queue.set(id,desired);}
  if(desired&&equal(cloudProfile(desired),record.profile)&&(teamOf(id)!=='C'||equal(desired.traits,raw.traits))){pending.delete(id);pendingFields.delete(id);}
  profiles[id]=desired&&!equal(desired,raw)?desired:window.PLAYER_PROFILE_MODEL.cleanProfile(raw,teamOf(id));
 }
 for(const [id,raw] of pending)profiles[id]=raw;
 emit('playerprofilescloudchange',{profiles});
 notifyStatus('ready');
}
function publishSuggestions(){
 const traits=[...new Set([...records.suggestions.values()].map(item=>item.text).filter(text=>typeof text==='string'))].sort();
 emit('playertraitssuggestionschange',{suggestions:traits});
 const suggestions={};
 for(const item of records.keywords.values())if(Object.hasOwn(window.PLAYER_PROFILE_MODEL.keywordKinds,item.kind)&&typeof item.text==='string'){
  (suggestions[item.kind]??=[]).push(item.text);
 }
 for(const kind of Object.keys(suggestions))suggestions[kind]=[...new Set(suggestions[kind])].sort();
 emit('playerkeywordsuggestionschange',{suggestions});
}
async function createIfMissing(ref,id,data,timestamp='updatedAt'){
 await runTransaction(db,async transaction=>{
  const target=doc(ref,id),existing=await transaction.get(target);
  if(!existing.exists())transaction.set(target,{...data,[timestamp]:serverTimestamp()});
 });
}
async function addSuggestions(raw,id){
 const model=window.PLAYER_PROFILE_MODEL;
 const entries=teamOf(id)==='C'?raw.traits.map(text=>({ref:refs.suggestions,records:records.suggestions,text,data:{text}}))
  :raw.keywords.map(item=>({ref:refs.keywords,records:records.keywords,text:item.text,data:item}));
 for(const entry of entries){
  const key='s_'+model.fingerprint(entry.data);
  if(!entry.records.has(key)){
   await createIfMissing(entry.ref,key,entry.data,'createdAt');
   entry.records.set(key,entry.data);
  }
 }
}
async function flush(id){
 if(!ready||writing.has(id))return;
 writing.add(id);
 try{
  while(queue.has(id)){
   const raw=queue.get(id);queue.delete(id);
   const fields=pendingFields.get(id)?new Set(pendingFields.get(id)):null;
   await runTransaction(db,async transaction=>{
    const target=doc(refs.profiles,id),existing=await transaction.get(target);
    const patch=fields?Object.fromEntries([...fields].filter(key=>key!=='traits').map(key=>[key,raw[key]])):cloudProfile(raw);
    const profile=cloudProfile(window.PLAYER_PROFILE_MODEL.cleanProfile({...existing.data()?.profile,...patch},teamOf(id)));
    if(!fields||Object.keys(patch).length)transaction.set(target,{profile,updatedAt:serverTimestamp()});
    if(teamOf(id)==='C'&&(!fields||fields.has('traits')))transaction.set(doc(refs.traits,id),{items:raw.traits,updatedAt:serverTimestamp()});
   });
   await addSuggestions(raw,id);
  }
 }catch(error){
  if(pending.has(id)&&!queue.has(id))queue.set(id,pending.get(id));
  console.error('Firestore profile save failed',error);notifyStatus('error',error);
 }finally{writing.delete(id);}
}
state.saveProfile=(id,raw,fields=null)=>{
 if(!window.PLAYER_PROFILES.has(id))return;
 const profile=window.PLAYER_PROFILE_MODEL.cleanProfile(raw,teamOf(id));
 const wasFull=pending.has(id)&&!pendingFields.has(id);
 if(fields&&!wasFull){const existing=pendingFields.get(id)||new Set();for(const field of fields)existing.add(field);pendingFields.set(id,existing);}else pendingFields.delete(id);
 pending.set(id,profile);queue.set(id,profile);
 notifyStatus(ready?'ready':'connecting');
 return flush(id);
};
state.retry=()=>{if(ready)for(const id of queue.keys())void flush(id);};
async function migrate(){
 const legacy=await getDocs(collection(db,'playerProfiles'));
 const old=new Map(legacy.docs.map(item=>[item.id,item.data()])),local=window.PLAYER_PROFILES.all();
 for(const [id,localProfile] of Object.entries(local)){
  if(records.profiles.has(id))continue;
  const raw=old.has(id)?{...old.get(id).profile,traits:records.traits.get(id)?.items||old.get(id).profile?.traits||[]}:localProfile;
  const profile=window.PLAYER_PROFILE_MODEL.cleanProfile(raw,teamOf(id),localProfile.keywords||[]);
  await createIfMissing(refs.profiles,id,{profile:cloudProfile(profile)});
  if(teamOf(id)==='C')await createIfMissing(refs.traits,id,{items:profile.traits});
  await addSuggestions(profile,id);
 }
 const snapshots=await Promise.all(Object.values(refs).map(ref=>getDocs(ref)));
 Object.keys(refs).forEach((key,index)=>{records[key]=new Map(snapshots[index].docs.map(item=>[item.id,item.data()]));});
 ready=true;publishProfiles();publishSuggestions();
 for(const id of queue.keys())void flush(id);
}
function start(){
 if(started||!window.PLAYER_PROFILES)return;started=true;
 signInAnonymously(auth).then(()=>{
  for(const [key,ref] of Object.entries(refs))onSnapshot(ref,snapshot=>{
   records[key]=new Map(snapshot.docs.map(item=>[item.id,item.data()]));received.add(key);
   if(received.size===Object.keys(refs).length&&!migrating){migrating=true;void migrate().catch(error=>{console.error('Profile migration failed',error);notifyStatus('error',error);});}
   else if(ready){if(key==='profiles'||key==='traits')publishProfiles();else publishSuggestions();}
  },error=>{console.error('Firestore subscription failed',error);notifyStatus('error',error);});
  onSnapshot(doc(db,'teamLineups','C'),snapshot=>{
   state.lineup=snapshot.exists()?snapshot.data():null;state.lineupReady=true;state.lineupError='';emit('teamlineupchange',{lineup:state.lineup});
  },error=>{state.lineupError=error.code;state.lineupReady=false;emit('teamlineupchange',{error:error.code});});
 }).catch(error=>{console.error('Anonymous sign-in failed',error);notifyStatus('error',error);});
}
state.saveLineup=async(plan,expectedRevision)=>{
 if(!ready||!state.lineupReady)throw new Error('팀 공유 저장소 연결 후 확정할 수 있습니다.');
 const errors=window.PAIRING_MODEL.validatePlan(window.BOARD_DATA,plan,plan.fixedPairs||[]);
 if(errors.length)throw new Error(errors.join(' / '));
 const target=doc(db,'teamLineups','C');
 await runTransaction(db,async transaction=>{
  const current=await transaction.get(target),revision=current.exists()?current.data().revision:0;
  if(revision!==expectedRevision)throw new Error('다른 팀원이 출전표를 확정했습니다. 최신 확정표를 확인한 뒤 다시 선택해 주세요.');
  transaction.set(target,{...plan,revision:revision+1,confirmedAt:serverTimestamp(),confirmedBy:auth.currentUser.uid});
 });
};
state.analyzeMatchup=async request=>{
 if(!ready)throw new Error('팀 공유 저장소 연결 후 AI 분석을 사용할 수 있습니다.');
 const response=await httpsCallable(functions,'analyzeMatchup',{timeout:65000})(request);
 return response.data;
};
state.subscribeAnalysis=(key,onResult,onError)=>onSnapshot(doc(db,'matchupAnalyses',key),snapshot=>{
 if(snapshot.exists())onResult(snapshot.data());
},onError);
window.addEventListener('playerprofileschange',event=>{
 if(event.detail?.cloudRefresh)return;
 const {team,name,fields}=event.detail||{};
 if(team&&name)void state.saveProfile(team+':'+name,window.PLAYER_PROFILES.get(team,name),fields);
});
window.addEventListener('online',state.retry);
window.addEventListener('playerprofilesready',start,{once:true});
if(window.PLAYER_PROFILES)start();
