export async function parseFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.gpx')) return parseGpx(await file.text());
  if (name.endsWith('.fit')) return parseFit(await file.arrayBuffer());
  throw new Error('Unsupported file type');
}

export function parseGpx(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const trkpts = doc.querySelectorAll('trkpt');
  const pts = [];
  trkpts.forEach(tp => {
    const lat = parseFloat(tp.getAttribute('lat'));
    const lon = parseFloat(tp.getAttribute('lon'));
    const eleEl = tp.querySelector('ele');
    const timeEl = tp.querySelector('time');
    const hrEl = tp.querySelector('hr, HeartRateBpm value, heartrate');
    const cadEl = tp.querySelector('cad, cadence');
    pts.push({
      time: timeEl ? new Date(timeEl.textContent).getTime() : null,
      lat, lon,
      ele: eleEl ? parseFloat(eleEl.textContent) : 0,
      hr: hrEl ? parseFloat(hrEl.textContent) : null,
      cad: cadEl ? parseFloat(cadEl.textContent) : null
    });
  });
  return pts.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

export function parseFit(buffer) {
  return new Promise((resolve, reject) => {
    const parser = new window.FitParser({ force: true });
    parser.parse(buffer, (err, data) => {
      if (err) return reject(err);
      const records = data?.records || [];
      const pts = records.map(r => ({
        time: r.timestamp ? new Date(r.timestamp).getTime() : null,
        lat: r.position_lat != null ? r.position_lat * (180/Math.pow(2,31)) : null,
        lon: r.position_long != null ? r.position_long * (180/Math.pow(2,31)) : null,
        ele: r.altitude ?? r.enhanced_altitude ?? 0,
        hr: r.heart_rate ?? null,
        cad: r.cadence ?? null
      })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      resolve(pts);
    });
  });
}

export function makeSample() {
  const pts = [];
  const start = Date.now();
  let lat = -6.2, lon = 106.8, ele = 50;
  let dist = 0;
  // ~3km
  for (let i = 0; i <= 300; i++) {
    const t = start + i * 1000 * (6/60*60/1000? 0 : 1); // ~1s per 10m approx
    lat += 0.00009;
    lon += 0.00009;
    ele += Math.sin(i/20) * 0.5 + (Math.random()-0.5)*0.3;
    dist += 10;
    pts.push({ time: start + i*1000, lat, lon, ele, hr: 150 + Math.round(Math.random()*10), cad: 170 + Math.round(Math.random()*5) });
  }
  return pts;
}
