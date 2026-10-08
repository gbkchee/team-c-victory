const fs=require('node:fs');const path=require('node:path');require('./verify.cjs');
const target=path.join(__dirname,'dist');fs.mkdirSync(target,{recursive:true});
const allow=['index.html','styles.css','data.js','validation.js','app.js','ratings.js','profile-model.js','pairing-model.js','pairing-worker.js','gemini-config.js','gemini-analysis.js','firebase-cloud.js','rules.pdf','assets'];
for(const f of fs.readdirSync(target))if(!allow.includes(f))throw new Error('배포 폴더에 허용되지 않은 파일이 있습니다: '+f);
for(const f of allow)fs.cpSync(path.join(__dirname,f),path.join(target,f),{recursive:true});
console.log('PASS: 정적 배포 폴더 dist 생성');
