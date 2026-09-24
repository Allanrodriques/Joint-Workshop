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

const staging = (page) => page.evaluate(() => window.__jointWorkshop?.stage);
const hintVisible = (page) =>
  page.evaluate(() => {
    const b = document.querySelector('#hint');
    return !!b && !b.hasAttribute('hidden') && getComputedStyle(b).display !== 'none';
  });
const pctText = (page) => page.evaluate(() => document.querySelector('#hint-pct')?.textContent ?? '');
const pctData = (page) =>
  page.evaluate(() => parseFloat(document.querySelector('#hint-pct')?.getAttribute('data-pct')) || 0);
const statusText = (page) => page.evaluate(() => document.querySelector('#hint-status')?.textContent ?? '');
const kickerText = (page) => page.evaluate(() => document.querySelector('#hint-kicker')?.textContent ?? '');
const hintText = (page) => page.evaluate(() => document.querySelector('#hint-text')?.textContent ?? '');
const metaHidden = (page) =>
  page.evaluate(() => {
    const m = document.querySelector('#hint-meta');
    return !m || m.hasAttribute('hidden') || getComputedStyle(m).display === 'none';
  });
const stepOf = (page, stage) =>
  page.evaluate((s) => {
    const el = document.querySelector(`.progress .step[data-stage="${s}"]`);
    return el ? [...el.classList] : [];
  }, stage);
const hintOK = (page) =>
  page.evaluate(() => {
    const r = document.querySelector('#hint').getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, width: r.width };
  });
const headerRect = (page) =>
  page.evaluate(() => {
    const r = document.querySelector('header.hud').getBoundingClientRect();
    return { height: r.height, width: r.width };
  });
const docOverflowX = (page) =>
  page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));

async function waitFor(page, name, ms = 18000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await staging(page)) === name) return;
    const vis = await page.evaluate(() => {
      const b = document.querySelector('#hint-continue');
      return !!b && !b.hasAttribute('hidden') && getComputedStyle(b).display !== 'none';
    });
    if (vis) await page.click('#hint-continue');
    await page.waitForTimeout(90);
  }
  throw new Error(`never reached ${name} (now ${await staging(page)})`);
}

const eq = async (page, script, ...args) =>
  page.evaluate(
    ([s, a]) => window.__jointWorkshop?.[s]?.(a),
    [script, ...args],
  );

/* ================= DESKTOP ================= */
const browser = await chromium.launch({ headless: true, args });
const page = await boot(browser, { width: 1380, height: 860 });
await skipIntro(page);
LT('desktop: loaded');

const hdr = await headerRect(page);
LT(`header height ${hdr.height.toFixed(0)}px`);
if (hdr.height < 44 || hdr.height > 78) failures.push(`header height ${hdr.height} outside game-bar range`);

// PREPARE: compact objective HUD drives real state
await page.click('#btn-start');
await waitFor(page, 'PREPARE');
if (!(await hintVisible(page))) failures.push('hint hidden during PREPARE');
const k = await kickerText(page);
if (!/^01\s*·\s*PREPARE/i.test(k)) failures.push(`kicker "01 · PREPARE" expected, got "${k}"`);
const pct = await pctText(page);
if (pct.trim() !== '0 / 1') failures.push(`PREPARE progress should read "0 / 1", got "${pct}"`);
if ((await pctData(page)) !== 0) failures.push('PREPARE data-pct should be 0');
if ((await statusText(page)) !== 'READY') failures.push('PREPARE status should be READY');

// top-nav timeline: active 01, rest locked, none done at the very start
const cls01 = await stepOf(page, 'PREPARE');
const clsSmoke = await stepOf(page, 'SMOKE');
if (!cls01.includes('active')) failures.push('step PREPARE should be active');
if (!clsSmoke.includes('locked')) failures.push('step SMOKE should be locked at start');

// collapse / expand
await page.click('#hint-toggle');
const collapsed = await page.evaluate(() => document.querySelector('#hint').classList.contains('collapsed'));
if (!collapsed) failures.push('collapse toggle did not collapse the objective HUD');
const bodyHidden = await page.evaluate(() => {
  const b = document.querySelector('#hint .hint-body');
  return !b || getComputedStyle(b).display === 'none';
});
if (!bodyHidden) failures.push('collapsed objective HUD should hide its body');
await page.click('#hint-toggle');
if (await page.evaluate(() => document.querySelector('#hint').classList.contains('collapsed')))
  failures.push('expand toggle did not restore the objective HUD');
LT('objective HUD collapse/expand ok');

// objective panel sits top-left under the bar, within the viewport
const hp = await hintOK(page);
if (hp.top < hdr.height) failures.push('objective HUD overlaps the top bar');
if (hp.left < 0 || hp.right > 1380 || hp.top < 0) failures.push('objective HUD outside viewport');
LT('objective HUD anchored top-left');

