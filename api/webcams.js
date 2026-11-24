// Public webcams near a point (Windy Webcams API). The key stays on the server.
function num(v, min, max, dflt) {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : dflt;
}

export default async function handler(req, res) {
  const key = String(process.env.WINDY_KEY || '').trim();
  if (!key) return res.status(503).json({ error: 'Webcams are not set up yet (WINDY_KEY missing).', webcams: [] });
  const lat = num(req.query.lat, -90, 90, 21.5).toFixed(4);
  const lon = num(req.query.lon, -180, 180, 70.5).toFixed(4);
  const url = `https://api.windy.com/webcams/api/v3/webcams?nearby=${lat},${lon},250&limit=50&include=images,location,player`;
  try {
    const r = await fetch(url, { headers: { 'x-windy-api-key': key }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return res.status(502).json({ error: `Webcam service answered ${r.status}.`, webcams: [] });
    const d = await r.json();
    const webcams = (d.webcams || [])
      .filter((w) => w.location)
      .map((w) => {
        const p = w.player || {};
        const pick = (x) => (typeof x === 'string' ? x : x && x.embed) || null;
        return {
          id: w.webcamId,
          title: w.title,
          lat: w.location.latitude,
          lng: w.location.longitude,
          city: w.location.city || '',
          country: w.location.country || '',
          image: w.images?.current?.preview || w.images?.current?.thumbnail || null,
          player: pick(p.live) || pick(p.day) || null,
        };
      });
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    return res.status(200).json({ webcams });
  } catch {
    return res.status(502).json({ error: 'Webcam service did not answer.', webcams: [] });
  }
}
