import { chromium } from 'playwright';
const URL = process.env.JW_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--use-gl=angle'] });
const page = await browser.newPage({ viewport: { width: 1380, height: 860 } });
await page.goto(URL);
await page.waitForFunction(() => window.__jointWorkshop, null, { timeout: 20000 });
await page.evaluate(() => window.__jointWorkshop.go('ARRANGE'));
await page.waitForTimeout(2500);
const info = await page.evaluate(() => {
  const sm = window.__jointWorkshop.sceneMx;
  const c = sm.camera;
  const dir = new THREE.Vector3();
  c.getWorldDirection(dir);
  const target = window.__jointWorkshop.cameraRig.controls.target;
  const exactTarget = new THREE.Vector3(0, 0.1, 0.1);
  const paperC = new THREE.Vector3(0, 0.06, 0.1);
  const pTarget = exactTarget.clone().project(c);
  const pPaper = paperC.clone().project(c);
  const rect = document.querySelector('#scene').getBoundingClientRect();
  const proj = (p) => ({ x: (p.x*0.5+0.5)*rect.width, y: (-p.y*0.5+0.5)*rect.height, z: p.z });
  return {
    quat: [c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w],
    dir: dir.toArray(),
    target: target.toArray(),
    pExactTarget: proj(pTarget),
    pPaperC: proj(pPaper),
    up: [c.up.x, c.up.y, c.up.z],
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();