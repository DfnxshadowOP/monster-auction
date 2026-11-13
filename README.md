# Monster Auction V0.5 — Mobile app setup

This package keeps the V0.4 web game and adds a Capacitor wrapper configuration for Android and iOS. The current game server remains hosted on Render; the native app connects to that online server, so friends can play together over the internet.

## Game scoring choice

The selected scoring system is one combined power score per Pokémon. The score must remain hidden from players throughout bidding and only be revealed after the final auction round. The final winner is the player with the highest sum of the power scores of all Pokémon they won.

## Web deployment

Keep using the existing Render service. The server's `npm start` command is unchanged. If you replace the GitHub `package.json`, run a new Render deploy after committing it.

## Android app build

Requirements: a computer with Node.js LTS, Android Studio, and Android SDK installed.

1. Extract this project and open a terminal in its folder.
2. Run `npm install`.
3. Run `npx cap add android` (only once).
4. Run `npx cap sync android`.
5. Run `npx cap open android`.
6. In Android Studio, test on a device/emulator. For a distributable APK: Build > Build Bundle(s) / APK(s) > Build APK(s). For Google Play, generate a signed Android App Bundle (AAB).

The Android app loads `https://monster-auction.onrender.com`; the Render service must be live and use HTTPS.

## iOS app build

Requirements: a Mac with Xcode and an Apple Developer account for TestFlight/App Store distribution.

1. On the Mac, run `npm install`.
2. Run `npx cap add ios` (only once).
3. Run `npx cap sync ios`.
4. Run `npx cap open ios`.
5. Configure signing in Xcode, test on an iPhone, then archive and distribute through TestFlight/App Store Connect.

An iOS IPA cannot be built or signed on Windows or Android. App Store approval is not guaranteed; Apple reviews app functionality and quality.

## Important notes

- This ZIP is the source project and mobile wrapper configuration, not a compiled APK or IPA.
- Do not commit signing keys, keystores, passwords, or Apple certificates to GitHub.
- Render's free service can sleep when idle. A server restart currently clears in-memory rooms; persistent storage and reconnect recovery are needed before production use.
- Pokémon names, artwork, and related marks belong to their respective rights holders. Review branding and distribution permissions before public commercial release.
