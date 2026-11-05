import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const code=readFileSync(new URL('../public/miniapp/p74/home.js',import.meta.url),'utf8');
const window={addEventListener(){}};
const document={readyState:'loading',addEventListener(){}};
runInNewContext(code,{window,document,location:{search:'?p74Preview=1&stepEdit=1',pathname:'/miniapp/p74/preview.html'},URLSearchParams,URL});
const g=window.P74StepGeometry;
const old={top:34,right:36,width:45,height:13};
function boxes(width){const height=width*1770/780;return {stage:{top:0,bottom:height,width,height},mountain:{top:height*.5,bottom:height*.78,width,height:height*.28}}}
function within(p,b){const st=b.stage,m=b.mountain;const left=(100-p.right-p.width)*m.width/100;const right=(100-p.right)*m.width/100;
 const top=m.top+p.top*m.height/100,bottom=top+p.height*m.height/100;
 return left>=-.02&&right<=st.width+.02&&top>=st.top-.03&&bottom<=st.bottom+.03;}
test('stored layout remains backward compatible',()=>{assert.deepEqual(JSON.parse(JSON.stringify(g.stepPosition(old,old))),old)});
test('stage-wide vertical movement reaches the very top',()=>{
 for(const w of [320,375,390,430,540]){
  const b=boxes(w),p=g.stepDrag(old,0,-b.stage.height,b.stage,b.mountain);
  assert.ok(p.top < -170,`width ${w} top ${p.top}`);
  assert.ok(within(p,b));
 }
});
test('dragging cannot push a button beyond the full stage',()=>{
 for(const width of [320,390,540]){
  const b=boxes(width),a=g.stepDrag(old,10000,10000,b.stage,b.mountain),z=g.stepDrag(old,-10000,-10000,b.stage,b.mountain);
  assert.ok(within(a,b));assert.ok(within(z,b));
 }
});
test('width and height are independently resizable in %',()=>{
 const b=boxes(390);const m=b.mountain;
 const p=g.stepResize(old,-m.width*.10,m.height*.08,b.stage,m);
 assert.equal(p.width,55);assert.equal(p.height,21);assert.ok(within(p,b));
 const q=g.stepResize(old,m.width*.40,-m.height*.40,b.stage,m);
 assert.equal(q.width,18);assert.equal(q.height,7);assert.ok(within(q,b));
});
test('two finger pinch enlarges and shrinks dimensions while keeping within bounds',()=>{
 for(const width of [320,390,430,540]){
  const b=boxes(width);
  for(const scale of [0.25,0.7,1.25,2,7]){
   const p=g.stepPinch(old,scale,0,0,b.stage,b.mountain);
   assert.ok(within(p,b),`${width}, ${scale} ${JSON.stringify(p)}`);
   assert.ok(p.width>=18&&p.width<=95);
   assert.ok(p.height>=7&&p.height<=28);
  }
 }
});
test('pinch movement also changes the position, with clipping prevention',()=>{
 const b=boxes(375),p=g.stepPinch(old,1.2,25,-120,b.stage,b.mountain);
 assert.ok(p.top<old.top);assert.ok(p.right<old.right);assert.ok(within(p,b));
});
test('editing panel allows negative top and flexible dimensions',()=>{
 const html=readFileSync(new URL('../apps/api/public/admin.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/miniapp/p74/home.css',import.meta.url),'utf8');
 assert.match(html,/top:\[-178\.57,171\.57\]/);
 assert.match(html,/width:\[18,95\]/);
 assert.match(html,/height:\[7,28\]/);
 assert.match(html,/stepNormalize\(item\.position\)/);
 assert.match(css,/\.p76-step-resize-grip/);
 assert.match(css,/min-height:0!important/);
});
