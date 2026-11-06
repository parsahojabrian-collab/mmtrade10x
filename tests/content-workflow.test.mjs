import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import Fastify from 'fastify';
import { z } from 'zod';
import { contentRevision, assertContentRevision, withContentLock, ContentConflict } from '../apps/api/src/content-workflow.ts';

const source=readFileSync(new URL('../apps/api/src/index.ts',import.meta.url),'utf8');
function database(){
 let state={draft:{slug:'index',title:'Draft',blocks:[{type:'text',text:'new'}],updatedAt:'2026-11-06T00:00:00.000Z'},published:{slug:'index',title:'Live',blocks:[],status:'PUBLISHED'},settings:{MMVS_SPATIAL_R4_index:{version:1,revision:2,published:{items:[]},draft:{items:[{selector:'.hero',x:10,y:0,scale:1}]},history:[]}},versions:[],logs:[]};
 let tail=Promise.resolve(),fail=false;
 const copy=structuredClone;
 function client(s){return {
  contentPageDraft:{findUnique:async()=>copy(s.draft),upsert:async({create,update})=>{s.draft={...(s.draft||create),...update,updatedAt:new Date().toISOString()};return copy(s.draft)}},
  contentPage:{findUnique:async()=>copy(s.published),upsert:async({create,update})=>{s.published={...(s.published||create),...update};return copy(s.published)}},
  systemSetting:{findUnique:async({where})=>s.settings[where.key]?{value:copy(s.settings[where.key])}:null,upsert:async({where,create,update})=>{s.settings[where.key]=copy(s.settings[where.key]?update.value:create.value);return {value:s.settings[where.key]}}},
  contentPageVersion:{aggregate:async()=>({_max:{version:s.versions.length}}),create:async({data})=>{s.versions.push(copy(data));return data}},
  auditLog:{create:async({data})=>{if(fail&&data.action==='CONTENT_PAGE_PUBLISHED')throw Error('injected audit failure');s.logs.push(copy(data));return data}}
 }}
 const db={
  get:()=>copy(state),failPublish:()=>{fail=true},
  $transaction(action){const result=tail.then(async()=>{const candidate=copy(state);const result=await action(client(candidate));state=candidate;return result});tail=result.catch(()=>{});return result}
 };
 for(const name of ['contentPageDraft','contentPage','systemSetting'])db[name]=new Proxy({}, {get:(_,key)=>(...args)=>client(state)[name][key](...args)});
 return db;
}
async function harness(){
 const app=Fastify(),db=database();
 app.setErrorHandler((e,req,reply)=>reply.code(e instanceof ContentConflict?409:500).send({error:e.code||e.message}));
 const spatial=source.slice(source.indexOf('const mmvsSpatialSlug ='),source.indexOf('async function mmvsSpatialOwner('));
 const routes=source.slice(source.indexOf("app.get('/admin/content/pages/:slug/editor'"),source.indexOf("app.put('/admin/content/pages/:slug',"));
 runInNewContext(stripTypeScriptTypes(spatial+'\n'+routes),{app,prisma:db,z,PAGE_SLUGS:['index'],contentRevision,assertContentRevision,withContentLock,ContentConflict,
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
