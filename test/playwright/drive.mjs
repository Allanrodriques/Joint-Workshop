import { chromium } from 'playwright';
import { skipIntro } from './helpers.mjs';

const URL = process.env.JW_URL ?? 'http://127.0.0.1:4173/';
const LT = (m) => {
  process.stdout.write('· ' + m + '\n');
};
const errors = [];
const notes = [];

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--use-gl=angle'],
});
const page = await browser.newPage({ viewport: { width: 1380, height: 860 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/three/.test(m.text())) errors.push('console: ' + m.text());
});

await page.goto(URL);
await page.waitForFunction(
  () => window.__jointWorkshop && document.querySelector('#scene')?.getBoundingClientRect().width > 0,
  null,
  { timeout: 20000 },
);
LT('app loaded, canvas sized');
await skipIntro(page);

const axe = (script, ...args) =>
  page.evaluate(
    ([s, a]) => window.__jointWorkshop?.[s]?.(a),
    [script, ...args],
  );

const pxAnchor = (name) => page.evaluate((n) => window.__jointWorkshop?.debugAnchor(n), name);
const pxTargets = () => page.evaluate(() => window.__jointWorkshop?.debugTargets() ?? []);
const staging = () => page.evaluate(() => window.__jointWorkshop?.stage);

async function canvasOffset() {
  return page.evaluate(() => {
    const r = document.querySelector('#scene').getBoundingClientRect();
    return { x: r.left, y: r.top };
  });
}

async function waitFor(name, ms = 18000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await staging()) === name) return;
    await clickContinueIfVisible();
    await page.waitForTimeout(90);
  }
  throw new Error(`never reached ${name} (now ${await staging()})`);
}

async function clickContinueIfVisible() {
  const vis = await page.evaluate(() => {
    const b = document.querySelector('#hint-continue');
    return !!b && !b.hasAttribute('hidden') && getComputedStyle(b).display !== 'none';
  });
  if (vis) await page.click('#hint-continue');
}

async function clickAt(x, y) {
  const off = await canvasOffset();
  await page.mouse.click(off.x + x, off.y + y);
}

const speckCount = async () => {
  const n = await page.evaluate(
    () => [...window.__jointWorkshop.stats.interactions].filter((x) => x.startsWith('speck:')).length,
  );
  return n || 0;
};

async function dragFrom(from, to, steps = 14) {
  const off = await canvasOffset();
  await page.mouse.move(off.x + from.x, off.y + from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      off.x + from.x + ((to.x - from.x) * i) / steps,
      off.y + from.y + ((to.y - from.y) * i) / steps,
      { steps: 1 },
    );
  }
  await page.mouse.up();
}

/* -- intro -> start -------------------------------------------------- */
await page.click('#btn-start');
await waitFor('PREPARE');
LT('PREPARE');

/* -- PREPARE: drag bud onto tray -------------------------------------- */
const bud = await pxAnchor('bud');
const tray = await pxAnchor('tray');
LT(`PREPARE: bud@${bud?.x.toFixed(0)},${bud?.y.toFixed(0)} tray@${tray?.x.toFixed(0)},${tray?.y.toFixed(0)}`);
if (bud && tray) await dragFrom(bud, tray);
await waitFor('CLEAN', 22000);
notes.push('PREPARE→CLEAN');
LT('CLEAN');

/* -- CLEAN UP: drag each stem/seed debris into the discard bin --------- */
const pctNow = async () =>
  parseFloat(
    (await page.evaluate(() => document.querySelector('#hint-pct')?.getAttribute('data-pct'))) ?? '0',
  ) || 0;
const tryGrab = async (t) => {
  const off = await canvasOffset();
  for (let attempt = 0; attempt < 12; attempt++) {
    const sx = t.x + ((attempt * 17) % 21) - 10;
    const sy = t.y + ((attempt * 13) % 15) - 7;
    await page.mouse.move(off.x + sx, off.y + sy);
    await page.mouse.down();
    await page.mouse.move(off.x + sx + 3, off.y + sy, { steps: 2 });
    const st = await page.evaluate(() => window.__jointWorkshop.debugDrag());
    if (st?.activeTarget === t.id) return { x: sx, y: sy };
    await page.mouse.up();
  }
  return null;
};
for (let sweep = 0; sweep < 12 && (await staging()) === 'CLEAN'; sweep++) {
  const all = await pxTargets();
  for (const t of all) {
    if (!t.enabled || t.mode !== 'drag') continue;
    if ((await staging()) !== 'CLEAN') break;
    const grabbedPoint = await tryGrab(t);
    if (!grabbedPoint) continue;
    const grabState = await page.evaluate(() => window.__jointWorkshop.debugDrag());
    await page.mouse.up();
    const dest = await page.evaluate(
      (p) => window.__jointWorkshop.debugZoneTarget('discard', p.planeY, p.grabOffset),
      { planeY: grabState.planeY ?? t.planeY, grabOffset: grabState.grabOffset },
    );
    if (!dest) continue;
    await dragFrom(grabbedPoint, { x: dest.x, y: dest.y });
    await page.waitForTimeout(260);
    console.log('  CLEAN drag', t.id, 'pct now', (await pctNow()) + '%');
  }
}
console.log('  CLEAN final progress = ' + (await pctNow()) + '%');
await waitFor('BREAK', 22000);
notes.push('CLEAN→BREAK');
LT('BREAK');

