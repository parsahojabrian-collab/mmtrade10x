import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import Fastify from 'fastify';
import { z } from 'zod';
import { recordStudioRelease, studioReleaseKey } from '../apps/api/src/studio-releases.ts';
import { contentRevision, assertContentRevision, withContentLock, ContentConflict } from '../apps/api/src/content-workflow.ts';

const source=readFileSync(new URL('../apps/api/src/index.ts',import.meta.url),'utf8');
function database(){
 let state={draft:{slug:'index',title:'Draft',blocks:[{type:'text',text:'new'}],updatedAt:'2026-11-06T00:00:00.000Z'},published:{slug:'index',title:'Live',blocks:[],status:'PUBLISHED'},settings:{MMVS_SPATIAL_R4_index:{version:1,revision:2,published:{items:[]},draft:{items:[{selector:'.hero',x:10,y:0,scale:1}]},history:[]}},versions:[],logs:[]};
 let tail=Promise.resolve(),fail=false;
 const copy=structuredClone;let failRestore=false;
 function client(s){return {
  contentPageDraft:{findUnique:async()=>copy(s.draft),upsert:async({create,update})=>{s.draft={...(s.draft||create),...update,updatedAt:new Date().toISOString()};return copy(s.draft)}},
  contentPage:{findUnique:async()=>copy(s.published),upsert:async({create,update})=>{s.published={...(s.published||create),...update};return copy(s.published)}},
  systemSetting:{create:async({data})=>{if(s.settings[data.key])throw Error('duplicate snapshot');s.settings[data.key]=copy(data.value);return copy(data)},findMany:async({where})=>Object.keys(s.settings).filter(key=>where.key.in.includes(key)).map(key=>({key})),findUnique:async({where})=>s.settings[where.key]?{value:copy(s.settings[where.key])}:null,upsert:async({where,create,update})=>{s.settings[where.key]=copy(s.settings[where.key]?update.value:create.value);return {value:s.settings[where.key]}}},
  contentPageVersion:{findMany:async()=>copy(s.versions.filter(v=>v.status==='PUBLISHED').slice().reverse()),aggregate:async()=>({_max:{version:s.versions.length}}),create:async({data})=>{const v={...copy(data),id:'v'+(s.versions.length+1),createdAt:new Date().toISOString()};s.versions.push(v);return copy(v)}},
  auditLog:{create:async({data})=>{if((fail&&data.action==='CONTENT_PAGE_PUBLISHED')||(failRestore&&data.action==='STUDIO_RELEASE_RESTORED_TO_DRAFT'))throw Error('injected audit failure');s.logs.push(copy(data));return data}}
 }}
 const db={
  get:()=>copy(state),failPublish:()=>{fail=true},failRestore:()=>{failRestore=true},legacy:()=>state.versions.push({id:'legacy',version:0,title:'Old',status:'PUBLISHED',createdAt:new Date().toISOString()}),
  $transaction(action){const result=tail.then(async()=>{const candidate=copy(state);const result=await action(client(candidate));state=candidate;return result});tail=result.catch(()=>{});return result}
 };
 for(const name of ['contentPageDraft','contentPage','systemSetting','contentPageVersion'])db[name]=new Proxy({}, {get:(_,key)=>(...args)=>client(state)[name][key](...args)});
 return db;
}
async function harness(){
 const app=Fastify(),db=database();
 app.setErrorHandler((e,req,reply)=>reply.code(e instanceof ContentConflict?409:500).send({error:e.code||e.message}));
 const spatial=source.slice(source.indexOf('const mmvsSpatialSlug ='),source.indexOf("app.get('/public/mmvs/layout"));
 const releaseRoutes=source.slice(source.indexOf('// Canonical paired history:'),source.indexOf("app.get('/admin/content/pages',"));
 const routes=source.slice(source.indexOf("app.get('/admin/content/pages/:slug/editor'"),source.indexOf("app.put('/admin/content/pages/:slug',"));
 runInNewContext(stripTypeScriptTypes(spatial+'\n'+releaseRoutes+'\n'+routes),{app,prisma:db,z,PAGE_SLUGS:['index'],contentRevision,assertContentRevision,withContentLock,ContentConflict,recordStudioRelease,studioReleaseKey,
  adminGuard:async request=>{request.admin={role:request.headers['x-test-role']||'SUPER_ADMIN'};return true},adminIdOf:()=> 'owner',toInputJson:x=>structuredClone(x),
  blockSchema:z.object({type:z.literal('text'),text:z.string()}),Date,Set,JSON});
 await app.ready();return {app,db};
}

