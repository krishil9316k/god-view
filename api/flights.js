// Live aircraft near a point. Free community ADS-B feeds, no key needed.
const SOURCES = [
  (lat, lon, nm) => `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${nm}`,
  (lat, lon, nm) => `https://api.airplanes.live/v2/point/${lat}/${lon}/${nm}`,
];

function num(v, min, max, dflt) {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : dflt;
}

export default async function handler(req, res) {
  const lat = num(req.query.lat, -90, 90, 21.5).toFixed(3);
  const lon = num(req.query.lon, -180, 180, 70.5).toFixed(3);
  const nm = Math.round(num(req.query.nm, 10, 250, 250));
  for (const src of SOURCES) {
    try {
      const r = await fetch(src(lat, lon, nm), { signal: AbortSignal.timeout(7000), headers: { 'user-agent': 'god-view (portfolio project)' } });
      if (!r.ok) continue;
      const d = await r.json();
      const flights = (d.ac || d.aircraft || [])
        .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon))
        .slice(0, 400)
        .map((a) => ({
          id: a.hex,
          call: (a.flight || '').trim() || a.r || a.hex,
          type: a.t || null,
          reg: a.r || null,
          cat: a.category || null,
          lat: a.lat,
          lng: a.lon,
          alt: typeof a.alt_baro === 'number' ? a.alt_baro : 0,
          ground: a.alt_baro === 'ground',
          speed: a.gs ?? null,
          heading: a.track ?? a.true_heading ?? a.mag_heading ?? null,
          vrate: a.baro_rate ?? a.geom_rate ?? null,
          age: Number.isFinite(a.seen_pos) ? a.seen_pos : (Number.isFinite(a.seen) ? a.seen : 0),
        }));
      res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=40');
      return res.status(200).json({ flights });
    } catch {
      // try the next source
    }
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(502).json({ error: 'Flight feeds are not answering right now.', flights: [] });
}
