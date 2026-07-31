// Shared storage key
const STORAGE_KEY = "karate_scoreboard";

// State and Tracking
let state = null;
let currentWinnerSide = null; // Tracks which side is currently winning
let announcementShownForWinner = null; // Tracks who we already showed the big announcement for

// Load state from localStorage
function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    state = JSON.parse(saved);
    updateDisplay();
  }
}

// Update display from state
function updateDisplay() {
  if (!state) return;

  // Header update
  if (document.getElementById("tournamentTitle")) {
    document.getElementById("tournamentTitle").textContent = state.tournamentTitle || "";
  }
  const eventTitle = document.getElementById("eventTitle");
  if (eventTitle) {
    eventTitle.textContent = state.eventTitle || "THẢM 1";
  }
  if (document.getElementById("matchInfo")) {
    document.getElementById("matchInfo").textContent = state.matchInfo || "KATA";
  }

  // Logos/Sponsors
  const logoContainer = document.getElementById("logoContainer");
  if (logoContainer) {
    const hasSponsorLogos = state.sponsorLogos && (state.sponsorLogos.systemLogo || (state.sponsorLogos.sponsors && state.sponsorLogos.sponsors.length > 0));
    
    logoContainer.innerHTML = "";
    
    if (hasSponsorLogos) {
      if (state.sponsorLogos.systemLogo) {
        const img = document.createElement("img");
        img.src = state.sponsorLogos.systemLogo;
        img.style.height = "12vh";
        img.style.width = "auto";
        img.style.objectFit = "contain";
        logoContainer.appendChild(img);
      }
      if (state.sponsorLogos.sponsors) {
        state.sponsorLogos.sponsors.forEach(src => {
          const img = document.createElement("img");
          img.src = src;
          img.style.height = "12vh";
          img.style.width = "auto";
          img.style.objectFit = "contain";
          logoContainer.appendChild(img);
        });
      }
    } else {
      // Fallback to Logo_den.png if no sponsors
      const img = document.createElement("img");
      img.src = "../public/Logo_den.png";
      img.style.height = "12vh"; // Increased from 70px to 12vh for better visibility
      img.style.width = "auto";
      img.style.objectFit = "contain";
      logoContainer.appendChild(img);
    }
  }

  const isSwapped = state.swapPositions || false;
  const topData = isSwapped ? state.ao : state.aka;
  const bottomData = isSwapped ? state.aka : state.ao;

  // AKA
  if (document.getElementById("akaAthlete")) document.getElementById("akaAthlete").textContent = topData.athlete || "";
  if (document.getElementById("akaUnit")) document.getElementById("akaUnit").textContent = (state.contentType === "individual" ? topData.unit : topData.team) || "";
  if (document.getElementById("akaScore")) document.getElementById("akaScore").textContent = topData.score || "0";
  if (state.scoringStarted) document.getElementById("akaScore").classList.remove("hidden");
  else document.getElementById("akaScore").classList.add("hidden");
  if (document.getElementById("akaKataDisplay")) document.getElementById("akaKataDisplay").textContent = (topData.kataName || "").toUpperCase();

  // AO
  if (document.getElementById("aoAthlete")) document.getElementById("aoAthlete").textContent = bottomData.athlete || "";
  if (document.getElementById("aoUnit")) document.getElementById("aoUnit").textContent = (state.contentType === "individual" ? bottomData.unit : bottomData.team) || "";
  if (document.getElementById("aoScore")) document.getElementById("aoScore").textContent = bottomData.score || "0";
  if (state.scoringStarted) document.getElementById("aoScore").classList.remove("hidden");
  else document.getElementById("aoScore").classList.add("hidden");
  if (document.getElementById("aoKataDisplay")) document.getElementById("aoKataDisplay").textContent = (bottomData.kataName || "").toUpperCase();

  // Winner logic
  const akaRow = document.getElementById("akaRow");
  const aoRow = document.getElementById("aoRow");
  if (akaRow) akaRow.classList.remove("winner");
  if (aoRow) aoRow.classList.remove("winner");

  const akaScoreVal = Number(topData.score) || 0;
  const aoScoreVal = Number(bottomData.score) || 0;

  let winnerSide = null;
  if (akaScoreVal > aoScoreVal) {
    winnerSide = "aka";
    if (akaRow) akaRow.classList.add("winner");
  } else if (aoScoreVal > akaScoreVal) {
    winnerSide = "ao";
    if (aoRow) aoRow.classList.add("winner");
  }

  // Handle Winner Announcement Overlay
  if (winnerSide && state.scoringStarted) {
    // Unique ID for this specific win (combination of athlete name and score)
    const winnerData = winnerSide === "aka" ? topData : bottomData;
    const winnerId = `${winnerData.athlete}_${winnerData.score}`;
    
    if (announcementShownForWinner !== winnerId) {
      showWinnerAnnouncement(winnerData, winnerSide);
      announcementShownForWinner = winnerId;
    }
  } else {
    // Reset tracker if scores are even or match reset
    announcementShownForWinner = null;
    hideWinnerAnnouncement();
  }

  // Dynamic scaling
  autoScale(document.getElementById("akaAthlete"), 4.2, 0.95);
  autoScale(document.getElementById("aoAthlete"), 4.2, 0.95);
  autoScale(document.getElementById("akaUnit"), 2.2, 0.7);
  autoScale(document.getElementById("aoUnit"), 2.2, 0.7);
  autoScale(document.getElementById("akaKataDisplay"), 3.5, 0.45);
  autoScale(document.getElementById("aoKataDisplay"), 3.5, 0.45);

  updateTimerDisplay();
}

