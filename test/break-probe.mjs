import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--use-gl=angle'] });
const page = await browser.newPage({ viewport: { width: 1380, height: 860 } });
page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 120)));
await page.goto('http://127.0.0.1:4173/');
await page.waitForFunction(() => window.__jointWorkshop, null, { timeout: 20000 });
const off = () => page.evaluate(() => { const r = document.querySelector('#scene').getBoundingClientRect(); return { x: r.left, y: r.top }; });
const chunkIds = () => page.evaluate(() => [...window.__jointWorkshop.stats.interactions].filter((x) => x.startsWith('chunk:')));

// start to break quickly via synthesized interactions? No — real flow.
async function drivePrev() {
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__jointWorkshop?.stage === 'PREPARE', null, { timeout: 20000 });
  const o = await off();
  const bud = await page.evaluate(() => window.__jointWorkshop.debugAnchor('bud'));
  const tray = await page.evaluate(() => window.__jointWorkshop.debugAnchor('tray'));
  await page.mouse.move(o.x + bud.x, o.y + bud.y);
  await page.mouse.down();
  for (let i = 1; i <= 18; i++) await page.mouse.move(o.x + bud.x + (tray.x - bud.x) * i / 18, o.y + bud.y + (tray.y - bud.y) * i / 18, { steps: 1 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('#hint-continue').click());
  await page.waitForFunction(() => window.__jointWorkshop?.stage === 'CLEAN', null, { timeout: 15000 });
  for (let i = 0; i < 80 && await page.evaluate(() => window.__jointWorkshop?.stage) === 'CLEAN'; i++) {
    const t = await page.evaluate(() => window.__jointWorkshop.debugTargets().find((x) => x.enabled && x.mode !== 'drag'));
    if (!t) break;
    const c = await off();
    await page.mouse.click(c.x + t.x, c.y + t.y);
    await page.waitForTimeout(140);
  }
  await page.waitForFunction(() => window.__jointWorkshop?.stage === 'BREAK', null, { timeout: 15000 });
  console.log('== in BREAK ==');
}
await drivePrev();

const o = await off();
const t0 = await page.evaluate(() => window.__jointWorkshop.debugTargets());
console.log('BREAK targets sample:', JSON.stringify(t0.slice(0, 4)));
for (let i = 0; i < 25; i++) {
  const before = new Set(await chunkIds());
  const anchor = await page.evaluate(() => window.__jointWorkshop.debugAnchor('bud'));
  const cx = o.x + anchor.x, cy = o.y + anchor.y;
  const spread = [0, 12, -12, 20, -20, 30, -30, 40, -40];
  const dx = spread[i % spread.length];
  const dy = spread[(i * 7) % spread.length];
  await page.mouse.click(cx + dx, cy + dy);
  await page.waitForTimeout(400);
  const after = await chunkIds();
  const added = after.filter((x) => !before.has(x));
  const st = await page.evaluate(() => window.__jointWorkshop?.stage);
  console.log('click', i, 'off=(' + dx, dy + ')', 'chunks=' + after.length, 'added=' + JSON.stringify(added), 'stage=' + st);
  if (st !== 'BREAK') break;
}
console.log('FINAL chunks:', JSON.stringify(await chunkIds()));
await browser.close();