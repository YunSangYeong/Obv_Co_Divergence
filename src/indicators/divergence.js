import { obv } from './obv.js';
import { chaikin } from './chaikin.js';
import { pivots } from './pivots.js';
export const INTERVAL = 900000;
export function detect(candles, { direction = 'ALL', recent = 10, warmup = 100, minGap = 5, maxGap = 80, left = 5, right = 5, indicators } = {}) {
  const ov = indicators?.obv ?? obv(candles), co = indicators?.co ?? chaikin(candles);
  const signals = [];
  for (const [kind, side] of [['low','LONG'], ['high','SHORT']]) {
    if (direction !== 'ALL' && direction !== side) continue;
    const points = pivots(candles, kind, left, right);
    for (let n = 1; n < points.length; n++) {
      const a = points[n - 1], b = points[n], gap = b.index - a.index;
      if (a.index < warmup || gap < minGap || gap > maxGap || b.confirmed < candles.length - recent) continue;
      const sign = side === 'LONG' ? 1 : -1;
      if ((a.value - b.value) * sign > 0 && (ov[b.index] - ov[a.index]) * sign > 0 && (co[b.index] - co[a.index]) * sign > 0) {
        signals.push({ side, first: a.index, second: b.index, occurredAt: candles[b.index].time, confirmedAt: candles[b.confirmed].time + INTERVAL, age: candles.length - 1 - b.confirmed });
      }
    }
  }
  return signals.sort((a,b) => b.confirmedAt - a.confirmedAt);
}
