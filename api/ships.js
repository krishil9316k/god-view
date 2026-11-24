// Ships near a point: listens to the AISStream feed for a few seconds and returns a snapshot.
// The key stays on the server.
function num(v, min, max, dflt) {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : dflt;
}

// AIS ship type code -> model family used by the 3D view.
function describe(k) {
  if (!k) return { kind: 'cargo' };
  const t = Number(k.type) || 0;
  let kind = 'cargo';
  if (t >= 60 && t < 70) kind = 'passenger';
  else if (t >= 80 && t < 90) kind = 'tanker';
  else if (t >= 70 && t < 80) kind = 'cargo';
  else if (t === 30 || t === 31 || t === 32 || t === 36 || t === 37 || (t >= 50 && t < 60)) kind = 'small';
  return { kind, len: k.len || null, dest: k.dest || null, typeCode: t || null };
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
  const kinds = new Map();
  const dbg = { opened: false, messages: 0, errors: [], close: null };
  await new Promise((resolve) => {
    let ws;
    const done = () => { try { ws && ws.close(); } catch {} resolve(); };
    const timer = setTimeout(done, 6000);
    try {
      ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
      ws.onopen = () => { dbg.opened = true; ws.send(JSON.stringify({ APIKey: key, BoundingBoxes: [box], FilterMessageTypes: ['PositionReport', 'ShipStaticData', 'StandardClassBPositionReport'] })); };
      ws.onmessage = async (ev) => {
        try {
          const text = typeof ev.data === 'string' ? ev.data : await new Response(ev.data).text();
          const m = JSON.parse(text);
          dbg.messages++;
          if (m.error) dbg.errors.push(String(m.error).slice(0, 200));
          const meta = m.MetaData || {};
          const msg = m.Message || {};
          if (msg.ShipStaticData) {
            const st = msg.ShipStaticData;
            const dim = st.Dimension || {};
            kinds.set(meta.MMSI, { type: st.Type, len: (dim.A || 0) + (dim.B || 0), dest: String(st.Destination || '').trim() });
            const s = ships.get(meta.MMSI);
            if (s) Object.assign(s, describe(kinds.get(meta.MMSI)));
            return;
          }
          const pr = msg.PositionReport || msg.StandardClassBPositionReport || {};
          if (!Number.isFinite(meta.latitude) || !Number.isFinite(meta.longitude)) return;
          const hdg = Number.isFinite(pr.TrueHeading) && pr.TrueHeading < 360 ? pr.TrueHeading : (Number.isFinite(pr.Cog) && pr.Cog < 360 ? pr.Cog : null);
          ships.set(meta.MMSI, {
            id: meta.MMSI,
            name: String(meta.ShipName || '').trim() || `MMSI ${meta.MMSI}`,
            lat: meta.latitude,
            lng: meta.longitude,
            speed: Number.isFinite(pr.Sog) && pr.Sog < 102 ? pr.Sog : null,
            heading: hdg,
            ...describe(kinds.get(meta.MMSI)),
          });
          if (ships.size >= 300) { clearTimeout(timer); done(); }
        } catch (e) { if (dbg.errors.length < 3) dbg.errors.push(String(e).slice(0, 200)); }
      };
      ws.onerror = (e) => { dbg.errors.push('socket error: ' + String(e && (e.message || e.type)).slice(0, 200)); clearTimeout(timer); done(); };
      ws.onclose = (e) => { dbg.close = [e.code, String(e.reason || '').slice(0, 200)]; clearTimeout(timer); resolve(); };
    } catch {
      clearTimeout(timer);
      done();
    }
  });
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  const out = { ships: [...ships.values()] };
  if (req.query.debug === '1') { out.debug = dbg; res.setHeader('Cache-Control', 'no-store'); }
  return res.status(200).json(out);
}
