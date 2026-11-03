import { Bybit, candlesFrom, abortError, pause } from '../api/bybit.js';
import { matchesMarket, MARKET_LABELS } from './market.js';
import { detect, INTERVAL } from '../indicators/divergence.js';
export class Scanner {
  constructor(api = new Bybit()) { this.api = api; this.active = false; this.cache = new Map(); }
  cancel() { this.controller?.abort(); }
  async run(direction = 'ALL', onProgress = () => {}, market = 'all') {
    if (this.active) throw new Error('검색이 이미 진행 중입니다.');
    if (!Object.hasOwn(MARKET_LABELS, market)) throw new Error('지원하지 않는 시장 선택입니다.');
    this.active = true; this.controller = new AbortController();
    const signal = this.controller.signal, started = Date.now(), initialRequests = this.api.requests;
    const state = { market, status:'running', phase:'Bybit 서버 시간 확인', total:0, done:0, failures:[], results:[], warnings:[], cutoff:0, cacheHits:0, requests:0, started };
    const emit = () => { state.elapsed = Date.now() - started; state.requests = this.api.requests - initialRequests; onProgress({...state}); };
    emit();
    try {
      try {
        const t = await this.api.request('time', {}, signal);
        const seconds = Number(t.timeSecond);
        if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('서버 시간 구조 오류');
        state.cutoff = seconds * 1000;
      } catch (e) { if (signal.aborted) throw e; state.cutoff = Date.now(); state.warnings.push(`서버 시간 조회 실패: 시스템 UTC 사용. ${e.message}`); }
      state.lastCandle = Math.floor(state.cutoff / INTERVAL) * INTERVAL - INTERVAL;
      state.phase = '전체 종목 및 거래대금 조회'; emit();
      const allInstruments = await this.api.instruments(signal);
      const instruments = allInstruments.filter(item => matchesMarket(item.symbolType, market));
      const unknown = allInstruments.filter(item => typeof item.symbolType !== 'string' || !['', 'innovation', 'stock', 'ETF', 'commodity', 'forex'].includes(item.symbolType)).length;
      if (market !== 'all' && unknown) state.warnings.push(`시장 분류 누락·미확인 ${unknown}종목은 선택 시장에서 제외했습니다. 전체 선택 시 포함됩니다.`);
      const tickerResult = await this.api.request('tickers', {category:'linear'}, signal);
      if (!Array.isArray(tickerResult.list)) throw new Error('시세 응답 구조 변경');
      const tickers = new Map(tickerResult.list.map(t => [t.symbol,t]));
      const targets = [];
      for (const item of instruments) {
        const t = tickers.get(item.symbol);
        if (!t || !t.turnover24h || !Number.isFinite(Number(t.turnover24h)) || Number(t.turnover24h) < 0) { state.failures.push({symbol:item.symbol, reason:'24시간 시세 또는 거래대금 누락/비정상'}); continue; }
        if (Number(t.turnover24h) >= 10000000) targets.push({symbol:item.symbol, turnover:Number(t.turnover24h), price:Number(t.lastPrice)});
      }
      state.total = targets.length; state.phase = '15분봉 분석'; emit();
      let next = 0;
      const worker = async () => {
        while (next < targets.length) {
          if (signal.aborted) throw abortError();
          const target = targets[next++];
          try {
            if (!Number.isFinite(target.price) || target.price <= 0) throw new Error('현재 가격 누락/비정상');
            const cache = this.cache.get(target.symbol);
            let candles;
            if (cache && cache.lastCandle === state.lastCandle && Date.now() - cache.saved < 60000) { candles = cache.candles; state.cacheHits++; }
            else {
              const r = await this.api.request('kline', {category:'linear', symbol:target.symbol, interval:'15', limit:'500', end:String(state.lastCandle + INTERVAL - 1)}, signal);
              candles = candlesFrom(r.list,state.cutoff);
              this.cache.set(target.symbol,{lastCandle:state.lastCandle,saved:Date.now(),candles});
            }
            const signals = detect(candles,{direction});
            if (signals.length) state.results.push({...target, signals});
            state.done++;
          } catch (e) { if (signal.aborted) throw e; state.failures.push({symbol:target.symbol,reason:e.message}); }
          emit();
          await pause(120,signal);
        }
      };
      const workers = await Promise.allSettled(Array.from({length:Math.min(5,targets.length)},worker));
      if (signal.aborted) throw abortError();
      const rejected = workers.find(r => r.status === 'rejected'); if (rejected) throw rejected.reason;
      state.results.sort((a,b) => b.signals[0].confirmedAt - a.signals[0].confirmedAt || b.turnover - a.turnover);
      state.status = state.failures.length ? 'partial' : 'complete';
      state.phase = state.failures.length ? '일부 분석 실패' : '검색 완료';
    } catch (e) { state.status = signal.aborted ? 'cancelled' : 'error'; state.phase = signal.aborted ? '사용자가 검색을 취소했습니다.' : e.message; }
    finally { this.active = false; state.finished = Date.now(); emit(); }
    return state;
  }
}
