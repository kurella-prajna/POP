// POP web app — standalone flashcard engine with real calendar-based
// spaced repetition (unlike the session-only boxes in the extension version).

const STORAGE_KEY = "pop_deck_v1";
const DAY = 24 * 60 * 60 * 1000;

// Box -> days until next review, once a card is graded correct at that box.
const INTERVALS = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 16, 6: 30 };
const MAX_BOX = 6;

const DEFAULT_DECK = [
  mkCard("Mitochondria", "The organelle that produces ATP (cellular respiration)."),
  mkCard("Newton's 2nd Law", "F = ma"),
  mkCard("Photosynthesis equation", "6CO2 + 6H2O + light \u2192 C6H12O6 + 6O2"),
  mkCard("Capital of Australia", "Canberra (not Sydney!)"),
  mkCard("Derivative of sin(x)", "cos(x)"),
];

function mkCard(front, back) {
  return {
    id: "c" + Math.random().toString(36).slice(2, 10),
    front,
    back,
    box: 1,
    nextReview: Date.now(), // due immediately until first graded
  };
}

// ---------- storage ----------

function loadDeck() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  saveDeck(DEFAULT_DECK);
  return DEFAULT_DECK;
}

function saveDeck(deck) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(deck));
}

let deck = loadDeck();
let session = null; // { queue: [Card], total, done, currentCard }

// ---------- scheduling ----------

function dueCards(d) {
  const now = Date.now();
  return d.filter((c) => c.nextReview <= now);
}

function boxStatus(card) {
  const now = Date.now();
  if (card.nextReview <= now) return { label: "due", cls: "due" };
  if (card.box >= MAX_BOX) return { label: "mastered", cls: "mastered" };
  return { label: "learning", cls: "learning" };
}

function gradeCard(card, correct) {
  if (correct) {
    card.box = Math.min(MAX_BOX, card.box + 1);
    card.nextReview = Date.now() + INTERVALS[card.box] * DAY;
  } else {
    card.box = 1;
    card.nextReview = Date.now(); // stays due, will resurface in this session
  }
  saveDeck(deck);
}

// ---------- home view rendering ----------

function fmtDue(n) {
  return n === 0 ? "All caught up" : `${n} card${n === 1 ? "" : "s"} due`;
}

function renderHome() {
  const due = dueCards(deck);
  document.getElementById("stat-due").textContent = due.length;
  document.getElementById("stat-total").textContent = deck.length;
  const mastered = deck.filter((c) => c.box >= MAX_BOX).length;
  document.getElementById("stat-mastered").textContent = mastered;

  const startBtn = document.getElementById("start-review-btn");
  const subtext = document.getElementById("cta-sub");
  if (due.length > 0) {
    startBtn.textContent = `Review ${due.length} card${due.length === 1 ? "" : "s"}`;
    startBtn.disabled = false;
    subtext.textContent = "";
  } else if (deck.length > 0) {
    startBtn.textContent = "Review ahead (nothing due yet)";
    startBtn.disabled = false;
    subtext.textContent = "You're caught up \u2014 come back later, or review early anyway.";
  } else {
    startBtn.textContent = "Add cards to get started";
    startBtn.disabled = true;
    subtext.textContent = "";
  }

  renderDeckList();
}

function renderDeckList() {
  const list = document.getElementById("deck-list");
  list.innerHTML = "";
  deck
    .slice()
    .sort((a, b) => a.nextReview - b.nextReview)
    .forEach((card) => {
      const status = boxStatus(card);
      const row = document.createElement("div");
      row.className = "card-row";
      row.innerHTML = `
        <div>
          <div class="front">${escapeHtml(card.front)}</div>
          <div class="meta">${nextReviewLabel(card)}</div>
        </div>
        <div class="row-with-remove">
          <span class="box-pill ${status.cls}">${status.label}</span>
          <button class="remove-btn" data-id="${card.id}" title="Remove">\u00d7</button>
        </div>
      `;
      list.appendChild(row);
    });

  list.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      deck = deck.filter((c) => c.id !== btn.getAttribute("data-id"));
      saveDeck(deck);
      renderHome();
    });
  });
}

