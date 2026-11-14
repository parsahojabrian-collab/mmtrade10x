import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeBotHtml, botProgress, renderBotScreen, renderBotText, menuRowPlan } from '../apps/bot/src/bot-ui.ts';

test('HTML escaping protects Telegram message entities and dynamic admin content', () => {
  assert.equal(escapeBotHtml('<script a="1">&</script>'), '&lt;script a=&quot;1&quot;&gt;&amp;&lt;/script&gt;');
  const result = renderBotScreen({ title: 'گزارش <ویژه>', description: 'AT&T & < 10' });
  assert.ok(result.includes('&lt;ویژه&gt;'));
  assert.ok(result.includes('AT&amp;T &amp; &lt; 10'));
  assert.ok(!result.includes('<ویژه>'));
});

test('all registration stages map to bounded progress', () => {
  const values = ['STARTED','CHANNELS_PENDING','CONSENT_PENDING','PHONE_PENDING','REGISTERED','MINI_APP_PENDING','COMPLETE'];
  const counts = values.map(stage => botProgress(stage).current);
  assert.deepEqual(counts, [1,1,2,3,4,4,4]);
  assert.deepEqual(botProgress('UNKNOWN'), {current:1,total:4});
});

test('short actions pair while long Persian labels keep full-width rows', () => {
  assert.deepEqual(menuRowPlan(['آکادمی','چالش 10X','پشتیبانی','🚀 ورود به 10X Mini App','وضعیت ثبت‌نام']), [
    ['آکادمی','چالش 10X'],['پشتیبانی','🚀 ورود به 10X Mini App'],['وضعیت ثبت‌نام']
  ]);
  assert.deepEqual(menuRowPlan(['اول','دکمه کاملاً بلند برای کنترل بخش اختصاصی','دوم']), [
    ['اول'],['دکمه کاملاً بلند برای کنترل بخش اختصاصی'],['دوم']
  ]);
});

test('screens have a consistent identity, correct tone, progress and hint', () => {
  const result = renderBotScreen({title:'موفقیت',description:'تأیید شد',tone:'success',progress:{current:3,total:4},hint:'از منو ادامه بده'});
  assert.match(result,/MMTRADE 10X/);
  assert.match(result,/✅ <b>موفقیت<\/b>/);
  assert.match(result,/●●●○  3\/4/);
  assert.match(result,/از منو ادامه بده/);
  assert.match(renderBotText('پاسخ خودکار'),/راهنمای 10X/);
});

test('untrusted content is truncated before HTML formatting', () => {
  const result = renderBotScreen({title:'x'.repeat(300),description:'<'.repeat(4000),hint:'&'.repeat(700)});
  assert.equal((result.match(/&lt;/g)||[]).length, 3200);
  assert.equal((result.match(/&amp;/g)||[]).length, 500);
  assert.ok(result.includes(`<b>${'x'.repeat(100)}</b>`));
});
