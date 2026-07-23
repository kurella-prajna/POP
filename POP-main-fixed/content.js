// POP (Practice On Pause) — content script
// Detects YouTube in-stream ad playback and shows a flashcard overlay
// on top of the player for the duration of the ad.

const DEFAULT_DECK = [
  { id: "d1", front: "Mitochondria", back: "The organelle that produces ATP (cellular respiration).", box: 1, lastSeen: 0 },
  { id: "d2", front: "Newton's 2nd Law", back: "F = ma", box: 1, lastSeen: 0 },
  { id: "d3", front: "Photosynthesis equation", back: "6CO2 + 6H2O + light → C6H12O6 + 6O2", box: 1, lastSeen: 0 },
  { id: "d4", front: "Capital of Australia", back: "Canberra (not Sydney!)", box: 1, lastSeen: 0 },
  { id: "d5", front: "Derivative of sin(x)", back: "cos(x)", box: 1, lastSeen: 0 },
];

let deck = [];
let currentCard = null;
let overlayEl = null;
let playerEl = null;
let observer = null;
let pollTimer = null;
let adActive = false;

// ---------- storage ----------

async function loadDeck() {
  const stored = await chrome.storage.local.get("deck");
  if (stored.deck && Array.isArray(stored.deck) && stored.deck.length > 0) {
    deck = stored.deck;
  } else {
    deck = DEFAULT_DECK;
    await chrome.storage.local.set({ deck });
  }
}

async function saveDeck() {
  await chrome.storage.local.set({ deck });
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA + "T00:00:00Z");
  const b = new Date(isoB + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}

// Bumping the streak counts ANY engagement — ad-triggered or a manual
// "study now" session — since POP usage naturally depends on whether
// someone happened to watch a video with ads that day.
function bumpStreak(stats) {
  if (!stats.streak) stats.streak = { count: 0, lastDate: null };
  const today = isoDate(new Date());
  if (stats.streak.lastDate === today) return; // already active today
  const diff = stats.streak.lastDate ? daysBetween(stats.streak.lastDate, today) : null;
  stats.streak.count = diff === 1 ? stats.streak.count + 1 : 1;
  stats.streak.lastDate = today;
}

let adBreakCountedThisSession = false;

async function bumpStats(correct, fromAdBreak) {
  const stored = await chrome.storage.local.get("stats");
  const stats = stored.stats || { reviews: 0, correct: 0, streak: { count: 0, lastDate: null }, adBreaksRepped: 0 };
  stats.reviews += 1;
  if (correct) stats.correct += 1;
  bumpStreak(stats);

  // Lifetime "ad breaks turned into reps" counter — counts once per ad
  // break (not per card), and never decreases. It's a pure achievement stat.
  if (fromAdBreak && !adBreakCountedThisSession) {
    stats.adBreaksRepped = (stats.adBreaksRepped || 0) + 1;
    adBreakCountedThisSession = true;
  }

  await chrome.storage.local.set({ stats });
}

// ---------- card selection (simple Leitner-style weighting) ----------

function pickCard() {
  if (deck.length === 0) return null;
  // Weight lower boxes (less well-known cards) more heavily.
  const weighted = [];
  deck.forEach((card) => {
    const weight = card.box >= 3 ? 1 : card.box === 2 ? 3 : 5;
    for (let i = 0; i < weight; i++) weighted.push(card);
  });
  return weighted[Math.floor(Math.random() * weighted.length)];
}

function gradeCard(card, correct) {
  if (correct) {
    card.box = Math.min(3, card.box + 1);
  } else {
    card.box = 1;
  }
  card.lastSeen = Date.now();
  saveDeck();
  bumpStats(correct, adActive);
}

// ---------- overlay UI ----------

