import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'],
});
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1180, height: 1400 } });
const url = 'file://' + process.cwd() + '/sprites.html';
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(900); // let all thumbnails rasterize
await page.screenshot({ path: 'proto/shots/sprites-full.png', fullPage: true });
// pick the siege tank to show turret + a couple races in the big preview
await page.selectOption('#pick', { label: 'Siege Tank' });
await page.evaluate(() => { document.getElementById('rot').value = 50; document.getElementById('rot').dispatchEvent(new Event('input')); document.getElementById('trot').value = 0; document.getElementById('trot').dispatchEvent(new Event('input')); });
await page.waitForTimeout(300);
await page.screenshot({ path: 'proto/shots/sprites-tank.png', clip: { x: 0, y: 0, width: 1180, height: 360 } });
await browser.close();
console.log('ok');
