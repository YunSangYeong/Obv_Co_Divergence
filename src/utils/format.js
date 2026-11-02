export const kst = t => t ? new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(t) + ' KST' : '—';
export const number = n => new Intl.NumberFormat('ko-KR',{maximumSignificantDigits:8}).format(n);
export function chartLinks(symbol) {
  // TradingView's BYBIT USDT linear perpetual namespace uses the .P contract suffix.
  if (!/^[A-Z0-9]+USDT$/.test(symbol)) return { bybit:`https://www.bybit.com/trade/usdt/${encodeURIComponent(symbol)}` };
  return { tv:`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(`BYBIT:${symbol}.P`)}&interval=15`, bybit:`https://www.bybit.com/trade/usdt/${encodeURIComponent(symbol)}` };
}
