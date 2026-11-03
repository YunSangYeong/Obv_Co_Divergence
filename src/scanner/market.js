export const MARKET_LABELS = { crypto: '코인만', stock: '주식만', all: '전체' };
export function matchesMarket(symbolType, market) {
  if (!Object.hasOwn(MARKET_LABELS, market)) throw new Error('지원하지 않는 시장 선택입니다.');
  if (market === 'all') return true;
  if (typeof symbolType !== 'string') return false;
  return market === 'stock' ? symbolType === 'stock' : symbolType === '' || symbolType === 'innovation';
}
export const MARKET_KEY = 'obv-co-market';
export function loadMarket() {
  try { const saved = localStorage.getItem(MARKET_KEY); return Object.hasOwn(MARKET_LABELS, saved) ? saved : 'all'; }
  catch { return 'all'; }
}
export function saveMarket(market) {
  try { localStorage.setItem(MARKET_KEY, market); } catch { /* Private browsing may deny storage. */ }
}
