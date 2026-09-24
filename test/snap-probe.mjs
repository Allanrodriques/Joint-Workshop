import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--use-gl=angle'],
});
const page = await browser.newPage({ viewport: { width: 1380, height: 860 } });
page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CON', m.text().slice(0, 160));
});

await page.goto('http://127.0.0.1:4173/');
await page.waitForFunction(() => window.__jointWorkshop, null, { timeout: 20000 });
await page.click('#btn-start');
await page.waitForFunction(() => window.__jointWorkshop?.stage === 'PREPARE', null, { timeout: 20000 });
console.log('stage =', await page.evaluate(() => window.__jointWorkshop.stage));

async function snap() {
  return page.evaluate(() => {
    const g = window.__jointWorkshop;
    return {
      stage: g.stage,
      targets: g.debugTargets().map((t) => ({ id: t.id, x: Math.round(t.x), y: Math.round(t.y) })),
      anchors: {
        bud: g.debugAnchor('bud'),
        tray: g.debugAnchor('tray'),
      },
      progress: g.progress?.value ?? null,
      interacted: [...g.stats.interactions],
    };
  });
}

console.log('initial', JSON.stringify(await snap(), null, 1));

// pointerdown on the bud, move to tray, pointerup — via evaluate + dispatchEvent to be sure of PointerEvents
await page.evaluate(async () => {
  const g = window.__jointWorkshop;
  const bud = g.debugAnchor('bud');
  const tray = g.debugAnchor('tray');
  const fire = (type, x, y) => {
    document.querySelector('#scene').dispatchEvent(
      new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, buttons: type === 'pointerup' ? 0 : 1 }),
    );
  };
  fire('pointerdown', bud.x, bud.y);
  await new Promise((r) => setTimeout(r, 60));
  for (let i = 1; i <= 16; i++) {
    fire('pointermove', bud.x + ((tray.x - bud.x) * i) / 16, bud.y + ((tray.y - bud.y) * i) / 16);
    await new Promise((r) => setTimeout(r, 30));
  }
  fire('pointerup', tray.x, tray.y);
});
await page.waitForTimeout(700);
console.log('after drag', JSON.stringify(await snap(), null, 1));
await page.waitForTimeout(2500);
console.log('after wait', JSON.stringify(await snap(), null, 1));

await browser.close();