/* -- BREAK: pop all 9 chunks; harvest chunk ids from stats ------- */
const chunkIds = new Set();
for (let sweep = 0; sweep < 10 && (await staging()) === 'BREAK'; sweep++) {
  const all = await pxTargets();
  for (const t of all) {
    if (!t.enabled || t.mode === 'drag') continue;
    if (chunkIds.has(t.id)) continue;
    const before = new Set([...chunkIds]);
    let grew = false;
    for (let attempt = 0; attempt < 5 && !grew; attempt++) {
      const jx = t.x + ((attempt * 13) % 11) - 5;
      const jy = t.y + ((attempt * 9) % 9) - 4;
      await clickAt(jx, jy);
      await page.waitForTimeout(260);
      const added = await page.evaluate(
        () => [...window.__jointWorkshop.stats.interactions].filter((x) => x.startsWith('chunk:')),
      );
      for (const c of added) chunkIds.add(c);
      grew = chunkIds.size > before.size;
    }
    for (const c of before) chunkIds.add(c);
    if ((await staging()) !== 'BREAK') break;
  }
}
console.log(' BREAK chunkIds=' + [...chunkIds].length);
await waitFor('ARRANGE', 24000);
notes.push('BREAK→ARRANGE');
LT('ARRANGE');
await page.waitForTimeout(1800); // let the ARRANGE camera transition settle

/* -- ARRANGE: place 5 pieces + filter; track via hint progress ---- */
const o0 = await canvasOffset();
const progressOf = async () =>
  parseFloat(
    (await page.evaluate(() => document.querySelector('#hint-pct')?.getAttribute('data-pct'))) ?? '0',
  ) || 0;
const zonePx = (planeY, grabOffset) =>
  page.evaluate(
    (p) => window.__jointWorkshop.debugZoneTarget('material', p.planeY, p.grabOffset),
    { planeY, grabOffset },
  );
for (let sweep = 0; sweep < 10 && (await staging()) === 'ARRANGE'; sweep++) {
  const all = await pxTargets();
  const pieceTargets = all.filter((t) => t.id.startsWith('piece:') && t.enabled);
  for (const t of pieceTargets) {
    if ((await staging()) !== 'ARRANGE') break;
    const trackedIds = new Set(
      await page.evaluate(() => [...window.__jointWorkshop.stats.interactions].filter((x) => x.startsWith('piece:'))),
    );
    if (trackedIds.has(t.id)) continue;
    let grabbedPoint = null;
    let grabState = null;
    for (let attempt = 0; attempt < 12 && !grabbedPoint; attempt++) {
      const sx = t.x + ((attempt * 17) % 25) - 12;
      const sy = t.y + ((attempt * 13) % 19) - 9;
      await page.mouse.move(o0.x + sx, o0.y + sy);
      await page.mouse.down();
      await page.mouse.move(o0.x + sx + 3, o0.y + sy, { steps: 2 });
      const nowTracked = new Set(
        await page.evaluate(() => [...window.__jointWorkshop.stats.interactions].filter((x) => x.startsWith('piece:'))),
      );
      for (const id of nowTracked) {
        if (!trackedIds.has(id)) {
          grabbedPoint = { x: sx, y: sy };
          break;
        }
      }
      if (!grabbedPoint) await page.mouse.up();
    }
    if (!grabbedPoint) continue;
    grabState = await page.evaluate(() => window.__jointWorkshop.debugDrag());
    const dest = await zonePx(grabState.planeY ?? t.planeY, grabState.grabOffset);
    if (!dest) {
      await page.mouse.up();
      console.log('  ARRANGE no material zone px for', t.id);
      continue;
    }
    await dragFrom(grabbedPoint, { x: dest.x, y: dest.y });
    await page.waitForTimeout(300);
    const afterDrop = await page.evaluate(
      () => [...window.__jointWorkshop.stats.interactions].filter((x) => x.startsWith('piece:') || x.startsWith('snap:')),
    );
    console.log('  ARRANGE dragged, track:', JSON.stringify(afterDrop), 'progress', (await progressOf()) + '%');
  }
  const fl = (await pxTargets()).find((t) => t.id === 'filter' && t.enabled);
  if (fl && !(await page.evaluate(() => window.__jointWorkshop.stats.interactions.has('filter')))) {
    let grabbedPoint = null;
    for (let attempt = 0; attempt < 12 && !grabbedPoint; attempt++) {
      const sx = fl.x + ((attempt * 17) % 25) - 12;
      const sy = fl.y + ((attempt * 13) % 19) - 9;
      await page.mouse.move(o0.x + sx, o0.y + sy);
      await page.mouse.down();
      await page.mouse.move(o0.x + sx + 3, o0.y + sy, { steps: 2 });
      if (await page.evaluate(() => window.__jointWorkshop.stats.interactions.has('filter'))) {
        grabbedPoint = { x: sx, y: sy };
      } else {
        await page.mouse.up();
      }
    }
    if (grabbedPoint) {
      const grabState = await page.evaluate(() => window.__jointWorkshop.debugDrag());
      const flZone = await page.evaluate(
        (p) => window.__jointWorkshop.debugZoneTarget('filter', p.planeY, p.grabOffset),
        { planeY: grabState.planeY ?? fl.planeY, grabOffset: grabState.grabOffset },
      );
      if (flZone) {
        await dragFrom(grabbedPoint, { x: flZone.x, y: flZone.y });
        await page.waitForTimeout(300);
      } else {
        await page.mouse.up();
      }
    }
  }
  console.log('  ARRANGE sweep end progress = ' + (await progressOf()) + '%');
}
await waitFor('ROLL', 26000);
notes.push('ARRANGE→ROLL');
LT('ROLL');

