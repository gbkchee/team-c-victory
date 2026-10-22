const fs=require('node:fs');const path=require('node:path');require('./verify.cjs');
if(!/const codeHash='[a-f0-9]{64}'/.test(fs.readFileSync(path.join(__dirname,'access-gate.js'),'utf8')))throw new Error('입장 답변 해시를 먼저 설정해 주세요.');
const target=path.join(__dirname,'dist');fs.mkdirSync(target,{recursive:true});
const allow=['index.html','styles.css','access-gate.js','data.js','tournament-model.js','validation.js','app.js','ratings.js','profile-model.js','pairing-model.js','pairing-worker.js','tactics-data.js','gemini-config.js','gemini-analysis.js','firebase-cloud.js','rules.pdf','assets'];
for(const f of fs.readdirSync(target))if(!allow.includes(f))throw new Error('배포 폴더에 허용되지 않은 파일이 있습니다: '+f);
for(const f of allow)fs.cpSync(path.join(__dirname,f),path.join(target,f),{recursive:true});
console.log('PASS: 정적 배포 폴더 dist 생성');
