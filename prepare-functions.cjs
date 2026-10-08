const fs=require('node:fs'),path=require('node:path');
const target=path.join(__dirname,'functions','shared');fs.mkdirSync(target,{recursive:true});
for(const name of ['profile-model.js','data.js'])fs.copyFileSync(path.join(__dirname,name),path.join(target,name));
console.log('PASS: Functions 공통 프로필·공식 명단 준비');
