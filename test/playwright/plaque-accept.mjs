import { chromium } from 'playwright';
import { skipIntro } from './helpers.mjs';

const URL = process.env.JW_URL ?? 'http://127.0.0.1:4173/';
const LT = (m) => process.stdout.write('· ' + m + '\n');
const errors = [];
const failures = [];

const args = ['--use-angle=metal', '--enable-unsafe-swiftshader', '--use-gl=angle'];
const browser = await chromium.launch({ headless: true, args });

function attach(page, tag) {
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/three/.test(m.text())) errors.push(`${tag} console: ${m.text()}`);
  });
}

async function booted(page) {
  await skipIntro(page);
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__jointWorkshop?.stage === 'PREPARE', null, {
    timeout: 20000,
  });
  await page.waitForTimeout(900);
}

/* ================= plaque is present, static, decorative ================= */
{
  const page = await browser.newPage({ viewport: { width: 1380, height: 860 } });
  attach(page, 'desktop');
  await page.goto(URL);
  await page.waitForFunction(() => window.__jointWorkshop && window.__jointIntro, null, { timeout: 20000 });
  await booted(page);

  const desc = await page.evaluate(() => {
    const w = window.__jointWorkshop.world;
    const pl = w.plaque;
    return {
      hasPlaque: !!pl,
      meshCount: pl.group.children.length,
      faceGlow: pl.faceMat.emissiveIntensity,
      position: { x: pl.group.position.x, z: pl.group.position.z },
      hasInteractable: pl.interactable !== undefined,
      linkedinTarget: window.__jointWorkshop.interaction.targetsLive.some((t) => t.id === 'creator-plaque'),
    };
  });
  if (!desc.hasPlaque) failures.push('creator plaque missing from the world');
  if (desc.meshCount === 0) failures.push('plaque has no visible mesh');
  if (!desc.position || desc.position.x !== 2.2) failures.push('plaque not at LAYOUT position');
  if (desc.faceGlow <= 0 || desc.faceGlow > 0.3) failures.push(`plaque glow off (${desc.faceGlow})`);
  if (desc.hasInteractable) failures.push('plaque should have no interaction group');
  if (desc.linkedinTarget) failures.push('creator-plaque interaction target should be gone');
  LT('static signature plaque present at back-right corner, glow on');

  // no popup / no link regardless of clicks
  let popups = 0;
  page.on('popup', () => popups++);

  const c = await page.evaluate(() => {
    const game = window.__jointWorkshop;
    const p = game.world.plaque.group.position.clone();
    p.y += 0.17;
    p.project(game.sceneMx.camera);
    return {
      x: Math.round((p.x * 0.5 + 0.5) * innerWidth),
      y: Math.round((-p.y * 0.5 + 0.5) * innerHeight),
    };
  });
  await page.mouse.click(c.x, c.y);
  await page.mouse.click(c.x + 40, c.y + 30);
  await page.waitForFunction(() => window.__jointWorkshop?.stage === 'PREPARE'); // still in game
  await page.waitForTimeout(600);
  if (popups > 0) failures.push(`plaque click opened ${popups} popup(s) — link should be removed`);

  const stillStatic = await page.evaluate(() => window.__jointWorkshop.world.plaque.group.position.y);
  if (stillStatic !== 0.014) failures.push('plaque should be static (no hover lift)');
  LT('clicks open nothing; plaque stays static');
  await page.close();
}

const pageErrors = errors.filter((e) => !/WebGL|GPU|gl/.test(e));
LT('console errors: ' + pageErrors.length + (pageErrors.length ? ' — ' + pageErrors.join(' | ') : ''));
if (pageErrors.length > 0) process.exitCode = 1;
if (failures.length) {
  console.log('\n== FAILURES ==\n' + failures.join('\n'));
  process.exitCode = 1;
}
await browser.close();
process.exit(0);