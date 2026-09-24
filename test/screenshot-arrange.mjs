import { chromium } from 'playwright';

const URL = process.env.JW_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--use-gl=angle'],
});

for (const viewport of [{ width: 1380, height: 860 }, { width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => console.log('PAGEERR:', viewport.width, e.message));
  await page.goto(URL);
  await page.waitForFunction(
    () => window.__jointWorkshop && document.querySelector('#scene')?.getBoundingClientRect().width > 0,
    null,
    { timeout: 20000 },
  );
  await page.evaluate(() => window.__jointWorkshop.go('ARRANGE'));
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `/tmp/arrange-${viewport.width}.png` });
  const targets = await page.evaluate(() => window.__jointWorkshop.debugTargets());
  console.log(`viewport ${viewport.width}: targets =`, JSON.stringify(targets));
  const anchor = await page.evaluate(() => ({
    paper: window.__jointWorkshop.debugAnchor('paper'),
    tray: window.__jointWorkshop.debugAnchor('tray'),
    filter: window.__jointWorkshop.debugAnchor('filter'),
  }));
  console.log('anchors =', JSON.stringify(anchor));
  await page.close();
}
await browser.close();