test('revision tokens detect changes in content and timestamp',()=>{
 const a={title:'A',blocks:[],updatedAt:'one'};
 assert.equal(contentRevision(a),contentRevision(structuredClone(a)));
 assert.throws(()=>assertContentRevision({...a,title:'B'},contentRevision(a)),ContentConflict);
 assert.notEqual(contentRevision(a),contentRevision({...a,updatedAt:'two'}));
});
test('two stale editors cannot overwrite each other',async t=>{
 const {app,db}=await harness();t.after(()=>app.close());const expectedRevision=contentRevision(db.get().draft);
 const responses=await Promise.all(['A','B'].map(title=>app.inject({method:'PUT',url:'/admin/content/pages/index/draft',payload:{title,blocks:[],expectedRevision}})));
 assert.deepEqual(responses.map(r=>r.statusCode).sort(),[200,409]);
 assert.equal(db.get().versions.length,1);
});
test('stale publish cannot make a newer draft public',async t=>{
 const {app,db}=await harness();t.after(()=>app.close());const before=db.get();
 const r=await app.inject({method:'POST',url:'/admin/content/pages/index/publish',payload:{expectedRevision:'0'.repeat(64)}});
 assert.equal(r.statusCode,409);assert.deepEqual(db.get(),before);
});
test('spatial revision conflict leaves content and layout unchanged',async t=>{
 const {app,db}=await harness();t.after(()=>app.close());const before=db.get();
 const r=await app.inject({method:'POST',url:'/admin/content/pages/index/publish',payload:{expectedRevision:contentRevision(before.draft),spatialExpectedRevision:99}});
 assert.equal(r.statusCode,409);assert.deepEqual(db.get(),before);
});
test('a late database failure rolls back content, layout, versions and audit together',async t=>{
 const {app,db}=await harness();t.after(()=>app.close());db.failPublish();const before=db.get();
 const r=await app.inject({method:'POST',url:'/admin/content/pages/index/publish',payload:{expectedRevision:contentRevision(before.draft),spatialExpectedRevision:2}});
 assert.equal(r.statusCode,500);assert.deepEqual(db.get(),before);
});
test('one successful publication commits both content and spatial version',async t=>{
 const {app,db}=await harness();t.after(()=>app.close());const before=db.get();
 const r=await app.inject({method:'POST',url:'/admin/content/pages/index/publish',payload:{expectedRevision:contentRevision(before.draft),spatialExpectedRevision:2}});
 assert.equal(r.statusCode,200);const after=db.get();assert.equal(after.published.title,'Draft');
 assert.equal(after.settings.MMVS_SPATIAL_R4_index.revision,3);assert.equal(after.settings.MMVS_SPATIAL_R4_index.draft,null);
 assert.equal(after.settings.MMVS_SPATIAL_R4_index.published.items[0].x,10);assert.equal(after.versions.length,1);
});

test('a content manager cannot publish spatial state through the combined endpoint',async t=>{
 const {app,db}=await harness();t.after(()=>app.close());const before=db.get();
 const r=await app.inject({method:'POST',url:'/admin/content/pages/index/publish',headers:{'x-test-role':'CONTENT_MANAGER'},payload:{expectedRevision:contentRevision(before.draft),spatialExpectedRevision:2}});
 assert.equal(r.statusCode,403);assert.deepEqual(db.get(),before);
});

async function checkpoint(app,db){const state=db.get();const r=await app.inject({method:'POST',url:'/admin/mmvs/releases/index/checkpoint',payload:{expectedPublishedRevision:contentRevision(state.published),spatialExpectedRevision:state.settings.MMVS_SPATIAL_R4_index.revision}});assert.equal(r.statusCode,200,r.body);return r.json()}
async function restore(app,db,id,extra={}){const s=db.get();return app.inject({method:'POST',url:'/admin/mmvs/releases/index/'+id+'/restore',payload:{expectedRevision:contentRevision(s.draft??s.published),spatialExpectedRevision:s.settings.MMVS_SPATIAL_R4_index.revision,...extra}})}

