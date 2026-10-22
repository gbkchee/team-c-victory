'use strict';
importScripts('data.js','profile-model.js?v=20261012-3','pairing-model.js?v=20261022-19');
self.onmessage=event=>{
 const {generation,requestId,action,profiles,options,pairs,sharedPairs}=event.data,envelope={generation,requestId};
 try{
  if(action==='restore'){self.postMessage({...envelope,plan:self.PAIRING_MODEL.restorePairSet(self.BOARD_DATA,profiles,pairs,options)});return;}
  if(action==='initial'){
   const strong=self.PAIRING_MODEL.generatePage(self.BOARD_DATA,profiles,{...options,strategy:'win',cursor:null,limit:1});
   let excluded=options.excludePairs||[];if(strong.plans[0])excluded=[...excluded,strong.plans[0].matches.map(match=>match.pair)];
   const returns=self.PAIRING_MODEL.generatePage(self.BOARD_DATA,profiles,{...options,strategy:'return',excludePairs:excluded,cursor:null,limit:1});
   let selectedPlan=null,selectionError='';if(sharedPairs)try{selectedPlan=self.PAIRING_MODEL.restorePairSet(self.BOARD_DATA,profiles,sharedPairs,options);}catch(error){selectionError='공유 페어 구성을 불러오지 못했습니다. '+error.message;}
   self.postMessage({...envelope,page:{plans:[...strong.plans,...returns.plans],nextCursor:returns.nextCursor,hasMore:returns.hasMore,searchLimited:returns.searchLimited,excludePairs:excluded},selectedPlan,selectionError});return;
  }
  const page=self.PAIRING_MODEL.generatePage(self.BOARD_DATA,profiles,{...options,strategy:'return'});let selectedPlan=null,selectionError='';
  if(sharedPairs)try{selectedPlan=self.PAIRING_MODEL.restorePairSet(self.BOARD_DATA,profiles,sharedPairs,options);}catch(error){selectionError='공유 페어 구성을 불러오지 못했습니다. '+error.message;}
  self.postMessage({...envelope,page,selectedPlan,selectionError});
 }catch(error){self.postMessage({...envelope,error:error.message,code:error.code});}
};
