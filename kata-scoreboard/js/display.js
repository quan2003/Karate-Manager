// Kumite Scoreboard - Display JavaScript
const STORAGE_KEY = "kumite_scoreboard";

// State management
let state = {
  mode: "individual", // 'individual' or 'team'
  category: "PENALTY",
  tournamentTitle:
    "GIẢI KARATE-DO SINH VIÊN TRƯỜNG ĐẠI HỌC CNTT VÀ TT VIỆT-HÀN MỞ RỘNG LẦN THỨ I - 2025", // Tournament title
  eventTitle: "Thảm 1", // Event title
  akaName: "AKA",
  aoName: "AO",
  akaScore: 0,
  aoScore: 0,
  akaPenalties: { C1: false, C2: false, C3: false, HC: false, H: false },
  aoPenalties: { C1: false, C2: false, C3: false, HC: false, H: false },
  akaSenshu: false,
  aoSenshu: false,
  timer: {
    minutes: 3,
    seconds: 0,
    deciseconds: 0,
    isRunning: false,
  },
  errorNames: { C1: "C1", C2: "C2", C3: "C3", HC: "HC", H: "H" },
  pointNames: {
    Senshu: "Senshu",
    Ippon: "Ippon",
    WazaAri: "Waza-ari",
    Yuko: "Yuko",
  },
  fontScale: 100, // Font scale percentage
  winnerFlash: null, // 'aka', 'ao', or null

  // Team mode specific
  teamMode: {
    currentRound: 1,
    maxRounds: 5,
    akaWins: 0,
    aoWins: 0,
    roundHistory: [],
  },
};

// Load state from localStorage
function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsedState = JSON.parse(saved);
    state = { ...state, ...parsedState };
  }
  updateDisplay();
}

// Update display from state
function updateDisplay() {
  // Update tournament title
  if (document.getElementById("tournamentTitle")) {
    document.getElementById("tournamentTitle").textContent =
      state.tournamentTitle ||
      "GIẢI KARATE-DO SINH VIÊN TRƯỜNG ĐẠI HỌC CNTT VÀ TT VIỆT-HÀN MỞ RỘNG LẦN THỨ I - 2025";
  }

  // Update category
  document.getElementById("categoryTitle").textContent = state.category;

  // Update event title
  if (document.getElementById("eventTitle")) {
    document.getElementById("eventTitle").textContent =
      state.eventTitle || "Thảm 1";
  }

  // Update names
  document.getElementById("akaName").textContent = state.akaName;
  document.getElementById("aoName").textContent = state.aoName;

  // Update Senshu indicators (above scores)
  const akaSenshuIndicator = document.getElementById("akaSenshuIndicator");
  const aoSenshuIndicator = document.getElementById("aoSenshuIndicator");
  if (akaSenshuIndicator) {
    akaSenshuIndicator.style.display = state.akaSenshu ? "block" : "none";
  }
  if (aoSenshuIndicator) {
    aoSenshuIndicator.style.display = state.aoSenshu ? "block" : "none";
  }

  // Update scores
  document.getElementById("akaScore").textContent = state.akaScore;
  document.getElementById("aoScore").textContent = state.aoScore;

  // Update winner flash animation
  const akaName = document.getElementById("akaName");
  const aoName = document.getElementById("aoName");
  const akaScore = document.getElementById("akaScore");
  const aoScore = document.getElementById("aoScore");
  const akaScoreContainer = akaScore.parentElement;
  const aoScoreContainer = aoScore.parentElement;

  if (state.winnerFlash === "aka") {
    akaName.classList.add("winner-flash");
    akaScoreContainer.classList.add("winner-flash");
    aoName.classList.remove("winner-flash");
    aoScoreContainer.classList.remove("winner-flash");
  } else if (state.winnerFlash === "ao") {
    aoName.classList.add("winner-flash");
    aoScoreContainer.classList.add("winner-flash");
    akaName.classList.remove("winner-flash");
    akaScoreContainer.classList.remove("winner-flash");
  } else {
    akaName.classList.remove("winner-flash");
    aoName.classList.remove("winner-flash");
    akaScoreContainer.classList.remove("winner-flash");
    aoScoreContainer.classList.remove("winner-flash");
  }

  // Update penalty buttons with custom names
  updatePenaltyButtons("aka", state.akaPenalties);
  updatePenaltyButtons("ao", state.aoPenalties);
  // Update timer
  updateTimerDisplay();

  // Update team mode display
  updateTeamModeDisplay();

  // Apply font scale if exists
  if (state.fontScale) {
    const scale = state.fontScale / 100;
    document.documentElement.style.setProperty("--font-scale", scale);
  }
}

// Update penalty buttons
function updatePenaltyButtons(competitor, penalties) {
  const errorNames = state.errorNames;

  ["C1", "C2", "C3", "HC", "H"].forEach((penalty) => {
    const btn = document.getElementById(`${competitor}${penalty}`);
    if (btn) {
      btn.textContent = errorNames[penalty] || penalty;
      if (penalties[penalty]) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    }
  });
}

// Beep audio context
let audioContext = null;
let finalBeepPlayed = false;
let warning15sPlayed = false; // Track if 15s warning beep has played

// Play beep sound
function playBeep(duration = 100, frequency = 800) {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = frequency;
  oscillator.type = "sine";

  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(
    0.01,
    audioContext.currentTime + duration / 1000
  );

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + duration / 1000);
}

