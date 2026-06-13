import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
// viewer: select mutalisk, show blue then red big preview side by side via two shots composited isn't needed; just blue
const vp = await b.newPage({ deviceScaleFactor:2, viewport:{width:760,height:420} });
await vp.goto('file://'+process.cwd()+'/sprites.html', { waitUntil:'load' });
await vp.waitForTimeout(700);
await vp.selectOption('#pick', { label: 'Mutalisk' });
await vp.waitForTimeout(300);
await vp.screenshot({ path:'proto/shots/muta-viewer-blue.png', clip:{x:300,y:60,width:300,height:300} });
await vp.evaluate(() => { document.querySelectorAll('.sw')[1].click(); });
await vp.waitForTimeout(300);
await vp.screenshot({ path:'proto/shots/muta-viewer-red.png', clip:{x:300,y:60,width:300,height:300} });
await b.close(); console.log('ok');
