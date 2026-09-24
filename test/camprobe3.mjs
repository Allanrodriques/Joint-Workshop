import { chromium } from 'playwright';
const URL = process.env.JW_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--use-gl=angle'] });
for (const viewport of [{ width: 1380, height: 860 }, { width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport });
  await page.goto(URL);
  await page.waitForFunction(() => window.__jointWorkshop, null, { timeout: 20000 });
  const marks = await page.evaluate(() => {
    const o = window.__jointWorkshop;
    o.go('PREPARE');
    o.go('CLEAN');
    o.go('BREAK');
    o.go('ARRANGE');
    return null;
  });
  await page.waitForTimeout(2600);
  const read = () => page.evaluate(() => {
    const rect = document.querySelector('#scene').getBoundingClientRect();
    const C = (x, y, z) => window.__jointWorkshop.screenFromWorld(x, y, z);
    const target = window.__jointWorkshop.cameraRig.controls.target;
    const cam = window.__jointWorkshop.sceneMx.camera;
    return {
      paperC: C(0, 0.06, 0.1),
      paperFar: C(-1.25, 0.06, -0.55),
      paperNear: C(1.25, 0.06, 0.75),
      trayBR: C(1.9, 0, 1.4),
      trayTR: C(1.9, 0, -1.2),
      trayTL: C(-1.9, 0, -1.2),
      trayBL: C(-1.9, 0, 1.4),
      filterStart: C(2.4, 0.1, 0.15),
      vw: rect.width,
      vh: rect.height,
      camPos: [cam.position.x, cam.position.y, cam.position.z],
      target: target.toArray(),
    };
  });
  console.log(viewport.width, JSON.stringify(await read()));
  await page.close();
}
await browser.close();