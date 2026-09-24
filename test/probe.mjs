import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal','--enable-unsafe-swiftshader','--use-gl=angle'] });
const page = await browser.newPage({ viewport: { width: 1380, height: 860 } });
page.on('console', (m) => { if (m.type()==='error'||m.type()==='warn') console.log('CON', m.type(), m.text().slice(0,220)); });
page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0,260)));
await page.goto('http://127.0.0.1:4173/');
await page.waitForTimeout(3500);
const info = await page.evaluate(() => {
  const c = document.querySelector('#scene');
  return {
    w: !!window.__jointWorkshop,
    canvas: c ? { w: c.width, h: c.height, rw: c.getBoundingClientRect().width } : null,
    bodyText: document.body.innerText.replace(/\n/g, ' | ').slice(0, 140),
  };
});
console.log('INFO', JSON.stringify(info));
await page.screenshot({ path: '/tmp/jw-probe.png' });
await browser.close();