// CLEAN: 5 debris
await eq(page, 'go', 'CLEAN');
await waitFor(page, 'CLEAN');
const pctClean = await pctText(page);
if (pctClean.trim() !== '0 / 5') failures.push(`CLEAN progress should read "0 / 5", got "${pctClean}"`);

// BREAK: 9 chunks
await eq(page, 'go', 'BREAK');
await waitFor(page, 'BREAK');
const pctBreak = await pctText(page);
if (pctBreak.trim() !== '0 / 9') failures.push(`BREAK progress should read "0 / 9", got "${pctBreak}"`);
if (!(await stepOf(page, 'PREPARE')).includes('done')) failures.push('PREPARE step should be done after CLEAN/BREAK');

// ROLL: counter 0..100 while dragging
await eq(page, 'go', 'ROLL');
await waitFor(page, 'ROLL');
if ((await pctText(page)).trim() !== '0 / 100') failures.push(`ROLL start should read "0 / 100", got "${await pctText(page)}"`);
// drag across the paper target to push progress
const off = await page.evaluate(() => {
  const r = document.querySelector('#scene').getBoundingClientRect();
  return { x: r.left, y: r.top };
});
const t = await page.evaluate(
  () => (window.__jointWorkshop.debugTargets() ?? []).find((x) => x.enabled && x.id === 'paper'),
);
if (t) {
  await page.mouse.move(off.x + t.x, off.y + t.y);
  await page.mouse.down();
  await page.mouse.move(off.x + t.x - 500, off.y + t.y + 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  const rollPct = await pctData(page);
  if (rollPct <= 0) failures.push(`ROLL never progressed (data-pct ${rollPct})`);
  const st = await statusText(page);
  if (st !== 'IN PROGRESS' && st !== 'COMPLETE')
    failures.push(`ROLL status should be IN PROGRESS/COMPLETE, got "${st}"`);
  LT(`ROLL drag → ${rollPct}% (${st})`);
} else {
  failures.push('no paper target for ROLL');
}

// SMOKE: objective stays, meta hidden (no fake progress), smoke chip live
await waitFor(page, 'FINISHED', 12000);
await page.click('#btn-light');
await waitFor(page, 'SMOKE');
if (!(await hintVisible(page))) failures.push('hint hidden during SMOKE');
if (!(await metaHidden(page))) failures.push('SMOKE should hide the numeric progress (no fake units)');
if (!(await hintText(page)).length) failures.push('SMOKE objective text missing');
const smokeChip = await page.evaluate(() => document.querySelector('#smoke-status-label')?.textContent ?? '');
if (!/RISING|BLOWING/.test(smokeChip)) failures.push(`smoke chip missing, got "${smokeChip}"`);
LT('SMOKE objective (no fake progress) + live chip ok');
await eq(page, 'go', 'FINAL');
await waitFor(page, 'FINAL', 10000);

// ARRANGE completion: 5 / 5 + COMPLETE pill + .complete kicker
await page.click('#btn-replay');
await waitFor(page, 'PREPARE');
await eq(page, 'go', 'ARRANGE');
await waitFor(page, 'ARRANGE');
const browse = await page.evaluate(() => {
  const r = document.querySelector('#scene').getBoundingClientRect();
  return { x: r.left, y: r.top };
});
async function tryGrab(pg) {
  const arr = await pg.evaluate(() => window.__jointWorkshop?.debugArrangement?.() ?? null);
  const excluded = new Set(arr?.placedIds ?? []);
  const targets = await pg.evaluate(() => window.__jointWorkshop?.debugTargets() ?? []);
  const t = targets.find((x) => x?.id?.startsWith('piece:') && x.enabled && !excluded.has(x.id));
  if (!t) return false;
  for (let attempt = 0; attempt < 18; attempt++) {
    const sx = t.x + ((attempt * 17) % 25) - 12;
    const sy = t.y + ((attempt * 13) % 19) - 9;
    await pg.mouse.move(browse.x + sx, browse.y + sy);
    await pg.mouse.down();
    await pg.mouse.move(browse.x + sx + 3, browse.y + sy, { steps: 2 });
    const state = await pg.evaluate(() => window.__jointWorkshop.debugDrag());
    if (state?.activeTarget === t.id) return { x: sx, y: sy };
    await pg.mouse.up();
  }
  return false;
}
async function dragFrom(pg, from, to, steps = 14) {
  await pg.mouse.move(browse.x + from.x, browse.y + from.y);
  await pg.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await pg.mouse.move(
      browse.x + from.x + ((to.x - from.x) * i) / steps,
      browse.y + from.y + ((to.y - from.y) * i) / steps,
      { steps: 1 },
    );
  }
  await pg.mouse.up();
}
// place 4 pieces
for (let i = 0; i < 6; i++) {
  const st = await page.evaluate(() => (window.__jointWorkshop?.debugArrangement?.() ?? null));
  if (st?.completed || st?.piecesPlaced >= 4) break;
  const g = await tryGrab(page);
  if (!g) {
    await page.waitForTimeout(200);
    continue;
  }
  const grabState = await page.evaluate(() => window.__jointWorkshop.debugDrag());
  const dest = grabState
    ? await page.evaluate(
        (p) => window.__jointWorkshop.debugZoneTarget('material', p.planeY, p.grabOffset),
        { planeY: grabState.planeY, grabOffset: grabState.grabOffset },
      )
    : null;
  if (grabState && dest) {
    await dragFrom(page, g, { x: dest.x, y: dest.y });
    await page.waitForTimeout(320);
  }
}
// place filter (only if it's the remaining step)
{
  let placedFilter = false;
  for (let attempt = 0; attempt < 18 && !placedFilter; attempt++) {
    const st = await page.evaluate(() => (window.__jointWorkshop?.debugArrangement?.() ?? null));
    if (st?.completed) break;
    if (st?.filterPlaced) { placedFilter = true; break; }
    const fl = (await page.evaluate(() => window.__jointWorkshop?.debugTargets() ?? [])).find((x) => x.id === 'filter' && x.enabled);
    if (!fl) break;
    const sx = fl.x + ((attempt * 17) % 25) - 12;
    const sy = fl.y + ((attempt * 13) % 19) - 9;
    await page.mouse.move(browse.x + sx, browse.y + sy);
    await page.mouse.down();
    await page.mouse.move(browse.x + sx + 3, browse.y + sy, { steps: 2 });
    const state = await page.evaluate(() => window.__jointWorkshop.debugDrag());
    if (state?.activeTarget === 'filter') {
      const dest = await page.evaluate(
        (p) => window.__jointWorkshop.debugZoneTarget('filter', p.planeY, p.grabOffset),
        { planeY: state.planeY, grabOffset: state.grabOffset },
      );
      if (dest) {
        await dragFrom(page, { x: sx, y: sy }, { x: dest.x, y: dest.y });
        await page.waitForTimeout(320);
        placedFilter = true;
      } else {
        await page.mouse.up();
      }
    } else {
      await page.mouse.up();
    }
  }
}
const stFinal = await page.evaluate(() => window.__jointWorkshop?.debugArrangement?.() ?? null);
if (!stFinal?.completed) {
  failures.push(`ARRANGE did not complete (${JSON.stringify(stFinal)})`);
} else {
  if ((await pctText(page)).trim() !== '5 / 5') failures.push(`ARRANGE complete should read "5 / 5", got "${await pctText(page)}"`);
  if ((await pctData(page)) !== 100) failures.push('ARRANGE complete data-pct should be 100');
  if ((await statusText(page)) !== 'COMPLETE') failures.push(`ARRANGE status should be COMPLETE, got "${await statusText(page)}"`);
  const isCompleteCls = await page.evaluate(() => document.querySelector('#hint').classList.contains('complete'));
  if (!isCompleteCls) failures.push('.hint should get .complete class');
  LT(`ARRANGE → "5 / 5" COMPLETE (${await kickerText(page)})`);
}

