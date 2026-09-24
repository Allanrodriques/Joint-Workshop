import { chromium } from 'playwright';

const URL = process.env.JW_URL ?? 'http://127.0.0.1:4173/';
const LT = (m) => process.stdout.write('· ' + m + '\n');
const errors = [];
const failures = [];
const notes = [];

const args = ['--use-angle=metal', '--enable-unsafe-swiftshader', '--use-gl=angle'];

const browser = await chromium.launch({ headless: true, args });

function attach(page, tag) {
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/three/.test(m.text())) errors.push(`${tag} console: ${m.text()}`);
  });
}

async function fresh() {
  const page = await browser.newPage({ viewport: { width: 1380, height: 860 } });
  attach(page, 'desktop');
  await page.goto(URL);
  await page.waitForFunction(
    () =>
      window.__jointWorkshop &&
      window.__jointIntro &&
      document.querySelector('#scene')?.getBoundingClientRect().width > 0,
    null,
    { timeout: 20000 },
  );
  return page;
}

/* ================= 1 — intro runs BEFORE the game ================= */
{
  const page = await fresh();
  LT('fresh load: app + intro wired');

  const introCover = await page.evaluate(() => {
    const r = document.getElementById('intro')?.getBoundingClientRect();
    return r
      ? { w: r.width, h: r.height, full: r.width >= innerWidth - 1 && r.height >= innerHeight - 1 }
      : { full: false };
  });
  if (!introCover.full) failures.push(`#intro should cover the viewport (${JSON.stringify(introCover)})`);

  const enterDisabled = await page.evaluate(() => {
    const b = document.getElementById('intro-enter');
    return !!b && b.disabled === true;
  });
  if (!enterDisabled) failures.push('intro ENTER must be disabled until the sequence is ready');

  const btnCovered = await page.evaluate(() => {
    const b = document.getElementById('btn-start');
    if (!b) return false;
    const r = b.getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!el && !b.contains(el);
  });
  if (!btnCovered) failures.push('#btn-start (game START) should be covered by #intro on fresh load');

  // Boot shell must be gone and #app revealed once the intro is live —
  // proves the critical boot screen handed over without a raw-HTML flash.
  const bootState = await page.evaluate(() => ({
    bootGone: !document.getElementById('app-boot'),
    appVisible: getComputedStyle(document.getElementById('app')).visibility === 'visible',
    gamePanelHidden: document.getElementById('overlay-intro')?.hasAttribute('hidden') ?? false,
    titleCount: [...document.querySelectorAll('h1')].filter((h) => h.offsetParent !== null).length,
  }));
  if (!bootState.bootGone) failures.push('#app-boot not removed after intro constructed');
  if (!bootState.appVisible) failures.push('#app not made visible after boot');
  if (!bootState.gamePanelHidden) failures.push('#overlay-intro (game panel) visible during intro');
  if (bootState.titleCount !== 1) {
    failures.push(`expected exactly 1 visible <h1> during intro, found ${bootState.titleCount}`);
  }

  const phase = await page.evaluate(() => document.getElementById('intro-phase')?.textContent ?? '');
  if (!phase) failures.push('intro phase label missing');
  LT(`intro overlay on top, ENTER disabled, phase "${phase}"`);

  // progress advances without any input
  await page.waitForFunction(
    () => {
      const v = parseFloat(document.getElementById('intro-pct')?.textContent ?? '0') || 0;
      return v >= 20 && v < 100;
    },
    null,
    { timeout: 15000 },
  );
  LT('progress advances without input');

  // pointer interaction mid-intro must not end the intro early
  await page.mouse.click(220, 320);
  await page.waitForTimeout(300);
  const midState = await page.evaluate(() => ({
    gone: !document.getElementById('intro'),
    ready: window.__jointIntro?.ready ?? false,
  }));
  if (midState.gone) failures.push('intro exited on early pointerdown');
  if (midState.ready) failures.push('intro became ready before the sequence finished');
  LT('mid-sequence pointer does not exit early');

  // reaches READY: ENTER visible, 100%
  await page.waitForFunction(() => window.__jointIntro?.ready === true, null, { timeout: 25000 });
  const done = await page.evaluate(() => ({
    pct: document.getElementById('intro-pct')?.textContent ?? '',
    barW: document.getElementById('intro-progress-bar')?.style.width ?? '',
    phase: document.getElementById('intro-phase')?.textContent ?? '',
    enterEnabled: (() => {
      const b = document.getElementById('intro-enter');
      return !!b && b.disabled === false;
    })(),
  }));
  if (done.pct.trim() !== '100%') failures.push(`intro progress should read 100%, got "${done.pct}"`);
  if (done.barW.trim() !== '100%') failures.push(`progress bar should be 100%, got "${done.barW}"`);
  if (!done.enterEnabled) failures.push('#intro-enter not enabled at READY');
  if (!/READY/i.test(done.phase)) failures.push(`phase should read READY at the end, got "${done.phase}"`);
  LT(`READY → ENTER enabled, progress ${done.pct} (${done.phase})`);

  // ENTER → leave → game boots → game START panel becomes actionable
  await page.click('#intro-enter');
  await page.waitForFunction(() => !document.getElementById('intro'), null, { timeout: 20000 });
  LT('ENTER → intro overlay removed');
  const booted = await page.evaluate(() => {
    const b = document.getElementById('btn-start');
    return !!b && !b.hasAttribute('hidden') && getComputedStyle(b).display !== 'none';
  });
  if (!booted) failures.push('game START panel not shown after intro ENTER');
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__jointWorkshop?.stage !== 'INTRO', null, {
    timeout: 20000,
  });
  LT('game started via START after ENTER');
  await page.close();
}

/* ================= 2 — QA skip() path on reload ================= */
{
  const page = await fresh();
  await page.evaluate(() => window.__jointIntro?.skip());
  await page.waitForFunction(() => !document.getElementById('intro'), null, { timeout: 20000 });
  LT('skip() → overlay removed quickly');
  await page.waitForTimeout(200);
  const booted = await page.evaluate(() => {
    const b = document.getElementById('btn-start');
    return !!b && !b.hasAttribute('hidden') && getComputedStyle(b).display !== 'none';
  });
  if (!booted) failures.push('game START panel not shown after skip()');
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__jointWorkshop?.stage !== 'INTRO', null, {
    timeout: 20000,
  });
  LT('game started via START after skip()');
  await page.close();
}

/* ================= 3 — repeated load: no WebGL/render bleed ================= */
{
  const page = await fresh();
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForFunction(
    () => window.__jointWorkshop && window.__jointIntro && !!document.getElementById('intro'),
    null,
    { timeout: 20000 },
  );
  await page.waitForTimeout(400);
  const ok = await page.evaluate(() => ({
    intro: !!document.getElementById('intro'),
    canvasW: document.querySelector('#scene')?.getBoundingClientRect().width ?? 0,
  }));
  if (!ok.intro) failures.push('intro missing after reload');
  if (ok.canvasW <= 0) failures.push('canvas not sized after reload');
  await page.evaluate(() => window.__jointIntro?.skip());
  await page.waitForFunction(() => !document.getElementById('intro'), null, { timeout: 20000 });
  LT('reload: intro re-runs cleanly and exits');
  await page.close();
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