// Shared storage key
const STORAGE_KEY = "karate_scoreboard";

// State
let state = null;

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

  // Apply global font scale (admin slider)
  const scalePercent = state.globalFontScale || 100;
  if (document.body) {
    try {
      // Use CSS zoom for scaling
      document.body.style.zoom = scalePercent + "%";
    } catch (e) {
      // Fallback: transform
      try {
        const scale = scalePercent / 100;
        document.body.style.transformOrigin = "0 0";
        document.body.style.transform = `scale(${scale})`;
      } catch (err) {
        // ignore
      }
    }
  } // Update header
  if (document.getElementById("tournamentTitle")) {
    document.getElementById("tournamentTitle").textContent =
      state.tournamentTitle ||
      "GIẢI KARATE-DO SINH VIÊN TRƯỜNG ĐẠI HỌC CNTT VÀ TT VIỆT-HÀN MỞ RỘNG LẦN THỨ I - 2025";
  }
  if (document.getElementById("eventTitle")) {
    document.getElementById("eventTitle").textContent =
      state.eventTitle || "THẢM 1";
  }
  document.getElementById("matchInfo").textContent =
    state.matchInfo || "KATA CÁ NHÂN NAM LỨA TUỔI 10 TUỔI ĐẾN 11 TUỔI"; // Update sponsor text - show default if empty or undefined
  if (document.getElementById("sponsorText")) {
    document.getElementById("sponsorText").textContent =
      state.sponsorText && state.sponsorText.trim() !== ""
        ? state.sponsorText
        : "NHÀ TÀI TRỢ";
  }

  // Check if positions are swapped
  const isSwapped = state.swapPositions || false;

  // Determine which data to show where
  const topData = isSwapped ? state.ao : state.aka;
  const bottomData = isSwapped ? state.aka : state.ao;

  // Update AKA row (top)
  if (state.contentType === "individual") {
    document.getElementById("akaAthlete").textContent =
      topData.athlete || "TÊN VĐV";
    document.getElementById("akaUnit").textContent = topData.unit || "ĐƠN VỊ";
  } else {
    document.getElementById("akaAthlete").textContent = "";
    document.getElementById("akaUnit").textContent = topData.team || "ĐƠN VỊ";
  } // Show/hide AKA score
  const akaScoreEl = document.getElementById("akaScore");
  const akaScoreVal = Number(topData.score) || 0;
  if (akaScoreEl) {
    akaScoreEl.textContent = akaScoreVal;
    // Show score only if scoring has started
    if (state.scoringStarted) {
      akaScoreEl.classList.remove("hidden");
    } else {
      akaScoreEl.classList.add("hidden");
    }
  }

  // Update AKA kata display
  const akaKataDisplay = document.getElementById("akaKataDisplay");
  if (akaKataDisplay) {
    akaKataDisplay.textContent =
      topData.kataName && topData.kataName !== "Kata Name"
        ? topData.kataName.toUpperCase()
        : "";
  }

  // Update AO row (bottom)
  if (state.contentType === "individual") {
    document.getElementById("aoAthlete").textContent =
      bottomData.athlete || "TÊN VĐV";
    document.getElementById("aoUnit").textContent = bottomData.unit || "ĐƠN VỊ";
  } else {
    document.getElementById("aoAthlete").textContent = "";
    document.getElementById("aoUnit").textContent = bottomData.team || "ĐƠN VỊ";
  }
  // Show/hide AO score
  const aoScoreEl = document.getElementById("aoScore");
  const aoScoreVal = Number(bottomData.score) || 0;
  if (aoScoreEl) {
    aoScoreEl.textContent = aoScoreVal;
    // Show score only if scoring has started
    if (state.scoringStarted) {
      aoScoreEl.classList.remove("hidden");
    } else {
      aoScoreEl.classList.add("hidden");
    }
  }

  // Update AO kata display
  const aoKataDisplay = document.getElementById("aoKataDisplay");
  if (aoKataDisplay) {
    aoKataDisplay.textContent =
      bottomData.kataName && bottomData.kataName !== "Kata Name"
        ? bottomData.kataName.toUpperCase()
        : "";
  }

  // Winner detection and highlighting
  const akaRow = document.getElementById("akaRow");
  const aoRow = document.getElementById("aoRow");

  if (akaRow) akaRow.classList.remove("winner");
  if (aoRow) aoRow.classList.remove("winner");

  if (akaScoreVal > aoScoreVal) {
    if (akaRow) akaRow.classList.add("winner");
  } else if (aoScoreVal > akaScoreVal) {
    if (aoRow) aoRow.classList.add("winner");
  }

  // Update timer
  updateTimerDisplay();
}

// Timer display update only
function updateTimerDisplay() {
  if (!state) return;

  const timerElement = document.getElementById("timer");
  const timerOverlay = document.getElementById("timerOverlay");

  if (!timerElement) return;

  const minutes = Math.floor(state.timer.seconds / 60);
  const seconds = state.timer.seconds % 60;
  const display = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  timerElement.textContent = display;

  // Show/hide timer overlay based on running state
  if (timerOverlay) {
    if (state.timer.isRunning && state.timer.seconds > 0) {
      timerOverlay.style.display = "flex";
    } else {
      timerOverlay.style.display = "none";
    }
  }

  // Add warning class if time is low (less than 30 seconds)
  const timerContent = timerOverlay?.querySelector(".timer-content");
  if (state.timer.seconds <= 30 && state.timer.seconds > 0) {
    timerElement.classList.add("warning");
    if (timerContent) timerContent.classList.add("warning");
  } else {
    timerElement.classList.remove("warning");
    if (timerContent) timerContent.classList.remove("warning");
  }
}

// Initialize
window.addEventListener("DOMContentLoaded", () => {
  loadState();

  // Listen for storage changes
  window.addEventListener("storage", () => {
    loadState();
  });

  // Poll for updates (fallback for same-origin storage updates)
  setInterval(() => {
    loadState();
  }, 500);
});
