import { INTERVAL } from './indicators/divergence.js';
import { kst } from './utils/format.js';

export function chartWindow({ candles, indicators }, signal) {
  const start = Math.max(0, signal.first - 12);
  // The signal timestamp is the confirmation candle's close.
  const confirmed = candles.length - 1 - signal.age;
  const end = Math.min(candles.length, confirmed + 9);
  return {
    candles: candles.slice(start, end),
    obv: indicators.obv.slice(start, end),
    co: indicators.co.slice(start, end),
    first: signal.first - start,
    second: signal.second - start,
    confirmed: confirmed - start,
  };
}

const axisTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const axisNumber = new Intl.NumberFormat('en', {
  notation: 'compact', maximumSignificantDigits: 4,
});
const panelLeft = 8;
const panelRight = 252;

function panel({ label, top, bottom, values, points, draw, x, confirmation }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min) * 0.08 || Math.abs(max) * 0.08 || 1;
  const high = max + padding;
  const low = min - padding;
  const y = value => top + (high - value) / (high - low) * (bottom - top);
  const grid = [max, (max + min) / 2, min].map((value, index) => {
    if (max === min && index !== 1) return '';
    return `<path class="plot-grid" d="M${panelLeft} ${y(value)}H${panelRight}"/>
      <text x="258" y="${y(value)}" dominant-baseline="middle">${axisNumber.format(value)}</text>`;
  }).join('');
  const [[a, av], [b, bv]] = points;
  return `<g data-panel="${label}">
    <text class="plot-title" x="${panelLeft}" y="${top - 6}">${label}</text>
    ${grid}${draw(y)}
    <path class="plot-confirm" d="M${confirmation} ${top}V${bottom}"/>
    <line class="plot-divergence" x1="${x(a)}" y1="${y(av)}" x2="${x(b)}" y2="${y(bv)}"/>
    ${points.map(([index, value], i) => `<circle class="plot-pivot" cx="${x(index)}" cy="${y(value)}" r="3.4" data-value="${value}" data-pivot="${i + 1}"/>`).join('')}
  </g>`;
}

export function signalChart(result, signal) {
  const data = chartWindow(result, signal);
  const { candles, first, second, confirmed } = data;
  const step = (panelRight - panelLeft) / candles.length;
  const x = index => panelLeft + (index + 0.5) * step;
  const confirmation = x(confirmed) + step / 2;
  const candleWidth = step * 0.65;
  const price = panel({
    label: '가격 · 15분', top: 22, bottom: 114, x, confirmation,
    values: candles.flatMap(bar => [bar.low, bar.high]),
    points: [first, second].map(i => [i, signal.side === 'LONG' ? candles[i].low : candles[i].high]),
    draw: y => candles.map((bar, i) => {
      const body = Math.min(y(bar.open), y(bar.close));
      const height = Math.max(0.75, Math.abs(y(bar.open) - y(bar.close)));
      return `<path class="plot-candle ${bar.close >= bar.open ? 'up' : 'down'}" d="M${x(i)} ${y(bar.high)}V${y(bar.low)} M${x(i) - candleWidth / 2} ${body}h${candleWidth}v${height}h-${candleWidth}Z"/>`;
    }).join(''),
  });
  const linePanel = (label, values, top, bottom) => panel({
    label, top, bottom, values, x, confirmation,
    points: [first, second].map(i => [i, values[i]]),
    draw: y => `<polyline class="plot-indicator" points="${values.map((value, i) => `${x(i)},${y(value)}`).join(' ')}"/>`,
  });
  const middle = Math.floor(candles.length / 2);
  const ticks = [
    [panelLeft, candles[0].time, 'start'],
    [panelLeft + middle * step, candles[middle].time, 'middle'],
    [panelRight, candles.at(-1).time + INTERVAL, 'end'],
  ];
  return `<figure class="signal-chart ${signal.side.toLowerCase()}">
    <svg viewBox="0 0 320 288" role="img" aria-label="${signal.side} 가격, OBV, CO 다이버전스 차트 (KST)">
      ${price}${linePanel('OBV', data.obv, 138, 184)}${linePanel('CO', data.co, 208, 254)}
      ${ticks.map(([px, time, anchor]) => `<text x="${px}" y="277" text-anchor="${anchor}">${axisTime.format(time).replace(',', '')}</text>`).join('')}
      <text x="258" y="277">KST</text>
    </svg>
    <figcaption><span>● 피벗 2개 · 연결선은 다이버전스</span><span>┊ 확정 ${kst(signal.confirmedAt)}</span></figcaption>
  </figure>`;
}
