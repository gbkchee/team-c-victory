import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { collection, doc, getDocs, getFirestore, onSnapshot, runTransaction, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig={
 apiKey:'AIzaSyDM-UxfDeXw1pFVrQ7MRzeMr051sfCXLP0',
 authDomain:'team-c-victory.firebaseapp.com',
 projectId:'team-c-victory',
 storageBucket:'team-c-victory.firebasestorage.app',
 messagingSenderId:'666605203672',
 appId:'1:666605203672:web:c76d72181d352a0b5167ad'
};
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
const profileCollection=collection(db,'playerProfiles'),traitsCollection=collection(db,'playerTraits'),suggestionCollection=collection(db,'traitSuggestions');
const state={status:'connecting'};
window.PLAYER_PROFILE_CLOUD=state;

let started=false,ready=false,migrating=false;
let profileDocs=new Map(),traitDocs=new Map(),suggestionDocs=new Map();
const notifyStatus=(status,error)=>{
 state.status=status;
 state.errorCode=error?.code||'';
 state.message=status==='ready'?'팀원과 실시간으로 공유 중입니다.':status==='connecting'?'팀 공유 저장소에 연결 중입니다.':(
  state.errorCode==='auth/operation-not-allowed'?'Firebase Authentication에서 익명 로그인을 켜 주세요.':
  state.errorCode==='auth/unauthorized-domain'?'Firebase Authentication의 승인된 도메인에 현재 웹사이트 주소를 추가해 주세요.':
  state.errorCode==='permission-denied'?'Firestore 규칙을 최신 firestore.rules 내용으로 게시했는지 확인해 주세요.':
  state.errorCode==='auth/invalid-api-key'?'Firebase 웹 앱 설정값을 확인해 주세요.':
  state.errorCode==='unavailable'?'Firebase에 연결할 수 없습니다. 네트워크를 확인하고 다시 시도해 주세요.':
  `Firebase 연결 실패 (${state.errorCode||'원인 코드 없음'}). 브라우저 개발자 도구 Console에서 상세 오류를 확인해 주세요.`
 );
 window.dispatchEvent(new Event('playerprofilecloudstatuschange'));
};
const snapshotsReady={profiles:false,traits:false,suggestions:false};
const idTeam=id=>id.split(':',1)[0];
function cloudProfile(raw){const clean={...raw};delete clean.traits;return clean;}
function suggestionId(text){
 let hash=2166136261;
 for(const character of text)hash=Math.imul(hash^character.charCodeAt(0),16777619);
 return 's_'+(hash>>>0).toString(36);
}
function publishProfiles(){
 if(!ready)return;
 const profiles=window.PLAYER_PROFILES.all();
 for(const [id,record] of profileDocs){
  const base=profiles[id]||{};
  const raw={...(record.profile||{}),traits:traitDocs.get(id)?.items||record.profile?.traits||[]};
  profiles[id]=window.PLAYER_PROFILE_MODEL.cleanProfile(raw,idTeam(id),base.keywords||[]);
 }
 for(const [id,record] of traitDocs){
  const base=profiles[id]||window.PLAYER_PROFILE_MODEL.cleanProfile(null,idTeam(id));
  profiles[id]=window.PLAYER_PROFILE_MODEL.cleanProfile({...base,traits:record.items||[]},idTeam(id),base.keywords||[]);
 }
 window.dispatchEvent(new CustomEvent('playerprofilescloudchange',{detail:{profiles}}));
}
function publishSuggestions(){
 if(!ready)return;
 const suggestions=[...new Set([...suggestionDocs.values()].map(item=>item.text).filter(text=>typeof text==='string'))]
  .sort((a,b)=>a.localeCompare(b,'ko'));
 window.dispatchEvent(new CustomEvent('playertraitssuggestionschange',{detail:{suggestions}}));
}
async function createIfMissing(collectionRef,id,data,timestampField='updatedAt'){
 const reference=doc(collectionRef,id);
 await runTransaction(db,async transaction=>{
  const existing=await transaction.get(reference);
  if(!existing.exists())transaction.set(reference,{...data,[timestampField]:serverTimestamp()});
 });
}
async function migrateLocalProfiles(){
 const localProfiles=window.PLAYER_PROFILES.all();
 for(const [id,raw] of Object.entries(localProfiles)){
  const profile=cloudProfile(raw);
  await createIfMissing(profileCollection,id,{profile});
  if(Array.isArray(raw.traits)){
   await createIfMissing(traitsCollection,id,{items:raw.traits});
   for(const text of raw.traits)await createIfMissing(suggestionCollection,suggestionId(text),{text},'createdAt');
  }
 }
 const [profilesSnapshot,traitsSnapshot,suggestionsSnapshot]=await Promise.all([
  getDocs(profileCollection),getDocs(traitsCollection),getDocs(suggestionCollection)
 ]);
 profileDocs=new Map(profilesSnapshot.docs.map(item=>[item.id,item.data()]));
 traitDocs=new Map(traitsSnapshot.docs.map(item=>[item.id,item.data()]));
 suggestionDocs=new Map(suggestionsSnapshot.docs.map(item=>[item.id,item.data()]));
 ready=true;
 notifyStatus('ready');
 publishProfiles();publishSuggestions();
}
function start(){
 if(started||!window.PLAYER_PROFILES)return;
 started=true;
 signInAnonymously(auth).then(()=>{
  onSnapshot(profileCollection,snapshot=>{
   profileDocs=new Map(snapshot.docs.map(item=>[item.id,item.data()]));snapshotsReady.profiles=true;
   if(Object.values(snapshotsReady).every(Boolean)&&!migrating){
    migrating=true;migrateLocalProfiles().catch(error=>{console.error('Firebase profile migration failed',error);notifyStatus('error',error);});
   }else publishProfiles();
  },error=>{console.error('Firestore profiles listener failed',error);notifyStatus('error',error);});
  onSnapshot(traitsCollection,snapshot=>{
   traitDocs=new Map(snapshot.docs.map(item=>[item.id,item.data()]));snapshotsReady.traits=true;
   if(Object.values(snapshotsReady).every(Boolean)&&!migrating){
    migrating=true;migrateLocalProfiles().catch(error=>{console.error('Firebase profile migration failed',error);notifyStatus('error',error);});
   }else publishProfiles();
  },error=>{console.error('Firestore traits listener failed',error);notifyStatus('error',error);});
  onSnapshot(suggestionCollection,snapshot=>{
   suggestionDocs=new Map(snapshot.docs.map(item=>[item.id,item.data()]));snapshotsReady.suggestions=true;
   if(Object.values(snapshotsReady).every(Boolean)&&!migrating){
    migrating=true;migrateLocalProfiles().catch(error=>{console.error('Firebase profile migration failed',error);notifyStatus('error',error);});
   }else publishSuggestions();
  },error=>{console.error('Firestore suggestions listener failed',error);notifyStatus('error',error);});
 }).catch(error=>{console.error('Firebase anonymous sign-in failed',error);notifyStatus('error',error);});
}
state.saveProfile=async(id,raw)=>{
 if(!ready)return;
 const profile=cloudProfile(raw),oldProfile=profileDocs.get(id)?.profile;
 const traits=Array.isArray(raw.traits)?raw.traits:[];
 const oldTraits=traitDocs.get(id)?.items||[];
 try{
  if(JSON.stringify(oldProfile)!==JSON.stringify(profile)){
   await setDoc(doc(profileCollection,id),{profile,updatedAt:serverTimestamp()});
  }
  if(JSON.stringify(oldTraits)!==JSON.stringify(traits)){
   await setDoc(doc(traitsCollection,id),{items:traits,updatedAt:serverTimestamp()});
  }
  for(const text of traits){
   const suggestionKey=suggestionId(text);
   if(!suggestionDocs.has(suggestionKey)){
    await setDoc(doc(suggestionCollection,suggestionKey),{text,createdAt:serverTimestamp()});
   }
  }
 }catch(error){console.error('Firestore profile save failed',error);notifyStatus('error',error);}
};
window.addEventListener('playerprofileschange',event=>{
 if(event.detail?.cloudRefresh||state.status!=='ready')return;
 const {team,name}=event.detail||{};
 if(team&&name){const profile=window.PLAYER_PROFILES.get(team,name);void state.saveProfile(team+':'+name,profile);}
});
window.addEventListener('playerprofilesready',start,{once:true});
if(window.PLAYER_PROFILES)start();
