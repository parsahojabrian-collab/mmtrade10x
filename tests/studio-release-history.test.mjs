import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const code=readFileSync(new URL('../public/miniapp/p74/studio/release-history.js',import.meta.url),'utf8');
class Node{constructor(tag){this.tag=tag;this.children=[]}append(...n){this.children.push(...n)}replaceChildren(...n){this.children=[...n]}}
function harness(options={}){
 const host=new Node('div'),ctx={page:'index',session:1,busy:false,dirty:true,revision:'content-token',spatialRevision:2};
 const window={confirm:()=>true};runInNewContext(code,{window,document:{createElement:tag=>new Node(tag),getElementById:()=>host}});
 const calls=[],previews=[],messages=[];let restored=0;
 const controller=window.MMStudioReleaseHistory.create({api:async(...args)=>{calls.push(args);return options.api?options.api(...args):{items:[]}},context:()=>({...ctx}),setBusy:value=>{ctx.busy=value},onPreview:v=>previews.push(v),onRestored:async()=>{restored++},notify:(...args)=>messages.push(args),confirm:options.confirm||(()=>true)});
 return {controller,host,ctx,calls,previews,messages,restored:()=>restored};
}
test('historical preview sends only a read and keeps draft context untouched',async()=>{
 const h=harness({api:async()=>({version:1,title:'Old',blocks:[],layout:{items:[]}})});await h.controller.preview('v1');
 assert.equal(h.calls.length,1);assert.equal(h.calls[0][0],'/mmvs/releases/index/v1');assert.equal(h.calls[0][1],undefined);
 assert.equal(h.previews.length,1);assert.equal(h.ctx.dirty,true);assert.equal(h.ctx.revision,'content-token');
});
test('a stale preview response cannot replace a different page',async()=>{
 let finish;const h=harness({api:()=>new Promise(r=>finish=r)});const task=h.controller.preview('v1');h.ctx.page='profile';h.ctx.session++;finish({version:1});await task;assert.equal(h.previews.length,0);
});
test('cancelling restore does not write or discard changes',async()=>{
 const h=harness({confirm:()=>false});await h.controller.restore('v1');assert.equal(h.calls.length,0);assert.equal(h.restored(),0);assert.equal(h.ctx.dirty,true);
});
test('restore submits both revisions to the draft-only endpoint',async()=>{
 const h=harness();await h.controller.restore('v1');assert.equal(h.calls.length,1);const [path,method,body]=h.calls[0];
 assert.equal(path,'/mmvs/releases/index/v1/restore');assert.equal(method,'POST');assert.equal(body.expectedRevision,'content-token');assert.equal(body.spatialExpectedRevision,2);assert.equal(h.restored(),1);
});
test('restore failure retains local context and never calls onRestored',async()=>{
 const h=harness({api:async()=>{throw Error('conflict')}});await h.controller.restore('v1');assert.equal(h.restored(),0);assert.equal(h.ctx.dirty,true);assert.equal(h.ctx.busy,false);assert.equal(h.messages.at(-1)[1],true);
});
test('a pending save blocks historical preview and restore',async()=>{
 const h=harness();h.ctx.busy=true;await h.controller.preview('v1');await h.controller.restore('v1');assert.equal(h.calls.length,0);assert.equal(h.ctx.busy,true);
});
test('old content-only versions are shown with disabled preview and restore',async()=>{
 const h=harness({api:async()=>({items:[{id:'legacy',version:1,createdAt:'2026-11-06',paired:false}]})});await h.controller.load();
 const actions=h.host.children[0].children[1];assert.ok(actions.children.every(button=>button.disabled));
});
test('checkpoint uses public revision rather than the unsaved draft revision',async()=>{
 const h=harness({api:async path=>path.endsWith('/editor')?{published:{revision:'public-token'}}:path==='/mmvs/layout/index'?{revision:7}:{items:[]}});await h.controller.checkpoint();
 const call=h.calls.find(c=>c[0].endsWith('/checkpoint'));assert.equal(call[2].expectedPublishedRevision,'public-token');assert.equal(call[2].spatialExpectedRevision,7);assert.equal(h.ctx.dirty,true);
});
