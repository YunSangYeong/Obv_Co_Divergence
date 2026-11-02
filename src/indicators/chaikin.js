// EMA is seeded with the first ADL value. Signals skip the first 100 candles.
export function ema(values, period) {
  const alpha = 2 / (period + 1);
  return values.reduce((out, value, i) => { out.push(i ? alpha * value + (1 - alpha) * out[i - 1] : value); return out; }, []);
}
export function chaikin(candles) {
  let total = 0;
  const adl = candles.map(c => total += (c.high === c.low ? 0 : (2 * c.close - c.low - c.high) / (c.high - c.low)) * c.volume);
  const fast = ema(adl, 3), slow = ema(adl, 10);
  return fast.map((v, i) => v - slow[i]);
}
