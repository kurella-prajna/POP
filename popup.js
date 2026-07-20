async function getDeck() {
  const { deck } = await chrome.storage.local.get("deck");
  return deck || [];
}

async function setDeck(deck) {
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

// Same streak rule used in content.js: any engagement (ad-triggered or a
// manual study session) keeps the streak alive.
function bumpStreak(stats) {
  if (!stats.streak) stats.streak = { count: 0, lastDate: null };
  const today = isoDate(new Date());
  if (stats.streak.lastDate === today) return;
  const diff = stats.streak.lastDate ? daysBetween(stats.streak.lastDate, today) : null;
  stats.streak.count = diff === 1 ? stats.streak.count + 1 : 1;
  stats.streak.lastDate = today;
}

// For display: don't wait for the next rep to reflect a broken streak —
// show it as already broken (but don't touch storage until they act).
function displayStreak(stats) {
  const streak = (stats && stats.streak) || { count: 0, lastDate: null };
  if (!streak.lastDate) return { count: 0, atRisk: false };
  const today = isoDate(new Date());
  const diff = daysBetween(streak.lastDate, today);
  if (diff <= 0) return { count: streak.count, atRisk: false };
  if (diff === 1) return { count: streak.count, atRisk: true }; // one-day warning
  return { count: 0, atRisk: false }; // streak broken
}

async function refreshStats() {
  const { stats } = await chrome.storage.local.get("stats");
  const s = stats || { reviews: 0, correct: 0, streak: { count: 0, lastDate: null }, adBreaksRepped: 0 };
  document.getElementById("abf-adbreaks").textContent = s.adBreaksRepped || 0;
  document.getElementById("abf-accuracy").textContent =
    s.reviews > 0 ? Math.round((s.correct / s.reviews) * 100) + "%" : "—";

  const ds = displayStreak(s);
  document.getElementById("abf-streak").textContent = `🔥 ${ds.count} day streak`;

  const warningEl = document.getElementById("abf-warning");
  if (ds.atRisk) {
    warningEl.style.display = "block";
    warningEl.textContent = "⚠️ Streak at risk — study now to keep it alive.";
  } else {
    warningEl.style.display = "none";
  }
}

function boxLabel(box) {
  return box === 3 ? "popped" : box === 2 ? "bubble" : "fizz";
}

async function refreshBoxCounts() {
  const deck = await getDeck();
  const counts = { 1: 0, 2: 0, 3: 0 };
  deck.forEach((c) => { counts[c.box] = (counts[c.box] || 0) + 1; });
  document.getElementById("abf-box-fizz").textContent = counts[1];
  document.getElementById("abf-box-bubble").textContent = counts[2];
  document.getElementById("abf-box-popped").textContent = counts[3];
}

async function refreshList() {
  const deck = await getDeck();
  document.getElementById("abf-count").textContent = deck.length;
  refreshBoxCounts();
  const list = document.getElementById("abf-list");
  list.innerHTML = "";
  deck
    .slice()
    .reverse()
    .forEach((card) => {
      const row = document.createElement("div");
      row.className = "abf-item";
      row.innerHTML = `
        <span>${escapeHtml(card.front)}</span>
        <span class="box">${boxLabel(card.box)}
          <button class="abf-remove" data-id="${card.id}" title="Remove">×</button>
        </span>
      `;
      list.appendChild(row);
    });

  list.querySelectorAll(".abf-remove").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.getAttribute("data-id");
      const deck = (await getDeck()).filter((c) => c.id !== id);
      await setDeck(deck);
      refreshList();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function makeId() {
  return "c" + Math.random().toString(36).slice(2, 10);
}

document.getElementById("abf-add-btn").addEventListener("click", async () => {
  const front = document.getElementById("abf-front-input").value.trim();
  const back = document.getElementById("abf-back-input").value.trim();
  if (!front || !back) return;
  const deck = await getDeck();
  deck.push({ id: makeId(), front, back, box: 1, lastSeen: 0 });
  await setDeck(deck);
  document.getElementById("abf-front-input").value = "";
  document.getElementById("abf-back-input").value = "";
  refreshList();
});

document.getElementById("abf-import-btn").addEventListener("click", async () => {
  const raw = document.getElementById("abf-import").value;
  if (!raw.trim()) return;
  const deck = await getDeck();
  let added = 0;
  raw.split("\n").forEach((line) => {
    if (!line.trim()) return;
    const parsed = parseLine(line);
    if (parsed) {
      deck.push({ id: makeId(), front: parsed.front, back: parsed.back, box: 1, lastSeen: 0 });
      added++;
    }
  });
  await setDeck(deck);
  document.getElementById("abf-import").value = "";
  refreshList();
  if (added === 0) {
    alert("Couldn't find any term/definition pairs. Make sure each line has a tab, comma, or dash between the two.");
  }
});

// Handles Quizlet's plain-text export format (tab-separated by default),
// as well as comma- or dash-separated pastes, and strips wrapping quotes.
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

// ---------- Study now (manual session, adjustable goal) ----------

let sessionGoal = 10;
let sessionProgress = 0;
let sessionCard = null;
let sessionActive = false;

function pickSessionCard(deck) {
  if (deck.length === 0) return null;
  const weighted = [];
  deck.forEach((card) => {
    const weight = card.box >= 3 ? 1 : card.box === 2 ? 3 : 5;
    for (let i = 0; i < weight; i++) weighted.push(card);
  });
  return weighted[Math.floor(Math.random() * weighted.length)];
}

function updateSessionProgressUI() {
  const pct = Math.min(100, Math.round((sessionProgress / sessionGoal) * 100));
  document.getElementById("abf-progress-fill").style.width = pct + "%";
  document.getElementById("abf-progress-label").textContent = `${sessionProgress} / ${sessionGoal} cards`;
}

document.getElementById("abf-goal-row").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-goal]");
  if (!btn) return;
  sessionGoal = parseInt(btn.getAttribute("data-goal"), 10);
  document.querySelectorAll("#abf-goal-row button").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  sessionProgress = 0;
  updateSessionProgressUI();
});

