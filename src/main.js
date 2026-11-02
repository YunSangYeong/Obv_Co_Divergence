import './style.css';
import { Scanner } from './scanner/scanner.js';
import { kst, number, chartLinks } from './utils/format.js';
const app = document.querySelector('#app');
app.innerHTML = `<main><header><span class="eyebrow">시장 분석 · 투자 연구 도구 / V1.0</span><h1>OBV + CO<br><span>DUAL DIVERGENCE</span></h1><p>Bybit USDT Perpetual Scanner</p></header><section class="panel"><div class="section-title">검색 설정 <span class="badge">확정 봉만 분석</span></div><div class="settings"><div><small>시간봉</small><strong>15분</strong></div><div><small>신호 범위</small><strong>최근 10봉</strong></div><div><small>24H 거래대금</small><strong>10M USDT 이상</strong></div></div><label for="direction">검색 방향</label><select id="direction"><option value="ALL">ALL · 강세 + 약세</option><option value="LONG">LONG · 강세</option><option value="SHORT">SHORT · 약세</option></select><button id="start">검색 시작</button><button id="cancel" class="secondary" hidden>검색 취소</button><p class="hint">OBV와 CO가 동일 가격 피벗에서 함께 확인된 일반 다이버전스만 표시합니다.</p></section><section id="status" class="panel" aria-live="polite"><strong>검색 대기 중</strong><p class="hint">검색 시작을 누르면 실시간 데이터를 조회합니다.<br>최초 접속 시 자동으로 검색하지 않습니다.</p></section><section><div class="section-title">검색 결과 <span id="count" class="badge">0</span></div><div id="results"><div class="empty">검색을 시작해 주세요.</div></div></section><footer>15분봉 · 피벗 5 / 5 · 간격 5–80봉 · CO 3 / 10<br>투자 판단과 책임은 사용자에게 있습니다.</footer></main>`;
const scanner = new Scanner();
const start = document.querySelector('#start'), cancel = document.querySelector('#cancel'), direction = document.querySelector('#direction');
const escape = v => String(v).replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let latest, timer;
function signalDetails(s) { return `<dl><div><dt>다이버전스 발생</dt><dd>${kst(s.occurredAt)}</dd></div><div><dt>신호 확정</dt><dd>${kst(s.confirmedAt)}</dd></div><div><dt>확정 이후</dt><dd>${s.age}봉 경과 · ${s.side}</dd></div></dl>`; }
function render(state) {
  latest = state;
  const running = state.status === 'running';
  start.disabled = running; direction.disabled = running; cancel.hidden = !running;
  const long = state.results.reduce((n,r) => n + r.signals.filter(s=>s.side === 'LONG').length,0), short = state.results.reduce((n,r) => n + r.signals.filter(s=>s.side === 'SHORT').length,0);
  const processed = state.done + state.failures.filter(f=>!f.reason.startsWith('24시간')).length;
  document.querySelector('#status').innerHTML = `<div class="section-title ${['error','partial','cancelled'].includes(state.status)?'warning':''}">${escape(state.phase)}</div><progress max="${Math.max(state.total,1)}" value="${Math.min(processed,state.total)}"></progress><div class="metrics"><div><small>대상 종목</small><strong>${state.total}</strong></div><div><small>정상 분석</small><strong>${state.done}</strong></div><div><small>실패</small><strong>${state.failures.length}</strong></div><div><small>경과 시간</small><strong>${((running?Date.now()-state.started:state.elapsed)/1000).toFixed(1)}초</strong></div></div><p class="hint">API 요청 ${state.requests}회 · 캐시 ${state.cacheHits}종목<br>LONG ${long}개 · SHORT ${short}개 · 신호 ${long+short}개 / ${state.results.length}종목<br>검색 기준: ${kst(state.cutoff)}<br>마지막 확정 봉 시작: ${kst(state.lastCandle)}${state.finished?`<br>검색 종료: ${kst(state.finished)}`:''}</p>${state.warnings.map(w=>`<p class="warning">${escape(w)}</p>`).join('')}${state.cacheHits?'<p class="hint">캐시는 동일 마지막 확정 봉 기준, 수집 후 60초 이내의 캔들만 재사용합니다. 시세·거래대금은 이번 검색에서 조회했습니다.</p>':''}${state.failures.length?`<details><summary>실패 및 제외 사유 ${state.failures.length}건</summary><ul>${state.failures.map(f=>`<li>${escape(f.symbol)}: ${escape(f.reason)}</li>`).join('')}</ul></details>`:''}`;
  document.querySelector('#count').textContent = `${state.results.length}종목 · ${long+short}신호`;
  document.querySelector('#results').innerHTML = state.results.map(r => {
    const s = r.signals[0], links = chartLinks(r.symbol);
    return `<article class="card"><a class="card-title" href="${escape(links.tv??links.bybit)}" target="_blank" rel="noopener noreferrer"><h2>${escape(r.symbol)}</h2><span class="side ${s.side.toLowerCase()}">${s.side}</span></a><div class="price">${number(r.price)} <small>USDT</small></div><p class="hint">24H 거래대금 ${(r.turnover/1e6).toFixed(2)}M USDT</p>${signalDetails(s)}${r.signals.length>1?`<details><summary>이전 확정 신호 ${r.signals.length-1}개</summary>${r.signals.slice(1).map(signalDetails).join('')}</details>`:''}<div class="links">${links.tv?`<a href="${escape(links.tv)}" target="_blank" rel="noopener noreferrer">TradingView ↗</a>`:''}<a href="${escape(links.bybit)}" target="_blank" rel="noopener noreferrer">Bybit 거래 화면 ↗</a></div><p class="hint">차트에서 종목이 지원되지 않으면 Bybit 링크를 이용하세요.</p></article>`;
  }).join('') || `<div class="empty">${running?'전체 대상 종목을 분석하고 있습니다.':state.status==='complete'?'조건을 충족한 종목이 없습니다.':'분석이 완료되지 않았습니다. 결과 0건으로 확정할 수 없습니다.'}</div>`;
}
start.addEventListener('click', async () => {
  if (scanner.active) return;
  timer = setInterval(()=> { if(latest) render(latest); },1000);
  try { await scanner.run(direction.value,render); } finally { clearInterval(timer); }
});
cancel.addEventListener('click',()=>scanner.cancel());
