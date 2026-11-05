import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const src=readFileSync(new URL('../public/miniapp/p74/object-model.js',import.meta.url),'utf8');
const ctx={window:{}};runInNewContext(src,ctx);
const model=ctx.window.MMTradeObjectModel;
const plain=x=>JSON.parse(JSON.stringify(x));

test('legacy mountain preserves editable cube and coin layers',()=>{
 const list=plain(model.normalizeObjects());assert.equal(list.length,2);
 assert.deepEqual(list.map(x=>x.id),['legacy-cube','legacy-coin']);
});
test('explicitly empty objects stays empty after removing layers',()=>{
 assert.deepEqual(plain(model.normalizeObjects([])),[]);
});
test('all 3..8 stage backgrounds are configurable',()=>{
 const values=Object.fromEntries([3,4,5,6,7,8].map(n=>[n,'/uploads/home-studio/p62-demo'+n+'.webp']));
 assert.equal(Object.keys(model.backgrounds(values)).length,6);
 assert.equal(model.backgrounds({3:'javascript:alert(1)'})['3'],undefined);
});
test('asset URL sanitizer disallows XSS schemes and path traversal',()=>{
 for(const src of ['javascript:alert(1)','//evil.example/a.webp','/miniapp/p74/assets/../secret','/uploads/home-studio/a.png?x=1','https://evil.example/a.webp'])assert.equal(model.assetUrl(src),'');
 assert.equal(model.assetUrl('/miniapp/p74/assets/coin.webp'),'/miniapp/p74/assets/coin.webp');
});
test('opacity, positions, z index and animation are clamped',()=>{
 const a=plain(model.normalizeObjects([{id:'a',type:'light',x:99,y:-30,w:80,h:10,z:999,opacity:2,animation:'eval',duration:100}]));
 assert.equal(a[0].x,20);assert.equal(a[0].y,0);assert.equal(a[0].z,99);assert.equal(a[0].opacity,1);assert.equal(a[0].animation,'none');assert.equal(a[0].duration,30);
});
test('image requires a safe local asset path and duplicate ids fail validation',()=>{
 assert.throws(()=>model.validateConfig({objects:[{id:'a',type:'image',src:'https://evil.example/x.png'}]}));
 assert.throws(()=>model.validateConfig({objects:[{id:'x',type:'flag'},{id:'x',type:'flag'}]}));
});
test('per-stage layer visibility respects chosen mountain variant',()=>{
 const a=model.normalizeObject({type:'flag',id:'f1',stages:[3,7],visible:true},0);
 assert.equal(model.allowedOn(a,3),true);assert.equal(model.allowedOn(a,5),false);
 assert.equal(model.allowedOn(a,7),true);
});
test('object count is bounded at 48',()=>{
 assert.throws(()=>model.validateConfig({objects:Array.from({length:49},(_,i)=>({id:'a'+i,type:'light'}))}));
});
