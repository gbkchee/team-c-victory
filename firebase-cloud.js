import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { collection, doc, getDocs, getFirestore, onSnapshot, runTransaction, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const app=initializeApp({
 apiKey:'AIzaSyDM-UxfDeXw1pFVrQ7MRzeMr051sfCXLP0',authDomain:'team-c-victory.firebaseapp.com',projectId:'team-c-victory',
 storageBucket:'team-c-victory.firebasestorage.app',messagingSenderId:'666605203672',appId:'1:666605203672:web:c76d72181d352a0b5167ad'
});
const auth=getAuth(app),db=getFirestore(app);
const refs={profiles:collection(db,'playerProfilesV2'),traits:collection(db,'playerTraits'),suggestions:collection(db,'traitSuggestions'),keywords:collection(db,'keywordSuggestions')};
const gemini=window.GEMINI_ANALYSIS,aiConfig=window.GEMINI_CONFIG;
const state={status:'connecting',pendingCount:0,lineup:null,lineupReady:false,aiProvider:'Gemini',aiStatus:aiConfig?.appCheckSiteKey?'ready':'setup'};
window.PLAYER_PROFILE_CLOUD=state;
let started=false,ready=false,migrating=false,connection=0,subscriptionFailed=false;
let profileSubscriptions=[];
const records={profiles:new Map(),traits:new Map(),suggestions:new Map(),keywords:new Map()};
const received=new Set(),pending=new Map(),pendingFields=new Map(),queue=new Map(),writing=new Set();
const pendingStorageKey='teamc.pending-profiles.v1';
function persistPending(){
 try{
  localStorage.setItem(pendingStorageKey,JSON.stringify(Object.fromEntries([...pending].map(([id,profile])=>[id,{profile,fields:[...pendingFields.get(id)||[]]}]))));
 }catch{console.warn('Unsent player edits could not be stored in this browser.');}
}
// Restore only explicit unsent fields, never the old profile cache as a whole.
try{
 const saved=JSON.parse(localStorage.getItem(pendingStorageKey)||'{}');
 for(const [id,entry] of Object.entries(saved||{})){
  if(!window.PLAYER_PROFILES.has(id)||!entry||!Array.isArray(entry.fields))continue;
  const profile=window.PLAYER_PROFILE_MODEL.cleanProfile(entry.profile,id.split(':')[0]);
  const fields=new Set(entry.fields.filter(field=>Object.hasOwn(profile,field)));
  if(!fields.size)continue;
  pending.set(id,profile);pendingFields.set(id,fields);queue.set(id,profile);
 }
}catch{console.warn('Unsent player edits could not be read from this browser.');}
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
  profiles[id]=desired&&!equal(desired,raw)?desired:window.PLAYER_PROFILE_MODEL.cleanProfile(raw,teamOf(id));
 }
 for(const [id,raw] of pending)profiles[id]=raw;
 persistPending();
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
  while(ready&&queue.has(id)){
   const raw=queue.get(id);queue.delete(id);
   const fields=pendingFields.get(id)?new Set(pendingFields.get(id)):null;
   await runTransaction(db,async transaction=>{
    const target=doc(refs.profiles,id),existing=await transaction.get(target);
    const patch=fields?Object.fromEntries([...fields].filter(key=>key!=='traits').map(key=>[key,raw[key]])):cloudProfile(raw);
    const profile=cloudProfile(window.PLAYER_PROFILE_MODEL.cleanProfile({...existing.data()?.profile,...patch},teamOf(id)));
    if(!fields||Object.keys(patch).length)transaction.set(target,{profile,updatedAt:serverTimestamp()});
    if(teamOf(id)==='C'&&(!fields||fields.has('traits')))transaction.set(doc(refs.traits,id),{items:raw.traits,updatedAt:serverTimestamp()});
   });
   // Acknowledgements retire only values this transaction actually saved. Newer edits stay queued.
   const remaining=pendingFields.get(id),desired=pending.get(id);
   if(remaining&&desired)for(const field of fields||Object.keys(raw))if(equal(desired[field],raw[field]))remaining.delete(field);
   if(remaining&&!remaining.size){pending.delete(id);pendingFields.delete(id);queue.delete(id);}
   persistPending();notifyStatus(subscriptionFailed?'error':'ready',subscriptionFailed?{code:state.errorCode}:undefined);
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
 const existing=pendingFields.get(id)||new Set();
 for(const field of fields||Object.keys(profile))if(Object.hasOwn(profile,field))existing.add(field);
 pendingFields.set(id,existing);
 pending.set(id,profile);queue.set(id,profile);
 persistPending();
 notifyStatus(ready?'ready':state.status==='error'?'error':'connecting',state.status==='error'?{code:state.errorCode}:undefined);
 return flush(id);
};
state.retry=()=>{
 if(ready&&!subscriptionFailed&&state.lineupReady&&state.status==='ready'){for(const id of queue.keys())void flush(id);return;}
 connection++;
 for(const unsubscribe of profileSubscriptions)unsubscribe();
 profileSubscriptions=[];received.clear();started=false;ready=false;migrating=false;subscriptionFailed=false;state.lineupReady=false;
 notifyStatus('connecting');start();
};
async function migrate(activeConnection){
 const legacy=await getDocs(collection(db,'playerProfiles'));
 if(activeConnection!==connection)return;
 const old=new Map(legacy.docs.map(item=>[item.id,item.data()])),local=window.PLAYER_PROFILES.all();
 for(const [id,localProfile] of Object.entries(local)){
  if(records.profiles.has(id)){await addSuggestions({...records.profiles.get(id).profile,traits:records.traits.get(id)?.items||[]},id);continue;}
  const raw=old.has(id)?{...old.get(id).profile,traits:records.traits.get(id)?.items||old.get(id).profile?.traits||[]}:localProfile;
  const profile=window.PLAYER_PROFILE_MODEL.cleanProfile(raw,teamOf(id),localProfile.keywords||[]);
  await createIfMissing(refs.profiles,id,{profile:cloudProfile(profile)});
  if(teamOf(id)==='C')await createIfMissing(refs.traits,id,{items:profile.traits});
  await addSuggestions(profile,id);
 }
 const snapshots=await Promise.all(Object.values(refs).map(ref=>getDocs(ref)));
 if(activeConnection!==connection||subscriptionFailed)return;
 Object.keys(refs).forEach((key,index)=>{records[key]=new Map(snapshots[index].docs.map(item=>[item.id,item.data()]));});
 ready=true;publishProfiles();publishSuggestions();
 for(const id of queue.keys())void flush(id);
}
function start(){
 if(started||!window.PLAYER_PROFILES)return;started=true;
 const activeConnection=++connection;
 (auth.currentUser?Promise.resolve():signInAnonymously(auth)).then(()=>{
  if(activeConnection!==connection)return;
  for(const [key,ref] of Object.entries(refs))profileSubscriptions.push(onSnapshot(ref,snapshot=>{
   if(activeConnection!==connection)return;
   records[key]=new Map(snapshot.docs.map(item=>[item.id,item.data()]));received.add(key);
   if(received.size===Object.keys(refs).length&&!migrating){migrating=true;void migrate(activeConnection).catch(error=>{if(activeConnection!==connection)return;console.error('Profile migration failed',error);notifyStatus('error',error);});}
   else if(ready){if(key==='profiles'||key==='traits')publishProfiles();else publishSuggestions();}
  },error=>{if(activeConnection!==connection)return;subscriptionFailed=true;ready=false;console.error('Firestore subscription failed',error);notifyStatus('error',error);}));
  profileSubscriptions.push(onSnapshot(doc(db,'teamLineups','C'),snapshot=>{
   if(activeConnection!==connection)return;
   state.lineup=snapshot.exists()?snapshot.data():null;state.lineupReady=true;state.lineupError='';emit('teamlineupchange',{lineup:state.lineup});
  },error=>{if(activeConnection!==connection)return;subscriptionFailed=true;ready=false;state.lineupError=error.code;state.lineupReady=false;notifyStatus('error',error);emit('teamlineupchange',{error:error.code});}));
 }).catch(error=>{if(activeConnection!==connection)return;console.error('Anonymous sign-in failed',error);notifyStatus('error',error);});
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
let appCheck=null,ai=null,aiSDK=null,appCheckSDK=null;
async function prepareGemini(){
 if(!aiConfig?.appCheckSiteKey)throw new gemini.AnalysisError('failed-precondition','AI 연결 설정 후 사용할 수 있어요.','ai-setup');
 if(aiConfig.modelName!==gemini.modelName)throw new gemini.AnalysisError('failed-precondition','지원하는 Gemini 무료 모델 설정을 확인해 주세요.','ai-setup');
 if(!aiSDK)[aiSDK,appCheckSDK]=await Promise.all([import('https://www.gstatic.com/firebasejs/12.19.0/firebase-ai.js'),import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js')]);
 if(!appCheck){
  try{
   const local=['localhost','127.0.0.1','[::1]'].includes(window.location.hostname);
   if(local&&localStorage.getItem('teamc.appcheck-debug')==='true')window.FIREBASE_APPCHECK_DEBUG_TOKEN=true;
   appCheck=appCheckSDK.initializeAppCheck(app,{provider:new appCheckSDK.ReCaptchaEnterpriseProvider(aiConfig.appCheckSiteKey),isTokenAutoRefreshEnabled:true});
  }catch(error){throw gemini.normalizeError(error);}
 }
 await appCheckSDK.getToken(appCheck);
 if(!ai)ai=aiSDK.getAI(app,{backend:new aiSDK.GoogleAIBackend()});
}
const aiStore=gemini.createFirestoreStore({db,doc,runTransaction,serverTimestamp,Timestamp,data:window.BOARD_DATA,model:window.PLAYER_PROFILE_MODEL});
const analyzeGemini=gemini.createService({data:window.BOARD_DATA,model:window.PLAYER_PROFILE_MODEL,store:aiStore,prepare:prepareGemini,generate:async context=>{
 const generator=aiSDK.getGenerativeModel(ai,{model:gemini.modelName,systemInstruction:gemini.instructions,generationConfig:{responseMimeType:'application/json',responseSchema:gemini.responseSchema(aiSDK.Schema),maxOutputTokens:2000}},{timeout:gemini.timeoutMs});
 const output=await generator.generateContent(JSON.stringify(context));
 return gemini.parseResponse(output.response);
}});
state.analyzeMatchup=async request=>{
 if(!ready)throw new gemini.AnalysisError('failed-precondition','팀 공유 저장소 연결 후 AI 분석을 사용할 수 있습니다.');
 try{return await analyzeGemini(request,auth.currentUser?.uid);}catch(error){throw gemini.normalizeError(error);}
};
state.subscribeAnalysis=(key,onResult,onError)=>onSnapshot(doc(db,'geminiMatchupAnalyses',key),snapshot=>{
 if(snapshot.exists()){
  const record=snapshot.data();
  try{onResult({...record,...(record.status==='ready'?{result:gemini.validateResult(record.result)}:{})});}
  catch(error){onError?.(gemini.normalizeError(error));}
 }
},onError);
window.addEventListener('playerprofileschange',event=>{
 if(event.detail?.cloudRefresh)return;
 const {team,name,fields}=event.detail||{};
 if(team&&name)void state.saveProfile(team+':'+name,window.PLAYER_PROFILES.get(team,name),fields);
});
window.addEventListener('online',state.retry);
window.addEventListener('playerprofilesready',start,{once:true});
if(window.PLAYER_PROFILES)start();
