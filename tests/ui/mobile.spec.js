import {test,expect} from '@playwright/test';
test('mobile initial no requests, error handling and controls',async({page})=>{
 let requests=0;
 await page.route('https://api.bybit.com/**',async route=>{requests++;await route.fulfill({status:403,headers:{'access-control-allow-origin':'*'},body:'blocked'});});
 await page.goto('/');await expect(page.getByRole('button',{name:'검색 시작'})).toBeEnabled();expect(requests).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.selectOption('#direction','LONG');await page.click('#start');
 await expect(page.locator('#status')).toContainText('HTTP 403');await expect(page.locator('#results')).toContainText('결과 0건으로 확정할 수 없습니다');
 await expect(page.locator('#start')).toBeEnabled();expect(requests).toBe(2);
 await page.screenshot({path:'/tmp/obv-mobile.png',fullPage:true});
});
test('cancel active request',async({page})=>{
 await page.route('https://api.bybit.com/**',()=>{});await page.goto('/');await page.click('#start');await page.click('#cancel');await expect(page.locator('#status')).toContainText('사용자가 검색을 취소');await expect(page.locator('#start')).toBeEnabled();
});
async function routeCandles(page, { beforeOther, longGap } = {}) {
 const interval = 900000;
 const rows = Array.from({length: 501}, (_, i) => [i * interval, 10, 12, 8, 10, 10, 100].map(String));
 for (const [i, low, close, volume] of [[longGap ? 414 : 478, 6, 7, 100], [485, 8, 8, 10], [486, 5, 9, 100], [494, 4, 11, 100], [500, 1, 2, 9999]]) {
  rows[i] = [i * interval, 10, 12, low, close, volume, 100].map(String);
 }
 rows.reverse();
 const symbols = beforeOther ? ['BTCUSDT', 'ETHUSDT'] : ['BTCUSDT'];
 await page.route('https://api.bybit.com/**', async route => {
  const url = new URL(route.request().url());
  let result;
  if (url.pathname.endsWith('/time')) result = {timeSecond: String(500 * interval / 1000)};
  else if (url.pathname.endsWith('/instruments-info')) result = {list: symbols.map(symbol => ({symbol, quoteCoin: 'USDT', settleCoin: 'USDT', contractType: 'LinearPerpetual', status: 'Trading'}))};
  else if (url.pathname.endsWith('/tickers')) result = {list: symbols.map(symbol => ({symbol, turnover24h: symbol === 'BTCUSDT' ? '20000000' : '30000000', lastPrice: '10'}))};
  else {
   if (url.searchParams.get('symbol') === 'ETHUSDT') await beforeOther;
   result = {list: rows};
  }
  await route.fulfill({headers: {'access-control-allow-origin': '*'}, json: {retCode: 0, result}});
 });
}

test('mobile card uses confirmed scanner data and preserves earlier signal through progress', async ({page}) => {
 let releaseOther;
 const beforeOther = new Promise(resolve => { releaseOther = resolve; });
 await routeCandles(page, {beforeOther});
 await page.setViewportSize({width: 320, height: 740});
 await page.goto('/');
 await page.click('#start');
 const card = page.locator('.card').filter({has: page.getByRole('heading', {name: 'BTCUSDT'})});
 const chart = card.getByRole('img');
 const select = card.getByLabel('확정 신호');
 try {
  await expect(chart).toBeVisible();
  await expect(card.locator('.card-title')).toHaveAttribute('target', '_blank');
  await expect(select).toHaveValue('0');
  for (const [name, values] of [['가격 · 15분', [5, 4]], ['OBV', [0, 110]], ['CO', [-10.472159110152106, 22.6492430315534]]]) {
   const panel = chart.locator(`[data-panel="${name}"]`);
   await expect(panel.locator('.plot-divergence')).toHaveCount(1);
   const positions = await panel.locator('.plot-pivot').evaluateAll(points => points.map(p => [Number(p.dataset.value), p.getAttribute('cx'), p.getAttribute('cy')]));
   expect(positions.map(([value]) => value)).toEqual(values);
   const line = panel.locator('.plot-divergence');
   await expect(line).toHaveAttribute('x1', positions[0][1]);
   await expect(line).toHaveAttribute('y1', positions[0][2]);
   await expect(line).toHaveAttribute('x2', positions[1][1]);
   await expect(line).toHaveAttribute('y2', positions[1][2]);
   await expect(panel.locator('.plot-confirm')).toHaveAttribute('d', /^M252 /);
  }
  await expect(chart.locator('.plot-candle')).toHaveCount(50);
  await expect(chart.locator('[data-panel="가격 · 15분"] .plot-ema')).toBeVisible();
  await expect(card.locator(".ema-label")).toContainText("EMA 80 · 15분");
  expect((await chart.locator('.plot-ema').getAttribute('points')).split(' ')).toHaveLength(50);
  await expect(chart.locator('text').filter({hasText: /^KST$/})).toBeVisible();
  await expect(card.locator('figcaption')).toContainText('14:00:00 KST');
  await expect(chart.locator('.plot-divergence').first()).toHaveCSS('stroke', 'rgb(100, 223, 174)');
  await select.selectOption('1');
  await select.focus();
  await expect(card.locator('figcaption')).toContainText('12:00:00 KST');
  await expect(chart.locator('[data-panel="가격 · 15분"] .plot-pivot').first()).toHaveAttribute('data-value', '6');
  await expect(chart.locator('.plot-confirm').first()).toHaveAttribute('d', "M212.96 22V114");
  await chart.evaluate(node => { node.dataset.preserved = 'yes'; });
  await expect(page.locator('#status')).toContainText(/경과 시간[1-9][0-9]*\.[0-9]초/);
  await expect(chart).toHaveAttribute('data-preserved', 'yes');
 } finally {
  releaseOther();
 }
 await expect(page.locator('#status')).toContainText('검색 완료');
 await expect(page.locator('#status')).toContainText('API 요청 5회');
 await expect(page.locator('.card').first()).toContainText('ETHUSDT');
 await expect(select).toHaveValue('1');
 await expect(select).toBeFocused();
 await expect(chart).toHaveAttribute('data-preserved', 'yes');
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await chart.screenshot({path: '/tmp/obv-mobile-chart.png'});
});

