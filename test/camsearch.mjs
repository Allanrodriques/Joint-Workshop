import { chromium } from 'playwright';
const URL = process.env.JW_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--use-gl=angle'] });

async function measure(page, pos, target) {
  return page.evaluate(([p, t]) => {
    const rig = window.__jointWorkshop.cameraRig;
    rig.setImmediate({ x: p[0], y: p[1], z: p[2] }, { x: t[0], y: t[1], z: t[2] });
    const rect = document.querySelector('#scene').getBoundingClientRect();
    const C = (x, y, z) => window.__jointWorkshop.screenFromWorld(x, y, z);
    const pts = {
      trayTL: C(-1.9, 0, -1.2), trayTR: C(1.9, 0, -1.2),
      trayBL: C(-1.9, 0, 1.4), trayBR: C(1.9, 0, 1.4),
      paperFar: C(-1.25, 0.06, -0.55), paperNear: C(1.25, 0.06, 0.75),
      filter: C(2.4, 0.1, 0.15),
    };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const k of Object.keys(pts)) {
      const q = pts[k];
      if (!q) return null;
      minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
      minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
    }
    return { pts, bbox: { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY }, vw: rect.width, vh: rect.height };
  }, [pos, target]);
}

const candidates = [
  { pos: [0, 3.5, 3.05], target: [0, 0.1, 0.1] },
  { pos: [0, 3.7, 3.25], target: [0, 0.1, 0.1] },
  { pos: [-0.15, 3.6, 3.2], target: [0, 0.1, 0.1] },
  { pos: [0, 3.9, 3.5], target: [0, 0.08, 0.1] },
  { pos: [-0.25, 3.7, 3.3], target: [0, 0.1, 0.12] },
];

for (const vp of [{ width: 1380, height: 860 }, { width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport: vp });
  await page.goto(URL);
  await page.waitForFunction(() => window.__jointWorkshop, null, { timeout: 20000 });
  await page.evaluate(() => { window.__jointWorkshop.go('PREPARE'); });
  await page.waitForTimeout(400);
  for (const c of candidates) {
    const r = await measure(page, c.pos, c.target);
    if (!r) { console.log(vp.width, JSON.stringify(c.pos), 'null'); continue; }
    const marginX = Math.min(r.pts.trayTL.x, r.pts.trayBL.x, r.pts.paperFar.x);
    const fits = r.bbox.minX >= -10 && r.bbox.maxX <= r.vw + 10 && r.bbox.minY >= -10 && r.bbox.maxY <= r.vh + 10;
    const filterIn = r.pts.filter && r.pts.filter.x >= -10 && r.pts.filter.x <= r.vw + 10 && r.pts.filter.y >= -10 && r.pts.filter.y <= r.vh + 10;
    console.log(
      vp.width, JSON.stringify(c.pos), 'bbox', JSON.stringify(r.bbox),
      'trayW%', ((r.bbox.w / r.vw) * 100).toFixed(0), 'trayH%', ((r.bbox.h / r.vh) * 100).toFixed(0),
      'filterIn', filterIn, 'fits', fits,
    );
  }
  await page.close();
}
await browser.close();