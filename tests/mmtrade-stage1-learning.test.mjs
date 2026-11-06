import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const cwd=process.cwd();
const api=readFileSync(join(cwd,'apps/api/src/index.ts'),'utf8');
const js=readFileSync(join(cwd,'public/miniapp/p74/learning/stage1.js'),'utf8');
const html=readFileSync(join(cwd,'public/miniapp/p74/learning/stage1.html'),'utf8');
const studio=readFileSync(join(cwd,'public/miniapp/p74/learning/studio.js'),'utf8');
const defaultObjects=JSON.parse(readFileSync(join(cwd,'public/miniapp/p74/learning/scene-defaults.json'),'utf8'));
const lessonKeys=['challenge','forex','gold','crypto','broker','scam','risk'];
test('all seven keys are present consistently in UI and API',()=>{
 for(const key of lessonKeys){assert.match(api,new RegExp(`'${key}'`));assert.match(js,new RegExp(`id:'${key}'`))}
 assert.match(api,/MM_STAGE1_KEYS\.length === MM_STAGE1_KEYS\.length|read\.length === MM_STAGE1_KEYS\.length/);
});
test('progress is associated with authenticated telegram user and existing DB model',()=>{
 assert.match(api,/miniUser\(body\.data\.initData, false\)/);
 assert.match(api,/prisma\.lessonProgress\.upsert/);
 assert.match(api,/userId: who\.id/);
 assert.match(api,/MM10_STAGE1_V1_\$\{body\.data\.lessonKey\}/);
 assert.match(api,/userId_lessonId/);
});
test('stage two content is server-guarded and refuses incomplete course',()=>{
 const start=api.indexOf("app.post('/challenge/learning/stage2/content'");
 const end=api.indexOf('const mmSceneKey',start);
 assert.ok(start>0&&end>start);
 const route=api.slice(start,end);
 assert.match(route,/if \(!state\.unlocked\) return reply\.code\(403\)/);
 assert.ok(route.indexOf('state.unlocked')<route.indexOf('return { unlocked: true'));
});
test('study requires explicit confirmed POST and cannot be marked by opening',()=>{
 assert.match(html,/مطالعه کردم/);
 assert.match(js,/confirm\.addEventListener\('click'/);
 assert.match(js,/\/challenge\/learning\/stage1\/complete/);
 assert.doesNotMatch(js,/localStorage/);
 assert.match(js,/read=new Set\(j\.read/);
});
test('red -> green indicators derive from server saved read status',()=>{
 assert.match(js,/mark\.textContent=done\?'✓':'•'/);
 assert.match(js,/done\?' is-read'/);
 assert.match(js,/stage2\.html/);
});
test('stage scene consists of independently animated objects',()=>{
 assert.ok(defaultObjects.some(o=>o.type==='candles'));
 assert.ok(defaultObjects.some(o=>o.anim==='pulse'));
 assert.ok(defaultObjects.every(o=>typeof o.id==='string'));
 assert.match(js,/renderScene\(items\)/);
 assert.match(js,/clamp\(o\.x,0,100\)/);
 assert.match(js,/MM_STAGE1_SCENE_PREVIEW/);
});
test('only authenticated admins can save/publish; draft is independent from published',()=>{
 const a=api.indexOf("app.get('/admin/challenge/stage1/scene'");
 const b=api.indexOf('// MMTrade Stage 1 routes end.',a);
 const routes=api.slice(a,b);
 assert.match(routes,/p60OwnerOnly\(request, reply\)/);
 assert.match(routes,/mmSceneDraftKey/);
 assert.match(routes,/app\.post\('\/admin\/challenge\/stage1\/scene\/publish'/);
 assert.match(studio,/authorization:'Bearer '/);
});
test('image paths and scene count are validated on server',()=>{
 assert.match(api,/mmSceneList = z\.array\(mmSceneItem\)\.max\(32\)/);
 assert.match(api,/duplicate_id/);
 assert.match(api,/unsafe_asset_path/);
 assert.match(api,/image_requires_safe_source/);
});
