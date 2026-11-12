import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const adminHtml=read('apps/api/public/admin.html');
const shared=read('public/miniapp/p74/studio/home-object-editor.js');
const admin=adminHtml+'\n'+shared;
const home=read('public/miniapp/p74/home.js');
const preview=read('public/miniapp/p74/preview.html');

test('Object Studio is a regular full-page editor reachable through Pages & Popups',()=>{
 assert.match(admin,/ورود به ویرایشگر تمام‌صفحه هوم/);
 assert.match(shared,/modal=el\('section','mm-home-object-controls'\)/);
 assert.match(shared,/options\.host\.replaceChildren\(modal\)/);
 assert.match(adminHtml,/selectedStudioHomeTools=true/);
 assert.doesNotMatch(admin,/b\.id='p74-admin-launch'/);
 assert.doesNotMatch(admin,/modal\.setAttribute\('aria-modal','true'\)/);
});
test('navigation cleans up the editor and its listener, old studio dock is hidden while editing',()=>{
 assert.match(admin,/window\.MMTradeObjectStudioClose\?\.\(true\)/);
 assert.match(admin,/window\.removeEventListener\('message',receive\)/);
 assert.match(read('public/miniapp/p74/studio/home-object-editor.css'),/body\.mm-object-fullpage #mf65-dock/);
});
test('poster upload passes through image optimization and existing authenticated media endpoint',()=>{
 assert.match(admin,/uploadObjectMedia\(file,'object'\)/);
 assert.match(admin,/window\.MMTradeImageOptimizer\.optimize\(file/);
 assert.match(admin,/\/home-studio\/media\/begin/);
 assert.match(admin,/config\.videoPoster=result\.url/);
});
test('poster persists alongside width, height and top in existing Home marker',()=>{
 for(const key of ['videoPoster','videoFrameWidth','videoFrameHeight','videoFrameTop']){
  assert.match(admin,new RegExp(key));
  assert.match(home,new RegExp(key));
 }
 assert.match(admin,/#p74-home-config/);
 assert.match(read('public/miniapp/p74/studio/studio.js'),/saveDraft\(\)/);
});
test('poster uses a local asset and does not affect video play URL',()=>{
 assert.match(admin,/OBJECT\.assetUrl\(config\.videoPoster\)/);
 assert.match(home,/window\.MMTradeObjectModel\.assetUrl\(cfg\.videoPoster\)/);
 assert.match(home,/video\.poster=window\.MMTradeObjectModel\.assetUrl\(posterUrl\)/);
 assert.match(home,/showModal\(cfg\.videoUrl,cfg\.videoPoster\)/);
 assert.match(home,/hero\.style\.backgroundImage/);
});
test('poster has editable safe percentage ranges, and preview cache version is bumped',()=>{
 for(const [key,min,max] of [['videoFrameWidth',60,100],['videoFrameHeight',8,32],['videoFrameTop',4,42]]){
  assert.match(admin,new RegExp(`'${key}',${min},${max}`));
  assert.match(home,new RegExp(`'${key}',${min},${max}`));
 }
 assert.match(preview,/MMTRADE_MERGED_HOME_20261111/);
});
