import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import Fastify from 'fastify';
import { z } from 'zod';
import { botMenuConflict } from '../packages/shared/src/bot-menu-validation.ts';
const source=readFileSync(new URL('../apps/api/src/index.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('api.ts',source,ts.ScriptTarget.Latest,true);
function declaration(name){return ast.statements.find(n=>ts.isFunctionDeclaration(n)?n.name?.text===name:ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)===name)).getText(ast);}
function route(method,path){return ast.statements.find(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='app.'+method&&n.expression.arguments[0]?.text===path).getText(ast);}
async function harness(){
 const settings=new Map(),logs=[],app=Fastify();
 const prisma={systemSetting:{findUnique:async({where})=>settings.has(where.key)?{value:structuredClone(settings.get(where.key))}:null,
 upsert:async({where,create,update})=>{settings.set(where.key,structuredClone(settings.has(where.key)?update.value:create.value));return {value:settings.get(where.key)}}},auditLog:{create:async({data})=>{logs.push(data);return data}}};
 const context={app,prisma,z,botMenuConflict,URL,process:{env:{}},adminIdOf:()=>null,adminGuard:async(req,reply)=>{
  const role=req.headers['x-role'];if(!role){reply.code(401).send({error:'unauthorized'});return false}req.admin={role};return true;
 }};
 const code=['BOT_CONFIG_KEY','defaultBotConfig','readBotConfig','botControlGuard'].map(declaration).join('\n')+'\n'+route('get','/admin/bot/config')+';\n'+route('put','/admin/bot/config');
 vm.runInNewContext(ts.transpile(code,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}),context);
 await app.ready();const get=()=>app.inject({url:'/admin/bot/config',headers:{'x-role':'SUPER_ADMIN'}});
 const initial=(await get()).json().config;
 const save=(body,role='SUPER_ADMIN')=>app.inject({method:'PUT',url:'/admin/bot/config',headers:role?{'x-role':role}:{},payload:body});
 return {app,settings,logs,get,initial,save};
}
test('Mini App only is off by default and round-trips independently of automatic replies',async t=>{
 const h=await harness();t.after(()=>h.app.close());assert.equal(h.initial.miniAppOnly,false);
 h.settings.set('MINI_APP_URL','https://example.com/miniapp');
 let r=await h.save({...h.initial,enabled:false,miniAppOnly:true});assert.equal(r.statusCode,200,r.body);
 assert.equal((await h.get()).json().config.miniAppOnly,true);assert.equal(h.logs.at(-1).metadata.miniAppOnly,true);
 r=await h.save({...h.initial,miniAppOnly:false});assert.equal(r.statusCode,200);assert.equal((await h.get()).json().config.miniAppOnly,false);
});
test('mode cannot be activated without an HTTPS Mini App URL and preserves previous settings',async t=>{
 const h=await harness();t.after(()=>h.app.close());
 for(const url of ['', 'http://example.com/app','javascript:alert(1)','https://user:secret@example.com/app']){
  h.settings.set('MINI_APP_URL',url);const r=await h.save({...h.initial,miniAppOnly:true});assert.equal(r.statusCode,400,r.body);assert.equal(r.json().error,'MINI_APP_URL_REQUIRED');assert.equal(h.settings.has('BOT_CONTROL_CONFIG'),false);
 }
});
test('old config clients cannot accidentally switch off an enabled Mini App mode',async t=>{
 const h=await harness();t.after(()=>h.app.close());h.settings.set('MINI_APP_URL','https://example.com/app');
 await h.save({...h.initial,miniAppOnly:true});
 const oldClient={...h.initial};delete oldClient.miniAppOnly;
 const r=await h.save({...oldClient,welcomeMessage:'Updated message'});assert.equal(r.statusCode,200,r.body);assert.equal((await h.get()).json().config.miniAppOnly,true);
});
test('only superadmins can read or change bot mode; nonboolean values are rejected',async t=>{
 const h=await harness();t.after(()=>h.app.close());
 assert.equal((await h.save({...h.initial,miniAppOnly:true},'SUPPORT')).statusCode,403);
 assert.equal((await h.save({...h.initial,miniAppOnly:true},null)).statusCode,401);
 assert.equal((await h.app.inject({url:'/admin/bot/config',headers:{'x-role':'CONTENT_MANAGER'}})).statusCode,403);
 assert.equal((await h.save({...h.initial,miniAppOnly:'true'})).statusCode,400);assert.equal(h.logs.length,0);
});
