import { INTERVAL } from '../indicators/divergence.js';
export class ApiError extends Error {}
export function abortError() { return new DOMException('검색이 취소되었습니다.', 'AbortError'); }
export function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(done, ms);
    const abort = () => { clearTimeout(timer); reject(abortError()); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export class Bybit {
  constructor({ fetcher = globalThis.fetch.bind(globalThis), sleep = pause, random = Math.random } = {}) { this.fetcher = fetcher; this.sleep = sleep; this.random = random; this.requests = 0; }
  async request(path, params = {}, signal) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (signal?.aborted) throw abortError();
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(), 12000);
      let retry = false;
      try {
        this.requests++;
        const response = await this.fetcher(`https://api.bybit.com/v5/market/${path}?${new URLSearchParams(params)}`, { signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal });
        if (response.status === 429 || response.status >= 500) { retry = true; throw new ApiError(`API 요청 제한 또는 서버 오류 (HTTP ${response.status})`); }
        if (!response.ok) throw new ApiError(`Bybit HTTP ${response.status}: 접근이 거부되었거나 API가 응답하지 않습니다.`);
        const data = await response.json();
        if (data.retCode === 10006) { retry = true; throw new ApiError('Bybit 요청 제한 (10006)'); }
        if (data.retCode !== 0 || !data.result || typeof data.result !== 'object') throw new ApiError(`Bybit 응답 오류 (${data.retCode ?? '구조 변경'})`);
        return data.result;
      } catch (error) {
        if (signal?.aborted) throw abortError();
        if (error instanceof TypeError || timeout.signal.aborted) retry = true;
        if (!retry || attempt === 2) {
          if (timeout.signal.aborted) throw new ApiError('Bybit 응답 시간 초과 (12초)');
          if (error instanceof TypeError) throw new ApiError('네트워크 연결 실패. 인터넷·Bybit 접속 또는 CORS 차단 가능성이 있습니다. 브라우저 보안 정책상 원인을 확정할 수 없습니다.');
          throw error;
        }
      } finally { clearTimeout(timer); }
      await this.sleep(1000 * 2 ** attempt + this.random() * 500, signal);
    }
  }
  async instruments(signal) {
    const items = new Map(), cursors = new Set(); let cursor = '';
    do {
      const r = await this.request('instruments-info', { category:'linear', limit:'1000', ...(cursor ? { cursor } : {}) }, signal);
      if (!Array.isArray(r.list)) throw new ApiError('종목 목록 응답 구조 변경');
      for (const item of r.list) {
        if (!item || typeof item.symbol !== 'string') throw new ApiError('잘못된 종목 데이터');
        items.set(item.symbol, item);
      }
      cursor = r.nextPageCursor ?? '';
      if (typeof cursor !== 'string' || (cursor && cursors.has(cursor))) throw new ApiError('종목 페이지 커서 오류');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return [...items.values()].filter(i => i.quoteCoin === 'USDT' && i.settleCoin === 'USDT' && i.contractType === 'LinearPerpetual' && i.status === 'Trading');
  }
}
export function candlesFrom(rows, cutoff) {
  if (!Array.isArray(rows)) throw new ApiError('캔들 응답 구조 변경');
  const map = new Map();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 7) throw new ApiError('잘못된 캔들 구조');
    const nums = row.slice(0,7).map(v => typeof v === 'string' && v.trim() === '' || v === null ? NaN : Number(v));
    const [time, open, high, low, close, volume, turnover] = nums;
    // In-progress bars never enter validation, indicators, or pivots.
    if (Number.isFinite(time) && time + INTERVAL > cutoff) continue;
    if (!nums.every(Number.isFinite) || !Number.isSafeInteger(time) || time % INTERVAL || low <= 0 || high < Math.max(open,close,low) || low > Math.min(open,close) || volume < 0 || turnover < 0) throw new ApiError('비정상 가격·거래량 또는 타임스탬프');
    const c = { time, open, high, low, close, volume };
    if (map.has(time) && JSON.stringify(map.get(time)) !== JSON.stringify(c)) throw new ApiError('동일 시각의 캔들 데이터 충돌');
    map.set(time,c);
  }
  const candles = [...map.values()].sort((a,b) => a.time - b.time);
  if (candles.length < 200) throw new ApiError(`과거 캔들 부족 (${candles.length}/최소 200봉)`);
  if (candles.at(-1).time !== Math.floor(cutoff / INTERVAL) * INTERVAL - INTERVAL) throw new ApiError('마지막 확정 봉 누락 또는 지연');
  if (candles.some((c,i) => i && c.time - candles[i-1].time !== INTERVAL)) throw new ApiError('캔들 시계열 중간 누락');
  return candles;
}
