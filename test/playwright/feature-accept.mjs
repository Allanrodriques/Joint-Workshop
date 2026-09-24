import { chromium } from 'playwright';
import { skipIntro } from './helpers.mjs';

const URL = process.env.JW_URL ?? 'http://127.0.0.1:4173/';
const LT = (m) => process.stdout.write('· ' + m + '\n');
const errors = [];
const failures = [];
const notes = [];

const args = ['--use-angle=metal', '--enable-unsafe-swiftshader', '--use-gl=angle'];

function attach(browser, page, tag) {
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/three/.test(m.text())) errors.push(`${tag} console: ${m.text()}`);
  });
}

async function boot(browser, viewport) {
  const page = await browser.newPage({ viewport });
  attach(browser, page, `${viewport.width}x${viewport.height}`);
  await page.goto(URL);
  await page.waitForFunction(
    () => window.__jointWorkshop && document.querySelector('#scene')?.getBoundingClientRect().width > 0,
    null,
    { timeout: 20000 },
  );
  return page;
}

async function waitFor(page, name, ms = 18000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await page.evaluate(() => window.__jointWorkshop?.stage)) === name) return;
    await page.waitForTimeout(90);
  }
  throw new Error(`never reached ${name} (now ${await page.evaluate(() => window.__jointWorkshop?.stage)})`);
}

const eq = async (page, script, ...args) =>
  page.evaluate(
    ([s, a]) => window.__jointWorkshop?.[s]?.(a),
    [script, ...args],
  );

const settings = (page) => page.evaluate(() => window.__jointWorkshop?.settings);
const meta = (page) =>
  page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('joint-workshop.progress.v1') ?? '{}');
    } catch {
      return {};
    }
  });
const history = (page) =>
  page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('joint-workshop.history.v1') ?? '[]');
    } catch {
      return [];
    }
  });
const achievements = (page) =>
  page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('joint-workshop.achievements.v1') ?? '[]');
    } catch {
      return [];
    }
  });
const toastTexts = (page) =>
  page.evaluate(() => Array.from(document.querySelectorAll('#toasts .toast')).map((n) => n.textContent));
const finalVisible = (page) =>
  page.evaluate(() => {
    const o = document.querySelector('#overlay-final');
    return !!o && !o.hasAttribute('hidden') && getComputedStyle(o).display !== 'none';
  });

const browser = await chromium.launch({ headless: true, args });
const page = await boot(browser, { width: 1380, height: 860 });

/* ================= B: skip-intro setting ================= */
await page.waitForFunction(() => window.__jointIntro !== undefined, null, { timeout: 20000 });
await page.evaluate(() => localStorage.setItem(
  'joint-workshop.settings.v1',
  JSON.stringify({ graphics: 'low', motion: 'reduced', sound: false, themeIndex: 0, skipIntro: true, music: false }),
));
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__jointWorkshop && document.querySelector('#scene')?.getBoundingClientRect().width > 0, null, { timeout: 30000 });
// skipIntro should auto-advance past the cinematic without any click
await page.waitForFunction(() => !document.getElementById('intro'), null, { timeout: 35000 });
LT('skip-intro setting: intro auto-skipped without user click');
const s0 = await settings(page);
if (s0.skipIntro !== true) failures.push(`skipIntro setting should be true, got ${s0.skipIntro}`);
if (s0.music !== false) failures.push(`music setting should be false, got ${s0.music}`);
await page.click('#btn-start');
await waitFor(page, 'PREPARE');
LT('prepared after auto-skipped intro');

/* ================= Settings radios stay in sync ================= */
await page.click('#btn-settings');
await page.waitForFunction(() => !document.querySelector('#modal-settings').hasAttribute('hidden'), null, { timeout: 5000 });
const preIntro = await page.evaluate(() => document.querySelector('input[name="intro"][value="on"]').checked);
const preMusic = await page.evaluate(() => document.querySelector('input[name="music"][value="on"]').checked);
if (preIntro) failures.push('intro radio should show Watch by default (skipIntro on)');
if (!preMusic) failures.push('music radio should show On by default');
await page.click('input[name="intro"][value="on"]');
await page.click('input[name="music"][value="off"]');
await page.click('input[name="sound"][value="off"]');
await page.click('#btn-settings-close');
const s1 = await settings(page);
if (s1.skipIntro !== true) failures.push('settings apply: skipIntro should stay true');
if (s1.music !== false) failures.push('settings apply: music should be false');
if (s1.sound !== false) failures.push('settings apply: sound off radio not applied');
LT('settings radios: intro/music/sound sync confirmed');
// reopen: radios reflect stored state
await page.click('#btn-settings');
const reIntro = await page.evaluate(() => document.querySelector('input[name="intro"][value="on"]').checked);
const reMusic = await page.evaluate(() => document.querySelector('input[name="music"][value="on"]').checked);
const reSound = await page.evaluate(() => document.querySelector('input[name="sound"][value="on"]').checked);
if (!reIntro) failures.push('reopened settings: intro Skip not checked');
if (reMusic) failures.push('reopened settings: music On should not be checked');
if (reSound) failures.push('reopened settings: sound On should not be checked');
await page.click('#btn-settings-close');
LT('settings radios: reopen reflects persisted state');

