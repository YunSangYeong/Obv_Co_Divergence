import './style.css';
import { signalChart } from './chart.js';
import { MARKET_LABELS, loadMarket, saveMarket } from './scanner/market.js';
import { Scanner } from './scanner/scanner.js';
import { kst, number, chartLinks } from './utils/format.js';
const app = document.querySelector('#app');
app.innerHTML = `<main><header><span class="eyebrow">시장 분석 · 투자 연구 도구 / V1.0</span><h1>OBV + CO<br><span>DUAL DIVERGENCE</span></h1><p>Bybit USDT Perpetual Scanner</p></header><section class="panel"><div class="section-title">검색 설정 <span class="badge">확정 봉만 분석</span></div><div class="settings"><div><small>시간봉</small><strong>15분</strong></div><div><small>신호 범위</small><strong>최근 10봉</strong></div><div><small>24H 거래대금</small><strong>10M USDT 이상</strong></div></div><fieldset id="market-options"><legend>탐색 시장</legend><div class="market-buttons">${Object.entries(MARKET_LABELS).map(([value,label]) => `<button type="button" data-market="${value}" aria-pressed="false">${label}</button>`).join('')}</div></fieldset><p class="hint market-note">주식만: Bybit 개별 주식 기반 무기한 선물. 전체에는 ETF·원자재·외환 등도 포함됩니다.</p><label for="direction">검색 방향</label><select id="direction"><option value="ALL">ALL · 강세 + 약세</option><option value="LONG">LONG · 강세</option><option value="SHORT">SHORT · 약세</option></select><button id="start">검색 시작</button><button id="cancel" class="secondary" hidden>검색 취소</button><p class="hint">OBV와 CO가 동일 가격 피벗에서 함께 확인된 일반 다이버전스만 표시합니다.</p></section><section id="status" class="panel" aria-live="polite"><strong>검색 대기 중</strong><p class="hint">검색 시작을 누르면 실시간 데이터를 조회합니다.<br>최초 접속 시 자동으로 검색하지 않습니다.</p></section><section><div class="section-title">검색 결과 <span id="count" class="badge">0</span></div><div id="results"><div class="empty">검색을 시작해 주세요.</div></div></section><footer>15분봉 · 피벗 5 / 5 · 간격 5–80봉 · CO 3 / 10<br>투자 판단과 책임은 사용자에게 있습니다.</footer></main>`;
const scanner = new Scanner();
const start = document.querySelector('#start'), cancel = document.querySelector('#cancel'), direction = document.querySelector('#direction');
const escape = v => String(v).replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let latest, timer;
let market = loadMarket();
const marketOptions = document.querySelector('#market-options');
function showMarket() {
  for (const button of marketOptions.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.market === market));
}
showMarket();
marketOptions.addEventListener('click', event => {
  const button = event.target.closest('[data-market]');
  if (!button || scanner.active) return;
  market = button.dataset.market; saveMarket(market); showMarket();
});
function signalDetails(s) { return `<dl><div><dt>다이버전스 발생</dt><dd>${kst(s.occurredAt)}</dd></div><div><dt>신호 확정</dt><dd>${kst(s.confirmedAt)}</dd></div><div><dt>확정 이후</dt><dd>${s.age}봉 경과 · ${s.side}</dd></div></dl>`; }
function render(state) {
  latest = state;
  const running = state.status === 'running';
  start.disabled = running; direction.disabled = running; marketOptions.disabled = running; cancel.hidden = !running;
  const long = state.results.reduce((n,r) => n + r.signals.filter(s=>s.side === 'LONG').length,0), short = state.results.reduce((n,r) => n + r.signals.filter(s=>s.side === 'SHORT').length,0);
  const processed = state.done + state.failures.filter(f=>!f.reason.startsWith('24시간')).length;
  document.querySelector('#status').innerHTML = `<div class="section-title ${['error','partial','cancelled'].includes(state.status)?'warning':''}">${escape(state.phase)}</div><progress max="${Math.max(state.total,1)}" value="${Math.min(processed,state.total)}"></progress><div class="metrics"><div><small>대상 종목</small><strong>${state.total}</strong></div><div><small>정상 분석</small><strong>${state.done}</strong></div><div><small>실패</small><strong>${state.failures.length}</strong></div><div><small>경과 시간</small><strong>${((running?Date.now()-state.started:state.elapsed)/1000).toFixed(1)}초</strong></div></div><p class="hint">탐색 시장: ${MARKET_LABELS[state.market]}<br>API 요청 ${state.requests}회 · 캐시 ${state.cacheHits}종목<br>LONG ${long}개 · SHORT ${short}개 · 신호 ${long+short}개 / ${state.results.length}종목<br>검색 기준: ${kst(state.cutoff)}<br>마지막 확정 봉 시작: ${kst(state.lastCandle)}${state.finished?`<br>검색 종료: ${kst(state.finished)}`:''}</p>${state.warnings.map(w=>`<p class="warning">${escape(w)}</p>`).join('')}${state.cacheHits?'<p class="hint">캐시는 동일 마지막 확정 봉 기준, 수집 후 60초 이내의 캔들만 재사용합니다. 시세·거래대금은 이번 검색에서 조회했습니다.</p>':''}${state.failures.length?`<details><summary>실패 및 제외 사유 ${state.failures.length}건</summary><ul>${state.failures.map(f=>`<li>${escape(f.symbol)}: ${escape(f.reason)}</li>`).join('')}</ul></details>`:''}`;
  document.querySelector('#count').textContent = `${state.results.length}종목 · ${long+short}신호`;
  renderResults(state, running);
}

