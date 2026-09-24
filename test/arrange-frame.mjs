import { chromium } from 'playwright';
const URL = process.env.JW_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--use-gl=angle'] });
for (const viewport of [{ width: 1380, height: 860 }, { width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport });
  await page.goto(URL);
  await page.waitForFunction(() => window.__jointWorkshop, null, { timeout: 20000 });
  await page.evaluate(() => {
    const o = window.__jointWorkshop;
    o.go('PREPARE');
    o.go('CLEAN');
    o.go('BREAK');
    o.go('ARRANGE');
  });
  await page.waitForTimeout(3200);
  const read = await page.evaluate(() => {
    const o = window.__jointWorkshop;
    const C = (x, y, z) => o.screenFromWorld(x, y, z);
    const rect = document.querySelector('#scene').getBoundingClientRect();
    const targets = o.debugTargets();
    return {
      vw: rect.width, vh: rect.height,
      camPos: o.cameraRig.controls.object.position.toArray(),
      target: o.cameraRig.controls.target.toArray(),
      paper: C(0, 0.06, 0.1),
      trayNear: C(0, 0, 1.3),
      trayFar: C(0, 0, -1.1),
      filter: C(2.4, 0.1, 0.15),
      targetPts: targets.map((t) => ({ id: t.id, x: Math.round(t.x), y: Math.round(t.y), world: t.world })),
    };
  });
  console.log('='.repeat(8), viewport.width, '='.repeat(8));
  console.log('fw', JSON.stringify(read));
  await page.close();
}
await browser.close();