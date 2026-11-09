import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const workspace=read('public/miniapp/p74/studio/admin-workspace.js');
const studio=read('public/miniapp/p74/studio/studio.js');
const operations=studio.slice(studio.indexOf('function setOperation('),studio.indexOf('async function loadPopups('));
function controller(extra={}){
 const controls={save:{},publish:{},reload:{}};
 const scope={reviewSnapshot:null,document:{querySelector:()=>null},busy:false,canWrite:()=>true,page:'index',pageRequestId:1,title:'First',blocks:[{type:'text',text:'First'}],initial:'',
  editor:{hasDraft:true,revision:'a'.repeat(64)},window:{},clone:structuredClone,validateAllBlocks(){},syncDirty(){},toast(){},confirm:()=>true,
  $:id=>controls[id],loadPage:async()=>{},...extra};
 scope.dirty=()=>JSON.stringify({title:scope.title,blocks:scope.blocks})!==scope.initial;
 runInNewContext(operations,scope);return scope;
}

test('workspace blocks leaving during save and asks before discarding edits',()=>{
 let questions=0,alerts=0;const window={addEventListener(){},confirm(){questions++;return false},alert(){alerts++}};
 runInNewContext(workspace,{window});let saving=false;
 window.MMAdminWorkspace.register('editor',{dirty:()=>true,busy:()=>saving});
 assert.equal(window.MMAdminWorkspace.canLeave(),false);assert.equal(questions,1);
 saving=true;assert.equal(window.MMAdminWorkspace.canLeave(),false);assert.equal(alerts,1);assert.equal(questions,1);
});
test('detached editors do not block navigation',()=>{
 const window={addEventListener(){},confirm(){throw Error('should not ask')},alert(){}};runInNewContext(workspace,{window});
 window.MMAdminWorkspace.register('old',{active:()=>false,dirty:()=>true});assert.equal(window.MMAdminWorkspace.canLeave(),true);
});
test('publishing during another save never sends a publish request',async()=>{
 const requests=[];const s=controller({busy:true,api:async(...args)=>requests.push(args)});await s.publish();assert.equal(requests.length,0);
});
test('editing during save keeps the editor dirty and snapshots the submitted content',async()=>{
 let finish,sent;const s=controller({api:async(path,method,body)=>{sent=body;await new Promise(r=>finish=r);return {ok:true,revision:'b'.repeat(64)}}});
 const task=s.saveDraft();s.title='Second';finish();await task;
 assert.equal(sent.title,'First');assert.equal(s.title,'Second');assert.equal(s.dirty(),true);
 assert.equal(s.editor.revision,'b'.repeat(64));assert.equal(s.busy,false);
});
test('failed spatial save prevents content publication',async()=>{
 const requests=[];const s=controller({api:async(path)=>{requests.push(path);return {ok:true,revision:'b'.repeat(64)}},window:{MMVS_Spatial:{isBusy:()=>false,isDirty:()=>true,saveIfDirty:async()=>false,setPublishing(){}}}});
 await s.publish();assert.ok(requests.every(path=>!path.endsWith('/publish')));
});
test('content and layout use exactly one publication request with both revision checks',async()=>{
 const requests=[];const spatial={isBusy:()=>false,isDirty:()=>false,hasPending:()=>true,getRevision:()=>4,setPublishing(){},acceptPublished(){}};
 const s=controller({api:async(path,method,body)=>{requests.push({path,body});return {ok:true,spatialRevision:5}},window:{MMVS_Spatial:spatial}});
 s.initial=JSON.stringify({title:s.title,blocks:s.blocks});await s.publish();
 assert.equal(requests.length,1);assert.equal(requests[0].path,'/content/pages/index/publish');
 assert.equal(requests[0].body.spatialExpectedRevision,4);assert.equal(requests[0].body.expectedRevision,'a'.repeat(64));
});
test('Object Studio cancellation preserves its unsaved configuration',()=>{
 const admin=read('apps/api/public/admin.html');const start=admin.indexOf('function close(force=false){');const code=admin.slice(start,admin.indexOf('\nfunction validate(){',start));
 const config={brand:'Unsaved'};let removed=false;
 const scope={modal:{remove(){removed=true}},config,operation:false,objectDirty:()=>true,confirm:()=>false};runInNewContext(code,scope);
 assert.equal(scope.close(),false);assert.equal(removed,false);assert.equal(scope.config,config);
});