// ambient ambience element exists + ember glow is driven by the frame loop
const ember = await page.evaluate(() => {
  const el = document.querySelector('#ember-glow');
  return el ? parseFloat(el.style.opacity || '0') : -1;
});
if (ember < 0) failures.push('#ember-glow missing');
else notes.push(`ember-glow opacity ${ember.toFixed(2)}`);
if (!(ember >= 0.1 && ember <= 0.65)) notes.push('ember-glow opacity outside expected band (0.12–0.62)');

/* ================= B: first session → history + First Roll ================= */
await eq(page, 'go', 'FINAL');
await waitFor(page, 'FINAL');
if (!(await finalVisible(page))) failures.push('FINAL overlay not visible');
await page.waitForTimeout(200);
const hist1 = await history(page);
if (hist1.length !== 1) failures.push(`expected 1 history record after first FINAL, got ${hist1.length}`);
if (hist1[0]?.chain !== 1) failures.push(`first record should carry chain 1, got ${JSON.stringify(hist1[0])}`);
const ach1 = await achievements(page);
if (!ach1.includes('first-roll')) failures.push('first-roll achievement not unlocked');
const toastSnap = await toastTexts(page);
if (!toastSnap.some((t) => t.includes('Unlocked: First Roll'))) failures.push('no "Unlocked: First Roll" toast');
const count1 = await page.evaluate(() => document.querySelector('#achiev-count')?.textContent ?? '');
if (count1.trim() !== '1 / 12') failures.push(`achiev-count should be "1 / 12", got "${count1}"`);
const chip1 = await page.evaluate(() => Array.from(document.querySelectorAll('#achiev-strip .achiev-chip')).map((n) => n.textContent));
if (!chip1.includes('First Roll')) failures.push(`strip missing First Roll chip (${chip1.join(', ')})`);
LT(`session recorded + First Roll unlocked (count ${count1.trim()})`);

/* ================= D: ROLL ANOTHER chains the streak ================= */
await page.click('#btn-nextjoint');
await waitFor(page, 'PREPARE');
await eq(page, 'go', 'FINAL');
await waitFor(page, 'FINAL');
await page.waitForTimeout(200);
const hist2 = await history(page);
if (hist2.length !== 2) failures.push(`expected 2 history records after ROLL ANOTHER, got ${hist2.length}`);
if (hist2[0]?.chain !== 2) failures.push(`latest record should carry chain 2, got ${JSON.stringify(hist2[0])}`);
const ach2 = await achievements(page);
if (!ach2.includes('double')) failures.push('double achievement not unlocked after back-to-back roll');
const count2 = await page.evaluate(() => document.querySelector('#achiev-count')?.textContent ?? '');
if (count2.trim() !== '2 / 12') failures.push(`achiev-count should be "2 / 12", got "${count2}"`);
const chip2 = await page.evaluate(() => Array.from(document.querySelectorAll('#achiev-strip .achiev-chip')).map((n) => n.textContent));
if (!chip2.includes('Double Rolled')) failures.push(`strip missing Double Rolled chip (${chip2.join(', ')})`);
LT(`ROLL ANOTHER → chain 2, count ${count2.trim()}`);

/* ================= D: SANDBOX entry/exit ================= */
await page.click('#btn-sandbox');
await waitFor(page, 'SANDBOX');
const sbTargets = await page.evaluate(() => (window.__jointWorkshop?.debugTargets() ?? []).map((t) => t.id));
if (!sbTargets.some((id) => id === 'sb-bud' || id === 'sb-paper')) failures.push(`sandbox targets missing (${sbTargets.join(', ')})`);
const sandboxKicker = await page.evaluate(() => document.querySelector('#hint-kicker')?.textContent ?? '');
if (!/SANDBOX/i.test(sandboxKicker)) failures.push(`SANDBOX kicker expected, got "${sandboxKicker}"`);
LT(`SANDBOX entered (targets: ${sbTargets.filter((id) => id.startsWith('sb-')).join(', ')})`);
await page.click('#btn-exit-freeroam');
await waitFor(page, 'FINAL');
LT('SANDBOX exited to FINAL');

