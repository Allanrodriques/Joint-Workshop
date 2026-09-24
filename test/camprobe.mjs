import { chromium } from 'playwright';
const URL = process.env.JW_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--use-gl=angle'] });
for (const viewport of [{ width: 1380, height: 860 }, { width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport });
  await page.goto(URL);
  await page.waitForFunction(() => window.__jointWorkshop, null, { timeout: 20000 });
  await page.evaluate(() => window.__jointWorkshop.go('ARRANGE'));
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const sm = window.__jointWorkshop.sceneMx;
    const c = sm.camera;
    const rig = window.__jointWorkshop.cameraRig;
    const rect = document.querySelector('#scene').getBoundingClientRect();
    const pts = [];
    for (const [x, y, z] of [[-1.9, 0, -1.2],[1.9,0,-1.2],[1.9,0,1.4],[-1.9,0,1.4],[0,0,0.1],[-0.95,0,-0.42]]) {
      window.__jointWorkshop.screenFromWorld(x,y,z);
    }
    return { camPos: [c.position.x, c.position.y, c.position.z], camTarget: rig.controls.target.toArray(), fov: c.fov, aspect: c.aspect, w: rect.width, h: rect.height };
  });
  console.log(viewport.width, 'camInfo', JSON.stringify(info));
  const corners = await page.evaluate(() => {
    const rect = document.querySelector('#scene').getBoundingClientRect();
    const out = {};
    for (const [k, x, z] of [['trayNR',-1.9,-1.2],['trayNL',1.9,-1.2],['trayFR',1.9,1.4],['trayFL',-1.9,1.4],['paperC',0,0.1],['filterSnap',-0.95,-0.42]]) {
      const p = window.__jointWorkshop.screenFromWorld(x, 0, z);
      out[k] = p;
    }
    return out;
  });
  console.log(viewport.width, 'corners', JSON.stringify(corners));
  await page.close();
}
await browser.close();