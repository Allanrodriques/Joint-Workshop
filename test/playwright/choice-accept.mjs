import { chromium } from 'playwright';
import { skipIntro } from './helpers.mjs';

const URL = process.env.JW_URL ?? 'http://127.0.0.1:4173/';
const LT = (m) => process.stdout.write('· ' + m + '\n');
const errors = [];
const failures = [];

const args = ['--use-angle=metal', '--enable-unsafe-swiftshader', '--use-gl=angle'];
const browser = await chromium.launch({ headless: true, args });

function attach(page, tag) {
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/three/.test(m.text())) errors.push(`${tag} console: ${m.text()}`);
  });
}

async function boot(page) {
  await page.goto(URL);
  await page.waitForFunction(
    () => window.__jointWorkshop && window.__jointIntro,
    null,
    { timeout: 20000 },
  );
  await skipIntro(page);
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__jointWorkshop?.stage === 'PREPARE', null, { timeout: 20000 });
  await page.waitForTimeout(700);
}

const choicesNow = (page) => page.evaluate(() => window.__jointWorkshop.choices ?? null);
const pressed = (page, kind, value) =>
  page.evaluate(
    ([k, v]) => {
      const b = document.querySelector(`#choice-bar [data-kind="${k}"][data-value="${v}"]`);
      return b ? b.getAttribute('aria-pressed') === 'true' : false;
    },
    [kind, value],
  );
const barVisible = (page) =>
  page.evaluate(() => {
    const b = document.querySelector('#choice-bar');
    return !!b && !b.hasAttribute('hidden') && getComputedStyle(b).display !== 'none';
  });

async function assertBarState(page, tag, expected) {
  const c = await choicesNow(page);
  for (const [kind, val] of [
    ['strain', expected.strain],
    ['paper', expected.paper],
    ['amount', expected.amount],
  ]) {
    if (c?.[kind] !== val) failures.push(`${tag}: choices.${kind} should be "${val}", got "${c?.[kind]}"`);
    if (!(await pressed(page, kind, val))) failures.push(`${tag}: pill ${kind}/${val} not active`);
  }
  return c;
}

/* ================= DESKTOP ================= */
{
  const page = await browser.newPage({ viewport: { width: 1380, height: 860 } });
  attach(page, 'desktop');
  await boot(page);

  if (!(await barVisible(page))) failures.push('desktop: choice bar not visible at PREPARE');
  await assertBarState(page, 'desktop', { strain: 'green', paper: 'regular', amount: 'regular' });
  LT('desktop: bar visible with green/regular/regular defaults');

  // Selecting via the segmented pills must update state + highlight the pill.
  await page.click('#choice-bar [data-kind="paper"][data-value="king"]');
  await page.waitForFunction(() => window.__jointWorkshop?.choices.paper === 'king');
  await page.click('#choice-bar [data-kind="strain"][data-value="violet"]');
  await page.waitForFunction(() => window.__jointWorkshop?.choices.strain === 'violet');
  await page.click('#choice-bar [data-kind="amount"][data-value="generous"]');
  await page.waitForFunction(() => window.__jointWorkshop?.choices.amount === 'generous');
  await assertBarState(page, 'desktop', { strain: 'violet', paper: 'king', amount: 'generous' });

  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('joint-workshop.choices.v1') ?? 'null'));
  if (!stored || stored.paper !== 'king' || stored.strain !== 'violet' || stored.amount !== 'generous')
    failures.push('desktop: choices not persisted to localStorage');
  LT('desktop: pills update state + persist (violet / king / generous)');

  // World must react: strain recolors the bud, paper resizes the sheet + joint.
  const worldFx = await page.evaluate(() => {
    const w = window.__jointWorkshop.world;
    let stained = false;
    w.bud.group.traverse((n) => {
      if (stained || !n.isMesh || !n.material) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of mats) {
        if (m.isMeshStandardMaterial && m.color.getHexString() === '6a4a82') {
          stained = true;
          return;
        }
      }
    });
    return {
      stained,
      sheetWidth: w.paper.mesh.geometry.parameters.height,
      jointScaleX: w.joint.group.scale.x,
    };
  });
  if (!worldFx.stained) failures.push('desktop: bud not recolored to violet');
  if (Math.abs(worldFx.sheetWidth - 1.5) > 0.001) failures.push(`desktop: paper sheet not king size (${worldFx.sheetWidth})`);
  if (Math.abs(worldFx.jointScaleX - 2.7 / 2.4) > 0.01) failures.push(`desktop: joint not king-scaled (${worldFx.jointScaleX})`);
  LT('desktop: violet strain visible, king-size sheet + joint applied');

  // Generous fill → 5 pieces in ARRANGE (plus filter).
  await page.evaluate(() => window.__jointWorkshop.go('ARRANGE'));
  await page.waitForFunction(() => window.__jointWorkshop?.stage === 'ARRANGE');
  const arr = await page.evaluate(() => window.__jointWorkshop.debugArrangement());
  if (arr.totalPieces !== 5) failures.push(`desktop: generous ARRANGE should need 5 pieces, got ${arr.totalPieces}`);
  const targets = await page.evaluate(() => window.__jointWorkshop.debugTargets() ?? []);
  for (let i = 0; i < 5; i++) {
    if (!targets.some((t) => t.id === `piece:${i}` && t.enabled))
      failures.push(`desktop: piece:${i} not an enabled target with generous fill`);
  }
  LT('desktop: ARRANGE scaled to 5 material pieces');

  // Persistence survives a reload.
  await page.reload();
  await page.waitForFunction(
    () => window.__jointWorkshop && window.__jointIntro,
    null,
    { timeout: 20000 },
  );
  await skipIntro(page);
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__jointWorkshop?.stage === 'PREPARE', null, { timeout: 20000 });
  await assertBarState(page, 'reload', { strain: 'violet', paper: 'king', amount: 'generous' });
  LT('desktop: recipe persists across reload');
  await page.close();
}

/* ================= MOBILE (defaults intact, fresh context) ================= */
{
  const mp = await browser.newPage({
    viewport: { width: 390, height: 844, hasTouch: true, isMobile: true },
  });
  attach(mp, 'mobile');
  await boot(mp);

  if (!(await barVisible(mp))) failures.push('mobile: choice bar not visible at PREPARE');
  await assertBarState(mp, 'mobile', { strain: 'green', paper: 'regular', amount: 'regular' });

  // Default recipe still rolls a 4-piece arrangement (existing tests depend on it).
  await mp.evaluate(() => window.__jointWorkshop.go('ARRANGE'));
  await mp.waitForFunction(() => window.__jointWorkshop?.stage === 'ARRANGE');
  const arr = await mp.evaluate(() => window.__jointWorkshop.debugArrangement());
  if (arr.totalPieces !== 4) failures.push(`mobile: default ARRANGE should need 4 pieces, got ${arr.totalPieces}`);
  LT('mobile: defaults stay green/regular/regular → 4-piece ARRANGE');
  await mp.close();
}

const pageErrors = errors.filter((e) => !/WebGL|GPU|gl/.test(e));
LT('console errors: ' + pageErrors.length + (pageErrors.length ? ' — ' + pageErrors.join(' | ') : ''));
if (pageErrors.length > 0) process.exitCode = 1;
if (failures.length) {
  console.log('\n== FAILURES ==\n' + failures.join('\n'));
  process.exitCode = 1;
}
await browser.close();
process.exit(0);