function buildOverlay() {
  const el = document.createElement("div");
  el.id = "abf-overlay";
  el.innerHTML = `
    <div class="abf-card" id="abf-card">
      <div class="abf-header">
        <span class="abf-badge">POP · quick review</span>
        <button class="abf-close" id="abf-close" title="Hide">×</button>
      </div>
      <div class="abf-front" id="abf-front"></div>
      <div class="abf-back" id="abf-back" style="display:none;"></div>
      <div class="abf-actions" id="abf-reveal-row">
        <button class="abf-btn abf-btn-primary" id="abf-reveal">Reveal answer</button>
      </div>
      <div class="abf-actions" id="abf-grade-row" style="display:none;">
        <button class="abf-btn abf-btn-miss" id="abf-miss">Missed it</button>
        <button class="abf-btn abf-btn-hit" id="abf-hit">Got it</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  el.querySelector("#abf-close").addEventListener("click", () => {
    el.style.display = "none";
  });
  el.querySelector("#abf-reveal").addEventListener("click", revealAnswer);
  el.querySelector("#abf-hit").addEventListener("click", () => handleGrade(true));
  el.querySelector("#abf-miss").addEventListener("click", () => handleGrade(false));

  return el;
}

function showNewCard() {
  currentCard = pickCard();
  if (!currentCard) return;
  overlayEl.querySelector("#abf-front").textContent = currentCard.front;
  overlayEl.querySelector("#abf-back").textContent = currentCard.back;
  overlayEl.querySelector("#abf-back").style.display = "none";
  overlayEl.querySelector("#abf-reveal-row").style.display = "flex";
  overlayEl.querySelector("#abf-grade-row").style.display = "none";
  overlayEl.style.display = "block";
}

function revealAnswer() {
  overlayEl.querySelector("#abf-back").style.display = "block";
  overlayEl.querySelector("#abf-reveal-row").style.display = "none";
  overlayEl.querySelector("#abf-grade-row").style.display = "flex";
}

function handleGrade(correct) {
  if (currentCard) gradeCard(currentCard, correct);
  if (adActive) {
    showNewCard(); // keep practicing if the ad is still running
  } else {
    overlayEl.style.display = "none";
  }
}

function hideOverlay() {
  if (overlayEl) overlayEl.style.display = "none";
}

// ---------- ad detection ----------

function isAdShowing(player) {
  if (!player) return false;
  const cls = player.className || "";
  if (cls.includes("ad-showing") || cls.includes("ad-interrupting")) return true;
  // Fallbacks: some ad formats don't set those classes on the player itself,
  // but always render one of these UI elements while an ad is active.
  if (document.querySelector(".ytp-ad-player-overlay")) return true;
  if (document.querySelector(".video-ads.ytp-ad-module .ytp-ad-text")) return true;
  if (document.querySelector(".ytp-ad-skip-button, .ytp-ad-skip-button-modern")) return true;
  if (document.querySelector(".ytp-ad-preview-container")) return true;
  return false;
}

let hideTimer = null;

function onAdStateChange(showing) {
  if (showing) {
    // ad confirmed on: cancel any pending hide and show immediately
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (adActive) return; // already showing, nothing to do
    adActive = true;
    adBreakCountedThisSession = false;
    if (!overlayEl) overlayEl = buildOverlay();
    showNewCard();
  } else {
    if (!adActive || hideTimer) return; // already hidden, or already waiting to hide
    // Don't hide immediately — a multi-ad pod often has a brief gap between
    // ads where the class briefly disappears before the next ad starts.
    hideTimer = setTimeout(() => {
      adActive = false;
      hideTimer = null;
      hideOverlay();
    }, 700);
  }
}

function attachObserver(player) {
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    onAdStateChange(isAdShowing(player));
  });
  observer.observe(player, { attributes: true, attributeFilter: ["class"] });
  // check immediate state too
  onAdStateChange(isAdShowing(player));

  // Polling safety net: some ad formats change the DOM in ways the observer
  // above can miss (e.g. elements swapped outside the observed subtree).
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    onAdStateChange(isAdShowing(player));
  }, 700);
}

function findPlayerAndAttach() {
  const player = document.getElementById("movie_player");
  if (player && player !== playerEl) {
    playerEl = player;
    attachObserver(player);
  }
}

function init() {
  loadDeck().then(() => {
    findPlayerAndAttach();
    // Player may not exist yet on first load; poll briefly until it appears.
    const poll = setInterval(() => {
      if (document.getElementById("movie_player")) {
        findPlayerAndAttach();
        clearInterval(poll);
      }
    }, 500);
  });
}

// Manual test trigger from the popup (useful when no real ad is available).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "abf-simulate-ad") {
    loadDeck().then(() => {
      if (!overlayEl) overlayEl = buildOverlay();
      adActive = true;
      adBreakCountedThisSession = false;
      showNewCard();
      // auto-hide after 15s like a short ad, unless a real ad state overrides it
      setTimeout(() => {
        if (adActive) onAdStateChange(false);
      }, 15000);
    });
    sendResponse({ ok: true });
  }
  return true;
});

// YouTube is a single-page app; re-check the player on navigation.
document.addEventListener("yt-navigate-finish", () => {
  playerEl = null;
  setTimeout(findPlayerAndAttach, 500);
});

init();
