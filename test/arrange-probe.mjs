import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--use-gl=angle'] });
const page = await browser.newPage({ viewport: { width: 1380, height: 860 } });
page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 120)));
await page.goto('http://127.0.0.1:4173/');
await page.waitForFunction(() => window.__jointWorkshop, null, { timeout: 20000 });
await page.evaluate(() => window.__jointWorkshop.go('ARRANGE'));
await page.waitForTimeout(800);
const off = () => page.evaluate(() => { const r = document.querySelector('#scene').getBoundingClientRect(); return { x: r.left, y: r.top }; });
console.log('targets', JSON.stringify(await page.evaluate(() => window.__jointWorkshop.debugTargets())));
const mat = await page.evaluate(() => window.__jointWorkshop.debugZones().find((z) => z.id === 'material'));
console.log('material zone px', JSON.stringify(mat));
const t0 = await page.evaluate(() => window.__jointWorkshop.debugTargets().find((x) => x.id.startsWith('piece:')));
console.log('rect', JSON.stringify(await page.evaluate(() => { const r = document.querySelector('#scene').getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height }; })));
console.log('css', JSON.stringify(await page.evaluate(() => { const c = document.querySelector('#scene'); return { cw: c.clientWidth, ch: c.clientHeight }; })));
const o = await off();
await page.mouse.move(o.x + t0.x, o.y + t0.y);
await page.mouse.down();
const pressed = await page.evaluate(() => window.__jointWorkshop.debugDrag());
console.log('pressed:', JSON.stringify(pressed));
const target = await page.evaluate(
  (p) => window.__jointWorkshop.debugZoneTarget('material', p.planeY, p.grabOffset),
  pressed,
);
console.log('debugZoneTarget material px', JSON.stringify(target));
if (target) {
  await page.mouse.move(o.x + target.x, o.y + target.y, { steps: 8 });
  console.log('after move:', JSON.stringify(await page.evaluate(() => window.__jointWorkshop.debugDrag())));
}
await page.mouse.up();
await page.waitForTimeout(500);
console.log('after up, track:', JSON.stringify(await page.evaluate(() => [...window.__jointWorkshop.stats.interactions])));
await browser.close();