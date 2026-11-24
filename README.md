# God View

**Live:** https://god-view-bay.vercel.app

The live Earth in 3D, built by [Krishil](https://www.ovrix.in).

- **Sharp satellite imagery** you can zoom down to street level (Esri World Imagery tiles), plus NASA's whole-Earth view from yesterday and the classic Blue Marble
- **Aircraft as 3D models:** airliners, 4-engine heavies, light aircraft and helicopters with spinning rotors, nav lights and contrails. Live ADS-B (adsb.lol, airplanes.live fallback). They glide smoothly between updates using their real speed and heading
- **Ships as 3D models:** container ships, tankers, passenger ships and small boats with wakes, picked from the AIS ship type (AISStream)
- **Webcams as 3D camera masts**, which open the live player (Windy Webcams)
- **Earthquakes as glowing beacons** sized and coloured by magnitude, with shockwave rings for M4+ (USGS, last 24 hours)
- Click anything for details. Aircraft show a real photo of that exact plane (Planespotters.net) and can be **followed**
- Loads automatically as you explore. Callsign and name labels appear when you zoom in
- **Fly to any city** (OpenStreetMap search)

All 3D models are made in code (`src/models.js`) and drawn with GPU instancing, so hundreds of planes stay smooth.
API keys never reach the browser: the page calls `/api/*` serverless functions on Vercel, which hold the keys.

## Build

`npm install && npm run build` bundles `src/` into `public/app.js` (Vercel does this on every push).

## Setup

Vercel → Project → Settings → Environment Variables:

| Name | Value |
|---|---|
| `WINDY_KEY` | your Windy Webcams API key |
| `AISSTREAM_KEY` | your aisstream.io API key |

Flights and earthquakes need no key.

For learning and fun; not for navigation.
