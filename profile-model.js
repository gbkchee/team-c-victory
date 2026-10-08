'use strict';
(function(root){
 const positions={'':'미선택',fore:'포 (듀스코트)',back:'백 (애드코트)',either:'상관없음'};
 const courtPreferences={'':'미선택',baseline:'베이스라인',net:'네트',either:'상관없음'};
 const styles={attack:'공격형',balance:'밸런스형',defense:'수비형',unknown:'모르겠음'};
 const partnerRoles={cover:'뒤에서 커버',attack:'전위 공격',connect:'안정적 연결',tactics:'전술가',encourage:'칭찬과 응원',either:'상관없음'};
 const restPreferences={'':'미선택',continuous:'연속 출전',rest:'쉬었다가',flexible:'되는대로 할게요'};
 const keywordKinds={note:'특징',pattern:'자주 쓰는 플레이·공격 패턴',weak:'어려워하는 공·상황'};
 const keywordSuggestions={
  pattern:['서브 후 네트 접근','적극적인 포칭','크로스 랠리 위주','다운더라인 공격','로브 자주 사용','슬라이스로 낮게 연결'],
  weak:['몸쪽 공','높은 백핸드','낮은 발리','빠른 서브 리턴','로브 대처','짧은 공 처리','포핸드','백핸드'],
  note:['왼손잡이','키가 큼','슬라이스 서브','로브 잘 함','탑스핀','베이스라인 긴 공']
 };
 const traitSuggestions=['왼손잡이','키가 큼','슬라이스 서브','로브 잘 함','탑스핀','베이스라인 긴 공','킥서브','네트에 자주 붙음','긴 랠리가 편함','파트너와 콜을 많이 함','초반에 몸이 늦게 풀림','안정적 연결','전술가','칭찬과 응원'];
 const cleanText=text=>typeof text==='string'?text.normalize('NFC').trim().replace(/\s+/g,' '):'';
 function cleanTraits(raw){
  if(!Array.isArray(raw))return [];
  return [...new Set(raw.filter(item=>typeof item==='string').map(item=>cleanText(item).slice(0,40)).filter(Boolean))].slice(0,20);
 }
 function cleanKeywords(raw){
  const seen=new Set(),result=[];
  for(const item of Array.isArray(raw)?raw:[]){
   if(!item||!Object.hasOwn(keywordKinds,item.kind)||typeof item.text!=='string')continue;
   const text=cleanText(item.text).slice(0,40),key=item.kind+':'+text;
   if(text&&!seen.has(key)){seen.add(key);result.push({kind:item.kind,text});}
   if(result.length===20)break;
  }
  return result;
 }
 const choice=(raw,options,fallback)=>typeof raw==='string'&&Object.hasOwn(options,raw)?raw:fallback;
 function cleanProfile(raw,team,initialKeywords=[]){
  if(team==='C'){
   let roles=Object.keys(partnerRoles).filter(key=>Array.isArray(raw?.partnerRoles)&&raw.partnerRoles.includes(key));
   if(roles.length>1)roles=roles.filter(key=>key!=='either');
   return {position:choice(raw?.position,positions,''),courtPreference:choice(raw?.courtPreference,courtPreferences,''),
    style:choice(raw?.style,styles,'unknown'),partnerRoles:roles,traits:cleanTraits(raw?.traits),restPreference:choice(raw?.restPreference,restPreferences,'')};
  }
  const source=Array.isArray(raw?.keywords)?raw.keywords:initialKeywords;
  return {style:choice(raw?.style,styles,'unknown'),keywords:cleanKeywords(source),
   legacyStrengths:cleanTraits([...(Array.isArray(raw?.legacyStrengths)?raw.legacyStrengths:[]),...source.filter(item=>item?.kind==='strong').map(item=>item.text)])};
 }
 function stableStringify(value){
  if(Array.isArray(value))return '['+value.map(stableStringify).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>JSON.stringify(key)+':'+stableStringify(value[key])).join(',')+'}';
  return JSON.stringify(value);
 }
 function fingerprint(value){
  const text=stableStringify(value);let a=2166136261,b=2246822519;
  for(let index=0;index<text.length;index++){const code=text.charCodeAt(index);a=Math.imul(a^code,16777619);b=Math.imul(b^code,3266489917);}
  return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
 }
 function profileVersion(players){
  return fingerprint([...players].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(player=>({id:player.id,tier:player.tier,profile:cleanProfile(player.profile,player.id.split(':')[0])})));
 }
 function analysisVersion(players){
  return fingerprint([...players].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(player=>{const profile=cleanProfile(player.profile,player.id.split(':')[0]);delete profile.legacyStrengths;return {id:player.id,tier:player.tier,profile};}));
 }
 const model={positions,courtPreferences,styles,opponentStyles:styles,partnerRoles,restPreferences,keywordKinds,keywordSuggestions,traitSuggestions,cleanText,cleanTraits,cleanKeywords,cleanProfile,stableStringify,fingerprint,profileVersion,analysisVersion};
 if(typeof module==='object'&&module.exports)module.exports=model;else root.PLAYER_PROFILE_MODEL=model;
})(typeof window==='undefined'?globalThis:window);
