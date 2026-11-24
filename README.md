# God View

**Live:** https://god-view-bay.vercel.app

A live 3D Earth in one screen, built by [Krishil](https://www.ovrix.in).

- **Today's satellite view:** NASA GIBS (MODIS Terra true colour), full planet
- **Earthquakes:** USGS feed, past 24 hours, M2.5+, pulsing rings for M4.5+
- **Flights:** live ADS-B around wherever you look (adsb.lol, airplanes.live fallback)
- **Ships:** live AIS positions (AISStream), snapshot around the view
- **Webcams:** public cams with live players (Windy Webcams)
- **Fly to any city** (OpenStreetMap search)

API keys never reach the browser: the page calls `/api/*` serverless functions on Vercel, which hold the keys.

## Setup

Vercel → Project → Settings → Environment Variables:

| Name | Value |
|---|---|
| `WINDY_KEY` | your Windy Webcams API key |
| `AISSTREAM_KEY` | your aisstream.io API key |

Flights and earthquakes need no key.

For learning and fun; not for navigation.
