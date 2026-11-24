import { buildSplits, summaryStats } from './telemetryEngine.js';

let chart = null;

export function renderChart(splits) {
  const ctx = document.getElementById('chart').getContext('2d');
  if (chart) chart.destroy();
  const labels = splits.map(s => (s.endDist).toFixed(0));
  const pace = splits.map(s => s.pace);
  const gap = splits.map(s => s.gap);
  const elev = splits.map(s => s.endElev);
  const text = getComputedStyle(document.documentElement).getPropertyValue('--text').trim();
  const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Pace', data: pace, yAxisID: 'y', borderColor: accent, tension: 0.3, pointRadius: 0 },
        { label: 'GAP', data: gap, yAxisID: 'y', borderColor: muted, borderDash: [4,4], tension: 0.3, pointRadius: 0 },
        { label: 'Elevation', data: elev, yAxisID: 'y2', borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,0.12)', fill: true, tension: 0.3, pointRadius: 0 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: text } } },
      scales: {
        x: { ticks: { color: muted }, title: { display: true, text: 'Distance (m)', color: muted } },
        y: { reverse: true, ticks: { color: muted }, title: { display: true, text: 'Pace (min/km)', color: muted } },
        y2: { position: 'right', ticks: { color: muted }, title: { display: true, text: 'Elevation (m)', color: muted }, grid: { drawOnChartArea: false } }
      }
    }
  });
}

function formatSeconds(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
function formatPace(minutesPerKm) {
  return formatSeconds(minutesPerKm * 60);
}

export function renderTable(splits, avgPace) {
  const tbody = document.querySelector('#splitTable tbody');
  tbody.innerHTML = '';
  const lastIndex = splits.length - 1;
  splits.forEach((s, i) => {
    const tr = document.createElement('tr');
    if (s.pace < avgPace * 0.95) tr.classList.add('fast');
    else if (s.pace > avgPace * 1.10) tr.classList.add('slow');
    const splitLabel = (i === lastIndex && s.endDist - s.startDist < 100)
      ? `${s.endDist.toFixed(0)}m (${(s.endDist - s.startDist).toFixed(0)}m)`
      : `${s.endDist.toFixed(0)}m`;
    tr.innerHTML = `<td>${splitLabel}</td><td>${s.time.toFixed(1)}</td><td>${formatPace(s.pace)}</td><td>${formatPace(s.gap)}</td><td>${s.elevDelta.toFixed(1)}</td><td>${s.grade.toFixed(1)}</td>`;
    tr.addEventListener('mouseenter', () => {
      if (chart) {
        chart.setActiveElements([{ datasetIndex: 0, index: s.split-1 }]);
        chart.tooltip.setActiveElements([{ datasetIndex: 0, index: s.split-1 }], { x: 0, y: 0 });
        chart.update();
      }
    });
    tbody.appendChild(tr);
  });
}

export function renderSummary(stats) {
  document.getElementById('s-dist').textContent = (stats.totalDist/1000).toFixed(2);
  document.getElementById('s-time').textContent = formatSeconds(stats.movingTime);
  document.getElementById('s-pace').textContent = formatPace(stats.avgPace);
  document.getElementById('s-gap').textContent = formatPace(stats.avgGap);
  document.getElementById('s-gain').textContent = stats.gain.toFixed(0);
  document.getElementById('s-cv').textContent = stats.cv.toFixed(1);
  const note = document.getElementById('filterNote');
  if (note) note.textContent = stats.filteredCount > 0
    ? `${stats.filteredCount} slow/outlier splits excluded from pace stats.`
    : 'No splits filtered.';
}

export function renderInsights(stats, splits) {
  const el = document.getElementById('insights');
  if (!el || !splits.length) return;
  const half = Math.floor(splits.length / 2);
  const first = splits.slice(0, half);
  const second = splits.slice(half);
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b.pace, 0) / arr.length : 0;
  const firstPace = avg(first);
  const secondPace = avg(second);
  const drift = firstPace ? ((secondPace - firstPace) / firstPace * 100) : 0;
  const uphill = splits.filter(s => s.grade > 2);
  const flatDown = splits.filter(s => s.grade <= 2);
  const upPace = avg(uphill);
  const flatPace = avg(flatDown);
  const fastest = splits.reduce((a, b) => b.pace < a.pace ? b : a, splits[0]);
  const slowest = splits.reduce((a, b) => b.pace > a.pace ? b : a, splits[0]);
  el.innerHTML = [
    `First half ${formatPace(firstPace)} vs second half ${formatPace(secondPace)} (${drift >= 0 ? '+' : ''}${drift.toFixed(1)}%).`,
    `Uphill avg ${formatPace(upPace)}; flat/downhill avg ${formatPace(flatPace)}.`,
    `Fastest split at ${fastest.endDist.toFixed(0)}m (${formatPace(fastest.pace)}), slowest at ${slowest.endDist.toFixed(0)}m (${formatPace(slowest.pace)}).`,
    stats.filteredCount > 0 ? `${stats.filteredCount} anomalies filtered.` : 'No anomalies filtered.'
  ].join(' ');
}
