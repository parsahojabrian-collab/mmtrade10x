import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function functions(source,names){const ast=ts.createSourceFile('file.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),found=new Map();function visit(n){if(ts.isFunctionDeclaration(n)&&names.includes(n.name?.text))found.set(n.name.text,n.getText(ast));ts.forEachChild(n,visit)}visit(ast);return names.map(n=>{assert.ok(found.has(n),n);return found.get(n)}).join('\n');}
for(const file of ['spatial.js','spatial-bridge.js'])test(file+' preserves legacy and layered backgrounds, rejecting unsafe layer data',()=>{
 const scope={URL,location:{origin:'https://mmtrade10x.ir'}};const fn=functions(read('public/miniapp/p74/studio/'+file),['mmvsBgValidUrl','mmvsBgValidStop','mmvsBgValidLayer','mmvsBgValid']);vm.runInNewContext(fn,scope);
 const base={id:'bg-test',enabled:true,opacity:1,blur:0,blend:'normal'};
 const solid={...base,type:'solid',color:'#102030'};
 const image={...base,id:'bg-image',type:'image',url:'/miniapp/p74/assets/emblem.webp',fit:'cover',positionX:50,positionY:50};
 assert.equal(scope.mmvsBgValid({url:'/miniapp/p74/assets/emblem.webp',fit:'cover',position:'center',dim:0.3}),true);
 assert.equal(scope.mmvsBgValid({layers:[solid,image]}),true);
 assert.equal(scope.mmvsBgValid({layers:[{...image,url:'javascript:alert(1)'}]}),false);
 assert.equal(scope.mmvsBgValid({layers:[{...solid,opacity:5}]}),false);
 assert.equal(scope.mmvsBgValid({layers:[]}),false);
});
test('published page links remain local and only expose registered published pages',()=>{
 const entries=new Map([['index',{status:'PUBLISHED',path:'/miniapp'}],['draft',{status:'DRAFT',path:'/draft'}],['external',{status:'PUBLISHED',path:'https://other.example/page'}]]);
 const scope={publicPageRegistry:entries,URL,location:{origin:'https://mmtrade10x.ir'}};
 vm.runInNewContext(functions(read('public/miniapp/p74/studio/studio.js'),['publicPageUrl']),scope);
 assert.equal(scope.publicPageUrl('index'),'https://mmtrade10x.ir/miniapp');assert.equal(scope.publicPageUrl('draft'),'');assert.equal(scope.publicPageUrl('external'),'');
});