/* -- ROLL: repeat horizontal drag across the paper --------------------- */
for (let i = 0; i < 90 && (await staging()) === 'ROLL'; i++) {
  const ts = (await pxTargets()).filter((t) => t.enabled && t.mode !== 'click');
  if (!ts.length) break;
  const p = ts[0];
  await dragFrom({ x: p.x, y: p.y }, { x: p.x - 380, y: p.y + 40 });
  await page.waitForTimeout(90);
}
await waitFor('FINISHED', 26000);
notes.push('ROLL→FINISHED');
LT('FINISHED (rolled)');

/* -- FINISHED -> light -> SMOKE (indefinite hold-to-blow) ---------------- */
await page.click('#btn-light');
await waitFor('SMOKE', 20000);
LT('SMOKE (lit)');

const smokeStatus = () =>
  page.evaluate(() => document.querySelector('#smoke-status-label')?.textContent ?? '');
const smokeUiVisible = () =>
  page.evaluate(() => {
    const el = document.querySelector('#smoke-ui');
    return !!el && !el.hasAttribute('hidden') && getComputedStyle(el).display !== 'none';
  });

await page.waitForFunction(
  () => {
    const el = document.querySelector('#smoke-ui');
    return !!el && !el.hasAttribute('hidden') && getComputedStyle(el).display !== 'none';
  },
  null,
  { timeout: 8000 },
);
LT('SMOKE panel visible, status: ' + (await smokeStatus()));

// Hold + drag BLOW SMOKE a few times; smoke must never auto-exit.
for (let i = 0; i < 3; i++) {
  const box = await (await page.$('#btn-blow-hold')).boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 110, cy - 40, { steps: 6 });
  await page.waitForTimeout(500);
  await page.mouse.move(cx + 150, cy + 30, { steps: 6 });
  await page.waitForTimeout(650);
  await page.mouse.up();
  await page.waitForTimeout(450);
  LT('blow hold #' + (i + 1) + ' (status: ' + (await smokeStatus()) + ')');
}

// Still in SMOKE after ~4.8s of continuous interaction — no automatic exit.
if ((await staging()) !== 'SMOKE') throw new Error('SMOKE auto-ended: ' + (await staging()));
await page.waitForTimeout(2200);
if ((await staging()) !== 'SMOKE') throw new Error('SMOKE auto-ended after idle: ' + (await staging()));
if (!(await smokeUiVisible())) throw new Error('SMOKE panel disappeared');
LT('SMOKE stays indefinite after idle, status: ' + (await smokeStatus()));

// END SESSION is the only way out.
await page.click('#btn-end-session');
await waitFor('FINAL', 20000);
notes.push('→FINAL');
LT('FINAL (session complete panel)');
await page.screenshot({ path: '/tmp/joint-final.png' });

/* -- replay -> prepare -------------------------------------------------- */
await page.click('#btn-replay');
await waitFor('PREPARE', 18000);
notes.push('FINAL→PREPARE (replay)');
LT('replay → PREPARE');

/* -- free roam --------------------------------------------------------- */
await axe('go', 'FREE_ROAM');
await waitFor('FREE_ROAM', 12000);
LT('FREE_ROAM entered');
await page.evaluate(() => window.__jointWorkshop?.exitFreeRoam?.());
await waitFor('PREPARE', 12000);
LT('FREE_ROAM exited → PREPARE');

const pageErrors = errors.filter((e) => !/WebGL|GPU|gl/.test(e));
LT('console errors: ' + pageErrors.length + (pageErrors.length ? ' — ' + pageErrors.join(' | ') : ''));
if (pageErrors.length > 0) process.exitCode = 1;
console.log('\n== NOTES ==\n' + notes.join('\n'));
await browser.close();
process.exit(0);