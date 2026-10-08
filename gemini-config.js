'use strict';
(function(root){
 const config=Object.freeze({
  modelName:'gemini-3.5-flash-lite',
  // Firebase App Check reCAPTCHA Enterprise 공개 사이트 키. Gemini API 비밀 키가 아닙니다.
  appCheckSiteKey:''
 });
 if(typeof module==='object'&&module.exports)module.exports=config;else root.GEMINI_CONFIG=config;
})(typeof window==='undefined'?globalThis:window);
