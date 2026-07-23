# POP — Practice On Pause

A Chrome extension that watches for YouTube in-stream ads and pops up a
flashcard over the player so you can squeeze in a quick review while you
wait — no need to pause the video or leave the tab.

Built because I have a hard time sitting down to study on purpose, but
noticed I still remember ads even when I'm half-distracted on my phone.
This tries to use that same "low-effort, repetitive" ad-break window for
something more useful than an ad.

## How it works

- A content script watches the YouTube player element for the CSS classes
  YouTube adds/removes when an ad starts (`ad-showing`, `ad-interrupting`).
- When an ad starts, it shows a card pulled from your deck, weighted toward
  cards you've missed recently (simple 3-box Leitner system).
- Grade yourself "Got it" / "Missed it," and if the ad is still running,
  the next card appears automatically.
- When the ad ends, the overlay hides itself.

This only works on **YouTube**. Netflix and Hulu encrypt their video (DRM),
so a browser extension can't reliably detect ad state there — that's a
platform limitation, not something more code can fix.

## Install it (Chrome / Edge / Brave — any Chromium browser)

1. Clone or download this repo.
2. Go to `chrome://extensions`
3. Turn on **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `pop` folder
6. Pin the extension (puzzle-piece icon → pin) so it's easy to open

Not yet published on the Chrome Web Store — this is a prototype you load
locally for now.

## Add your own flashcards

Click the extension icon:
- Add cards one at a time, or
- Import from Quizlet — open your set → **...** menu → **Export** → keep
  "Tab" between term/definition and "New line" between cards → copy → paste
  into the import box. Comma- and dash-separated pastes also work.

## Try it

Open any YouTube video that runs ads, or use the **"Simulate ad break"**
button in the popup to test without needing a real one.

## Known limitations

- Ad detection relies on the player's current CSS class names — a future
  YouTube redesign could require a small update.
- Spaced repetition is session-based only right now — box resets track
  "seen this session," not calendar spacing across days.
- No live Quizlet API integration (their public API isn't currently open
  to new third-party apps) — import is manual/paste-based instead.

## Contributing

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for setup
steps and a list of good first areas to help with (calendar-based spaced
repetition is the biggest one).

## License

[MIT](LICENSE)