test('a checkpoint records public content/layout and preserves the draft',async t=>{
 const {app,db}=await harness();t.after(()=>app.close());const before=db.get();const v=await checkpoint(app,db);const after=db.get();
 assert.deepEqual(after.draft,before.draft);assert.deepEqual(after.published,before.published);
 const snapshot=after.settings[studioReleaseKey('index',v.id)];assert.equal(snapshot.title,'Live');assert.deepEqual(snapshot.layout,{items:[]});
});
test('previewing a paired version performs no writes',async t=>{
 const {app,db}=await harness();t.after(()=>app.close());const v=await checkpoint(app,db),before=db.get();
 const r=await app.inject({method:'GET',url:'/admin/mmvs/releases/index/'+v.id});assert.equal(r.statusCode,200);assert.equal(r.json().contentVersionId,v.id);assert.deepEqual(db.get(),before);
});
test('legacy content history is identified without inventing a paired layout',async t=>{
 const {app,db}=await harness();t.after(()=>app.close());const v=await checkpoint(app,db);db.legacy();
 const r=await app.inject({method:'GET',url:'/admin/mmvs/releases/index'});assert.equal(r.statusCode,200);
 assert.equal(r.json().items.find(x=>x.id===v.id).paired,true);assert.equal(r.json().items.find(x=>x.id==='legacy').paired,false);
 const before=db.get(),bad=await restore(app,db,'legacy');assert.equal(bad.statusCode,409);assert.deepEqual(db.get(),before);
});
test('restoration changes both drafts while public content and layout stay untouched',async t=>{
 const {app,db}=await harness();t.after(()=>app.close());const v=await checkpoint(app,db);
 let s=db.get();let r=await app.inject({method:'POST',url:'/admin/content/pages/index/publish',payload:{expectedRevision:contentRevision(s.draft),spatialExpectedRevision:2}});assert.equal(r.statusCode,200);
 const before=db.get();r=await restore(app,db,v.id);assert.equal(r.statusCode,200,r.body);const after=db.get();
 assert.equal(after.draft.title,'Live');assert.deepEqual(after.settings.MMVS_SPATIAL_R4_index.draft,{items:[]});
 assert.deepEqual(after.published,before.published);assert.deepEqual(after.settings.MMVS_SPATIAL_R4_index.published,before.settings.MMVS_SPATIAL_R4_index.published);
 assert.deepEqual(after.settings[studioReleaseKey('index',v.id)],before.settings[studioReleaseKey('index',v.id)]);
});
test('a late restore error rolls back content draft, layout draft and audit',async t=>{
 const {app,db}=await harness();t.after(()=>app.close());const v=await checkpoint(app,db);db.failRestore();const before=db.get();
 const r=await restore(app,db,v.id);assert.equal(r.statusCode,500);assert.deepEqual(db.get(),before);
});
test('restore requires both current content and current layout revisions',async t=>{
 const {app,db}=await harness();t.after(()=>app.close());const v=await checkpoint(app,db);const before=db.get();
 const content=await restore(app,db,v.id,{expectedRevision:'0'.repeat(64)});assert.equal(content.statusCode,409);assert.deepEqual(db.get(),before);
 const layout=await restore(app,db,v.id,{spatialExpectedRevision:99});assert.equal(layout.statusCode,409);assert.deepEqual(db.get(),before);
});
test('publication captures exactly the paired content and layout it publishes',async t=>{
 const {app,db}=await harness();t.after(()=>app.close());const before=db.get();
 const r=await app.inject({method:'POST',url:'/admin/content/pages/index/publish',payload:{expectedRevision:contentRevision(before.draft),spatialExpectedRevision:2}});assert.equal(r.statusCode,200);
 const after=db.get(),v=after.versions[0],snapshot=after.settings[studioReleaseKey('index',v.id)];
 assert.equal(snapshot.title,after.published.title);assert.deepEqual(snapshot.blocks,after.published.blocks);assert.deepEqual(snapshot.layout,after.settings.MMVS_SPATIAL_R4_index.published);
});
test('release history and restoration are restricted to superadmins',async t=>{
 const {app,db}=await harness();t.after(()=>app.close());const v=await checkpoint(app,db);const before=db.get();
 for(const [method,url,payload] of [['GET','/admin/mmvs/releases/index',undefined],['POST','/admin/mmvs/releases/index/'+v.id+'/restore',{expectedRevision:contentRevision(before.draft),spatialExpectedRevision:2}]]){
 const r=await app.inject({method,url,payload,headers:{'x-test-role':'CONTENT_MANAGER'}});assert.equal(r.statusCode,403);assert.deepEqual(db.get(),before);}
});
