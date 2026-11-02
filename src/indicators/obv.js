export function obv(candles) {
  let value = 0;
  return candles.map((c, i) => { if (i) value += Math.sign(c.close - candles[i - 1].close) * c.volume; return value; });
}
