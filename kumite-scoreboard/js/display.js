// Kumite Scoreboard - Display JavaScript
const STORAGE_KEY = "kumite_scoreboard";

// State management
let state = {
  mode: "individual", // 'individual' or 'team'
  displayLayout: "horizontal", // 'horizontal' or 'vertical'
  swapPositions: false,
  category: "PENALTY",
  tournamentTitle:
    "GIẢI KARATE-DO SINH VIÊN TRƯỜNG ĐẠI HỌC CNTT VÀ TT VIỆT-HÀN MỞ RỘNG LẦN THỨ I - 2025", // Tournament title
  eventTitle: "Thảm 1", // Event title
  sponsorText: "NHÀ TÀI TRỢ", // Sponsor text
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
  const displayLayout = state.displayLayout === "vertical"
    ? "vertical"
    : "horizontal";
  document.body.classList.toggle("vertical-layout", displayLayout === "vertical");
  document.body.classList.toggle("horizontal-layout", displayLayout === "horizontal");
  document.body.classList.toggle("positions-swapped", state.swapPositions === true);

  // Update tournament title
  if (document.getElementById("tournamentTitle")) {
    document.getElementById("tournamentTitle").textContent =
      state.tournamentTitle ||
      "GIẢI KARATE-DO SINH VIÊN TRƯỜNG ĐẠI HỌC CNTT VÀ TT VIỆT-HÀN MỞ RỘNG LẦN THỨ I - 2025";
  } // Update category
  document.getElementById("categoryTitle").textContent =
    state.displayLayout === "vertical" ? "WARNING" : state.category;
  // Update event title
  if (document.getElementById("eventTitle")) {
    document.getElementById("eventTitle").textContent =
      state.eventTitle || "THẢM 1";
  } 
  const matchRoundDisplay = document.getElementById("matchRoundDisplay");
  if (matchRoundDisplay) {
    matchRoundDisplay.textContent = state.matchRound || "";
    matchRoundDisplay.style.display = state.matchRound ? "block" : "none";
  }
  const matchModeDisplay = document.getElementById("matchModeDisplay");
  if (matchModeDisplay) {
    matchModeDisplay.textContent =
      state.category ||
      (state.mode === "team" ? "KUMITE ĐỒNG ĐỘI" : "KUMITE");
  }
  
  // Update sponsor text/logos - Enhanced logic to check multiple storage locations
  const logoContainer = document.getElementById("logoContainer");
  if (logoContainer) {
    // 1. Try Kumite-specific state first
    let sLogos = state.sponsorLogos;
    
    // 2. If not found, try main tournament storage (karate_tournament_data)
    if (!sLogos || ((!sLogos.systemLogo && !sLogos.tournamentLogos) && (!sLogos.sponsors || sLogos.sponsors.length === 0))) {
      try {
        const rawData = localStorage.getItem('karate_tournament_data');
        if (rawData) {
          const mainData = JSON.parse(rawData);
          if (mainData && mainData.tournaments) {
            // Priority: Find a tournament that matches the current title
            const currentTitle = (state.tournamentTitle || "").trim().toLowerCase();
            let tMatched = mainData.tournaments.find(t => (t.name || "").trim().toLowerCase() === currentTitle);
            
            // Fallback: Just the first one with any logos
            if (!tMatched) {
              tMatched = mainData.tournaments.find(t => 
                t.sponsorLogos && (t.sponsorLogos.systemLogo || t.sponsorLogos.tournamentLogos || (t.sponsorLogos.sponsors && t.sponsorLogos.sponsors.length > 0))
              );
            }

            if (tMatched && tMatched.sponsorLogos) {
              sLogos = tMatched.sponsorLogos;
            }
          }
        }
      } catch (e) {
        console.warn("Could not read main tournament data:", e);
      }
    }

    // 3. Last resort: Try Kata scoreboard state
    if (!sLogos || ((!sLogos.systemLogo && !sLogos.tournamentLogos) && (!sLogos.sponsors || sLogos.sponsors.length === 0))) {
      try {
        const kataState = JSON.parse(localStorage.getItem('karate_scoreboard'));
        if (kataState && kataState.sponsorLogos) {
          sLogos = kataState.sponsorLogos;
        }
      } catch (e) {
        console.warn("Could not read Kata state:", e);
      }
    }

    const hasImageLogos = sLogos && (sLogos.systemLogo || sLogos.tournamentLogos || (sLogos.sponsors && sLogos.sponsors.length > 0));
    
    // Updated logic: Only show sponsors if they exist, otherwise fallback to icon.png
    const sponsors = sLogos && sLogos.sponsors && sLogos.sponsors.length > 0 ? sLogos.sponsors : [];
    
    logoContainer.innerHTML = "";
    logoContainer.style.display = "flex";

    if (sponsors.length > 0) {
      // Show ONLY sponsor logos if configured
      sponsors.forEach(src => {
        const img = document.createElement("img");
        img.src = src;
        img.className = "sponsor-logo-img";
        logoContainer.appendChild(img);
      });
    } else {
      // Fallback to app icon ONLY if no sponsors are configured
      const appImg = document.createElement("img");
      appImg.src = "../public/Logo_den.png"; // Changed to Logo_den.png as requested
      appImg.className = "sponsor-logo-img";
      logoContainer.appendChild(appImg);
    }
  }

  // Update names - Split into Name and Unit
  const updateCompetitorName = (side) => {
    const fullName = state[`${side}Name`] || "";
    const nameEl = document.getElementById(`${side}Name`);
    const unitEl = document.getElementById(`${side}Unit`);
    
    if (fullName.includes(" - ")) {
      const parts = fullName.split(" - ");
      if (nameEl) nameEl.textContent = parts[0];
      if (unitEl) unitEl.textContent = parts[1];
    } else {
      if (nameEl) nameEl.textContent = fullName;
      if (unitEl) unitEl.textContent = "";
    }
  };

  updateCompetitorName("aka");
  updateCompetitorName("ao");

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

// Play multiple beeps with delay
function playMultipleBeeps(count, duration, frequency, delayBetween) {
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      playBeep(duration, frequency);
    }, i * delayBetween);
  }
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
  const totalSeconds = timer.minutes * 60 + timer.seconds; // Beep at exactly 15 seconds (warning)
  if (
    timer.isRunning &&
    totalSeconds === 15 &&
    timer.deciseconds === 0 &&
    !warning15sPlayed
  ) {
    playMultipleBeeps(3, 800, 600, 1000); // 3 long beeps at 15s (same as time up)
    warning15sPlayed = true;
  }

  // Reset warning flag when time > 15s
  if (totalSeconds > 15) {
    warning15sPlayed = false;
  }

  // Play long beep when timer reaches 0
  if (totalSeconds === 0 && timer.deciseconds === 0 && !finalBeepPlayed) {
    playMultipleBeeps(3, 800, 600, 1000); // 3 long beeps when time is up
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
  const timerContent = document.querySelector(".timer-content");

  if (!teamInfoContainer) return;

  // Show/hide based on mode
  if (state.mode === "team" && state.teamMode) {
    teamInfoContainer.style.display = "flex";

    // Remove individual mode class
    if (timerContent) {
      timerContent.classList.remove("individual-mode");
    }

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

    // Add individual mode class
    if (timerContent) {
      timerContent.classList.add("individual-mode");
    }
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

  // Hide after 1.2 seconds (faster)
  setTimeout(() => {
    overlay.classList.remove("show");
    // Reset content after animation
    setTimeout(() => {
      const content = overlay.querySelector(".fullscreen-content");
      content.innerHTML = `
        <div class="fullscreen-action" id="fullscreenAction">YUKO</div>
        <div class="fullscreen-points" id="fullscreenPoints">1 POINT</div>
      `;
    }, 150); // Faster reset
  }, 1200);
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