/* ================= MOBILE 320 ================= */
{
  const mp = await boot(browser, { width: 320, height: 568, hasTouch: true, isMobile: true });
  await skipIntro(mp);
  await mp.click('#btn-start');
  await waitFor(mp, 'PREPARE');
  const overflow = await docOverflowX(mp);
  if (overflow.scrollW > overflow.clientW + 1)
    failures.push(`horizontal overflow on 320px (scroll ${overflow.scrollW} > client ${overflow.clientW})`);
  const hpH = await hintOK(mp);
  if (hpH.left < 0 || hpH.right > 322) failures.push(`objective HUD outside 320px viewport (${hpH.left}..${hpH.right})`);
  const hd = await headerRect(mp);
  const ic = await mp.evaluate(() => {
    const el = document.querySelector('#btn-settings');
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  if (ic.w < 44 || ic.h < 44) failures.push(`top-bar touch target too small (${ic.w}x${ic.h})`);
  await mp.click('#hint-toggle');
  const overflow2 = await docOverflowX(mp);
  if (overflow2.scrollW > overflow2.clientW + 1)
    failures.push(`horizontal overflow after collapsing on 320px`);
  LT(`320x568: no overflow (header ${hd.height.toFixed(0)}px, targets ${ic.w}x${ic.h})`);
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