/* returning to the same session's FINAL must NOT re-record it */
const hist3 = await history(page);
if (hist3.length !== 2) failures.push(`re-entering FINAL should not add a session (got ${hist3.length})`);
LT('re-entered FINAL → history stable (no duplicate sessions)');

/* ================= C: FREE ROAM + photo mode ================= */
await page.click('#btn-freeroam');
await waitFor(page, 'FREE_ROAM', 12000);
const m0 = await meta(page);
if (m0.freeRoam !== 1) failures.push(`freeRoam counter should be 1, got ${m0.freeRoam}`);
if (!(await achievements(page)).includes('explorer')) failures.push('explorer achievement not unlocked');
const photoBtn = await page.evaluate(() => {
  const b = document.querySelector('#btn-photo-freeroam');
  return !!b && !b.hasAttribute('hidden');
});
if (!photoBtn) failures.push('#btn-photo-freeroam should be visible in FREE_ROAM');
LT('FREE_ROAM reached, explorer unlocked');

await page.click('#btn-photo-freeroam');
await page.waitForFunction(() => document.body.classList.contains('photo-mode'), null, { timeout: 5000 });
const photoUiShown = await page.evaluate(() => {
  const u = document.querySelector('#photo-ui');
  return !!u && !u.hasAttribute('hidden');
});
if (!photoUiShown) failures.push('#photo-ui should be visible in photo mode');
await page.click('#btn-photo-capture');
await page.waitForTimeout(300);
const toastsCap = await toastTexts(page);
if (!toastsCap.some((t) => t.includes('Snapshot saved.'))) failures.push('no "Snapshot saved." toast after capture');
const m1 = await meta(page);
if (m1.photos !== 1) failures.push(`photos counter should be 1, got ${m1.photos}`);
if (!(await achievements(page)).includes('photographer')) failures.push('photographer achievement not unlocked');
await page.click('#btn-photo-exit');
await page.waitForFunction(() => !document.body.classList.contains('photo-mode'), null, { timeout: 5000 });
LT('photo capture → Photographer unlocked, cut back to free roam');

await page.click('#btn-exit-freeroam');
await waitFor(page, 'FINAL');
LT('free roam exit → FINAL');

/* ================= Mobile 320 sanity ================= */
{
  const mp = await boot(browser, { width: 320, height: 568, hasTouch: true, isMobile: true });
  await skipIntro(mp);
  await mp.click('#btn-start');
  await waitFor(mp, 'PREPARE');
  await eq(mp, 'go', 'FINAL');
  await waitFor(mp, 'FINAL');
  const finRect = await mp.evaluate(() => {
    const o = document.querySelector('#overlay-final').getBoundingClientRect();
    return { left: o.left, right: o.right, w: window.innerWidth };
  });
  if (finRect.left < 0 || finRect.right > finRect.w + 1)
    failures.push(`FINAL overlay overflows 320px (${finRect.left}..${finRect.right})`);
  const overflow = await mp.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  if (overflow.scrollW > overflow.clientW + 1) failures.push(`horizontal overflow on 320px (${overflow.scrollW})`);
  await mp.click('#btn-photo');
  await mp.waitForFunction(() => document.body.classList.contains('photo-mode'), null, { timeout: 5000 });
  const photoOverflow = await mp.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  if (photoOverflow.scrollW > photoOverflow.clientW + 1) failures.push(`photo mode overflows 320px (${photoOverflow.scrollW})`);
  await mp.click('#btn-photo-exit');
  LT('320x568: FINAL + photo mode fit without overflow');
  await mp.close();
}

const pageErrors = errors.filter((e) => !/WebGL|GPU|gl/.test(e));
LT('console errors: ' + pageErrors.length + (pageErrors.length ? ' — ' + pageErrors.join(' | ') : ''));
if (pageErrors.length > 0) process.exitCode = 1;
if (failures.length) {
  console.log('\n== FAILURES ==\n' + failures.join('\n'));
  process.exitCode = 1;
}
console.log('\n== NOTES ==\n' + notes.join('\n'));
await browser.close();
process.exit(0);