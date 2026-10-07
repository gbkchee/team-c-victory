(function(root){
'use strict';
function validateBoard(data){
 const errors=[]; const roster=Object.keys(data.teams.C); const reference=data.strategies[0]?.matches;
 if(roster.length!==8) errors.push('C조 선수는 8명이어야 합니다.');
 for(const s of data.strategies){
  const fail=msg=>errors.push(`${s.title}: ${msg}`); const counts=Object.fromEntries(roster.map(p=>[p,0])); const slots=new Map(); const ids=new Set();
  if(s.matches.length!==20) fail('20경기가 필요합니다.');
  for(const m of s.matches){
   if(!Number.isInteger(m.id)||m.id<1||m.id>20||ids.has(m.id)) fail('경기 번호 누락 또는 중복'); ids.add(m.id);
   if(m.pair.length!==2||new Set(m.pair).size!==2) fail(`C${m.id} 복식 구성 오류`);
   if(m.pair.includes('꿉')&&m.pair.includes('한치')) fail(`C${m.id} 금지 조합`);
   if(!/^\d{2}:\d{2}$/.test(m.time)||!data.teams[m.team]||m.team==='C') fail(`C${m.id} 일정 오류`);
   const original=reference?.find(r=>r.id===m.id);if(original&&(m.time!==original.time||m.team!==original.team))fail(`C${m.id} 원본 일정 불일치`);
   const slot=slots.get(m.time)||new Set();
   for(const p of m.pair){if(!roster.includes(p)) fail(`C${m.id} 선수 오류`);else counts[p]++;if(slot.has(p))fail(`${m.time} 중복 출전`);slot.add(p);}slots.set(m.time,slot);
  }
  for(let id=1;id<=20;id++)if(!ids.has(id))fail(`C${id} 누락`);
  for(const p of roster)if(counts[p]!==5)fail(`${p} 출전 횟수 오류`);
  for(const [time,ps] of slots)if(ps.size>4)fail(`${time} 동시간 출전 인원 초과`);
 }
 return errors;
}
root.validateBoard=validateBoard;
})(typeof window==='undefined'?globalThis:window);
