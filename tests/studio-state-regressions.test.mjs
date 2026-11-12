import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
const read=p=>readFileSync(new URL('../public/miniapp/p74/studio/'+p,import.meta.url),'utf8');
const studio=read('studio.js'),spatial=read('spatial.js');
function code(source,names){const ast=ts.createSourceFile('source.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),found={};function walk(n){if(ts.isFunctionDeclaration(n)&&names.includes(n.name?.text))found[n.name.text]=n.getText(ast);ts.forEachChild(n,walk)}walk(ast);return names.map(n=>{assert.ok(found[n],n);return found[n]}).join('\n');}
function execute(s,c){vm.createContext(c);vm.runInContext(s,c);return c}
function node(){return {replaceChildren(){},append(){},setAttribute(){},classList:{toggle(){}},addEventListener(){}}}
function spatialScope(extra={}){
 const controls={};const doc={items:[{selector:'#old-home',x:0,y:0,scale:1}],domMoves:[]};
 const s={session:0,page:'index',revision:7,draft:null,published:{items:[]},history:[],loading:false,loadFailed:false,publishing:false,dirty:false,reviewLayout:null,historySuspended:false,externalBusy:false,lastHistoryDoc:JSON.stringify(doc),selected:'',groupMode:false,groupSelection:[],doc,initial:JSON.stringify(doc),clone:structuredClone,mmvsVisualPinned:new Set(),groupSync(){},renderProps(){},renderBoundary(){},preview(){},drawHistory(){},mmvsVisualStackSchedule(){},toast(){},$:id=>controls[id]??=node(),window:{dispatchEvent(){},MMVSWorkspace:{}},Event:class{}};
 return execute(code(spatial,['load','save','state']),Object.assign(s,extra));
}
test('failed layout load cannot associate or save the old document to a new page',async()=>{
 const s=spatialScope({api:async()=>{throw Error('offline')}});const before=structuredClone(s.doc);
 await assert.rejects(s.load('support'),/offline/);assert.equal(s.page,'index');assert.deepEqual(s.doc,before);assert.equal(s.loadFailed,true);assert.equal(s.loading,false);
 let writes=0;s.api=async()=>{writes++;return {revision:8}};s.dirty=true;assert.equal(await s.save(),false);assert.equal(writes,0);
});
test('a stale layout load failure cannot unlock or replace the newer request',async()=>{
 let rejectFirst,finishSecond;const first=new Promise((r,j)=>rejectFirst=j),second=new Promise(r=>finishSecond=r);let count=0;
 const s=spatialScope({api:()=>++count===1?first:second});const a=s.load('support').catch(()=>{}),b=s.load('profile');
 rejectFirst(Error('old failure'));await a;assert.equal(s.loading,true);assert.equal(s.loadFailed,false);
 finishSecond({revision:3,published:{items:[{selector:'#profile',x:1,y:1,scale:1}]},draft:null,history:[]});await b;assert.equal(s.page,'profile');assert.equal(s.doc.items[0].selector,'#profile');assert.equal(s.loading,false);
});
test('page editing remains blocked until both content and spatial loading finish',async()=>{
 let contentDone,layoutDone;const content=new Promise(r=>contentDone=r),layout=new Promise(r=>layoutDone=r),controls={};
 const s={page:'index',pageRequestId:0,pageLoading:false,pageLoadError:false,busy:false,popupBusy:false,uploadPending:0,reviewSnapshot:null,blocks:[],title:'Home',PAGES:[['support','Support']],clone:structuredClone,api:()=>content,window:{MMVS_Spatial:{loadPage:()=>layout}},$:id=>controls[id]??=node(),setOperation(v){s.busy=v},updatePreviewSourceToggle(){},drawPageList(){},syncDirty(){},drawEdits(){},drawContentBlocks(){},mountHomeTools(){},reloadFrame(){},updateHistoryButtons(){},toast(){}};
 execute(code(studio,['loadPage']),s);const task=s.loadPage('support');assert.equal(s.busy,true);contentDone({blocks:[],title:'Support'});await Promise.resolve();assert.equal(s.busy,true);assert.equal(s.page,'index');
 layoutDone();await task;assert.equal(s.page,'support');assert.equal(s.busy,false);assert.equal(s.pageLoading,false);
});
function imageScope(){let finish;const waiting=new Promise(r=>finish=r),inputs=[],edits={},messages=[];
 const make=tag=>{const n=node();n.files=[{}];if(tag==='input')inputs.push(n);return n};
 const s={page:'index',pageRequestId:1,reviewSnapshot:null,selected:'#first',props:[],elementBlock:()=>({}),$:()=>node(),textEl:make,document:{createElement:make},uploadImage:()=>waiting,checkpoint(){},editBlock:id=>edits[id]??={},drawEdits(){},syncDirty(){},postPreview(){},toast:m=>messages.push(m)};
 execute(code(studio,['showInspector']),s);s.showInspector({tag:'IMG'});return {s,inputs,edits,messages,finish};
}
test('image upload retains its original selected target',async()=>{
 const h=imageScope(),task=h.inputs[0].onchange();h.s.selected='#second';h.finish('/uploads/photo.webp');await task;assert.equal(h.edits['#first'].src,'/uploads/photo.webp');assert.equal(h.edits['#second'],undefined);
});
test('a late image upload never writes to a different page',async()=>{
 const h=imageScope(),task=h.inputs[0].onchange();h.s.page='support';h.s.pageRequestId++;h.finish('/uploads/photo.webp');await task;assert.equal(Object.keys(h.edits).length,0);assert.match(h.messages.at(-1),/صفحه/);
});
test('popup changes are detected and cancelling selection preserves the edited form',()=>{
 const keys=['title','body','imageUrl','buttonText','buttonUrl','pageSlug','frequency','status'];const form={elements:Object.fromEntries(keys.map(k=>[k,{value:''}]))},controls={};
 const s={popupInitial:null,popupSession:0,popupBusy:false,uploadPending:0,page:'index',chosenPopup:null,$:id=>id==='popup-form'?form:controls[id]??=node(),confirm:()=>false,toast(){}};
 execute(code(studio,['popupData','popupDirty','fillPopup']),s);assert.equal(s.fillPopup({id:'one',title:'First',body:'Saved'}),true);form.elements.body.value='Unsaved';assert.equal(s.popupDirty(),true);
 assert.equal(s.fillPopup({id:'two',title:'Second',body:'Other'}),false);assert.equal(s.chosenPopup,'one');assert.equal(form.elements.body.value,'Unsaved');
 s.popupBusy=true;assert.equal(s.fillPopup(null),false);assert.equal(s.chosenPopup,'one');
});
test('group moves crossing the server limit are atomic and preserve the prior document',()=>{
 const items=Array.from({length:499},(_,i)=>({selector:'#item'+i,x:0,y:0,scale:1}));const s={groupMode:true,loading:false,loadFailed:false,publishing:false,externalBusy:false,reviewLayout:null,groupSelection:['#a','#b'],groupClean:x=>x,doc:{items},savedFor:selector=>({selector,x:0,y:0,scale:1}),normalize:x=>x,state(){},renderProps(){},toast(){},preview(){}};
 execute(code(spatial,['groupCommit']),s);s.groupCommit([{selector:'#a',x:10,y:10},{selector:'#b',x:20,y:20}]);assert.equal(s.doc.items.length,499);assert.equal(s.doc.items.some(x=>x.selector==='#a'),false);
});
test('the latest media search is requested after an in-flight request and stale results never render',async()=>{
 let finish;const waiting=new Promise(r=>finish=r),requests=[],rendered=[];
 const s={loading:false,queuedLoad:false,queuedRefresh:false,page:1,group:{value:'all'},search:{value:'old'},LIMIT:32,recently:[],grid:{replaceChildren(){},querySelectorAll:()=>[]},pageNode:{},el:node,status(){},setTimeout(){},mmvsR4OnScroll(){},getCatalog:()=>{requests.push(s.search.value);return requests.length===1?waiting:Promise.resolve({items:[{name:'new result'}],total:1})},render:items=>rendered.push(items.map(x=>x.name))};
 execute(code(read('mmvs-media-library-r1.js'),['load']),s);const task=s.load();s.search.value='new';await s.load();finish({items:[{name:'old result'}],total:1});await task;
 assert.deepEqual(requests,['old','new']);assert.deepEqual(rendered,[['new result']]);
});
test('Home defaults to editable draft; live comparison uses published layout and disables dragging',()=>{
 const s={page:'index',reviewSnapshot:null,previewPublishedHome:false,externalBusy:false,window:{MMVSWorkspace:{}},reviewLayout:null,published:{items:[{selector:'#published'}]},doc:{items:[{selector:'#draft'}]},clone:structuredClone,mode:true,grid:false,animationPlaying:false,selected:'',send:(type,data)=>messages.push({type,data}),groupSync(){},scanLayers(){}};const messages=[];
 execute(code(studio,['isPublishedHomePreview'])+'\n'+code(spatial,['preview']),s);s.window.MMVSWorkspace.isPublishedHomePreview=s.isPublishedHomePreview;
 assert.equal(s.isPublishedHomePreview(),false);s.preview();assert.equal(messages[0].data.layout.items[0].selector,'#draft');messages.length=0;
 s.previewPublishedHome=true;s.preview();assert.equal(messages[0].data.layout.items[0].selector,'#published');assert.equal(messages[1].data.enabled,false);
});
test('HTML blocks remain selectable and invalid HTML size is rejected before saving',()=>{
 const types=studio.match(/const CONTENT_TYPES=([^;]+);/)[0];const s={page:'support',window:{},blocks:[{type:'html',html:'<p>Saved</p>'}],Object};execute(types+'\n'+code(studio,['contentIndices','validateAllBlocks']),s);
 assert.equal(s.contentIndices().length,1);s.validateAllBlocks();s.blocks[0].html='x'.repeat(16001);assert.throws(()=>s.validateAllBlocks(),/HTML/);
});

test('one Undo/Redo history restores both native layout and content without recording its own replay',()=>{
 const s=spatialScope();const controls={};Object.assign(s,{busy:false,pageLoading:false,pageLoadError:false,uploadPending:0,popupBusy:false,reviewSnapshot:null,previewPublishedHome:false,page:'index',title:'Home',blocks:[],undoStack:[],redoStack:[],selectedBlockIndex:-1,document:{},$:id=>controls[id]??=node(),drawEdits(){},drawContentBlocks(){},mountHomeTools(){},syncDirty(){},reloadFrame(){}});
 s.window.MMVS_Spatial={getDraftLayout:()=>structuredClone(s.doc),restoreLocal:layout=>s.spatialRestoreLocal(layout),isBusy:()=>false};
 const replay=code(spatial,['restoreLocal']).replace('function restoreLocal(','function spatialRestoreLocal(');
 vm.runInContext(replay+'\n'+code(studio,['snapshot','updateHistoryButtons','restoreLocal','undo','redo','workspaceBusy','isPublishedHomePreview']),s);
 const ast=ts.createSourceFile('studio.js',studio,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let callback;
 function walk(n){if(ts.isBinaryExpression(n)&&n.left.getText(ast)==='window.MMVSWorkspace')callback=n.right.properties.find(p=>p.name?.getText(ast)==='recordLayoutHistory').initializer.getText(ast);ts.forEachChild(n,walk)}walk(ast);
 s.window.MMVSWorkspace.recordLayoutHistory=vm.runInContext('('+callback+')',s);
 s.doc.items[0].x=40;s.state();assert.equal(s.undoStack.length,1);s.undo();assert.equal(s.doc.items[0].x,0);assert.equal(s.redoStack.length,1);assert.equal(s.undoStack.length,0);
 s.redo();assert.equal(s.doc.items[0].x,40);assert.equal(s.undoStack.length,1);assert.equal(s.redoStack.length,0);
});

test('blocking frame edits during a coordinated save does not block the owner save itself',async()=>{
 let writes=0;const s=spatialScope({externalBusy:true,dirty:true,selected:'#old-home',current:()=>({selector:'#old-home',x:0,y:0,scale:1}),put:()=>assert.fail('edit must be blocked'),api:async()=>{writes++;return {revision:8}}});
 vm.runInContext(code(spatial,['edit']),s);let changed=false;s.edit(()=>{changed=true});assert.equal(changed,false);assert.equal(await s.save(),true);assert.equal(writes,1);
});
test('a late popup image upload cannot overwrite the newly selected popup form',async()=>{
 let finish;const upload=new Promise(r=>finish=r);const field={value:'new popup image'},messages=[];
 const s={popupSession:1,$:id=>id==='popup-form'?{elements:{imageUrl:field}}:node(),uploadImage:()=>upload,toast:m=>messages.push(m)};
 const ast=ts.createSourceFile('studio.js',studio,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let callback;
 function walk(n){if(ts.isBinaryExpression(n)&&n.left.getText(ast)==="$('popup-upload').onchange")callback=n.right.getText(ast);ts.forEachChild(n,walk)}walk(ast);assert.ok(callback);
 execute('this.onUpload='+callback,s);const task=s.onUpload({target:{files:[{}],value:'file'}});s.popupSession++;finish('/uploads/old-form.webp');await task;assert.equal(field.value,'new popup image');assert.match(messages.at(-1),/فرم/);
});

test('publication and restoration may reload inside their own busy operation while user navigation stays blocked',async()=>{
 const controls={};const s={page:'index',pageRequestId:0,pageLoading:false,pageLoadError:false,busy:true,popupBusy:false,uploadPending:0,reviewSnapshot:null,blocks:[],title:'Home',PAGES:[['index','Home']],clone:structuredClone,api:async()=>({blocks:[],title:'Home'}),window:{MMVS_Spatial:{loadPage:async()=>{}}},$:id=>controls[id]??=node(),setOperation(v){s.busy=v},updatePreviewSourceToggle(){},drawPageList(){},syncDirty(){},drawEdits(){},drawContentBlocks(){},mountHomeTools(){},reloadFrame(){},updateHistoryButtons(){},toast(){}};
 execute(code(studio,['loadPage']),s);await assert.rejects(s.loadPage('index'),/عملیات/);assert.equal(await s.loadPage('index',true),true);assert.equal(s.busy,true);assert.equal(s.pageLoading,false);
});