// Update timer display
function updateTimerDisplay() {
  const timer = state.timer;
  const minutes = String(timer.minutes).padStart(2, "0");
  const seconds = String(timer.seconds).padStart(2, "0");
  const deciseconds = timer.deciseconds;

  document.getElementById("timerMain").textContent = `${minutes}:${seconds}`;
  document.getElementById("timerDecimal").textContent = `.${deciseconds}`;

  // Calculate total seconds
  const totalSeconds = timer.minutes * 60 + timer.seconds;

  // Beep at exactly 15 seconds (warning)
  if (
    timer.isRunning &&
    totalSeconds === 15 &&
    timer.deciseconds === 0 &&
    !warning15sPlayed
  ) {
    playBeep(150, 800); // Short beep at 15s
    warning15sPlayed = true;
  }

  // Reset warning flag when time > 15s
  if (totalSeconds > 15) {
    warning15sPlayed = false;
  }

  // Play long beep when timer reaches 0
  if (totalSeconds === 0 && timer.deciseconds === 0 && !finalBeepPlayed) {
    playBeep(1000, 600); // Long beep when time is up
    finalBeepPlayed = true;
  } else if (totalSeconds > 0) {
    finalBeepPlayed = false;
  }

  // Add warning class when time is low (15 seconds)
  const timerSection = document.querySelector(".timer-section");
  if (timer.minutes === 0 && timer.seconds <= 15) {
    timerSection.classList.add("timer-warning");
  } else {
    timerSection.classList.remove("timer-warning");
  }
}

// Update team mode display
function updateTeamModeDisplay() {
  const teamInfoContainer = document.getElementById("teamInfoContainer");

  if (!teamInfoContainer) return;

  // Show/hide based on mode
  if (state.mode === "team" && state.teamMode) {
    teamInfoContainer.style.display = "flex";

    // Update round number
    const roundNumber = document.getElementById("roundNumber");
    if (roundNumber) {
      roundNumber.textContent = `${state.teamMode.currentRound}/${state.teamMode.maxRounds}`;
    }

    // Update team wins
    const teamAkaWins = document.getElementById("teamAkaWins");
    const teamAoWins = document.getElementById("teamAoWins");
    if (teamAkaWins) {
      teamAkaWins.textContent = state.teamMode.akaWins || 0;
    }
    if (teamAoWins) {
      teamAoWins.textContent = state.teamMode.aoWins || 0;
    }
  } else {
    teamInfoContainer.style.display = "none";
  }
}

// Listen for storage changes from admin
window.addEventListener("storage", function (e) {
  if (e.key === STORAGE_KEY) {
    loadState();
  }
});

// Also listen for custom events
window.addEventListener("kumiteStateUpdate", function () {
  loadState();
});

// Store last state string to detect changes
let lastStateString = "";
let lastFullscreenTimestamp = 0;

// Fullscreen display function
function showFullscreenDisplay(displayData) {
  const overlay = document.getElementById("fullscreenOverlay");
  const actionEl = document.getElementById("fullscreenAction");
  const pointsEl = document.getElementById("fullscreenPoints");

  // Clear previous classes
  overlay.className = "fullscreen-overlay";

  // Determine background color
  if (displayData.action === "warning") {
    overlay.classList.add("warning-bg");
    actionEl.textContent = "WARNING";
    pointsEl.textContent = displayData.warningType || "";
  } else if (displayData.action === "senshu") {
    // Senshu display
    if (displayData.competitor === "aka") {
      overlay.classList.add("senshu-aka-bg");
    } else {
      overlay.classList.add("senshu-ao-bg");
    }
    overlay.classList.add("senshu-display");

    // Create senshu box
    const content = overlay.querySelector(".fullscreen-content");
    content.innerHTML = `
      <div class="fullscreen-senshu-box">S</div>
      <div class="fullscreen-action">SENSHU</div>
    `;
  } else {
    // Score display (yuko, wazaari, ippon)
    if (displayData.competitor === "aka") {
      overlay.classList.add("aka-bg");
    } else {
      overlay.classList.add("ao-bg");
    }

    // Action name
    let actionName = displayData.action.toUpperCase();
    if (displayData.action === "wazaari") {
      actionName = "WAZA-ARI";
    }
    actionEl.textContent = actionName;

    // Points text
    const pointText = displayData.points === 1 ? "POINT" : "POINTS";
    pointsEl.textContent = `${displayData.points} ${pointText}`;
  }

  // Show overlay
  overlay.classList.add("show");

  // Hide after 2 seconds
  setTimeout(() => {
    overlay.classList.remove("show");
    // Reset content after animation
    setTimeout(() => {
      const content = overlay.querySelector(".fullscreen-content");
      content.innerHTML = `
        <div class="fullscreen-action" id="fullscreenAction">YUKO</div>
        <div class="fullscreen-points" id="fullscreenPoints">1 POINT</div>
      `;
    }, 300);
  }, 2000);
}

// Poll for changes (backup method) - only update if changed
setInterval(function () {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && saved !== lastStateString) {
    lastStateString = saved;
    const newState = JSON.parse(saved);
    state = { ...state, ...newState };
    updateDisplay();

    // Check for fullscreen display trigger
    if (
      newState.fullscreenDisplay &&
      newState.fullscreenDisplay.timestamp !== lastFullscreenTimestamp
    ) {
      lastFullscreenTimestamp = newState.fullscreenDisplay.timestamp;
      showFullscreenDisplay(newState.fullscreenDisplay);
    }
  }
}, 50);

// Initialize
document.addEventListener("DOMContentLoaded", function () {
  loadState();
  lastStateString = localStorage.getItem(STORAGE_KEY) || "";
});
