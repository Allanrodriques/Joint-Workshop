/**
 * Skips the cinematic intro deterministically. All existing stage tests
 * assume the game is interactive right after load; the intro now sits in
 * front until the user (or this helper) concludes it.
 */
export async function skipIntro(page) {
  await page.waitForFunction(
    () => window.__jointIntro !== undefined,
    null,
    { timeout: 20000 },
  );
  await page.evaluate(() => window.__jointIntro?.skip());
  // The leave transition dims to black, boots the game, then removes #intro.
  await page.waitForFunction(() => !document.getElementById('intro'), null, {
    timeout: 20000,
  });
  await page.waitForTimeout(150);
}

/** True once the full intro has finished and the overlay is gone. */
export async function introGone(page) {
  return page.evaluate(() => !document.getElementById('intro'));
}