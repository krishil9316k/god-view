// Ships near a point: listens to the AISStream feed for a few seconds and returns a snapshot.
// The key stays on the server.
function num(v, min, max, dflt) {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : dflt;
}

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  const key = String(process.env.AISSTREAM_KEY || '').trim();
  if (!key) return res.status(503).json({ error: 'Ships are not set up yet (AISSTREAM_KEY missing).', ships: [] });
  if (typeof WebSocket === 'undefined') return res.status(500).json({ error: 'Server has no WebSocket support.', ships: [] });
  const lat = num(req.query.lat, -90, 90, 21.5);
  const lon = num(req.query.lon, -180, 180, 70.5);
  const box = [[Math.max(-90, lat - 4), Math.max(-180, lon - 6)], [Math.min(90, lat + 4), Math.min(180, lon + 6)]];
  const ships = new Map();
  await new Promise((resolve) => {
    let ws;
    const done = () => { try { ws && ws.close(); } catch {} resolve(); };
    const timer = setTimeout(done, 6000);
    try {
      ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
      ws.onopen = () => ws.send(JSON.stringify({ APIKey: key, BoundingBoxes: [box], FilterMessageTypes: ['PositionReport'] }));
      ws.onmessage = async (ev) => {
        try {
          const text = typeof ev.data === 'string' ? ev.data : await new Response(ev.data).text();
          const m = JSON.parse(text);
          const meta = m.MetaData || {};
          const pr = (m.Message || {}).PositionReport || {};
          if (!Number.isFinite(meta.latitude) || !Number.isFinite(meta.longitude)) return;
          ships.set(meta.MMSI, {
            id: meta.MMSI,
            name: String(meta.ShipName || '').trim() || `MMSI ${meta.MMSI}`,
            lat: meta.latitude,
            lng: meta.longitude,
            speed: pr.Sog ?? null,
            heading: pr.TrueHeading ?? null,
          });
          if (ships.size >= 300) { clearTimeout(timer); done(); }
        } catch {}
      };
      ws.onerror = () => { clearTimeout(timer); done(); };
      ws.onclose = () => { clearTimeout(timer); resolve(); };
    } catch {
      clearTimeout(timer);
      done();
    }
  });
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  return res.status(200).json({ ships: [...ships.values()] });
}
