import { chromium, devices } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'] });
const page = await (await browser.newContext({ ...devices['iPhone 12'] })).newPage();
await page.goto('http://127.0.0.1:8099/', { waitUntil: 'load' });
await page.waitForFunction('!!window.__game');
await page.evaluate('window.__game.restart("spectate", 20260, 1)');
await page.waitForTimeout(150);
await page.evaluate('window.__game.fastForward(7600)'); // armies built + clashing
await page.waitForTimeout(200);
await page.evaluate(() => { const ONE=4096,g=window.__game,e=g.sim.fullState().e,m=new Map(),cell=110;
  for(let i=0;i<e.hi;i++){ if(e.alive[i]!==1||e.kind[i]!==6)continue; const x=e.x[i]/ONE,y=e.y[i]/ONE,k=((x/cell)|0)+','+((y/cell)|0),a=m.get(k)||[0,0,0]; a[0]+=x;a[1]+=y;a[2]++;m.set(k,a);}
  let b=null;for(const a of m.values())if(!b||a[2]>b[2])b=a; if(b){g.zoom=1.7;g.centerOn(b[0]/b[2],b[1]/b[2]);} });
await page.waitForTimeout(500);
await page.screenshot({ path: 'proto/shots/ng-marines.png' });
await browser.close(); console.log('ok');