function showWinnerAnnouncement(data, side) {
  const overlay = document.getElementById("winnerAnnouncement");
  if (!overlay) return;
  
  const nameEl = document.getElementById("winnerName");
  const unitEl = document.getElementById("winnerUnit");
  const kataEl = document.getElementById("winnerKata");
  const headerEl = document.getElementById("winnerHeader");
  
  if (nameEl) nameEl.textContent = data.athlete || "";
  if (unitEl) unitEl.textContent = (state.contentType === "individual" ? data.unit : data.team) || "";
  if (kataEl) kataEl.textContent = (data.kataName || "").toUpperCase();
  if (headerEl) {
    headerEl.className = "winner-header " + side;
    headerEl.textContent = "WINNER";
  }
  
  overlay.style.display = "flex";
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    overlay.style.display = "none";
  }, 5000);
}

function hideWinnerAnnouncement() {
  const overlay = document.getElementById("winnerAnnouncement");
  if (overlay) overlay.style.display = "none";
}

function autoScale(el, maxVw, factor) {
  if (!el || !el.textContent) return;
  el.style.fontSize = maxVw + "vw";
  const parent = el.offsetParent; 
  if (!parent) return;
  let cur = maxVw;
  const limit = parent.offsetWidth * factor;
  while (el.scrollWidth > limit && cur > maxVw * 0.4) {
    cur -= 0.1;
    el.style.fontSize = cur + "vw";
  }
}

function updateTimerDisplay() {
  if (!state) return;
  const el = document.getElementById("timer");
  const overlay = document.getElementById("timerOverlay");
  if (!el || !overlay) return;
  const mins = Math.floor(state.timer.seconds / 60);
  const secs = state.timer.seconds % 60;
  const deciseconds = state.timer.deciseconds || 0;
  el.innerHTML = `<span>${mins}:${secs.toString().padStart(2, "0")}</span><span class="timer-deciseconds">.${deciseconds}</span>`;
  overlay.style.display =
    state.timer.isRunning && (state.timer.seconds > 0 || deciseconds > 0) ? "flex" : "none";
}

window.addEventListener("DOMContentLoaded", () => {
  loadState();
  window.addEventListener("storage", loadState);
  setInterval(loadState, 500);
});
