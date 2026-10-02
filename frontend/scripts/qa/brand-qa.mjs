import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

await mkdir('.qa/brand', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = [];
try {
  for (const width of [1440, 375]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, recordVideo: { dir: '.qa/brand/video', size: { width, height: 900 } } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.goto('http://127.0.0.1:4185/');
    await page.evaluate(() => { for (const animation of document.getAnimations()) animation.pause(); });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.querySelectorAll('.brand-gavel img')].map(image => image.decode()));
    });
    await page.locator('.arrival-screen[data-ready="true"]').waitFor();
    const font = await page.locator('.arrival-center .brand-lettering').evaluate(element => getComputedStyle(element).fontFamily);
    assert.match(font, /DynaPuff/);
    assert.equal(await page.evaluate(() => document.fonts.check('700 96px DynaPuff')), true);
    for (const [name, time] of [['rest', 0], ['lift', 450], ['strike', 720], ['bounce', 1000], ['settled', 1500]]) {
      await page.evaluate(time => {
        for (const animation of document.querySelector('.arrival-screen').getAnimations({ subtree: true })) {
          animation.pause();
          animation.currentTime = time;
        }
      }, time);
      const transforms = await page.locator('.arrival-screen').evaluate(element => ({
        hammer: getComputedStyle(element.querySelector('.gavel-mallet')).transform,
        letter: getComputedStyle(element.querySelector('.brand-glyph:last-child')).transform,
      }));
      if (name === 'strike') assert.equal(transforms.hammer, 'matrix(1, 0, 0, 1, 0, 0)');
      if (name === 'bounce') assert.notEqual(transforms.letter, 'matrix(1, 0, 0, 1, 0, 0)');
      await page.screenshot({ path: `.qa/brand/${name}-${width}.png` });
      if (name === 'settled') await page.locator('.arrival-center .brand-mark').screenshot({ path: `.qa/brand/logo-${width}.png` });
      report.push({ width, name, transforms });
    }
    await page.getByRole('button', { name: '건너뛰기', exact: true }).click();
    await page.clock.resume();
    await page.locator('#room-list-title').waitFor();
    await page.waitForFunction(() => [...document.querySelector('.wordmark').getAnimations({ subtree: true })].every(animation => animation.playState === 'finished'));
    await page.screenshot({ path: `.qa/brand/lobby-${width}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('link', { name: 'nackchal 홈' }).hover();
    await page.waitForFunction(() => document.querySelector('.wordmark').getAnimations({ subtree: true }).some(animation => animation.playState === 'running'));
    await page.waitForFunction(() => document.querySelector('.wordmark').getAnimations({ subtree: true }).every(animation => animation.playState === 'finished'));
    await page.getByRole('link', { name: 'nackchal 홈' }).focus();
    await page.waitForFunction(() => document.querySelector('.wordmark').getAnimations({ subtree: true }).some(animation => animation.playState === 'running'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.wordmark .gavel-mallet').evaluate(element => getComputedStyle(element).animationName), 'none');
    assert.equal(await page.locator('.wordmark .brand-glyph').first().evaluate(element => getComputedStyle(element).animationName), 'none');
    assert.deepEqual(errors, []);
    report.push({ width, hoverReplay: true, focusReplay: true, reducedMotion: true, errors });
    console.log('BRAND', width, errors);
    await context.close();
  }
  const slow = await browser.newPage();
  let releaseImages;
  const imagesAllowed = new Promise(resolve => { releaseImages = resolve; });
  await slow.route('**/art/brand/*.png', async route => { await imagesAllowed; await route.continue(); });
  await slow.goto('http://127.0.0.1:4185/', { waitUntil: 'domcontentloaded' });
  assert.equal(await slow.locator('.arrival-screen').getAttribute('data-ready'), 'false');
  await slow.getByRole('button', { name: '건너뛰기', exact: true }).click();
  await slow.locator('#room-list-title').waitFor();
  releaseImages();
  report.push({ pendingImageSkip: true });
  await slow.close();
} finally {
  await writeFile('.qa/brand/report.json', JSON.stringify(report, null, 2));
  await browser.close();
}
