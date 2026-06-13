import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'] });
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1500, height: 820 } });
await page.goto('http://127.0.0.1:8099/', { waitUntil: 'load' });
await page.waitForFunction('!!window.__game');
await page.waitForTimeout(500);
await page.evaluate('window.__game.gallery(1)');
await page.waitForTimeout(600);
await page.screenshot({ path: 'proto/shots/gallery.png' });
await browser.close(); console.log('ok');
