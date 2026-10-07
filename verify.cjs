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
const {axes,validScore,cleanProfile}=require('./ratings.js');
for(const value of [1,1.5,2,2.5,3,3.5,4,4.5,5])assert.ok(validScore(value));
for(const value of [null,undefined,'3',0,5.5,2.25,NaN,Infinity])assert.equal(validScore(value),false);
const old={scores:[2,4,3,5,1],position:'back',style:'defense',keywords:[{kind:'note',text:'코스 잘 봄'}]};
const migrated=cleanProfile(old);
assert.equal(migrated.ratings.serve,2);
assert.equal(migrated.ratings.coverage,5);
assert.equal(migrated.ratings.stamina,1);
assert.equal(migrated.ratings.stroke,4);
assert.equal(migrated.ratings.volley,3);
for(const key of ['forehand','backhand','forehandVolley','backhandVolley','slice','lob','smash','mental'])assert.equal(migrated.ratings[key],null);
assert.equal(migrated.position,'back');assert.equal(migrated.style,'defense');assert.deepEqual(migrated.keywords,old.keywords);
const edited=cleanProfile({...migrated,ratings:{...migrated.ratings,forehand:3.5,mental:4.5}});
assert.deepEqual(cleanProfile(JSON.parse(JSON.stringify(edited))),edited);
assert.equal(cleanProfile({ratings:{forehand:2.25,backhand:6,serve:'4'}}).ratings.forehand,null);
assert.ok(axes.every(axis=>cleanProfile(null).ratings[axis.key]===null));
console.log('PASS: 4개 전략 편성, 77개 상대 조합, 잘못된 편성 검출, 0.5점 입력과 기존 평가 이관');