const results = document.querySelector('#results');
const cards = new Map();
let resultList;

function createCard(result) {
  const { symbol, signals, price, turnover } = result;
  const links = chartLinks(symbol);
  const card = document.createElement('article');
  card.className = 'card';
  card.innerHTML = `<a class="card-title" href="${escape(links.tv ?? links.bybit)}" target="_blank" rel="noopener noreferrer"><h2>${escape(symbol)}</h2><span class="side"></span></a>
    <div class="price">${number(price)} <small>USDT</small></div><p class="hint">24H 거래대금 ${(turnover / 1e6).toFixed(2)}M USDT</p>
    ${signals.length > 1 ? `<label class="signal-picker">확정 신호<select>${signals.map((s, i) => `<option value="${i}">${i === 0 ? '최신 · ' : ''}${s.side} · ${kst(s.confirmedAt)}</option>`).join('')}</select></label>` : ''}
    <div class="signal-view"></div>
    <div class="links">${links.tv ? `<a href="${escape(links.tv)}" target="_blank" rel="noopener noreferrer">TradingView ↗</a>` : ''}<a href="${escape(links.bybit)}" target="_blank" rel="noopener noreferrer">Bybit 거래 화면 ↗</a></div>
    <p class="hint">차트에서 종목이 지원되지 않으면 Bybit 링크를 이용하세요.</p>`;
  const side = card.querySelector('.side');
  const view = card.querySelector('.signal-view');
  const selectSignal = index => {
    const signal = signals[index];
    side.className = `side ${signal.side.toLowerCase()}`;
    side.textContent = signal.side;
    view.innerHTML = signalDetails(signal) + signalChart(result, signal);
  };
  card.querySelector('select')?.addEventListener('change', event => selectSignal(Number(event.target.value)));
  selectSignal(0);
  return card;
}

function renderResults(state, running) {
  if (resultList !== state.results) {
    resultList = state.results;
    cards.clear();
    results.replaceChildren();
  }
  if (!state.results.length) {
    const message = running ? '전체 대상 종목을 분석하고 있습니다.' : state.status === 'complete' ? '조건을 충족한 종목이 없습니다.' : '분석이 완료되지 않았습니다. 결과 0건으로 확정할 수 없습니다.';
    if (results.textContent !== message) results.innerHTML = `<div class="empty">${message}</div>`;
    return;
  }
  results.querySelector('.empty')?.remove();
  for (const result of state.results) {
    if (!cards.has(result.symbol)) {
      const card = createCard(result);
      cards.set(result.symbol, card);
      results.append(card);
    }
  }
  if (!running) {
    // Keep existing card nodes and selection when ordering the finished results.
    const focused = document.activeElement;
    for (const [index, result] of state.results.entries()) {
      const card = cards.get(result.symbol);
      if (results.children[index] !== card) results.insertBefore(card, results.children[index]);
    }
    if (results.contains(focused) && document.activeElement !== focused) focused.focus({ preventScroll: true });
  }
}

start.addEventListener('click', async () => {
  if (scanner.active) return;
  timer = setInterval(()=> { if(latest) render(latest); },1000);
  try { await scanner.run(direction.value,render,market); } finally { clearInterval(timer); }
});
cancel.addEventListener('click',()=>scanner.cancel());
