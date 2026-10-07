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
const {cleanProfile}=require('./ratings.js');
const old={ratings:{serve:5,forehand:4.5},scores:[5,4,3,2,1],position:'back',style:'defense',keywords:[{kind:'weak',text:'체력'}]};
const migrated=cleanProfile(old,'C');
assert.deepEqual(migrated,{position:'back',style:'defense',confidentSkills:[],partnerRoles:[],restPreference:''});
assert.ok(!Object.hasOwn(migrated,'ratings')&&!Object.hasOwn(migrated,'keywords'));
const edited=cleanProfile({...migrated,confidentSkills:['lob','serve','serve','invalid'],partnerRoles:['cover','either'],restPreference:'continuous'},'C');
assert.deepEqual(edited.confidentSkills,['serve','lob']);
assert.deepEqual(edited.partnerRoles,['cover']);
assert.equal(edited.restPreference,'continuous');
assert.deepEqual(cleanProfile(JSON.parse(JSON.stringify(edited)),'C'),edited);
assert.deepEqual(cleanProfile({confidentSkills:[5],partnerRoles:['bad'],restPreference:'bad',style:'allround'},'C'),{position:'',style:'unknown',confidentSkills:[],partnerRoles:[],restPreference:''});
const seeds=[{kind:'strong',text:'포핸드'}];
const opponent=cleanProfile({position:'fore',style:'allround',ratings:{serve:5}},'A',seeds);
assert.equal(opponent.tendency,'unknown');assert.equal(opponent.style,'allround');
assert.deepEqual(opponent.keywords,seeds);assert.ok(!Object.hasOwn(opponent,'confidentSkills'));
const keywords=cleanProfile({tendency:'back',keywords:[{kind:'weak',text:'  높은   공  '},{kind:'weak',text:'높은 공'},{kind:'note',text:'장신'},{kind:'bad',text:'무효'}]},'D');
assert.deepEqual(keywords.keywords,[{kind:'weak',text:'높은 공'},{kind:'note',text:'장신'}]);
assert.equal(keywords.tendency,'back');
assert.deepEqual(cleanProfile({keywords:[]},'B',seeds).keywords,[]);
assert.equal(cleanProfile({keywords:Array.from({length:25},(_,index)=>({kind:'note',text:'특징 '+index}))},'A').keywords.length,20);
console.log('PASS: 4개 전략 편성, 77개 상대 조합, 잘못된 편성 검출, C조·상대 프로필 분리와 기존 입력 이관');
