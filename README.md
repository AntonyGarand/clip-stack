# Clip Stack by Clipboard

Stack sliding cards, clip the overhang, and chase six perfect placements.
Built for Hack the North 2026.

**Play:** https://antonygarand.github.io/clip-stack/

## Browser game

Open the page and press **A** or **Space** to start and place a card.
**B** pauses, **S** restarts, and **Up/Down** change the lights.
The personal best is saved in this browser. The Clipboard logo opens in the
center and moves up into the title area.

## HTN OS badge mode

1. Use a badge running [HTN OS](https://solana-htn.com/badge/docs), connected to Wi-Fi.
2. Set an app key in the badge's settings.
3. Select **Use a badge**, enter its HTN-ID and app key, and connect.
4. Keep the page open. Play with the badge's **A/B** buttons or the page's controls.
5. **Home** or **Disconnect** returns the badge to its menu.

The page connects directly to the documented HTN OS app WebSocket. It does
not require a project backend or cross-origin REST requests. Keys stay in
memory and are sent only to the official badge service; they are never saved
in local storage. The input is cleared after connection. Each browser stores
its own best scores, with separate records for browser and badge play.

Every command is acknowledged and spaced at least 65 ms apart, below the
20 commands/second service limit. Moving cards need two rectangle commands.
Board changes pause movement until drawing finishes. Badge mode uses a slower
speed and scores the last acknowledged position, rather than a predicted frame.
Leaving the page pauses a running game; closing it sends a best-effort Home
command. Connection loss requires an explicit reconnect.

## Original badge firmware

The original Lua app is in [`native/`](./native). Its full bundle is available
as [a ZIP download](./assets/clip-stack-native.zip). It runs locally on the
original Hack the North firmware and does not need Wi-Fi or this page.
The Lua bundle cannot run under HTN OS. Flashing HTN OS replaces that firmware;
the flasher's erase option removes existing data.

The four files belong under `/littlefs/apps/clipboard_clip_stack/`.
Both `.bin` images are necessary. The main file and manifest alone do not
include the logo assets. The complete bundle is below Share's 48 KiB limit.

## Development

No build step or runtime dependencies:

```sh
npm test
npm start
```

Visit `http://127.0.0.1:4173`. GitHub Pages serves the repository root.
The tests cover collisions, perfect streaks, retries, pause/resume, bounded
state, rate limiting, reply correlation, and rendering cancellation. Browser
checks exercise the live UI and a simulated HTN OS socket. A physical HTN OS
badge is needed to measure end-to-end network latency and display behavior.

Brand artwork: https://clipboard.health/og-card.png
Protocol: https://solana-htn.com/badge/docs
