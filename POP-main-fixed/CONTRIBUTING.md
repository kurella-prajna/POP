# Contributing to POP

Thanks for wanting to help fine-tune this — it's a small side project, so
contributions of any size are genuinely useful, from a one-line fix to a
new feature.

## Getting set up locally

1. Fork this repo, then clone your fork.
2. Go to `chrome://extensions`, enable **Developer mode**, click
   **Load unpacked**, and select the cloned folder.
3. Make your changes.
4. Reload the extension in `chrome://extensions` after edits to
   `manifest.json`, `content.js`, or `background` code (popup-only changes
   just need the popup reopened).
5. On the YouTube tab, use the **"Simulate ad break"** button in the popup
   to test without needing a real ad to show up.

## Good first areas to help with

- **Calendar-based spaced repetition** — right now the Leitner boxes only
  track "seen this session." Making a card's box also respect real elapsed
  time (don't resurface a "learned" card for N days) is the single biggest
  quality improvement the project needs.
- **Ad-detection robustness** — right now it watches for YouTube's
  `ad-showing` / `ad-interrupting` classes. If YouTube changes these, or if
  you find edge cases (e.g. certain ad formats not triggering the overlay),
  fixes here are high-value.
- **Deck management** — folders/tags for organizing multiple subjects,
  editing existing cards (currently add/delete only), etc.
- **Import formats** — broader support beyond the current tab/comma/dash
  parsing (e.g. Anki `.apkg` export).

## Reporting bugs

Open an issue with:
- What you expected vs. what happened
- Browser + OS
- Console errors if any (right-click the YouTube page → Inspect → Console)

## Pull requests

- Keep PRs focused — one feature/fix per PR is easier to review than a
  bundle of unrelated changes.
- No build step or dependencies right now — it's plain JS/HTML/CSS, so
  there's nothing to compile before testing.
