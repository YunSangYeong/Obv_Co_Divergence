import { test } from 'node:test';
import assert from 'node:assert/strict';
import { obv } from '../src/indicators/obv.js';
import { ema, chaikin } from '../src/indicators/chaikin.js';
import { pivots } from '../src/indicators/pivots.js';
import { detect, INTERVAL as I } from '../src/indicators/divergence.js';
import { Bybit, candlesFrom } from '../src/api/bybit.js';
import { Scanner } from '../src/scanner/scanner.js';
import { chartLinks } from '../src/utils/format.js';
const bars = n => Array.from({length:n},(_,i)=>({time:i*I,open:10,high:12,low:8,close:10,volume:10}));
function fixture(side='LONG') {
  const c=bars(40), ov=Array(40).fill(0),co=Array(40).fill(0), field=side==='LONG'?'low':'high';
  c.forEach((b,i)=> b[field]=(side==='LONG'?8:12)+(side==='LONG'?1:-1)*Math.abs(i%12-6)/100);
  c[15][field]=side==='LONG'?6:14;c[30][field]=side==='LONG'?5:15;
  ov[15]=co[15]=side==='LONG'?-3:3;ov[30]=co[30]=side==='LONG'?-2:2;
  return {c,ov,co,options:{warmup:0,indicators:{obv:ov,co}}};
}
test('OBV uses close direction and base volume; equal closes unchanged',()=>assert.deepEqual(obv([{close:1,volume:9},{close:2,volume:3},{close:2,volume:8},{close:1,volume:5}]),[0,3,3,-2]));
test('EMA first-value seed and CO ADL formulas',()=>{
 assert.deepEqual(ema([1,3,5],3),[1,2,3.5]);
 const c=[{low:0,high:10,close:10,volume:10},{low:0,high:10,close:0,volume:10},{low:5,high:5,close:5,volume:20}];
 const actual=chaikin(c),a=ema([10,0,0],3),b=ema([10,0,0],10);assert.deepEqual(actual,a.map((v,i)=>v-b[i]));
});
test('rightmost equal pivot wins; right bars required',()=>{
 const c=bars(16);c[5].low=1;c[6].low=1;
 assert.deepEqual(pivots(c,'low').map(p=>p.index),[6]);assert.equal(pivots(c.slice(0,11),'low').length,0);
});
for(const side of ['LONG','SHORT']) test(`${side}: both indicators on same price pivot; one alone insufficient`,()=>{
 const {c,ov,co,options}=fixture(side);const found=detect(c,options).filter(s=>s.second===30);assert.equal(found.length,1);assert.equal(found[0].side,side);assert.equal(found[0].confirmedAt,36*I);
 co[30]=co[15];assert.equal(detect(c,options).filter(s=>s.second===30).length,0);
 co[30]=side==='LONG'?-2:2;ov[30]=ov[15];assert.equal(detect(c,options).filter(s=>s.second===30).length,0);
});
test('unconfirmed signals absent, stable on append; recent cutoff uses confirmation',()=>{
 const {c,options}=fixture();assert.equal(detect(c.slice(0,35),options).some(s=>s.second===30),false);
 const s=detect(c.slice(0,36),options).find(s=>s.second===30);assert.ok(s);
 assert.deepEqual(detect(c,options).find(s=>s.second===30).confirmedAt,s.confirmedAt);
 assert.ok(detect([...c,...bars(5)],options).some(s=>s.second===30));
 assert.equal(detect([...c,...bars(6)],options).some(s=>s.second===30),false);
});
test('pivot gaps and warmup enforced, latest adjacent pivot replaces old one',()=>{
 const {c,options}=fixture();assert.equal(detect(c,{...options,minGap:16}).some(s=>s.second===30),false);
 assert.equal(detect(c,{...options,maxGap:14}).some(s=>s.second===30),false);
 assert.equal(detect(c,{...options,warmup:100}).length,0);
 // A newer intervening price pivot prevents comparing back to the older signal pivot.
 c[23].low=4;assert.equal(detect(c,options).some(s=>s.second===30),false);
});
const rows=()=>bars(201).map(c=>[c.time,c.open,c.high,c.low,c.close,c.volume,100].map(String)).reverse();
test('newest first, dedup, open candle fully excluded',()=>{
 const r=rows();r[0][2]='bad';r.push([...r.at(-1)]);const c=candlesFrom(r,200*I);assert.equal(c.length,200);assert.equal(c[0].time,0);assert.equal(c.at(-1).time,199*I);
});
test('invalid data, gaps, shortage, stale last bar rejected',()=>{
 const r=rows();r[10][5]='-1';assert.throws(()=>candlesFrom(r,201*I),/비정상/);
 assert.throws(()=>candlesFrom(rows().slice(0,100),201*I),/부족/);
 const g=rows();g.splice(50,1);assert.throws(()=>candlesFrom(g,201*I),/누락/);
 assert.throws(()=>candlesFrom(rows(),202*I),/마지막/);
});
test('429 and 10006 exponential retries, counts and success',async()=>{
 let calls=0;const waits=[];const api=new Bybit({random:()=>0,sleep:async ms=>waits.push(ms),fetcher:async()=>{calls++;return calls===1?{status:429}: {ok:true,status:200,json:async()=>calls===2?{retCode:10006,result:{}}:{retCode:0,result:{list:[]}}};}});
 assert.deepEqual(await api.request('test'),{list:[]});assert.equal(api.requests,3);assert.deepEqual(waits,[1000,2000]);
});
test('invalid retCode and malformed response fail clearly',async()=>{
 const api=new Bybit({fetcher:async()=>({ok:true,status:200,json:async()=>({retCode:0})})});await assert.rejects(api.request('test'),/응답 오류/);
});
test('instrument pagination, dedup, USDT perpetual selection',async()=>{
 const api=new Bybit();let calls=0;const valid={symbol:'BTCUSDT',quoteCoin:'USDT',settleCoin:'USDT',contractType:'LinearPerpetual',status:'Trading'};
 api.request=async()=>++calls===1?{list:[valid,{...valid,symbol:'X',status:'PreLaunch'}],nextPageCursor:'a'}:{list:[valid],nextPageCursor:''};
 assert.deepEqual(await api.instruments(),[valid]);assert.equal(calls,2);
});
test('cancellation and duplicate run protection; no false completion',async()=>{
 const api={requests:0,request:async(p,params,signal)=>new Promise((res,rej)=>signal.addEventListener('abort',()=>rej(new Error('abort')),{once:true}))};
 const s=new Scanner(api);const run=s.run();await assert.rejects(s.run(),/이미/);s.cancel();const state=await run;assert.equal(state.status,'cancelled');assert.equal(s.active,false);
});
test('scanner all targets no arbitrary cap; failure distinct, cache and direction',async()=>{
 const instruments=Array.from({length:103},(_,i)=>({symbol:`C${i}USDT`}));let k=0;
 const api={requests:0,instruments:async()=>instruments,request:async function(p,params){this.requests++;if(p==='time')return {timeSecond:String(201*I/1000)};if(p==='tickers')return {list:instruments.map(i=>({...i,turnover24h:'10000000',lastPrice:'10'}))};k++;if(params.symbol==='C1USDT')throw new Error('실패');return {list:rows()};}};
 const s=new Scanner(api);const result=await s.run();assert.equal(result.total,103);assert.equal(result.done,102);assert.equal(result.failures.length,1);assert.equal(result.status,'partial');assert.equal(k,103);
 const again=await s.run('LONG');assert.equal(again.cacheHits,102);assert.equal(k,104);
});
test('chart URLs encoded safely and Bybit fallback available',()=>{const l=chartLinks('BTCUSDT');assert.ok(l.tv.includes('BYBIT%3ABTCUSDT.P'));assert.ok(l.tv.endsWith('interval=15'));assert.ok(l.bybit.endsWith('BTCUSDT'));assert.equal(chartLinks('<bad>').tv,undefined);});
test('exact gap boundaries 5 and 80 included, 81 excluded',()=>{
 for(const gap of [5,80,81]) {
  const n=gap+25,c=bars(n);for(let i=0;i<n;i++){c[i].low=8+Math.abs(i-12)/100;}
  c[10].low=6;c[10+gap].low=5;
  const ov=Array(n).fill(0),co=Array(n).fill(0);ov[10]=co[10]=-2;ov[10+gap]=co[10+gap]=-1;
  const signals=detect(c,{warmup:0,left:2,right:2,recent:n,indicators:{obv:ov,co}});
  assert.equal(signals.some(s=>s.first===10 && s.second===10+gap),gap<=80);
 }
});
test('market classification follows explicit Bybit metadata only',async()=>{
 const {matchesMarket}=await import('../src/scanner/market.js');
 for(const type of ['', 'innovation']) assert.equal(matchesMarket(type,'crypto'),true);
 for(const type of ['stock','ETF','commodity','forex',undefined,'future-type']) assert.equal(matchesMarket(type,'crypto'),false);
 assert.equal(matchesMarket('stock','stock'),true);
 for(const type of ['', 'innovation','ETF',undefined]) assert.equal(matchesMarket(type,'stock'),false);
 for(const type of ['', 'stock','ETF',undefined,'future-type']) assert.equal(matchesMarket(type,'all'),true);
 assert.throws(()=>matchesMarket('stock','bogus'),/지원하지/);
});
test('market filtering precedes kline calls, counters and results follow selected market',async()=>{
 for(const market of ['crypto','stock','all']) {
  const items=[{symbol:'BTCUSDT',symbolType:''},{symbol:'NEWUSDT',symbolType:'innovation'},{symbol:'SHAREUSDT',symbolType:'stock'},{symbol:'ETFUSDT',symbolType:'ETF'},{symbol:'UNKNOWNUSDT'}];
  const calls=[];const api={requests:0,instruments:async()=>items,request:async function(p,params){this.requests++;if(p==='time')return {timeSecond:String(201*I/1000)};if(p==='tickers')return {list:items.map(i=>({...i,turnover24h:'10000000',lastPrice:'10'}))};calls.push(params.symbol);return {list:rows()};}};
  const result=await new Scanner(api).run('ALL',()=>{},market);
  const expected=market==='crypto'?['BTCUSDT','NEWUSDT']:market==='stock'?['SHAREUSDT']:items.map(i=>i.symbol);
  assert.deepEqual(calls,expected);assert.equal(result.total,expected.length);assert.equal(result.done,expected.length);assert.equal(result.status,'complete');assert.equal(result.market,market);
 }
});
