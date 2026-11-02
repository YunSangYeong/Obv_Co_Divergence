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
test('real scanner pipeline with deterministic fixture, mobile results and previous signals',async({page})=>{
 const I=900000, count=500, cutoff=count*I;
 const rows=Array.from({length:count},(_,i)=>[String(i*I),'10','12','8','10','10','100']);
 rows[480]=[String(480*I),'10','12','6','7','100','1000'];
 rows[490]=[String(490*I),'10','12','5','11','100','1000'];rows.reverse();
 await page.route('https://api.bybit.com/**',async route=>{
  const u=new URL(route.request().url());let result;
  if(u.pathname.endsWith('/time'))result={timeSecond:String(cutoff/1000)};
  else if(u.pathname.endsWith('/instruments-info'))result={list:[{symbol:'BTCUSDT',quoteCoin:'USDT',settleCoin:'USDT',contractType:'LinearPerpetual',status:'Trading'}]};
  else if(u.pathname.endsWith('/tickers'))result={list:[{symbol:'BTCUSDT',turnover24h:'20000000',lastPrice:'10'}]};
  else result={list:rows};
  await route.fulfill({headers:{'access-control-allow-origin':'*'},json:{retCode:0,result}});
 });
 await page.goto('/');await page.click('#start');await expect(page.locator('#status')).toContainText('검색 완료');await expect(page.locator('#status')).toContainText('정상 분석');await expect(page.locator('#results')).toContainText('BTCUSDT');await expect(page.locator('#results')).toContainText('LONG');await expect(page.locator('.card-title')).toHaveAttribute('target','_blank');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'/tmp/obv-mobile-results.png',fullPage:true});await expect(page.locator('#status')).toContainText('API 요청 4회');
});
test('production assets load and refresh under GitHub Pages subpath',async({page})=>{
 const {createServer}=await import('node:http');const {readFile}=await import('node:fs/promises');
 const server=createServer(async(req,res)=>{
  try{const path=req.url.replace(/^\/Obv_Co_Divergence\//,'');if(path===req.url){res.writeHead(404).end();return;}const file=path||'index.html';const data=await readFile(`dist/${file}`);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(data);}catch{res.writeHead(404).end();}
 });await new Promise(resolve=>server.listen(4180,'127.0.0.1',resolve));
 try{await page.goto('http://127.0.0.1:4180/Obv_Co_Divergence/');await expect(page.locator('#start')).toBeVisible();await page.reload();await expect(page.locator('#start')).toBeEnabled();}finally{await new Promise(resolve=>server.close(resolve));}
});
