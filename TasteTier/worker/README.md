# TasteTier link previews

A Cloudflare Worker that turns a pasted link into a name and photo for a TasteTier card.

- `GET /preview?url=<link>` returns `{ title, image, siteName, url, source }`.
- `GET /image?url=<image>` returns the image with CORS headers so the app can shrink it into a thumbnail.

Only pages served from `https://jasonphe.github.io` or `localhost` may call it (see `ALLOWED_ORIGINS` in `index.js`).

## What each kind of link gets

| Link | Name | Photo |
|---|---|---|
| Restaurant website | From its Open Graph tags or page title | Its `og:image`, often a food photo or logo |
| Google Maps | From the place name in the link (short `maps.app.goo.gl` links are expanded first) | Only with a Places API key (below) |
| Yelp | Yelp blocks server requests, so the app uses the name from the link | None |

## Run it locally

```bash
npx wrangler dev --port 8787
```

Then serve the site (`python -m http.server 8766` from the repo root) and open http://localhost:8766/TasteTier/. On localhost the app talks to `http://localhost:8787` automatically.

## Deploy

1. Sign in to Cloudflare (a free account is enough): `npx wrangler login`
2. Deploy from this folder: `npx wrangler deploy`
3. Copy the `https://tastetier-preview.<your-subdomain>.workers.dev` URL it prints into `DEPLOYED_PREVIEW_API` near the top of the script in `../index.html`, then commit and push.

You can also test a deployed build of the app against a different worker by adding `?api=<worker url>` to the page URL.

## Optional: photos for Google Maps links

1. In Google Cloud, enable **Places API (New)** and create an API key restricted to that API.
2. `npx wrangler secret put GOOGLE_PLACES_KEY`

Google bills Places calls beyond a free monthly allowance, and its terms limit storing place photos and require showing who took them. The app shows the photographer's name in the card's edit dialog, but it does save the thumbnail in the browser, so read the current Places terms before relying on this for more than personal use.
