# Monster Auction — Mobile PWA

A mobile-first, installable browser game for private multiplayer Pokémon auctions. Uses virtual coins only.

## Run locally

1. Install Node.js 18+.
2. In this folder run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000`.

For local multiplayer testing, open the URL on multiple devices connected to the same Wi-Fi (use your computer's LAN IP on the other devices). For friends outside your network, deploy this Node.js server to a host that supports persistent WebSocket connections, then open the HTTPS URL on mobile.

## Install on Android

1. Open the deployed HTTPS website in Chrome.
2. Tap the **Install app** prompt/button, or Chrome menu → **Install app** / **Add to Home screen**.
3. Launch Monster Auction from your home screen.

## Install on iPhone

1. Open the deployed HTTPS website in Safari.
2. Tap Share → **Add to Home Screen**.

## PWA details

- Web app manifest with standalone display and portrait orientation.
- App icons (192×192 and 512×512) and Apple touch icon.
- Service worker caches the app shell for repeat visits/offline shell access.
- Live auctions still require an internet connection and an active server.

## Gameplay

- Create a private room and share its six-character code.
- 2–8 players, 10,000 virtual coins each.
- Host starts a 10-round auction.
- Weighted rarity selection: Common 50%, Rare 30%, Epic 15%, Legendary 5%.
- 20-second auction; bids in the final 10 seconds extend it by 10 seconds.
- Minimum bid is the starting price, then increments of at least 100 coins.
- Highest bidder wins; no-bid Pokémon are UNSOLD.
- The next Pokémon appears automatically after five seconds.

## Important notes

- PWA installation requires HTTPS when deployed (localhost is exempt for development).
- Room state is in server memory and is cleared when the server restarts.
- The service worker caches only the app shell; multiplayer and Pokémon artwork require internet.
- This is an unofficial fan-made prototype, not affiliated with or endorsed by Nintendo, Game Freak, or The Pokémon Company. Pokémon names and artwork belong to their respective owners.
