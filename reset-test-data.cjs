'use strict';
const {createRequire}=require('node:module');
const data=require('./data.js'),model=require('./profile-model.js');
const projectId='team-c-victory';
function parseArguments(args){
 let project='',scope='profiles',execute=false;
 for(let i=0;i<args.length;i++){
  if(args[i]==='--project')project=args[++i];
  else if(args[i]==='--scope')scope=args[++i];
  else if(args[i]==='--execute')execute=true;
  else throw new Error('지원하지 않는 인자: '+args[i]);
 }
 if(project!==projectId)throw new Error('--project team-c-victory를 지정해야 합니다.');
 if(!['all','profiles'].includes(scope))throw new Error('--scope는 all 또는 profiles입니다.');
 return {project,scope,execute};
}
function blankDocuments(timestamp){
 const documents=new Map();
 for(const [team,players] of Object.entries(data.teams))for(const name of Object.keys(players)){
  const id=team+':'+name,profile=model.cleanProfile(null,team);delete profile.traits;
  documents.set('playerProfilesV2/'+id,{profile,updatedAt:timestamp});
  if(team==='C')documents.set('playerTraits/'+id,{items:[],updatedAt:timestamp});
 }
 return documents;
}
async function inspect(db,scope){
 const collections=['playerProfiles','playerProfilesV2','playerTraits',...(scope==='all'?['traitSuggestions','keywordSuggestions','teamLineups','matchupAnalyses','geminiMatchupAnalyses']:[])];
 const snapshots=await Promise.all(collections.map(name=>db.collection(name).get()));
 return Object.fromEntries(collections.map((name,index)=>[name,snapshots[index].size]));
}
async function reset(db,scope,timestamp){
 // Seed empty server profiles first so an old browser cache cannot be migrated back.
 const documents=blankDocuments(timestamp),batch=db.batch();
 for(const [path,value] of documents)batch.set(db.doc(path),value);
 await batch.commit();
 for(const collection of ['playerProfiles',...(scope==='all'?['traitSuggestions','keywordSuggestions','teamLineups','matchupAnalyses','geminiMatchupAnalyses']:[])])await db.recursiveDelete(db.collection(collection));
 for(const collection of ['playerProfilesV2','playerTraits']){
  const snapshot=await db.collection(collection).get();
  for(const document of snapshot.docs)if(!documents.has(document.ref.path))await db.recursiveDelete(document.ref);
 }
 // Keep both old and Gemini usage counters so resets do not grant extra daily attempts.
}
async function main(){
 const options=parseArguments(process.argv.slice(2));
 const requireAdmin=createRequire(__dirname+'/admin-tools/package.json');
 const {initializeApp,applicationDefault}=requireAdmin('firebase-admin/app'),{getFirestore,FieldValue}=requireAdmin('firebase-admin/firestore');
 initializeApp({projectId:options.project,credential:applicationDefault()});const db=getFirestore();
 console.log(JSON.stringify({project:options.project,scope:options.scope,mode:options.execute?'초기화 실행':'대상 확인만',collections:await inspect(db,options.scope),blankProfiles:31,blankTraits:8,retain:['기본 선수 명단','공식 배정표','aiUsage·geminiAiUsage 일일 한도 기록']},null,2));
 if(!options.execute){console.log('이 실행에서는 데이터를 변경하지 않았습니다.');return;}
 await reset(db,options.scope,FieldValue.serverTimestamp());console.log('완료: 입력 초기화 및 테스트 데이터 정리. 웹페이지를 새로고침하세요.');
}
if(require.main===module)main().catch(error=>{console.error('초기화 실패: '+error.message);process.exitCode=1;});
module.exports={parseArguments,blankDocuments,inspect,reset};
