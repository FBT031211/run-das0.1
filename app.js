import { parseFile, makeSample } from './parser.js';
import { buildSplits, summaryStats } from './telemetryEngine.js';
import { renderChart, renderTable, renderSummary, renderInsights } from './charts.js';

let map = null, markers = [];
let currentSplits = null;
let currentPoints = null;
let currentStats = null;

function initMap() {
  if (map) return;
  map = L.map('map').setView([0,0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
}

function paceColor(pace, avgPace) {
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const danger = getComputedStyle(document.documentElement).getPropertyValue('--danger').trim();
  const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
  if (pace < avgPace * 0.95) return accent;
  if (pace > avgPace * 1.10) return danger;
  return muted;
}

function plotRoute(points, stats) {
  initMap();
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  map.eachLayer(layer => {
    if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) map.removeLayer(layer);
  });
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(points[i].lat - points[i-1].lat);
    const dLon = toRad(points[i].lon - points[i-1].lon);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(points[i-1].lat)) * Math.cos(toRad(points[i].lat)) * Math.sin(dLon/2)**2;
    cum.push(cum[i-1] + R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
  }
  const avgPace = stats.avgPace || 1;
  for (let i = 0; i < points.length - 1; i++) {
    const dist = cum[i];
    const splitIndex = Math.min(Math.floor(dist / 100), stats ? 0 : 0);
    const split = currentSplits && currentSplits[Math.min(splitIndex, currentSplits.length - 1)];
    const color = split ? paceColor(split.pace, avgPace) : getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const seg = L.polyline([[points[i].lat, points[i].lon], [points[i+1].lat, points[i+1].lon]], { color, weight: 3 }).addTo(map);
    markers.push(seg);
  }
  const start = L.circleMarker([points[0].lat, points[0].lon], { radius: 6, color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), fillColor: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), fillOpacity: 1 }).addTo(map);
  const finish = L.circleMarker([points[points.length-1].lat, points[points.length-1].lon], { radius: 6, color: getComputedStyle(document.documentElement).getPropertyValue('--danger').trim(), fillColor: getComputedStyle(document.documentElement).getPropertyValue('--danger').trim(), fillOpacity: 1 }).addTo(map);
  markers.push(start, finish);
  const bounds = L.latLngBounds(points.map(p => [p.lat, p.lon]));
  map.fitBounds(bounds);
}

async function handlePoints(points) {
  const splits = buildSplits(points);
  const stats = summaryStats(points, splits);
  currentSplits = splits;
  currentPoints = points;
  currentStats = stats;
  renderSummary(stats);
  renderChart(splits);
  renderTable(splits, stats.avgPace);
  renderInsights(stats, splits);
  plotRoute(points, stats);
}

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
document.getElementById('browseBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', async e => {
  e.preventDefault(); dropzone.classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (file) handlePoints(await parseFile(file));
});
fileInput.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (file) handlePoints(await parseFile(file));
});
document.getElementById('sampleBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  handlePoints(makeSample());
});

const themeToggle = document.getElementById('themeToggle');
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
  if (currentSplits) renderChart(currentSplits);
}
function initialTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
applyTheme(initialTheme());
themeToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', next);
  applyTheme(next);
  if (currentPoints) plotRoute(currentPoints, currentStats);
});