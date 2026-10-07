const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');
const ctx={window:{}};vm.createContext(ctx);for(const f of ['data.js','validation.js'])vm.runInContext(fs.readFileSync(__dirname+'/'+f,'utf8'),ctx);
const data=ctx.window.BOARD_DATA,validate=ctx.window.validateBoard;
assert.equal(validate(data).length,0);
assert.equal(data.strategies.length,4);
for(const team of ['A','B','D']){
 const names=Object.keys(data.teams[team]);assert.equal(data.combos[team].length,names.length*(names.length-1)/2);
 for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++)assert.equal(data.combos[team].filter(c=>c.pair.includes(names[i])&&c.pair.includes(names[j])).length,1);
}
for(const mutate of [d=>d.strategies[0].matches.pop(),d=>d.strategies[0].matches[0].pair=['꿉','한치'],d=>d.strategies[0].matches[1].pair=d.strategies[0].matches[0].pair,d=>d.strategies[0].matches[0].id=2,d=>d.strategies[0].matches[0].pair=['우디','우디']]){const copy=JSON.parse(JSON.stringify(data));mutate(copy);assert.ok(validate(copy).length>0);}
console.log('PASS: 4개 전략 편성, 77개 상대 조합, 잘못된 편성 검출');
