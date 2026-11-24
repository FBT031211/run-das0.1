export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function smoothElevation(pts, w = 5) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - Math.floor(w/2)); j <= Math.min(pts.length-1, i + Math.floor(w/2)); j++) {
      s += pts[j].ele; c++;
    }
    out.push({ ...pts[i], ele: s / c });
  }
  return out;
}

export function buildSplits(points) {
  const pts = smoothElevation(points, 5);
  // cumulative distance
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i-1] + haversine(pts[i-1].lat, pts[i-1].lon, pts[i].lat, pts[i].lon));
  }
  const total = cum[cum.length-1];
  const bucketSize = 100;
  const numBuckets = Math.ceil(total / bucketSize);
  const splits = [];
  let idx = 0;
  for (let b = 0; b < numBuckets; b++) {
    const startDist = b * bucketSize;
    const endDist = Math.min((b+1) * bucketSize, total);
    if (endDist - startDist < 1) continue;
    // find start/end times via interpolation
    const tStart = interpTime(pts, cum, startDist);
    const tEnd = interpTime(pts, cum, endDist);
    const eleStart = interpEle(pts, cum, startDist);
    const eleEnd = interpEle(pts, cum, endDist);
    const timeSec = (tEnd - tStart) / 1000;
    const distKm = (endDist - startDist) / 1000;
    const pace = distKm > 0 ? timeSec / 60 / distKm : 0; // min/km
    const grade = (endDist - startDist) > 0 ? (eleEnd - eleStart) / (endDist - startDist) * 100 : 0;
    const gap = pace * (1 + 0.04 * grade); // Minetti approx
    const hr = interpVal(pts, cum, (startDist+endDist)/2, 'hr');
    splits.push({
      split: b+1,
      startDist, endDist,
      time: timeSec,
      pace, gap,       elevDelta: eleEnd - eleStart, endElev: eleEnd, grade, hr
    });
  }
  return splits;
}

function interpTime(pts, cum, d) {
  if (d <= 0) return pts[0].time;
  if (d >= cum[cum.length-1]) return pts[pts.length-1].time;
  let i = 0;
  while (i < cum.length-1 && cum[i+1] < d) i++;
  const t = (d - cum[i]) / (cum[i+1] - cum[i]);
  return pts[i].time + (pts[i+1].time - pts[i].time) * t;
}
function interpEle(pts, cum, d) {
  if (d <= 0) return pts[0].ele;
  if (d >= cum[cum.length-1]) return pts[pts.length-1].ele;
  let i = 0;
  while (i < cum.length-1 && cum[i+1] < d) i++;
  const t = (d - cum[i]) / (cum[i+1] - cum[i]);
  return pts[i].ele + (pts[i+1].ele - pts[i].ele) * t;
}
function interpVal(pts, cum, d, key) {
  if (!pts[0][key] && pts[0][key] !== 0) return null;
  if (d <= 0) return pts[0][key];
  if (d >= cum[cum.length-1]) return pts[pts.length-1][key];
  let i = 0;
  while (i < cum.length-1 && cum[i+1] < d) i++;
  const t = (d - cum[i]) / (cum[i+1] - cum[i]);
  const a = pts[i][key], b = pts[i+1][key];
  if (a == null || b == null) return a ?? b;
  return a + (b - a) * t;
}

export function summaryStats(points, splits) {
  const pts = smoothElevation(points, 5);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i-1] + haversine(pts[i-1].lat, pts[i-1].lon, pts[i].lat, pts[i].lon));
  const totalDist = cum[cum.length-1];
  const movingTime = (pts[pts.length-1].time - pts[0].time) / 1000;
  let gain = 0, loss = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = pts[i].ele - pts[i-1].ele;
    if (d > 0) gain += d; else loss += -d;
  }
  const splitTimes = splits.map(s => s.time).filter(t => t > 0);
  const avgSplitTime = splitTimes.length ? splitTimes.reduce((a, b) => a + b, 0) / splitTimes.length : 0;
  const included = splits.filter(s => {
    const speed = s.time > 0 ? (s.endDist - s.startDist) / s.time : 0;
    return speed >= 1.5 && s.time <= avgSplitTime * 2;
  });
  const paces = included.map(s => s.pace).filter(p => p > 0);
  const mean = paces.length ? paces.reduce((a, b) => a + b, 0) / paces.length : 0;
  const variance = paces.length ? paces.reduce((a, b) => a + (b - mean) ** 2, 0) / paces.length : 0;
  const cv = mean ? (Math.sqrt(variance) / mean * 100) : 0;
  const avgPace = totalDist > 0 ? (movingTime / 60) / (totalDist / 1000) : 0;
  const filteredAvgPace = included.length ? (included.reduce((a, b) => a + b.time, 0) / 60) / (included.reduce((a, b) => a + (b.endDist - b.startDist), 0) / 1000) : avgPace;
  const avgGap = splits.reduce((a, b) => a + b.gap, 0) / splits.length;
  return { totalDist, movingTime, gain, loss, avgPace: filteredAvgPace, avgGap, cv, filteredCount: splits.length - included.length, includedCount: included.length };
}