test('production assets load and refresh under GitHub Pages subpath',async({page})=>{
 const {createServer}=await import('node:http');const {readFile}=await import('node:fs/promises');
 const server=createServer(async(req,res)=>{
  try{const path=req.url.replace(/^\/Obv_Co_Divergence\//,'');if(path===req.url){res.writeHead(404).end();return;}const file=path||'index.html';const data=await readFile(`dist/${file}`);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(data);}catch{res.writeHead(404).end();}
 });await new Promise(resolve=>server.listen(4180,'127.0.0.1',resolve));
 try{
  await routeCandles(page, {longGap: true});
  await page.goto('http://127.0.0.1:4180/Obv_Co_Divergence/');
  await page.reload();
  await page.click('#start');
  await expect(page.locator('#status')).toContainText('검색 완료');
  await expect(page.getByRole('img', {name: /LONG 가격, OBV, CO/})).toBeVisible();
  await expect(page.locator('.plot-divergence')).toHaveCount(3);
  await page.getByLabel('확정 신호').selectOption('1');
  const price = page.locator('[data-panel="가격 · 15분"]');
  const first = price.locator('[data-pivot="1"]');
  await expect(first).toHaveCount(0);
  await expect(price.locator('.plot-confirm')).toHaveAttribute('d', /^M252 /);
  const earlier = page.getByRole('button', {name: '이전 봉'});
  await earlier.click();
  await earlier.click();
  await expect(first).toHaveAttribute('data-value', '6');
  await expect(price.locator('.plot-candle')).toHaveCount(50);
  await expect(price.locator('.plot-ema')).toBeVisible();
  await expect(earlier).toBeDisabled();
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('market buttons filter requests, persist selection and lock during scan',async({page})=>{
 const calls=[];
 await page.route('https://api.bybit.com/**',async route=>{
  const url=new URL(route.request().url());const items=[{symbol:'BTCUSDT',symbolType:''},{symbol:'SHAREUSDT',symbolType:'stock'},{symbol:'ETFUSDT',symbolType:'ETF'}];
  let result;
  if(url.pathname.endsWith('/time'))result={timeSecond:String(201*900)};
  else if(url.pathname.endsWith('/instruments-info'))result={list:items.map(i=>({...i,quoteCoin:'USDT',settleCoin:'USDT',contractType:'LinearPerpetual',status:'Trading'}))};
  else if(url.pathname.endsWith('/tickers'))result={list:items.map(i=>({...i,lastPrice:'10',turnover24h:'10000000'}))};
  else {calls.push(url.searchParams.get('symbol'));await new Promise(r=>setTimeout(r,200));result={list:Array.from({length:201},(_,i)=>[i*900000,10,12,8,10,10,100].map(String)).reverse()};}
  await route.fulfill({headers:{'access-control-allow-origin':'*'},json:{retCode:0,result}});
 });
 await page.goto('/');await page.getByRole('button',{name:'주식만',exact:true}).click();await page.reload();
 await expect(page.getByRole('button',{name:'주식만',exact:true})).toHaveAttribute('aria-pressed','true');
 for(const [label,expected] of [['주식만',['SHAREUSDT']],['코인만',['BTCUSDT']],['전체',['ETFUSDT']]]) {
  calls.length=0;await page.getByRole('button',{name:label,exact:true}).click();await page.click('#start');
  await expect(page.getByRole('button',{name:'전체',exact:true})).toBeDisabled();
  await expect(page.locator('#start')).toBeEnabled();expect(calls.sort()).toEqual(expected.sort());await expect(page.locator('#status')).toContainText(`탐색 시장: ${label}`);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
