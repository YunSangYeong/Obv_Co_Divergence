// Equal extrema: choose the rightmost occurrence in the complete window.
export function pivots(candles, kind, left = 5, right = 5) {
  const field = kind === 'low' ? 'low' : 'high';
  const better = kind === 'low' ? (a,b) => a < b : (a,b) => a > b;
  const result = [];
  for (let i = left; i + right < candles.length; i++) {
    const value = candles[i][field];
    let valid = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (better(candles[j][field], value) || (j > i && candles[j][field] === value)) { valid = false; break; }
    }
    if (valid) result.push({ index: i, confirmed: i + right, value });
  }
  return result;
}
