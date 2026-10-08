'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseArguments,blankDocuments,inspect,reset}=require('./reset-test-data.cjs');
function database(){
 const entries=new Map();return {entries,doc:path=>({path}),collection:path=>({path,get:async()=>{const docs=[...entries.keys()].filter(key=>key.startsWith(path+'/')).map(key=>({ref:{path:key}}));return {docs,size:docs.length};}}),batch:()=>{const writes=[];return {set:(ref,value)=>writes.push([ref.path,value]),commit:async()=>{for(const [path,value] of writes)entries.set(path,value);}};},recursiveDelete:async ref=>{for(const path of entries.keys())if(path===ref.path||path.startsWith(ref.path+'/'))entries.delete(path);}};
}
test('초기화는 지정 프로젝트만 허용하고 기본 실행은 읽기 전용이다',()=>{
 assert.deepEqual(parseArguments(['--project','team-c-victory']),{project:'team-c-victory',scope:'profiles',execute:false});
 for(const args of [[],['--project','other-project'],['--project','team-c-victory','--scope','anything'],['--project','team-c-victory','--unknown']])assert.throws(()=>parseArguments(args));
 assert.equal(parseArguments(['--project','team-c-victory','--scope','profiles','--execute']).execute,true);
 const documents=blankDocuments('timestamp');assert.equal(documents.size,39);assert.deepEqual(documents.get('playerProfilesV2/A:펩시').profile,{style:'unknown',keywords:[],legacyStrengths:[]});assert.equal(documents.get('playerProfilesV2/D:아르(시트: 야르)').profile.keywords.length,0);
});
test('전체 초기화는 빈 서버 프로필을 남기고 기록·공용 키워드·확정표·캐시를 제거한다',async()=>{
 const db=database();for(const path of ['playerProfiles/C:우디','playerProfilesV2/C:없는선수','playerTraits/C:없는선수','traitSuggestions/test','keywordSuggestions/test','teamLineups/C','matchupAnalyses/test','aiUsage/2026-10-08','unrelated/test'])db.entries.set(path,{test:true});
 const before=[...db.entries];assert.equal((await inspect(db,'all')).playerProfiles,1);assert.deepEqual([...db.entries],before);
 await reset(db,'all','timestamp');assert.equal(db.entries.size,41);assert.deepEqual(db.entries.get('playerTraits/C:우디').items,[]);for(const path of before.map(([path])=>path))assert.equal(db.entries.has(path),path.startsWith('aiUsage/')||path.startsWith('unrelated/'));
});
test('프로필만 초기화하면 공용 키워드와 확정표·캐시는 보존한다',async()=>{
 const db=database();db.entries.set('playerProfiles/C:우디',{test:true});db.entries.set('traitSuggestions/test',{text:'공용 특징'});db.entries.set('teamLineups/C',{test:true});db.entries.set('matchupAnalyses/test',{test:true});
 await reset(db,'profiles','timestamp');assert.equal(db.entries.has('playerProfiles/C:우디'),false);assert.equal(db.entries.has('traitSuggestions/test'),true);assert.equal(db.entries.has('teamLineups/C'),true);assert.equal(db.entries.has('matchupAnalyses/test'),true);
});