async function showNextSessionCard() {
  const deck = await getDeck();
  sessionCard = pickSessionCard(deck);
  const cardEl = document.getElementById("abf-session-card");
  if (!sessionCard) {
    cardEl.style.display = "none";
    return;
  }
  cardEl.style.display = "block";
  document.getElementById("abf-session-front").textContent = sessionCard.front;
  document.getElementById("abf-session-back").textContent = sessionCard.back;
  document.getElementById("abf-session-back").style.display = "none";
  document.getElementById("abf-session-reveal-row").style.display = "flex";
  document.getElementById("abf-session-grade-row").style.display = "none";
}

document.getElementById("abf-session-reveal").addEventListener("click", () => {
  document.getElementById("abf-session-back").style.display = "block";
  document.getElementById("abf-session-reveal-row").style.display = "none";
  document.getElementById("abf-session-grade-row").style.display = "flex";
});

async function gradeSessionCard(correct) {
  if (!sessionCard) return;
  const deck = await getDeck();
  const card = deck.find((c) => c.id === sessionCard.id);
  if (card) {
    card.box = correct ? Math.min(3, card.box + 1) : 1;
    card.lastSeen = Date.now();
    await setDeck(deck);
  }

  const { stats } = await chrome.storage.local.get("stats");
  const s = stats || { reviews: 0, correct: 0, streak: { count: 0, lastDate: null }, adBreaksRepped: 0 };
  s.reviews += 1;
  if (correct) s.correct += 1;
  bumpStreak(s); // manual sessions count toward the streak too
  await chrome.storage.local.set({ stats: s });

  sessionProgress += 1;
  updateSessionProgressUI();
  refreshStats();
  refreshBoxCounts();

  if (sessionProgress >= sessionGoal) {
    sessionActive = false;
    document.getElementById("abf-session-card").style.display = "none";
    document.getElementById("abf-study-btn").textContent = "Study now";
  } else {
    showNextSessionCard();
  }
}

document.getElementById("abf-session-hit").addEventListener("click", () => gradeSessionCard(true));
document.getElementById("abf-session-miss").addEventListener("click", () => gradeSessionCard(false));

document.getElementById("abf-study-btn").addEventListener("click", async () => {
  if (sessionActive) return;
  const deck = await getDeck();
  if (deck.length === 0) {
    alert("Add or import some cards first.");
    return;
  }
  sessionActive = true;
  sessionProgress = 0;
  updateSessionProgressUI();
  document.getElementById("abf-study-btn").textContent = "Studying…";
  showNextSessionCard();
});

// ---------- Export deck (Quizlet-compatible plain text) ----------

document.getElementById("abf-export-btn").addEventListener("click", async () => {
  const deck = await getDeck();
  if (deck.length === 0) {
    alert("No cards to export yet.");
    return;
  }
  const text = deck.map((c) => `${c.front}\t${c.back}`).join("\n");
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pop-deck.txt";
  a.click();
  URL.revokeObjectURL(url);
});

refreshStats();
refreshList();
