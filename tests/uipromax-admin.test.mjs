import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const admin = readFileSync('apps/api/public/admin.html', 'utf8');
const team = readFileSync('apps/api/public/team.html', 'utf8');
const adminCss = readFileSync('public/miniapp/p74/studio/uipromax-admin.css', 'utf8');
const adminJs = readFileSync('public/miniapp/p74/studio/uipromax-admin.js', 'utf8');
const teamCss = readFileSync('public/miniapp/p74/studio/uipromax-team.css', 'utf8');
const master = readFileSync('design-system/mmtrade10x/MASTER.md', 'utf8');
const projectOverrides = readFileSync('design-system/mmtrade10x/PROJECT_OVERRIDES.md', 'utf8');

test('Super Admin actually loads the Pro Max implementation assets after legacy styles', () => {
  assert.match(admin, /uipromax-admin\.css\?v=UIPROMAX_REAL_R1/);
  assert.match(admin, /uipromax-admin\.js\?v=UIPROMAX_REAL_R1/);
  assert.match(admin, /v\.dataset\.view=id/);
});

test('mobile navigation does not auto-open the iOS keyboard', () => {
  assert.match(admin, /drawer\.focus\(\{preventScroll:true\}\)/);
  assert.doesNotMatch(admin, /if\(search\)search\.focus\(\)/);
  assert.match(adminJs, /visualViewport/);
  assert.match(adminJs, /uix-keyboard-open/);
  assert.match(adminCss, /--uix-vv-height/);
  assert.match(adminCss, /uix-keyboard-open/);
  assert.match(adminCss, /\.p53-groups[\s\S]*?overflow-y:auto/);
  assert.match(adminCss, /\.p53-search[\s\S]*?font-size:16px/);
});

test('Financial Dashboard tokens and accessible states are present', () => {
  for (const token of ['#020617','#0E1223','#22C55E','#EF4444','#334155']) assert.ok(adminCss.includes(token));
  assert.match(adminCss, /:focus-visible/);
  assert.match(adminCss, /prefers-reduced-motion/);
  assert.match(adminCss, /min-height:44px/);
});

test('Team console uses the same semantic design system', () => {
  assert.match(team, /class="mm-uipromax-team"/);
  assert.match(team, /uipromax-team\.css\?v=UIPROMAX_REAL_R1/);
  assert.match(teamCss, /#020617/);
  assert.match(teamCss, /#22C55E/);
  assert.match(teamCss, /prefers-reduced-motion/);
});

test('official generated design system and Persian project overrides are retained', () => {
  assert.match(master, /Category:\*\* Financial Dashboard/);
  assert.match(master, /#020617/);
  assert.match(master, /Density 8\/10/);
  assert.match(projectOverrides, /Doran/);
  const pages = readdirSync('design-system/mmtrade10x/pages').filter(name => name.endsWith('.md'));
  assert.ok(pages.length >= 12, `expected at least 12 page overrides, got ${pages.length}`);
});

test('Mini App primary journeys load page-scoped Pro Max styles', () => {
  const pages = [
    ['public/miniapp/index.html','uipromax-home'],
    ['public/miniapp/p74/learning/academy-home.html','uipromax-academy'],
    ['public/miniapp/p74/eplanet/index.html','uipromax-eplanet'],
    ['public/miniapp/p74/support/support.html','uipromax-support'],
    ['public/miniapp/p74/copytrade-academy/index.html','uipromax-copytrade'],
    ['public/miniapp/p74/profile/profile.html','uipromax-profile']
  ];
  for (const [path, bodyClass] of pages) {
    const html = readFileSync(path, 'utf8');
    assert.match(html, new RegExp(bodyClass));
    assert.ok(html.includes('uipromax-miniapp.css?v=UIPROMAX_REAL_R1'));
  }
  const miniCss = readFileSync('public/miniapp/p74/studio/uipromax-miniapp.css','utf8');
  for (const token of ['.home-hero','.academy-modal-panel','.step-card','.glass-card','.notice-card','#p77-app']) {
    assert.ok(miniCss.includes(token), `missing Mini App page rule ${token}`);
  }
});

test('Visual Studio loads its dedicated workbench stylesheet', () => {
  const html = readFileSync('public/miniapp/p74/studio/index.html','utf8');
  const studioCss = readFileSync('public/miniapp/p74/studio/uipromax-studio.css','utf8');
  assert.match(html,/class="uipromax-studio"/);
  assert.ok(html.includes('uipromax-studio.css?v=UIPROMAX_REAL_R1'));
  assert.match(studioCss,/\.workspace/);
  assert.match(studioCss,/\.spatial-panel/);
  assert.match(studioCss,/prefers-reduced-motion/);
});

test('new CSS files have balanced block delimiters', () => {
  const miniCss = readFileSync('public/miniapp/p74/studio/uipromax-miniapp.css','utf8');
  const studioCss = readFileSync('public/miniapp/p74/studio/uipromax-studio.css','utf8');
  for (const [name, css] of [['admin',adminCss],['team',teamCss],['miniapp',miniCss],['studio',studioCss]]) {
    const opens = (css.match(/\{/g)||[]).length;
    const closes = (css.match(/\}/g)||[]).length;
    assert.equal(opens, closes, `${name} CSS brace mismatch ${opens} != ${closes}`);
  }
});
