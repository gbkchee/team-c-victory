'use strict';
const {initializeApp}=require('firebase-admin/app');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {defineSecret,defineString,defineInt}=require('firebase-functions/params');
const data=require('./shared/data.js'),model=require('./shared/profile-model.js');
const {createService,openAIResponse,AnalysisError}=require('./analysis-service.cjs');
initializeApp();const db=getFirestore();
const apiKey=defineSecret('OPENAI_API_KEY'),modelName=defineString('AI_MODEL',{default:'gpt-5.6-terra'}),dailyLimit=defineInt('AI_DAILY_LIMIT',{default:50});
const {createFirestoreStore}=require('./firestore-store.cjs');
const store=createFirestoreStore(db,model,data,()=>FieldValue.serverTimestamp());

exports.analyzeMatchup=onCall({region:'asia-northeast3',timeoutSeconds:75,memory:'256MiB',minInstances:0,maxInstances:1,concurrency:10,secrets:[apiKey]},async request=>{
 try{
  if(!request.auth?.uid)throw new AnalysisError('unauthenticated','팀 공유 저장소에 로그인한 뒤 다시 시도해 주세요.');
  const service=createService({data,model,store,dailyLimit:dailyLimit.value(),modelName:modelName.value(),generate:(context,options)=>openAIResponse(context,{...options,apiKey:apiKey.value()})});
  return await service(request.data,request.auth.uid);
 }catch(error){
  if(error instanceof AnalysisError)throw new HttpsError(error.code,error.message,{reason:error.reason||''});
  console.error('Matchup analysis failed',{code:error.code||'internal',name:error.name});
  throw new HttpsError('internal','AI 분석을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
 }
});