function nextReviewLabel(card) {
  const now = Date.now();
  if (card.nextReview <= now) return "due now";
  const days = Math.ceil((card.nextReview - now) / DAY);
  return `next review in ${days} day${days === 1 ? "" : "s"}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- review session ----------

function startReview() {
  let queue = dueCards(deck);
  if (queue.length === 0) queue = deck.slice(); // review-ahead fallback
  if (queue.length === 0) return;

  session = {
    queue: shuffle(queue.slice()),
    total: queue.length,
    done: 0,
  };

  document.getElementById("home-view").classList.add("hidden");
  document.getElementById("review-view").style.display = "flex";
  showNextCard();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function showNextCard() {
  if (session.queue.length === 0) {
    endReview();
    return;
  }
  const card = session.queue.shift();
  session.currentCard = card;

  document.getElementById("flash-front").textContent = card.front;
  const back = document.getElementById("flash-back");
  back.textContent = card.back;
  back.style.display = "none";
  document.getElementById("reveal-row").style.display = "block";
  document.getElementById("grade-row").style.display = "none";

  const pct = Math.round((session.done / session.total) * 100);
  document.getElementById("progress-fill").style.width = pct + "%";
  document.getElementById("progress-count").textContent = `${session.done}/${session.total}`;

  // re-trigger the pop animation
  const cardEl = document.getElementById("flash-card");
  cardEl.style.animation = "none";
  void cardEl.offsetWidth;
  cardEl.style.animation = "";
}

function revealAnswer() {
  document.getElementById("flash-back").style.display = "block";
  document.getElementById("reveal-row").style.display = "none";
  document.getElementById("grade-row").style.display = "flex";
}

function handleGrade(correct) {
  gradeCard(session.currentCard, correct);
  if (correct) session.done++;
  else {
    session.queue.push(session.currentCard); // missed cards resurface later in the same session
    session.total++;
  }
  showNextCard();
}

function endReview() {
  document.getElementById("review-view").style.display = "none";
  document.getElementById("home-view").classList.remove("hidden");
  session = null;
  renderHome();
}

// ---------- add / import ----------

function addCard(front, back) {
  if (!front.trim() || !back.trim()) return;
  deck.push(mkCard(front.trim(), back.trim()));
  saveDeck(deck);
  renderHome();
}

function parseLine(line) {
  let front, back;
  if (line.includes("\t")) {
    const parts = line.split("\t");
    front = parts[0];
    back = parts.slice(1).join(" ");
  } else if (line.includes(" - ")) {
    const idx = line.indexOf(" - ");
    front = line.slice(0, idx);
    back = line.slice(idx + 3);
  } else if (line.includes(",")) {
    const idx = line.indexOf(",");
    front = line.slice(0, idx);
    back = line.slice(idx + 1);
  } else {
    return null;
  }
  front = stripQuotes(front.trim());
  back = stripQuotes(back.trim());
  if (!front || !back) return null;
  return { front, back };
}

function stripQuotes(str) {
  if (str.length >= 2 && str.startsWith('"') && str.endsWith('"')) {
    return str.slice(1, -1).trim();
  }
  return str;
}

function importLines(raw) {
  let added = 0;
  raw.split("\n").forEach((line) => {
    if (!line.trim()) return;
    const parsed = parseLine(line);
    if (parsed) {
      deck.push(mkCard(parsed.front, parsed.back));
      added++;
    }
  });
  saveDeck(deck);
  renderHome();
  return added;
}

// ---------- wire up UI ----------

document.addEventListener("DOMContentLoaded", () => {
  renderHome();

  document.getElementById("start-review-btn").addEventListener("click", startReview);
  document.getElementById("exit-review-btn").addEventListener("click", endReview);
  document.getElementById("reveal-btn").addEventListener("click", revealAnswer);
  document.getElementById("hit-btn").addEventListener("click", () => handleGrade(true));
  document.getElementById("miss-btn").addEventListener("click", () => handleGrade(false));

  document.getElementById("add-btn").addEventListener("click", () => {
    const front = document.getElementById("front-input");
    const back = document.getElementById("back-input");
    addCard(front.value, back.value);
    front.value = "";
    back.value = "";
  });

  document.getElementById("import-btn").addEventListener("click", () => {
    const box = document.getElementById("import-input");
    const added = importLines(box.value);
    box.value = "";
    if (added === 0) alert("Couldn't find any term/definition pairs \u2014 check the format.");
  });

  // tabs
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
      document.getElementById(tab.dataset.target).classList.remove("hidden");
    });
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
});
