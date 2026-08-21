// Kumite Scoreboard - Admin JavaScript
const STORAGE_KEY = "kumite_scoreboard";

// State management
let state = {
  mode: "individual", // 'individual' or 'team'
  displayLayout: "horizontal", // 'horizontal' or 'vertical'
  swapPositions: false,
  category: "KUMITE",
  akaName: "AKA",
  aoName: "AO",
  akaScore: 0,
  aoScore: 0,
  techniqueCounts: {
    aka: { ippon: 0, wazaari: 0, yuko: 0 },
    ao: { ippon: 0, wazaari: 0, yuko: 0 },
  },
  akaPenalties: { C1: false, C2: false, C3: false, HC: false, H: false },
  aoPenalties: { C1: false, C2: false, C3: false, HC: false, H: false },
  akaSenshu: false,
  aoSenshu: false,
  timer: {
    minutes: 3,
    seconds: 0,
    deciseconds: 0,
    hasStarted: false,
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
  proposedWinner: null, // flashes while the secretary confirmation popup is open
  forcedEndBeepAt: 0,
  hantei: {
    status: "idle",
    judgeCount: 5,
    votes: [null, null, null, null, null],
    akaFlags: 0,
    aoFlags: 0,
    winner: null,
  },
  timerSpeed: 1, // Timer speed multiplier (1 = normal, 2 = 2x, 0.5 = half speed)
  matchRound: "", // Current match round (Chung Kết, Bán Kết, etc.)
  // Fullscreen display for animations
  fullscreenDisplay: null, // {competitor, action, points, warningType, timestamp}
  tournamentTitle:
    "GIẢI KARATE-DO SINH VIÊN TRƯỜNG ĐẠI HỌC CNTT VÀ TT VIỆT-HÀN MỞ RỘNG LẦN THỨ I - 2025",
  eventTitle: "Thảm 1",
  sponsorText: "NHÀ TÀI TRỢ", // Sponsor text

  // Team mode specific
  teamMode: {
    currentRound: 1,
    maxRounds: 5,
    akaWins: 0,
    aoWins: 0,
    roundHistory: [], // Array of round results
  },
  medicalTimer: {
    isOpen: false,
    minutes: 3,
    seconds: 0,
    deciseconds: 0,
    isRunning: false,
    hasStarted: false,
    expired: false,
  },
};

let timerInterval = null;
let medicalTimerInterval = null;
const kumiteStateChannel = typeof BroadcastChannel === "function"
  ? new BroadcastChannel("kumite-scoreboard-state") : null;
let displayWindow = null;
let athletes = []; // Array to store athletes data from CSV
let registeredTeamAthletes = { aka: [], ao: [] };
let activeWinProposal = null;
const dismissedWinProposals = new Set();

// Point values
const POINT_VALUES = {
  senshu: 0, // Senshu is just a marker
  ippon: 3,
  wazaari: 2,
  yuko: 1,
};

// ==================== CSV UPLOAD FUNCTIONS ====================

// Handle file upload
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const statusDiv = document.getElementById("uploadStatus");
  statusDiv.textContent = "🔄 Đang xử lý file...";
  statusDiv.style.color = "#ffd700";

  const reader = new FileReader();

  reader.onload = function (e) {
    try {
      const text = e.target.result;
      parseFileContent(text, file.name);
      statusDiv.textContent = "✅ Upload thành công!";
      statusDiv.style.color = "#38ef7d";
    } catch (error) {
      statusDiv.textContent = "❌ Lỗi: " + error.message;
      statusDiv.style.color = "#ff4444";
    }
  };

  if (file.name.endsWith(".csv")) {
    reader.readAsText(file);
  } else {
    reader.readAsText(file);
  }
}

// Parse CSV file content
function parseFileContent(text, filename) {
  const lines = text.split("\n").filter((line) => line.trim());

  athletes = [];

  lines.forEach((line, index) => {
    if (index === 0) return; // Skip header

    const parts = line.split(/[,;\t]/).map((p) => p.trim());

    if (parts.length >= 2) {
      const athlete = {
        name: parts[0],
        unit: parts[1],
        type: parts[2] ? parts[2].toLowerCase() : "", // kata or kumite
        category: parts[3] ? parts[3].toLowerCase() : "", // cá nhân or đồng đội
      };
      athletes.push(athlete);
    }
  });

  updateFilterStatus();
  populateAthleteDropdowns(); // Add this line to populate dropdowns
}

// Populate athlete dropdowns
function populateAthleteDropdowns() {
  const redSelect = document.getElementById("redAthleteSelect");
  const blueSelect = document.getElementById("blueAthleteSelect");

  if (!redSelect || !blueSelect) return;

  // Get filtered athletes for current mode
  const filteredAthletes = getFilteredAthletes();

  // Clear existing options (except first one)
  redSelect.innerHTML = '<option value="">-- Chọn VĐV --</option>';
  blueSelect.innerHTML = '<option value="">-- Chọn VĐV --</option>';

  // Add filtered athletes to dropdowns
  // Store original index in athletes array as the value
  filteredAthletes.forEach((athlete) => {
    const originalIndex = athletes.indexOf(athlete);

    const optionRed = document.createElement("option");
    optionRed.value = originalIndex; // Use original index
    optionRed.textContent = `${athlete.name} - ${athlete.unit}`;
    redSelect.appendChild(optionRed);

    const optionBlue = document.createElement("option");
    optionBlue.value = originalIndex; // Use original index
    optionBlue.textContent = `${athlete.name} - ${athlete.unit}`;
    blueSelect.appendChild(optionBlue);
  });
}

// Update filter status display
function updateFilterStatus() {
  const filterStatusDiv = document.getElementById("filterStatus");
  if (!filterStatusDiv) return;

  const totalAthletes = athletes.length;

  if (totalAthletes === 0) {
    filterStatusDiv.innerHTML = "";
    return;
  }

  // Count Kumite athletes
  const kumiteIndividual = athletes.filter((a) => {
    const isKumite = !a.type || a.type.includes("kumite");
    const isIndividual =
      !a.category ||
      a.category.includes("cá nhân") ||
      a.category.includes("individual");
    return isKumite && isIndividual;
  }).length;

  const kumiteTeam = athletes.filter((a) => {
    const isKumite = !a.type || a.type.includes("kumite");
    const isTeam =
      a.category &&
      (a.category.includes("đồng đội") || a.category.includes("team"));
    return isKumite && isTeam;
  }).length;

  // Count Kata athletes
  const kataIndividual = athletes.filter((a) => {
    const isKata = a.type && a.type.includes("kata");
    const isIndividual =
      !a.category ||
      a.category.includes("cá nhân") ||
      a.category.includes("individual");
    return isKata && isIndividual;
  }).length;

  const kataTeam = athletes.filter((a) => {
    const isKata = a.type && a.type.includes("kata");
    const isTeam =
      a.category &&
      (a.category.includes("đồng đội") || a.category.includes("team"));
    return isKata && isTeam;
  }).length;

  filterStatusDiv.innerHTML = `
    ✅ Đã tải <strong>${totalAthletes}</strong> VĐV<br>
    📊 Kumite: <strong>${kumiteIndividual}</strong> cá nhân, <strong>${kumiteTeam}</strong> đồng đội | 
    Kata: <strong>${kataIndividual}</strong> cá nhân, <strong>${kataTeam}</strong> đồng đội<br>
    🎯 Hiển thị: <strong>${
      state.mode === "individual" ? kumiteIndividual : kumiteTeam
    }</strong> VĐV (Kumite ${
    state.mode === "individual" ? "Cá nhân" : "Đồng đội"
  })
  `;
}

// Get filtered athletes for current mode
function getFilteredAthletes() {
  return athletes.filter((athlete) => {
    const isKumite = !athlete.type || athlete.type.includes("kumite");
    const matchesMode =
      state.mode === "individual"
        ? !athlete.category ||
          athlete.category.includes("cá nhân") ||
          athlete.category.includes("individual")
        : athlete.category &&
          (athlete.category.includes("đồng đội") ||
            athlete.category.includes("team"));
    return isKumite && matchesMode;
  });
}

// ==================== END CSV UPLOAD FUNCTIONS ====================

// ==================== ATHLETE SEARCH FUNCTIONS ====================

// Filter athletes based on search input
function filterAthletes(side) {
  const searchInputId =
    side === "aka" ? "redAthleteSearch" : "blueAthleteSearch";
  const selectId = side === "aka" ? "redAthleteSelect" : "blueAthleteSelect";

  const searchInput = document.getElementById(searchInputId);
  const select = document.getElementById(selectId);

  if (!searchInput || !select) return;

  const searchTerm = removeVietnameseAccents(
    searchInput.value.toLowerCase().trim()
  );
  const options = select.options;

  if (searchTerm === "") {
    // Show all options if search is empty
    for (let i = 0; i < options.length; i++) {
      options[i].style.display = "";
      options[i].style.background = "";
      options[i].style.color = "";
    }
    select.selectedIndex = 0;
    searchInput.style.borderColor = "";
    searchInput.title = "";
    return;
  }

  let visibleOptions = [];
  let firstMatchIndex = -1;

  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    const text = removeVietnameseAccents(option.textContent.toLowerCase());

    // Check if matches
    if (i === 0) {
      // Always hide the placeholder option
      option.style.display = "none";
    } else if (text.includes(searchTerm)) {
      option.style.display = "";
      option.style.background = "#fffacd"; // Highlight matching options
      option.style.color = "#000";
      visibleOptions.push(i);

      if (firstMatchIndex === -1) {
        firstMatchIndex = i;
      }
    } else {
      option.style.display = "none";
      option.style.background = "";
      option.style.color = "";
    }
  }

  // Auto-select behavior
  if (visibleOptions.length === 1) {
    // Only one match - auto select
    select.selectedIndex = visibleOptions[0];
    searchInput.style.borderColor = "#38ef7d";
    searchInput.title = "1 kết quả - Nhấn Enter để chọn";
  } else if (visibleOptions.length > 1) {
    // Multiple matches - select first one
    select.selectedIndex = firstMatchIndex;
    searchInput.style.borderColor = "#ffd700";
    searchInput.title = `${visibleOptions.length} kết quả - Chọn từ danh sách`;
  } else {
    // No matches
    select.selectedIndex = 0;
    searchInput.style.borderColor = "#ff4444";
    searchInput.title = "Không tìm thấy VĐV";
  }
}

// Handle Enter key in athlete search
function handleAthleteSearchKeyPress(event, side) {
  if (event.key === "Enter") {
    const selectId = side === "aka" ? "redAthleteSelect" : "blueAthleteSelect";
    const select = document.getElementById(selectId);

    if (select.selectedIndex > 0) {
      // Select the athlete
      selectAthlete(side);
      // Clear search
      clearAthleteSearch(side);
    }
  } else if (event.key === "Escape") {
    clearAthleteSearch(side);
  }
}

// Clear athlete search
function clearAthleteSearch(side) {
  const searchInputId =
    side === "aka" ? "redAthleteSearch" : "blueAthleteSearch";
  const selectId = side === "aka" ? "redAthleteSelect" : "blueAthleteSelect";

  const searchInput = document.getElementById(searchInputId);
  const select = document.getElementById(selectId);

  if (searchInput) {
    searchInput.value = "";
    searchInput.style.borderColor = "";
    searchInput.title = "";
  }

  if (select) {
    filterAthletes(side); // Reset the dropdown
  }
}

// Helper function to remove Vietnamese accents for better search
function removeVietnameseAccents(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

// ==================== END ATHLETE SEARCH FUNCTIONS ====================

// Load state from localStorage
function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsedState = JSON.parse(saved);
    state = { ...state, ...parsedState };
    state.proposedWinner = null;
    state.timer = { ...state.timer, ...parsedState.timer, hasStarted: parsedState.timer?.hasStarted === true };
    state.hantei = normalizeHanteiState(parsedState.hantei);
    if (parsedState.medicalTimer) {
      state.medicalTimer = { ...state.medicalTimer, ...parsedState.medicalTimer };
      if (state.medicalTimer.isOpen && state.medicalTimer.isRunning) {
        runMedicalTimerInterval();
      }
    }
  }
  updateUI();
  updatePreview();
}

// Save state to localStorage
function saveState() {
  const serializedState = JSON.stringify(state);
  localStorage.setItem(STORAGE_KEY, serializedState);
  if (kumiteStateChannel) kumiteStateChannel.postMessage(serializedState);
  window.dispatchEvent(new Event("storage"));
  updatePreview();
}

// Update UI from state
function updateUI() {
  // Chế độ được nhận tự động từ dữ liệu trận đấu.
  const individualModeBtn = document.getElementById("individualModeBtn");
  const teamModeBtn = document.getElementById("teamModeBtn");
  const teamRoundSection = document.getElementById("teamRoundSection");

  if (individualModeBtn) {
    individualModeBtn.classList.toggle("active", state.mode === "individual");
  }
  if (teamModeBtn) {
    teamModeBtn.classList.toggle("active", state.mode === "team");
  }
  if (teamRoundSection) {
    teamRoundSection.style.display = state.mode === "team" ? "block" : "none";
  }
  if (state.mode === "team") {
    updateTeamModeDisplay();
  }
  const teamAthleteSelectors = document.getElementById("teamAthleteSelectors");
  if (teamAthleteSelectors) teamAthleteSelectors.hidden = state.mode !== "team";

  // Các trường thông tin trận có thể không xuất hiện trên giao diện rút gọn.
  const redNameInput = document.getElementById("redName");
  const blueNameInput = document.getElementById("blueName");
  const categoryInput = document.getElementById("category");
  if (redNameInput) redNameInput.value = state.akaName;
  if (blueNameInput) blueNameInput.value = state.aoName;
  if (categoryInput) categoryInput.value = state.category;

  // Update penalties
  const penaltyKeys = ["C1", "C2", "C3", "HC", "H"];
  ["aka", "ao"].forEach((side) => {
    document.querySelectorAll(`.penalty-cell.penalty-${side}`).forEach((button, index) => {
      const isActive = state[`${side}Penalties`][penaltyKeys[index]] === true;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  });

  // Update seconds input (preserve decimal formatting and avoid overwriting while user is focused/typing)
  const secondsInput = document.getElementById("secondsInput");
  if (secondsInput && document.activeElement !== secondsInput) {
    const totalSec = (state.timer.minutes * 60 + state.timer.seconds) + ((state.timer.deciseconds || 0) / 10);
    secondsInput.value = formatSecondsValue(totalSec);
  }

  // Update error names
  document.getElementById("errorC1").value = state.errorNames.C1;
  document.getElementById("errorC2").value = state.errorNames.C2;
  document.getElementById("errorC3").value = state.errorNames.C3;
  document.getElementById("errorHC").value = state.errorNames.HC;
  document.getElementById("errorH").value = state.errorNames.H;
  // Update point names
  document.getElementById("pointSenshu").value = state.pointNames.Senshu;
  document.getElementById("pointIppon").value = state.pointNames.Ippon;
  document.getElementById("pointWazaAri").value = state.pointNames.WazaAri;
  document.getElementById("pointYuko").value = state.pointNames.Yuko;
  // Update font scale
  if (document.getElementById("fontScale")) {
    document.getElementById("fontScale").value = state.fontScale || 100;
    document.getElementById("fontScaleLabel").textContent =
      (state.fontScale || 100) + "%";
  }
  if (document.getElementById("displayLayout")) {
    document.getElementById("displayLayout").value =
      state.displayLayout === "vertical" ? "vertical" : "horizontal";
  }
  const swapPositionsBtn = document.getElementById("swapPositionsBtn");
  document.body.classList.toggle("positions-swapped", state.swapPositions === true);
  if (swapPositionsBtn) {
    const isSwapped = state.swapPositions === true;
    swapPositionsBtn.classList.toggle("active", isSwapped);
    swapPositionsBtn.setAttribute("aria-pressed", String(isSwapped));
    swapPositionsBtn.title = isSwapped
      ? "Đưa AKA về vị trí ban đầu"
      : "Đổi vị trí hiển thị AKA và AO";
  }
  // Update timer speed label
  if (document.getElementById("timerSpeedLabel")) {
    document.getElementById("timerSpeedLabel").textContent =
      (state.timerSpeed || 1) + "x";
  }
  // Update match round
  if (document.getElementById("matchRound")) {
    document.getElementById("matchRound").value = state.matchRound || "";
  }

  // Update tournament title, event title, and sponsor text
  if (document.getElementById("tournamentTitle")) {
    document.getElementById("tournamentTitle").value =
      state.tournamentTitle || "";
  }
  if (document.getElementById("eventTitle")) {
    document.getElementById("eventTitle").value = state.eventTitle || "Thảm 1";
  }
  if (document.getElementById("sponsorText")) {
    document.getElementById("sponsorText").value =
      state.sponsorText !== undefined ? state.sponsorText : "NHÀ TÀI TRỢ";
  }

  // Update start/stop button
  if (document.getElementById("startStopBtn")) {
    document.getElementById("startStopBtn").textContent = state.timer.isRunning
      ? "Stop"
      : "Start";
  }

  renderHanteiAdmin();
  renderMedicalAdmin();
}

// Update preview display
function updatePreview() {
  const miniDisplay = document.querySelector(".mini-display");
  if (miniDisplay) {
    miniDisplay.classList.toggle("positions-swapped", state.swapPositions === true);
  }
  document.getElementById("previewCategory").textContent = state.category || "KUMITE";
  document.getElementById("previewAkaName").textContent = state.akaName || "AKA";
  document.getElementById("previewAoName").textContent = state.aoName || "AO";
  document.getElementById("previewAkaScore").textContent = state.akaScore;
  document.getElementById("previewAoScore").textContent = state.aoScore;

  // Update Senshu indicators in preview (above scores)
  const akaSenshuPreview = document.getElementById("previewAkaSenshu");
  const aoSenshuPreview = document.getElementById("previewAoSenshu");
  if (akaSenshuPreview) {
    akaSenshuPreview.style.display = state.akaSenshu ? "block" : "none";
  }
  if (aoSenshuPreview) {
    aoSenshuPreview.style.display = state.aoSenshu ? "block" : "none";
  }

  // Update timer
  const minutes = String(state.timer.minutes).padStart(2, "0");
  const seconds = String(state.timer.seconds).padStart(2, "0");
  document.getElementById("previewTimer").textContent = `${minutes}:${seconds}`;
  const previewDecimal = document.querySelector(".mini-timer-decimal");
  if (previewDecimal) previewDecimal.textContent = `.${state.timer.deciseconds}`;
  const remainingDeciseconds = (state.timer.minutes * 60 + state.timer.seconds) * 10 + state.timer.deciseconds;
  const miniTimer = document.querySelector(".mini-timer");
  if (miniTimer) {
    miniTimer.classList.remove("timer-white", "timer-yellow", "timer-red");
    miniTimer.classList.add(remainingDeciseconds <= 0 || !state.timer.hasStarted ? "timer-white" : remainingDeciseconds <= 150 ? "timer-red" : "timer-yellow");
  }

  // Update penalty buttons in preview
  updatePreviewPenalties("Aka", state.akaPenalties);
  updatePreviewPenalties("Ao", state.aoPenalties);
}

// Update preview penalty buttons
function updatePreviewPenalties(competitor, penalties) {
  const container = document.getElementById(`preview${competitor}Penalties`);
  const buttons = container.querySelectorAll(".mini-penalty-btn");
  const penaltyKeys = ["C1", "C2", "C3", "HC", "H"];

  buttons.forEach((btn, index) => {
    const key = penaltyKeys[index];
    btn.textContent = state.errorNames[key];
    if (penalties[key]) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

// Timer functions
function playManualKumiteBeep() {
  const audio = new Audio("sounds/beep-2.wav");
  audio.play().catch((error) => {
    console.warn("Unable to play Kumite sound:", error);
  });
}

function toggleTimer() {
  if (state.timer.isRunning) {
    stopTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  state.timer.hasStarted = true;
  state.timer.isRunning = true;
  document.getElementById("startStopBtn").textContent = "Stop";
  saveState();

  // Calculate interval based on timer speed (100ms / speed)
  const intervalTime = 100 / (state.timerSpeed || 1);

  timerInterval = setInterval(() => {
    if (state.timer.deciseconds > 0) {
      state.timer.deciseconds--;
    } else if (state.timer.seconds > 0) {
      state.timer.seconds--;
      state.timer.deciseconds = 9;
    } else if (state.timer.minutes > 0) {
      state.timer.minutes--;
      state.timer.seconds = 59;
      state.timer.deciseconds = 9;
    } else {
      stopTimer();
      maybeProposeWinner("timer-ended");
      return;
    }
    if (
      state.timer.minutes === 0 &&
      state.timer.seconds === 0 &&
      state.timer.deciseconds === 0
    ) {
      stopTimer();
      maybeProposeWinner("timer-ended");
      return;
    }
    // Save directly to localStorage without dispatching event each time
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updatePreview();
  }, intervalTime);
}

function stopTimer() {
  state.timer.isRunning = false;
  document.getElementById("startStopBtn").textContent = "Start";

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  saveState();
}

function parseSecondsValue(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!/^\d*(?:\.\d*)?$/.test(normalized) || normalized === "" || normalized === ".") {
    return null;
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function formatSecondsValue(value) {
  const tenths = Math.max(0, Math.round((Number(value) || 0) * 10));
  return tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1);
}

function applySecondsValue(totalSeconds) {
  const totalTenths = Math.max(0, Math.round(totalSeconds * 10));
  state.timer.minutes = Math.floor(totalTenths / 600);
  state.timer.seconds = Math.floor((totalTenths % 600) / 10);
  state.timer.deciseconds = totalTenths % 10;
  state.timer.hasStarted = false;
}

function handleSecondsInput(event) {
  if (state.timer.isRunning) return;
  const parsed = parseSecondsValue(event.target.value);
  if (parsed === null) return;
  applySecondsValue(parsed);
  saveState();
  updatePreview();
}

function commitSecondsInput() {
  const input = document.getElementById("secondsInput");
  const parsed = parseSecondsValue(input?.value);
  const totalSeconds = parsed === null ? 180 : parsed;
  if (input) input.value = formatSecondsValue(totalSeconds);
  if (!state.timer.isRunning) {
    applySecondsValue(totalSeconds);
    saveState();
    updatePreview();
  }
}

function handleSecondsKeyDown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    commitSecondsInput();
    event.target.blur();
  }
}

function resetTimer() {
  stopTimer();
  const input = document.getElementById("secondsInput");
  const totalSeconds = parseSecondsValue(input?.value);
  applySecondsValue(totalSeconds === null ? 180 : totalSeconds);
  if (input) input.value = formatSecondsValue(totalSeconds === null ? 180 : totalSeconds);
  saveState();
  updatePreview();
}

function adjustSeconds(amount) {
  const input = document.getElementById("secondsInput");
  const parsed = parseSecondsValue(input?.value);
  const value = Math.max(0, (parsed === null ? 180 : parsed) + amount);
  input.value = formatSecondsValue(value);

  if (!state.timer.isRunning) {
    applySecondsValue(value);
    saveState();
    updatePreview();
  }
}

function setSeconds() {
  const input = document.getElementById("secondsInput");
  const totalSeconds = parseSecondsValue(input?.value);
  if (!state.timer.isRunning) {
    applySecondsValue(totalSeconds === null ? 180 : totalSeconds);
    if (input) input.value = formatSecondsValue(totalSeconds === null ? 180 : totalSeconds);
    saveState();
    updatePreview();
  }
}

// Timer Speed Control
function setTimerSpeed(speed) {
  const wasRunning = state.timer.isRunning;

  // Stop timer if running
  if (wasRunning) {
    stopTimer();
  }

  // Update speed
  state.timerSpeed = speed;
  saveState();

  // Update UI
  document.getElementById("timerSpeedLabel").textContent = speed + "x";

  // Restart timer if it was running
  if (wasRunning) {
    startTimer();
  }
}

// Score functions
function ensureTechniqueCounts() {
  const empty = () => ({ ippon: 0, wazaari: 0, yuko: 0 });
  state.techniqueCounts = state.techniqueCounts || {};
  state.techniqueCounts.aka = { ...empty(), ...state.techniqueCounts.aka };
  state.techniqueCounts.ao = { ...empty(), ...state.techniqueCounts.ao };
  return state.techniqueCounts;
}

function formatTechniqueSummary(side) {
  const counts = ensureTechniqueCounts()[side];
  const total = side === 'aka' ? state.akaScore : state.aoScore;
  return `IPPON:${counts.ippon} WAZA-ARI:${counts.wazaari} YUKO:${counts.yuko} TOTAL:${total}`;
}

function addPoint(competitor, type) {
  if (type === "senshu") {
    if (competitor === "aka") {
      state.akaSenshu = !state.akaSenshu;
      if (state.akaSenshu) {
        state.aoSenshu = false;
        triggerFullscreenDisplay(competitor, "senshu", 0);
        addMatchLog('senshu', 'aka', 'Senshu → AKA');
      } else {
        addMatchLog('senshu', 'aka', 'Bỏ Senshu AKA');
      }
    } else {
      state.aoSenshu = !state.aoSenshu;
      if (state.aoSenshu) {
        state.akaSenshu = false;
        triggerFullscreenDisplay(competitor, "senshu", 0);
        addMatchLog('senshu', 'ao', 'Senshu → AO');
      } else {
        addMatchLog('senshu', 'ao', 'Bỏ Senshu AO');
      }
    }
  } else {
    const points = POINT_VALUES[type];
    ensureTechniqueCounts()[competitor][type] += 1;
    const typeName = type === 'wazaari' ? 'Waza-ari' : type.charAt(0).toUpperCase() + type.slice(1);
    if (competitor === "aka") {
      state.akaScore += points;
      addMatchLog('point', 'aka', formatTechniqueSummary('aka'));
    } else {
      state.aoScore += points;
      addMatchLog('point', 'ao', formatTechniqueSummary('ao'));
    }
    triggerFullscreenDisplay(competitor, type, points);
  }
  saveState();
  if (type !== "senshu") maybeProposeWinner("live");
}

function removePoint(competitor, type) {
  const points = POINT_VALUES[type];
  const counts = ensureTechniqueCounts()[competitor];
  if (!counts[type]) return;
  counts[type] -= 1;
  if (competitor === "aka") {
    state.akaScore = Math.max(0, state.akaScore - points);
    addMatchLog('remove', 'aka', formatTechniqueSummary('aka'));
  } else {
    state.aoScore = Math.max(0, state.aoScore - points);
    addMatchLog('remove', 'ao', formatTechniqueSummary('ao'));
  }
  saveState();
}

function countPenaltiesForWin(side) {
  const penalties = side === "aka" ? state.akaPenalties : state.aoPenalties;
  return Object.values(penalties || {}).filter(Boolean).length;
}

function compareTechniquesForWin() {
  const counts = ensureTechniqueCounts();
  for (const technique of ["ippon", "wazaari", "yuko"]) {
    const diff = (counts.aka[technique] || 0) - (counts.ao[technique] || 0);
    if (diff !== 0) return diff > 0 ? "aka" : "ao";
  }
  return null;
}

function buildLiveWinProposal() {
  const diff = state.akaScore - state.aoScore;
  if (Math.abs(diff) >= 8) {
    return {
      winner: diff > 0 ? "aka" : "ao",
      code: "eight-point-gap",
      reason: `C\u00e1ch bi\u1ec7t ${Math.abs(diff)} \u0111i\u1ec3m (lu\u1eadt c\u00e1ch bi\u1ec7t 8 \u0111i\u1ec3m).`,
    };
  }
  const akaFaults = countPenaltiesForWin("aka");
  const aoFaults = countPenaltiesForWin("ao");
  if (akaFaults >= 5 || aoFaults >= 5) {
    const loser = akaFaults >= 5 ? "aka" : "ao";
    return {
      winner: loser === "aka" ? "ao" : "aka",
      code: "five-penalties",
      reason: `${loser.toUpperCase()} \u0111\u00e3 nh\u1eadn \u0111\u1ee7 5 l\u1ed7i.`,
    };
  }
  return null;
}

function buildEndTimeWinProposal() {
  const live = buildLiveWinProposal();
  if (live) return live;
  const diff = state.akaScore - state.aoScore;
  if (diff !== 0) {
    return {
      winner: diff > 0 ? "aka" : "ao",
      code: "time-score",
      reason: `H\u1ebft th\u1eddi gian, d\u1eabn \u0111i\u1ec3m ${state.akaScore} - ${state.aoScore}.`,
    };
  }
  if (state.akaSenshu !== state.aoSenshu) {
    const winner = state.akaSenshu ? "aka" : "ao";
    return { winner, code: "senshu", reason: `H\u00f2a \u0111i\u1ec3m, ${winner.toUpperCase()} c\u00f3 Senshu.` };
  }
  const winner = compareTechniquesForWin();
  if (!winner) return null;
  const c = ensureTechniqueCounts();
  return {
    winner,
    code: "higher-technique",
    reason: `H\u00f2a \u0111i\u1ec3m, x\u00e9t Ippon -> Waza-ari -> Yuko. AKA: ${c.aka.ippon}/${c.aka.wazaari}/${c.aka.yuko}; AO: ${c.ao.ippon}/${c.ao.wazaari}/${c.ao.yuko}.`,
  };
}

function winProposalSignature(p) {
  const c = ensureTechniqueCounts();
  return [state.matchId || "local", state.mode === "team" ? state.teamMode.currentRound : 0,
    p.code, p.winner, state.akaScore, state.aoScore,
    countPenaltiesForWin("aka"), countPenaltiesForWin("ao"),
    c.aka.ippon, c.aka.wazaari, c.aka.yuko,
    c.ao.ippon, c.ao.wazaari, c.ao.yuko,
    Number(state.akaSenshu), Number(state.aoSenshu)].join("|");
}

/* Disabled malformed draft produced by the Windows patch transport.
function countPenalties(side) {
  const penalties = side === aka ? state.akaPenalties : state.aoPenalties;
  return Object.values(penalties || {}).filter(Boolean).length;
}

function compareScoringTechniques() {
  const counts = ensureTechniqueCounts();
  for (const technique of [ippon, wazaari, yuko]) {
    const difference = (counts.aka[technique] || 0) - (counts.ao[technique] || 0);
    if (difference !== 0) return difference > 0 ? aka : ao;
  }
  return null;
}

function getWinProposal(trigger) {
  const difference = state.akaScore - state.aoScore;
  const akaFaults = countPenalties(aka);
  const aoFaults = countPenalties(ao);
  if (Math.abs(difference) >= 8) {
    return {
      winner: difference > 0 ? aka : ao,
      code: eight-point-gap,
      reason: `C�ch bj��y��y�t ${Math.abs(difference)}!i�w^~)�wm (lu�w^~)�ut c�ch bj��y��y�t 8 �w^~)�uk�u���Cm).`,
    };
  }
  if (akaFaults >= 5 || aoFaults >= 5) {
    const loser = akaFaults >= 5 ? aka : ao;
    return {
      winner: loser === aka ? ao : aka,
      code: five-penalties,
      reason: `${loser.toUpperCase()}!� nj��y��y�n!�u���g 5 n��y��y�i.`,
    };
  }
  return getEndTimeWinProposal(trigger, difference);
}

function getEndTimeWinProposal(trigger, difference) {
  if (trigger !== timer-ended) return null;
  if (difference !== 0) {
    return {
      winner: difference > 0 ? aka : ao,
      code: time-score,
      reason: \`H\u1ebft th\u1eddi gian, d\u1eabn \u0111i\u1ec3m \${state.akaScore} - \${state.aoScore}.\`,
    };
  }
  if (state.akaSenshu !== state.aoSenshu) {
    const winner = state.akaSenshu ? aka : ao;
    return { winner, code: senshu, reason: \`H\u00f2a \u0111i\u1ec3m, \${winner.toUpperCase()} c\u00f3 Senshu.\` };
  }
  const winner = compareScoringTechniques();
  if (!winner) return null;
  const c = ensureTechniqueCounts();
  return {
    winner,
    code: higher-technique,
    reason: \`H\u00f2a \u0111i\u1ec3m, x\u00e9t \u0111\u00f2n cao h\u01a1n theo Ippon -> Waza-ari -> Yuko. AKA: \${c.aka.ippon}/\${c.aka.wazaari}/\${c.aka.yuko}; AO: \${c.ao.ippon}/\${c.ao.wazaari}/\${c.ao.yuko}.\`,
  };
}

function proposalSignature(proposal) {
  const c = ensureTechniqueCounts();
  return [
    state.matchId || local,
    state.mode === team ? state.teamMode.currentRound : 0,
    proposal.code, proposal.winner, state.akaScore, state.aoScore,
    countPenalties(aka), countPenalties(ao),
    c.aka.ippon, c.aka.wazaari, c.aka.yuko,
    c.ao.ippon, c.ao.wazaari, c.ao.yuko,
    Number(state.akaSenshu), Number(state.aoSenshu),
  ].join(|);
}

function maybeProposeWinner(trigger) {
  if (state.winnerFlash) return;
  const proposal = getWinProposal(trigger);
  if (!proposal) return;
  proposal.signature = proposalSignature(proposal);
  if (dismissedWinProposals.has(proposal.signature)) return;
  activeWinProposal = proposal;

  const side = proposal.winner.toUpperCase();
  const name = proposal.winner === aka ? state.akaName : state.aoName;
  document.getElementById(winProposalSide).textContent = side;
  document.getElementById(winProposalName).textContent = name || side;
  document.getElementById(winProposalReason).textContent = proposal.reason;
  document.getElementById(winProposalOverlay).classList.add(show);
}

function closeWinProposal(rememberRejection = false) {
  if (rememberRejection && activeWinProposal) {
    dismissedWinProposals.add(activeWinProposal.signature);
    addMatchLog(system, ", \`Admin t\u1eeb ch\u1ed1i \u0111\u1ec1 xu\u1ea5t \${activeWinProposal.winner.toUpperCase()} th\u1eafng. H\u00e3y ch\u1ecdn Red Wins ho\u1eb7c Blue Wins.\`);
  }
  document.getElementById(winProposalOverlay)?.classList.remove(show);
  activeWinProposal = null;
}

function rejectWinProposal() {
  closeWinProposal(true);
}

function acceptWinProposal() {
  if (!activeWinProposal) return;
  const proposal = activeWinProposal;
  closeWinProposal(false);
  state.winnerFlash = proposal.winner;
  addMatchLog(win, proposal.winner, \`\${proposal.winner.toUpperCase()} TH\u1eaeNG - \${proposal.reason}\`);
  saveState();

  if (state.mode === team) {
    setTimeout(() => finishRound(), 350);
  } else if (pendingMatchData || state.matchId) {
    setTimeout(() => finishMatch(true), 350);
  }
}

*/
function maybeProposeWinner(trigger) {
  if (state.winnerFlash || activeWinProposal) return;
  const proposal = trigger === "timer-ended"
    ? buildEndTimeWinProposal()
    : buildLiveWinProposal();
  if (!proposal) return;
  proposal.signature = winProposalSignature(proposal);
  if (dismissedWinProposals.has(proposal.signature)) return;

  if (proposal.code === "eight-point-gap") {
    const hasTimeRemaining =
      state.timer.minutes > 0 ||
      state.timer.seconds > 0 ||
      state.timer.deciseconds > 0;
    if (hasTimeRemaining) {
      if (state.timer.isRunning) stopTimer();
      state.forcedEndBeepAt = Date.now();
    }
  }

  activeWinProposal = proposal;
  state.proposedWinner = proposal.winner;
  saveState();
  const side = proposal.winner.toUpperCase();
  const name = proposal.winner === "aka" ? state.akaName : state.aoName;
  document.getElementById("winProposalSide").textContent = side;
  document.getElementById("winProposalName").textContent = name || side;
  document.getElementById("winProposalReason").textContent = proposal.reason;
  document.getElementById("winProposalOverlay").classList.add("show");
}

function closeWinProposal(rememberRejection = false) {
  if (rememberRejection && activeWinProposal) {
    dismissedWinProposals.add(activeWinProposal.signature);
    addMatchLog("system", "", `Th\u01b0 k\u00fd t\u1eeb ch\u1ed1i \u0111\u1ec1 xu\u1ea5t ${activeWinProposal.winner.toUpperCase()} th\u1eafng. H\u00e3y ch\u1ecdn Red Wins ho\u1eb7c Blue Wins.`);
  }
  document.getElementById("winProposalOverlay")?.classList.remove("show");
  activeWinProposal = null;
  state.proposedWinner = null;
  saveState();
}

function rejectWinProposal() {
  closeWinProposal(true);
}

function acceptWinProposal() {
  if (!activeWinProposal) return;
  const proposal = activeWinProposal;
  closeWinProposal(false);
  state.winnerFlash = proposal.winner;
  state.proposedWinner = null;
  addMatchLog("win", proposal.winner, `${proposal.winner.toUpperCase()} TH\u1eaeNG - ${proposal.reason}`);
  saveState();
  if (state.mode === "team") setTimeout(() => finishRound(), 1500);
  else if (pendingMatchData || state.matchId) setTimeout(() => finishMatch(true), 1500);
}

function redWins() {
  // Automatic win rules use the same manual winner state after admin approval.
  closeWinProposal(false);
  state.winnerFlash = "aka";
  addMatchLog('win', 'aka', '🏆 AKA THẮNG');
  saveState();
  
  // Tự động Gửi kết quả về sơ đồ thi đấu (nếu trận được load từ bracket)
  if (state.mode !== "team" && (pendingMatchData || state.matchId)) {
    setTimeout(() => finishMatch(true), 1500); // Đợi 1.5s để người xem thấy ai thắng rồi tự đóng
  }
}

function blueWins() {
  closeWinProposal(false);
  state.winnerFlash = "ao";
  addMatchLog('win', 'ao', '🏆 AO THẮNG');
  saveState();

  // Tự động Gửi kết quả về sơ đồ thi đấu (nếu trận được load từ bracket)
  if (state.mode !== "team" && (pendingMatchData || state.matchId)) {
    setTimeout(() => finishMatch(true), 1500); // Đợi 1.5s để người xem thấy ai thắng rồi tự đóng
  }
}

function createDefaultHanteiState() {
  const count = 5;
  return {
    status: "idle",
    judgeCount: count,
    votes: Array(count).fill(null),
    akaFlags: 0,
    aoFlags: 0,
    winner: null,
  };
}

function normalizeHanteiState(value) {
  const normalized = createDefaultHanteiState();
  if (!value || typeof value !== "object") return normalized;

  normalized.status = ["idle", "open", "confirmed"].includes(value.status)
    ? value.status
    : "idle";
  normalized.votes = Array.from(
    { length: normalized.judgeCount },
    (_, index) => value.votes?.[index] === "aka" || value.votes?.[index] === "ao"
      ? value.votes[index]
      : null
  );

  const counts = getHanteiCounts(normalized.votes);
  normalized.akaFlags = counts.aka;
  normalized.aoFlags = counts.ao;
  normalized.winner = normalized.status === "confirmed" &&
    (value.winner === "aka" || value.winner === "ao")
    ? value.winner
    : null;
  return normalized;
}

function getHanteiCounts(votes = state.hantei?.votes || []) {
  return votes.reduce((counts, vote) => {
    if (vote === "aka") counts.aka += 1;
    if (vote === "ao") counts.ao += 1;
    return counts;
  }, { aka: 0, ao: 0 });
}

function splitHanteiCompetitor(fullName, fallback) {
  const parts = String(fullName || fallback).split(" - ");
  return {
    name: parts.shift() || fallback,
    unit: parts.join(" - "),
  };
}

function isMatchTimeFinished() {
  return Number(state.timer?.minutes || 0) === 0 &&
    Number(state.timer?.seconds || 0) === 0 &&
    Number(state.timer?.deciseconds || 0) === 0;
}

function openHantei() {
  if (state.akaScore !== state.aoScore) {
    alert("Kh\u00f4ng th\u1ec3 th\u1ef1c hi\u1ec7n HANTEI v\u00ec t\u1ef7 s\u1ed1 hi\u1ec7n t\u1ea1i kh\u00f4ng h\u00f2a.");
    return;
  }
  if (state.akaSenshu || state.aoSenshu) {
    alert("Tr\u1eadn \u0111\u1ea5u \u0111ang c\u00f3 SENSHU. Vui l\u00f2ng ki\u1ec3m tra l\u1ea1i tr\u01b0\u1edbc khi th\u1ef1c hi\u1ec7n HANTEI.");
    return;
  }
  if (state.hantei?.status === "confirmed") {
    alert("HANTEI \u0111\u00e3 \u0111\u01b0\u1ee3c x\u00e1c nh\u1eadn. H\u00e3y ho\u00e0n t\u00e1c ho\u1eb7c Reset tr\u1eadn tr\u01b0\u1edbc khi th\u1ef1c hi\u1ec7n l\u1ea1i.");
    return;
  }
  if (state.winnerFlash) {
    alert("Tr\u1eadn \u0111\u00e3 c\u00f3 ng\u01b0\u1eddi th\u1eafng. Vui l\u00f2ng ki\u1ec3m tra ho\u1eb7c ho\u00e0n t\u00e1c k\u1ebft qu\u1ea3 tr\u01b0\u1edbc khi m\u1edf HANTEI.");
    return;
  }
  if (!isMatchTimeFinished() &&
      !confirm("Th\u1eddi gian thi \u0111\u1ea5u ch\u01b0a k\u1ebft th\u00fac. B\u1ea1n c\u00f3 ch\u1eafc ch\u1eafn mu\u1ed1n m\u1edf HANTEI kh\u00f4ng?")) {
    return;
  }

  state.hantei = createDefaultHanteiState();
  state.hantei.status = "open";
  stopTimer();
  saveState();
  renderHanteiAdmin();
}

function selectHanteiQuickScore(akaFlags) {
  if (state.hantei?.status !== "open") return;
  const akaCount = Math.min(4, Math.max(0, Number.parseInt(akaFlags, 10) || 0));
  state.hantei.votes = Array.from(
    { length: 5 },
    (_, index) => index < 4 ? (index < akaCount ? "aka" : "ao") : null
  );
  const counts = getHanteiCounts();
  state.hantei.akaFlags = counts.aka;
  state.hantei.aoFlags = counts.ao;
  saveState();
  renderHanteiAdmin();
}

function selectHanteiVote(index, side) {
  if (state.hantei?.status !== "open" || index !== 4) return;
  const assistantCounts = getHanteiCounts(state.hantei.votes.slice(0, 4));
  if (assistantCounts.aka !== 2 || assistantCounts.ao !== 2) return;
  state.hantei.votes[4] = side;
  const counts = getHanteiCounts();
  state.hantei.akaFlags = counts.aka;
  state.hantei.aoFlags = counts.ao;
  saveState();
  renderHanteiAdmin();
}

function clearHanteiVotes() {
  if (state.hantei?.status !== "open") return;
  state.hantei.votes = Array(5).fill(null);
  state.hantei.akaFlags = 0;
  state.hantei.aoFlags = 0;
  saveState();
  renderHanteiAdmin();
}

function cancelHantei() {
  if (state.hantei?.status !== "open") return;
  state.hantei = createDefaultHanteiState();
  saveState();
  renderHanteiAdmin();
}

function confirmHanteiResult() {
  if (state.hantei?.status !== "open") return;
  const counts = getHanteiCounts();
  const assistantCounts = getHanteiCounts(state.hantei.votes.slice(0, 4));
  const assistantSelectedCount = assistantCounts.aka + assistantCounts.ao;
  const needsChiefJudge = assistantCounts.aka === 2 && assistantCounts.ao === 2;

  if (assistantSelectedCount !== 4) {
    alert("Vui l\u00f2ng ch\u1ecdn t\u1ef7 s\u1ed1 c\u1ee7a 4 tr\u1ecdng t\u00e0i ph\u1ee5.");
    return;
  }
  if (needsChiefJudge && !state.hantei.votes[4]) {
    alert("T\u1ef7 s\u1ed1 4 tr\u1ecdng t\u00e0i ph\u1ee5 \u0111ang h\u00f2a 2\u20132. Vui l\u00f2ng ch\u1ecdn quy\u1ebft \u0111\u1ecbnh c\u1ee7a tr\u1ecdng t\u00e0i ch\u00ednh.");
    return;
  }

  const winner = counts.aka > counts.ao ? "aka" : "ao";
  const winnerInfo = splitHanteiCompetitor(state[winner + "Name"], winner.toUpperCase());
  const message =
    "X\u00e1c nh\u1eadn " + winnerInfo.name + " th\u1eafng b\u1eb1ng HANTEI?\\n\\n" +
    "T\u1ef7 s\u1ed1 \u0111i\u1ec3m: " + state.akaScore + "\u2013" + state.aoScore + "\\n" +
    "K\u1ebft qu\u1ea3 c\u1edd: AKA " + counts.aka + "\u2013" + counts.ao + " AO\\n\\n" +
    "HANTEI kh\u00f4ng thay \u0111\u1ed5i t\u1ef7 s\u1ed1 \u0111i\u1ec3m.";
  if (!confirm(message)) return;

  state.hantei.status = "confirmed";
  state.hantei.akaFlags = counts.aka;
  state.hantei.aoFlags = counts.ao;
  state.hantei.winner = winner;
  state.winnerFlash = winner;
  addMatchLog("win", winner, "HANTEI: AKA " + counts.aka + "-" + counts.ao + " AO");
  saveState();
  renderHanteiAdmin();
}

function undoHantei() {
  if (state.hantei?.status !== "confirmed") return;

  state.hantei.status = "open";
  state.hantei.winner = null;
  state.winnerFlash = null;
  addMatchLog("system", "", "Ho\u00e0n t\u00e1c k\u1ebft qu\u1ea3 HANTEI");
  saveState();
  renderHanteiAdmin();
}

function renderHanteiAdmin() {
  const modal = document.getElementById("hanteiModal");
  if (!modal) return;

  const hantei = normalizeHanteiState(state.hantei);
  state.hantei = hantei;
  const undoButton = document.getElementById("undoHanteiBtn");
  const actionGroup = document.querySelector(".result-action-grid");
  const isConfirmed = hantei.status === "confirmed";
  if (undoButton) undoButton.hidden = !isConfirmed;
  if (actionGroup) actionGroup.classList.toggle("has-undo", isConfirmed);

  modal.classList.toggle("show", hantei.status === "open");
  if (hantei.status !== "open") return;

  const aka = splitHanteiCompetitor(state.akaName, "AKA");
  const ao = splitHanteiCompetitor(state.aoName, "AO");
  document.getElementById("hanteiAkaName").textContent = aka.name;
  document.getElementById("hanteiAkaUnit").textContent = aka.unit;
  document.getElementById("hanteiAoName").textContent = ao.name;
  document.getElementById("hanteiAoUnit").textContent = ao.unit;
  document.getElementById("hanteiAkaScore").textContent = state.akaScore;
  document.getElementById("hanteiAoScore").textContent = state.aoScore;
  document.getElementById("hanteiScoreAka").textContent = state.akaScore;
  document.getElementById("hanteiScoreAo").textContent = state.aoScore;
  const counts = getHanteiCounts(hantei.votes);
  document.getElementById("hanteiAkaFlags").textContent = counts.aka;
  document.getElementById("hanteiAoFlags").textContent = counts.ao;

  const list = document.getElementById("hanteiVoteList");
  list.innerHTML = "";
  const assistantCounts = getHanteiCounts(hantei.votes.slice(0, 4));
  const selectedQuickScore = assistantCounts.aka + assistantCounts.ao === 4
    ? assistantCounts.aka
    : null;
  const quickScores = document.createElement("div");
  quickScores.className = "hantei-quick-scores";
  [4, 3, 2, 1, 0].forEach((akaFlags) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hantei-quick-score" + (selectedQuickScore === akaFlags ? " selected" : "");
    button.innerHTML = `<span class="aka-count">${akaFlags}</span><small>&ndash;</small><span class="ao-count">${4 - akaFlags}</span>`;
    button.setAttribute("aria-label", `AKA ${akaFlags}, AO ${4 - akaFlags}`);
    button.setAttribute("aria-pressed", String(selectedQuickScore === akaFlags));
    button.onclick = () => selectHanteiQuickScore(akaFlags);
    quickScores.appendChild(button);
  });
  list.appendChild(quickScores);

  if (selectedQuickScore === 2) {
    const chief = document.createElement("div");
    chief.className = "hantei-chief-choice";
    const label = document.createElement("strong");
    label.textContent = "H\u00d2A 2\u20132 \u2022 TR\u1eccNG T\u00c0I CH\u00cdNH QUY\u1ebeT \u0110\u1ecaNH";
    const options = document.createElement("div");
    options.className = "hantei-judge-options";
    ["aka", "ao"].forEach((side) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hantei-vote " + side + (hantei.votes[4] === side ? " selected" : "");
      button.textContent = side.toUpperCase();
      button.setAttribute("aria-pressed", String(hantei.votes[4] === side));
      button.onclick = () => selectHanteiVote(4, side);
      options.appendChild(button);
    });
    chief.append(label, options);
    list.appendChild(chief);
  }

}
// Penalty functions
function togglePenalty(competitor, type) {
  if (competitor === "aka") {
    state.akaPenalties[type] = !state.akaPenalties[type];
    if (state.akaPenalties[type]) {
      triggerFullscreenDisplay(competitor, "warning", 0, type);
      addMatchLog('penalty', 'aka', `Lỗi ${state.errorNames[type] || type} → AKA`);
    } else {
      addMatchLog('penalty', 'aka', `Bỏ lỗi ${state.errorNames[type] || type} AKA`);
    }
  } else {
    state.aoPenalties[type] = !state.aoPenalties[type];
    if (state.aoPenalties[type]) {
      triggerFullscreenDisplay(competitor, "warning", 0, type);
      addMatchLog('penalty', 'ao', `Lỗi ${state.errorNames[type] || type} → AO`);
    } else {
      addMatchLog('penalty', 'ao', `Bỏ lỗi ${state.errorNames[type] || type} AO`);
    }
  }
  saveState();
  updateUI();
  maybeProposeWinner("live");
}

// Update functions
function updateNames() {
  state.akaName = document.getElementById("redName") ? document.getElementById("redName").value : "";
  state.aoName = document.getElementById("blueName") ? document.getElementById("blueName").value : "";
  saveState();
}

function updateCategory() {
  state.category = document.getElementById("category") ? document.getElementById("category").value : "";
  saveState();
}

function updateErrorNames() {
  state.errorNames.C1 = document.getElementById("errorC1").value || "C1";
  state.errorNames.C2 = document.getElementById("errorC2").value || "C2";
  state.errorNames.C3 = document.getElementById("errorC3").value || "C3";
  state.errorNames.HC = document.getElementById("errorHC").value || "HC";
  state.errorNames.H = document.getElementById("errorH").value || "H";
  saveState();
}

function updatePointNames() {
  state.pointNames.Senshu =
    document.getElementById("pointSenshu").value || "Senshu";
  state.pointNames.Ippon =
    document.getElementById("pointIppon").value || "Ippon";
  state.pointNames.WazaAri =
    document.getElementById("pointWazaAri").value || "Waza-ari";
  state.pointNames.Yuko = document.getElementById("pointYuko").value || "Yuko";
  saveState();
}

// Update tournament title
function updateTournamentTitle() {
  state.tournamentTitle =
    document.getElementById("tournamentTitle").value || "";
  saveState();
}

// Update event title
function updateEventTitle() {
  state.eventTitle = document.getElementById("eventTitle").value || "Thảm 1";
  saveState();
}

// Update sponsor text
function updateSponsorText() {
  const sponsorText = document.getElementById("sponsorText").value;
  // Allow empty string - user can clear it completely
  state.sponsorText = sponsorText;
  saveState();
}

// Trigger fullscreen display for animations
function triggerFullscreenDisplay(
  competitor,
  action,
  points,
  warningType = ""
) {
  state.fullscreenDisplay = {
    competitor: competitor,
    action: action,
    points: points,
    warningType: warningType,
    timestamp: Date.now(),
  };
  saveState();

  // Clear this after 2 seconds to prevent phantom re-triggers on unrelated state updates (like clicking START)
  setTimeout(() => {
    if (state.fullscreenDisplay && state.fullscreenDisplay.timestamp === state.fullscreenDisplay.timestamp) {
      state.fullscreenDisplay = null;
      saveState();
    }
  }, 2000);
}

// Reset functions
function resetAll() {
  state.akaScore = 0;
  state.aoScore = 0;
  state.techniqueCounts = {
    aka: { ippon: 0, wazaari: 0, yuko: 0 },
    ao: { ippon: 0, wazaari: 0, yuko: 0 },
  };
  state.akaPenalties = { C1: false, C2: false, C3: false, HC: false, H: false };
  state.aoPenalties = { C1: false, C2: false, C3: false, HC: false, H: false };
  state.akaSenshu = false;
  state.aoSenshu = false;
  state.winnerFlash = null; // Reset winner flash
  state.hantei = createDefaultHanteiState(state.hantei?.judgeCount);
  state.fullscreenDisplay = null; // Clear any pending overlays
  
  // Clear pending match data to ensure next match is fresh
  pendingMatchData = null;
  localStorage.removeItem(PENDING_MATCH_KEY);

  // Reset team mode if active
  if (state.mode === "team") {
    initializeTeamMode();
  }

  // Preserve the current match history before clearing the on-screen panel.
  persistMatchLogSnapshot(state.matchId);

  // Clear event log for next match
  clearMatchLog();

  resetTimer();
  saveState();
  updateUI();
}

function resetAllSettings() {
  state = {
    mode: "individual",
    displayLayout: "horizontal",
    swapPositions: false,
    category: "",
    akaName: "",
    aoName: "",
    akaScore: 0,
    aoScore: 0,
    techniqueCounts: {
      aka: { ippon: 0, wazaari: 0, yuko: 0 },
      ao: { ippon: 0, wazaari: 0, yuko: 0 },
    },
    akaPenalties: { C1: false, C2: false, C3: false, HC: false, H: false },
    aoPenalties: { C1: false, C2: false, C3: false, HC: false, H: false },
    akaSenshu: false,
    aoSenshu: false,
    timer: {
      minutes: 3,
      seconds: 0,
      deciseconds: 0,
      hasStarted: false,
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
    winnerFlash: null, // Reset winner flash
    hantei: createDefaultHanteiState(),
    timerSpeed: 1, // Reset timer speed to normal
  };
  saveState();
  updateUI();
}

function setLanguage(lang) {
  if (lang === "en") {
    state.errorNames = { C1: "C1", C2: "C2", C3: "C3", HC: "HC", H: "H" };
    state.pointNames = {
      Senshu: "Senshu",
      Ippon: "Ippon",
      WazaAri: "Waza-ari",
      Yuko: "Yuko",
    };
    state.category = "PENALTY";
  }
  saveState();
  updateUI();
}

// Font Scale function
function updateFontScale() {
  const fontScale = parseInt(document.getElementById("fontScale").value);
  state.fontScale = fontScale;
  document.getElementById("fontScaleLabel").textContent = fontScale + "%";
  saveState();
}

// Scoreboard audience layout
function updateDisplayLayout() {
  const layoutSelect = document.getElementById("displayLayout");
  state.displayLayout = layoutSelect?.value === "vertical"
    ? "vertical"
    : "horizontal";
  saveState();
}

// Swap AKA/AO display positions without changing bracket identities.
function swapPositions() {
  state.swapPositions = state.swapPositions !== true;
  saveState();
  updateUI();
}
// Open display window
function openDisplay() {
  displayWindow = window.open(
    "display.html",
    "KumiteDisplay",
    "width=1920,height=1080"
  );
}

// CSV Upload and Athlete Selection Functions
function handleCSVUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const text = e.target.result;
    parseCSV(text);
  };
  reader.readAsText(file, "UTF-8");
}

function parseCSV(text) {
  const lines = text.split("\n");
  athletes = [];

  // Skip header row (first line)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(",");
    if (parts.length >= 2) {
      athletes.push({
        name: parts[0].trim(),
        unit: parts[1].trim(),
      });
    }
  }

  // Populate dropdowns
  populateAthleteDropdowns();
}

function populateAthleteDropdowns() {
  const redSelect = document.getElementById("redAthleteSelect");
  const blueSelect = document.getElementById("blueAthleteSelect");

  if (!redSelect || !blueSelect) return;

  // Clear existing options except first
  redSelect.innerHTML = '<option value="">-- Chọn VĐV --</option>';
  blueSelect.innerHTML = '<option value="">-- Chọn VĐV --</option>';

  // Add athletes to dropdowns
  athletes.forEach((athlete, index) => {
    const optionRed = document.createElement("option");
    optionRed.value = index;
    // Display in dropdown: "NAME (Unit)"
    optionRed.textContent = `${athlete.name.toUpperCase()} (${athlete.unit.toUpperCase()})`;
    redSelect.appendChild(optionRed);

    const optionBlue = document.createElement("option");
    optionBlue.value = index;
    optionBlue.textContent = `${athlete.name.toUpperCase()} (${athlete.unit.toUpperCase()})`;
    blueSelect.appendChild(optionBlue);
  });
}

function selectAthlete(side) {
  const selectId = side === "aka" ? "redAthleteSelect" : "blueAthleteSelect";
  const nameInputId = side === "aka" ? "redName" : "blueName";

  const select = document.getElementById(selectId);
  const selectedIndex = select.value;

  if (selectedIndex === "") return;

  const athlete = athletes[selectedIndex];
  const nameInput = document.getElementById(nameInputId);

  // Set name to: "NAME - UNIT" (uppercase, single line with dash)
  nameInput.value = `${athlete.name.toUpperCase()} - ${athlete.unit.toUpperCase()}`;

  // Tự động reset điểm và lỗi khi chọn VĐV mới để tránh dính dữ liệu trận cũ
  state.akaScore = 0;
  state.aoScore = 0;
  state.techniqueCounts = {
    aka: { ippon: 0, wazaari: 0, yuko: 0 },
    ao: { ippon: 0, wazaari: 0, yuko: 0 },
  };
  state.akaPenalties = { C1: false, C2: false, C3: false, HC: false, H: false };
  state.aoPenalties = { C1: false, C2: false, C3: false, HC: false, H: false };
  state.akaSenshu = false;
  state.aoSenshu = false;
  state.winnerFlash = null;
  state.hantei = createDefaultHanteiState(state.hantei?.judgeCount);
  resetTimer();

  updateNames();
}

function populateRegisteredTeamAthletes() {
  ["aka", "ao"].forEach((side) => {
    const select = document.getElementById(side === "aka" ? "teamAkaAthleteSelect" : "teamAoAthleteSelect");
    const search = document.getElementById(side === "aka" ? "teamAkaAthleteSearch" : "teamAoAthleteSearch");
    if (!select) return;
    const sideLabel = side === "aka" ? "đỏ" : "xanh";
    select.innerHTML = `<option value="">-- Chọn VĐV ${sideLabel} --</option>`;
    if (select.options[0]) {
      select.options[0].textContent += " [" + registeredTeamAthletes[side].length + " VDV]";
    }
    const query = removeVietnameseAccents(search?.value || "").toLowerCase().trim();
    registeredTeamAthletes[side].forEach((athlete, index) => {
      const target = removeVietnameseAccents((athlete.name || "") + " " + (athlete.unit || "")).toLowerCase();
      if (query && !target.includes(query)) return;
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = athlete.unit ? athlete.name + " - " + athlete.unit : athlete.name;
      select.appendChild(option);
    });
  });
}

function selectRegisteredTeamAthlete(side) {
  if (state.mode !== "team") return;
  const select = document.getElementById(side === "aka" ? "teamAkaAthleteSelect" : "teamAoAthleteSelect");
  if (!select || select.value === "") return;
  const athlete = registeredTeamAthletes[side][Number(select.value)];
  if (!athlete) return;
  state[`${side}Name`] = athlete.unit ? `${athlete.name} - ${athlete.unit}` : athlete.name;
  resetScoresOnly();
  saveState();
  updateUI();
}

// End Match and Save Result to Medals
function endMatchAndSave() {
  const KUMITE_MEDALS_STORAGE_KEY = "kumite_medals_results";

  // Get match round
  const matchRoundSelect = document.getElementById("matchRound");
  const matchRound = matchRoundSelect.value;

  if (!matchRound) {
    alert("⚠️ Vui lòng chọn vòng thi đấu (Chung Kết, Bán Kết, Tứ Kết, v.v.)");
    return;
  }

  // Get category
  const category =
    document.getElementById("category").value.trim() || state.category;

  if (!category) {
    alert("⚠️ Vui lòng nhập nội dung thi đấu!");
    return;
  }
  // Determine winner
  // PRIORITY 1: Check if Red Wins or Blue Wins button was clicked (winnerFlash)
  // PRIORITY 2: Compare scores
  // PRIORITY 3: Check Senshu when tied
  let winner, loser, winnerScore, loserScore;

  if (state.winnerFlash === "aka") {
    // Red Wins button clicked - Red is winner regardless of score
    winner = { name: state.akaName, score: state.akaScore };
    loser = { name: state.aoName, score: state.aoScore };
  } else if (state.winnerFlash === "ao") {
    // Blue Wins button clicked - Blue is winner regardless of score
    winner = { name: state.aoName, score: state.aoScore };
    loser = { name: state.akaName, score: state.akaScore };
  } else if (state.akaScore > state.aoScore) {
    // Red wins by score
    winner = { name: state.akaName, score: state.akaScore };
    loser = { name: state.aoName, score: state.aoScore };
  } else if (state.aoScore > state.akaScore) {
    // Blue wins by score
    winner = { name: state.aoName, score: state.aoScore };
    loser = { name: state.akaName, score: state.akaScore };
  } else {
    // Tie - check Senshu
    if (state.akaSenshu && !state.aoSenshu) {
      winner = { name: state.akaName, score: state.akaScore };
      loser = { name: state.aoName, score: state.aoScore };
    } else if (state.aoSenshu && !state.akaSenshu) {
      winner = { name: state.aoName, score: state.aoScore };
      loser = { name: state.akaName, score: state.akaScore };
    } else {
      alert(
        "⚠️ Trận đấu hòa! Vui lòng xác định người thắng bằng cách bấm Red Wins hoặc Blue Wins."
      );
      return;
    }
  }

  // Parse name and unit
  function parseNameUnit(fullName) {
    const parts = fullName.split(" - ");
    return {
      athlete: parts[0]?.trim() || fullName,
      unit: parts[1]?.trim() || "",
    };
  }

  const winnerData = parseNameUnit(winner.name);
  const loserData = parseNameUnit(loser.name);

  // Load medals data
  let medalsData = { eventName: "", categories: [] };
  const saved = localStorage.getItem(KUMITE_MEDALS_STORAGE_KEY);
  if (saved) {
    medalsData = JSON.parse(saved);
  }

  // Find or create category
  let categoryData = medalsData.categories.find(
    (c) => c.categoryName === category
  );
  if (!categoryData) {
    categoryData = {
      categoryName: category,
      gold: { athlete: "", unit: "", round: "Chung Kết" },
      silver: { athlete: "", unit: "", round: "Chung Kết" },
      bronze1: { athlete: "", unit: "", round: "Bán Kết" },
      bronze2: { athlete: "", unit: "", round: "Bán Kết" },
      timestamp: new Date().toISOString(),
    };
    medalsData.categories.push(categoryData);
  }

  // Update based on match round
  let medalAssigned = false;

  if (matchRound === "Chung Kết") {
    // Winner = Gold, Loser = Silver
    categoryData.gold = {
      athlete: winnerData.athlete,
      unit: winnerData.unit,
      round: "Chung Kết",
    };
    categoryData.silver = {
      athlete: loserData.athlete,
      unit: loserData.unit,
      round: "Chung Kết",
    };
    medalAssigned = true;
    alert(
      `🏆 ĐÃ LƯU KẾT QUẢ CHUNG KẾT!\n\n🥇 HCV: ${winnerData.athlete}\n🥈 HCB: ${loserData.athlete}`
    );
  } else if (matchRound === "Bán Kết 1") {
    // Loser = Bronze #1
    categoryData.bronze1 = {
      athlete: loserData.athlete,
      unit: loserData.unit,
      round: "Bán Kết",
    };
    medalAssigned = true;
    alert(
      `🥉 ĐÃ LƯU KẾT QUẢ BÁN KẾT 1!\n\nHCĐ #1: ${loserData.athlete}\nThắng: ${winnerData.athlete} (vào Chung Kết)`
    );
  } else if (matchRound === "Bán Kết 2") {
    // Loser = Bronze #2
    categoryData.bronze2 = {
      athlete: loserData.athlete,
      unit: loserData.unit,
      round: "Bán Kết",
    };
    medalAssigned = true;
    alert(
      `🥉 ĐÃ LƯU KẾT QUẢ BÁN KẾT 2!\n\nHCĐ #2: ${loserData.athlete}\nThắng: ${winnerData.athlete} (vào Chung Kết)`
    );
  } else {
    // Other rounds - just save match result
    alert(
      `✅ KẾT THÚC TRẬN ${matchRound}!\n\nThắng: ${winnerData.athlete} (${winner.score}đ)\nThua: ${loserData.athlete} (${loser.score}đ)\n\n(Chỉ lưu huy chương cho Chung Kết và Bán Kết)`
    );
  }

  // Save to localStorage
  if (medalAssigned) {
    categoryData.timestamp = new Date().toISOString();
    localStorage.setItem(KUMITE_MEDALS_STORAGE_KEY, JSON.stringify(medalsData));
  }

  // Ask if user wants to reset for next match
  if (confirm("Reset điểm số cho trận tiếp theo?")) {
    resetAll();
  }
}

// Update match round in state
function updateMatchRound() {
  const matchRoundSelect = document.getElementById("matchRound");
  if (matchRoundSelect) {
    state.matchRound = matchRoundSelect.value;
    saveState();
  }
}

// ==================== MODE MANAGEMENT ====================

// Set mode (individual or team)
function setMode(mode) {
  state.mode = mode;

  // Nút chọn chế độ không còn xuất hiện trên giao diện rút gọn.
  const individualModeBtn = document.getElementById("individualModeBtn");
  const teamModeBtn = document.getElementById("teamModeBtn");
  if (individualModeBtn) {
    individualModeBtn.classList.toggle("active", mode === "individual");
  }
  if (teamModeBtn) {
    teamModeBtn.classList.toggle("active", mode === "team");
  }
  // Show/hide team round section
  const teamRoundSection = document.getElementById("teamRoundSection");
  if (teamRoundSection) {
    teamRoundSection.style.display = mode === "team" ? "block" : "none";
  }

  // Reset if switching modes
  if (mode === "team") {
    initializeTeamMode();
  }

  // Update filter status and re-populate dropdowns
  updateFilterStatus();
  populateAthleteDropdowns();

  saveState();
  broadcastUpdate();
}

// Initialize team mode
function initializeTeamMode() {
  state.teamMode = {
    currentRound: 1,
    maxRounds: 5,
    akaWins: 0,
    aoWins: 0,
    roundHistory: [],
  };
  updateTeamModeDisplay();
  saveState();
}

// Update team mode display
function updateTeamModeDisplay() {
  if (state.mode !== "team") return;

  document.getElementById(
    "currentRoundDisplay"
  ).textContent = `${state.teamMode.currentRound} / ${state.teamMode.maxRounds}`;
  document.getElementById("teamAkaWins").textContent = state.teamMode.akaWins;
  document.getElementById("teamAoWins").textContent = state.teamMode.aoWins;
}

// Finish current round and save result
function finishRound() {
  if (state.mode !== "team") {
    alert("⚠️ Chức năng này chỉ dành cho mode Đồng Đội!");
    return;
  }

  if (state.teamMode.currentRound > state.teamMode.maxRounds) {
    alert("⚠️ Đã hết số round tối đa!");
    return;
  }

  if (!state.winnerFlash) {
    const proposal = buildEndTimeWinProposal();
    if (proposal) {
      maybeProposeWinner("timer-ended");
      return;
    }
    alert("Kh\u00f4ng th\u1ec3 t\u1ef1 x\u00e1c \u0111\u1ecbnh ng\u01b0\u1eddi th\u1eafng round. Th\u01b0 k\u00fd ph\u1ea3i ch\u1ecdn Red Wins ho\u1eb7c Blue Wins.");
    return;
  }

  // Determine round winner
  let roundWinner = "";
  if (state.winnerFlash === "aka") {
    roundWinner = "AKA";
    state.teamMode.akaWins++;
  } else if (state.winnerFlash === "ao") {
    roundWinner = "AO";
    state.teamMode.aoWins++;
  } else if (state.akaScore > state.aoScore) {
    roundWinner = "AKA";
    state.teamMode.akaWins++;
  } else if (state.aoScore > state.akaScore) {
    roundWinner = "AO";
    state.teamMode.aoWins++;
  } else {
    roundWinner = "DRAW";
  }

  // Save round result to history
  const roundResult = {
    round: state.teamMode.currentRound,
    akaName: state.akaName,
    aoName: state.aoName,
    akaScore: state.akaScore,
    aoScore: state.aoScore,
    winner: roundWinner,
    timestamp: new Date().toISOString(),
  };

  state.teamMode.roundHistory.push(roundResult);

  // Show result
  const message =
    `✅ KẾT QUẢ ROUND ${state.teamMode.currentRound}:\n\n` +
    `🔴 ${state.akaName}: ${state.akaScore}\n` +
    `🔵 ${state.aoName}: ${state.aoScore}\n\n` +
    `🏆 Thắng: ${roundWinner === "DRAW" ? "HÒA" : roundWinner}\n\n` +
    `📊 Tổng kết:\n` +
    `🔴 AKA thắng: ${state.teamMode.akaWins} round\n` +
    `🔵 AO thắng: ${state.teamMode.aoWins} round`;

  alert(message);

  // Check if match is over
  const roundsPlayed = state.teamMode.currentRound;
  const roundsRemaining = state.teamMode.maxRounds - roundsPlayed;
  const scoreDiff = Math.abs(state.teamMode.akaWins - state.teamMode.aoWins);

  // Check if one team already won (impossible for other to catch up)
  if (scoreDiff > roundsRemaining) {
    const matchWinner =
      state.teamMode.akaWins > state.teamMode.aoWins
        ? `🔴 ${state.akaName}`
        : `🔵 ${state.aoName}`;

    if (
      confirm(
        `🏆 TRẬN ĐẤU KẾT THÚC!\n\n` +
          `Thắng: ${matchWinner}\n` +
          `Tỉ số: ${state.teamMode.akaWins} - ${state.teamMode.aoWins}\n\n` +
          `Bạn có muốn reset để bắt đầu trận mới?`
      )
    ) {
      if (finishTeamMatch(true)) {
        return;
      }
      resetAll();
      return;
    }
  }

  // Move to next round
  if (state.teamMode.currentRound < state.teamMode.maxRounds) {
    state.teamMode.currentRound++;

    // Reset scores for next round
    resetScoresOnly();

    updateTeamModeDisplay();
    saveState();
    broadcastUpdate();

    alert(`🔄 Bắt đầu Round ${state.teamMode.currentRound}!`);
  } else {
    // All rounds completed
    const matchWinner =
      state.teamMode.akaWins > state.teamMode.aoWins
        ? `🔴 ${state.akaName}`
        : state.teamMode.aoWins > state.teamMode.akaWins
        ? `🔵 ${state.aoName}`
        : "HÒA";

    alert(
      `🏁 HOÀN THÀNH TẤT CẢ ${state.teamMode.maxRounds} ROUNDS!\n\n` +
        `🏆 Kết quả chung cuộc: ${matchWinner}\n` +
        `📊 Tỉ số: ${state.teamMode.akaWins} - ${state.teamMode.aoWins}`
    );
    if (state.teamMode.akaWins !== state.teamMode.aoWins) {
      finishTeamMatch();
    }
  }
}

// Reset scores only (for next round in team mode)
function resetScoresOnly() {
  closeWinProposal(false);
  dismissedWinProposals.clear();
  state.akaScore = 0;
  state.aoScore = 0;
  state.techniqueCounts = {
    aka: { ippon: 0, wazaari: 0, yuko: 0 },
    ao: { ippon: 0, wazaari: 0, yuko: 0 },
  };
  state.akaPenalties = { C1: false, C2: false, C3: false, HC: false, H: false };
  state.aoPenalties = { C1: false, C2: false, C3: false, HC: false, H: false };
  state.akaSenshu = false;
  state.aoSenshu = false;
  state.winnerFlash = null;
  state.hantei = createDefaultHanteiState(state.hantei?.judgeCount);
  // Giữ nguyên Tên Đoàn/VĐV và UI Dropdown (không reset) để người dùng tự chọn VĐV tiếp theo!

  resetTimer();
  updateUI();
  updatePreview();
}

// View round history
function viewRoundHistory() {
  if (state.mode !== "team") {
    alert("⚠️ Chức năng này chỉ dành cho mode Đồng Đội!");
    return;
  }

  if (state.teamMode.roundHistory.length === 0) {
    alert("📭 Chưa có round nào được lưu!");
    return;
  }

  let message = "📜 LỊCH SỬ CÁC ROUND:\n\n";

  state.teamMode.roundHistory.forEach((round, index) => {
    message += `Round ${round.round}:\n`;
    message += `  🔴 ${round.akaName}: ${round.akaScore}\n`;
    message += `  🔵 ${round.aoName}: ${round.aoScore}\n`;
    message += `  🏆 Thắng: ${
      round.winner === "DRAW" ? "HÒA" : round.winner
    }\n`;
    message += `  🕒 ${new Date(round.timestamp).toLocaleString("vi-VN")}\n\n`;
  });

  message += `📊 TỔNG KẾT:\n`;
  message += `🔴 AKA thắng: ${state.teamMode.akaWins} round\n`;
  message += `🔵 AO thắng: ${state.teamMode.aoWins} round`;

  alert(message);
}

// ==================== BRACKET INTEGRATION FUNCTIONS ====================

// Key dùng chung với React app
const PENDING_MATCH_KEY = 'pending_match';
const MATCH_RESULT_KEY = 'match_result';

// Biến lưu thông tin trận đấu từ bracket
let pendingMatchData = null;
let lastLoadedMatchTimestamp = 0;

/**
 * Kiểm tra và load VĐV từ sơ đồ thi đấu (bracket)
 */
function checkForPendingMatch() {
  try {
    const data = localStorage.getItem(PENDING_MATCH_KEY);
    if (data) {
      pendingMatchData = JSON.parse(data);
      
      // Clear the trigger immediately so it doesn't fire again
      localStorage.removeItem(PENDING_MATCH_KEY);
      
      // Chỉ load nếu là trận kumite
      if (pendingMatchData.categoryType === 'kumite') {
        if (Number(pendingMatchData.timestamp) <= lastLoadedMatchTimestamp) return;
        lastLoadedMatchTimestamp = Number(pendingMatchData.timestamp) || Date.now();
        loadPendingMatch();
      }
    }
  } catch (error) {
    console.error('Error checking pending match:', error);
  }
}

window.addEventListener('message', function (event) {
  if (event.data?.type !== 'LOAD_SCOREBOARD_MATCH' || !event.data.match) return;
  if (event.data.match.categoryType !== 'kumite') return;
  if (Number(event.data.match.timestamp) <= lastLoadedMatchTimestamp) return;
  lastLoadedMatchTimestamp = Number(event.data.match.timestamp) || Date.now();
  pendingMatchData = event.data.match;
  localStorage.removeItem(PENDING_MATCH_KEY);
  loadPendingMatch();
});

/**
 * Load thông tin VĐV từ pending match vào scoreboard
 */
async function loadPendingMatch() {
  if (!pendingMatchData) {
    alert('Không có trận đấu nào đang chờ!');
    return;
  }
  
  const isTeam = pendingMatchData.categoryName && 
                 (pendingMatchData.categoryName.toLowerCase().includes('đồng đội') || 
                  pendingMatchData.categoryName.toLowerCase().includes('hỗn hợp'));

  registeredTeamAthletes = { aka: [], ao: [] };
  if (isTeam) {
    const normalizeClub = (value) => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
    const resolveTeamMembers = (team, side) => {
      const directRoster = pendingMatchData.teamRosters?.[side];
      if (Array.isArray(directRoster) && directRoster.length) return directRoster;
      const nested = Array.isArray(team?.members) ? team.members : [];
      if (nested.length) return nested;
      const teamKeys = new Set([
        normalizeClub(team?.name),
        normalizeClub(team?.club),
      ].filter(Boolean));
      const categoryAthletes = (Array.isArray(pendingMatchData.categoryAthletes)
        ? pendingMatchData.categoryAthletes
        : []);
      const teamId = String(team?.id || "").toLowerCase().replace(/-/g, "_");
      const idMembers = categoryAthletes.filter((athlete) => {
        const athleteId = String(athlete?.id || "").toLowerCase().replace(/-/g, "_");
        return athleteId.length > 8 && teamId.includes(athleteId);
      });
      if (idMembers.length) return idMembers;
      const canonicalClub = (value) => normalizeClub(value)
        .replace(/\b(CLB|NDK|KARATE|KARATEDO|KARATE DO|VO DUONG)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const canonicalTeams = [...teamKeys].map(canonicalClub).filter(Boolean);
      const clubMembers = categoryAthletes.filter((athlete) => {
        const club = canonicalClub(athlete?.club);
        return canonicalTeams.some((key) =>
          club === key ||
          (key.length >= 4 && club.includes(key)) ||
          (club.length >= 4 && key.includes(club))
        );
      });
      return clubMembers.length ? clubMembers : categoryAthletes;
    };
    const normalizeMembers = (team, side) => resolveTeamMembers(team, side)
      .map((member) => ({
        name: String(member?.name || member?.fullName || "").trim().toUpperCase(),
        unit: String(member?.club || team?.name || team?.club || "").trim().toUpperCase(),
      }))
      .filter((member) => member.name);
    registeredTeamAthletes.aka = normalizeMembers(pendingMatchData.athlete1, "aka");
    registeredTeamAthletes.ao = normalizeMembers(pendingMatchData.athlete2, "ao");
    populateRegisteredTeamAthletes();
    setTimeout(populateRegisteredTeamAthletes, 0);
    setTimeout(populateRegisteredTeamAthletes, 300);
  }

  // Prepare names
  let akaName = "AKA";
  let aoName = "AO";

  if (pendingMatchData.athlete1) {
    const name = pendingMatchData.athlete1.name.toUpperCase();
    const club = pendingMatchData.athlete1.club ? pendingMatchData.athlete1.club.toUpperCase() : '';
    akaName = isTeam ? name : (club ? `${name} - ${club}` : name);
    
    // Clear athletes array and populate with members for team matches
    if (isTeam && typeof athletes !== 'undefined') {
      athletes = []; // Reset athletes list for brand new teams
      if (pendingMatchData.athlete1.members && pendingMatchData.athlete1.members.length > 0) {
        pendingMatchData.athlete1.members.forEach(m => {
          athletes.push({ name: m.name.toUpperCase(), unit: name, category: pendingMatchData.categoryName });
        });
      }
    }
  }

  if (pendingMatchData.athlete2) {
    const name = pendingMatchData.athlete2.name.toUpperCase();
    const club = pendingMatchData.athlete2.club ? pendingMatchData.athlete2.club.toUpperCase() : '';
    aoName = isTeam ? name : (club ? `${name} - ${club}` : name);
    
    if (isTeam && pendingMatchData.athlete2.members && pendingMatchData.athlete2.members.length > 0 && typeof athletes !== 'undefined') {
      pendingMatchData.athlete2.members.forEach(m => {
        athletes.push({ name: m.name.toUpperCase(), unit: name, category: pendingMatchData.categoryName });
      });
    }
  }
  
  if (isTeam && typeof populateAthleteDropdowns === 'function') {
    populateAthleteDropdowns();
  }
  
  // Save current UI-only settings that should persist
  const currentTournamentTitle = pendingMatchData.tournamentName || state.tournamentTitle;
  const currentEventTitle = pendingMatchData.matNumber ? `Thảm ${pendingMatchData.matNumber}` : state.eventTitle;
  const currentSponsorText = state.sponsorText;
  const currentFontScale = state.fontScale;
  const currentDisplayLayout = state.displayLayout;

  // KILL TIMER COMPLETELY
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // RE-INITIALIZE STATE TO DEFAULTS
  // This is the "nuclear" reset to ensure no data from previous match leaks
  state = {
    mode: isTeam ? "team" : "individual",
    displayLayout: currentDisplayLayout === "vertical" ? "vertical" : "horizontal",
    category: pendingMatchData.categoryName || "",
    akaName: akaName,
    aoName: aoName,
    akaScore: 0,
    aoScore: 0,
    techniqueCounts: {
      aka: { ippon: 0, wazaari: 0, yuko: 0 },
      ao: { ippon: 0, wazaari: 0, yuko: 0 },
    },
    akaPenalties: { C1: false, C2: false, C3: false, HC: false, H: false },
    aoPenalties: { C1: false, C2: false, C3: false, HC: false, H: false },
    akaSenshu: false,
    aoSenshu: false,
    timer: {
      minutes: 3,
      seconds: 0,
      deciseconds: 0,
      hasStarted: false,
      isRunning: false,
    },
    errorNames: { C1: "C1", C2: "C2", C3: "C3", HC: "HC", H: "H" },
    pointNames: {
      Senshu: "Senshu",
      Ippon: "Ippon",
      WazaAri: "Waza-ari",
      Yuko: "Yuko",
    },
    fontScale: currentFontScale || 100,
    winnerFlash: null,
    hantei: createDefaultHanteiState(),
    fullscreenDisplay: null,
    tournamentTitle: currentTournamentTitle,
    eventTitle: currentEventTitle,
    sponsorText: currentSponsorText,
    // Logos must belong to the match's tournament. Never retain logos from
    // the previously opened match when the current tournament has none.
    sponsorLogos: pendingMatchData.sponsorLogos || { sponsors: [] },
    swapPositions: false,
    matchId: pendingMatchData.matchId || null,
    matchRound: pendingMatchData.roundName || "",
    timerSpeed: 1,
    medicalTimer: {
      isOpen: false,
      minutes: 3,
      seconds: 0,
      deciseconds: 0,
      isRunning: false,
      hasStarted: false,
      expired: false,
    },
    teamMode: isTeam ? {
      currentRound: 1,
      maxRounds: 5,
      akaWins: 0,
      aoWins: 0,
      roundHistory: [],
    } : null
  };

  // Load existing scores and winner from bracket if available
  if (pendingMatchData.score1 != null || pendingMatchData.score2 != null) {
    state.akaScore = Number(pendingMatchData.score1) || 0;
    state.aoScore = Number(pendingMatchData.score2) || 0;
  }
  
  // Restore winner flash if match already has winner
  if (pendingMatchData.hasWinner && pendingMatchData.winnerId) {
    if (pendingMatchData.athlete1 && pendingMatchData.winnerId === pendingMatchData.athlete1.id) {
      state.winnerFlash = "aka";
    } else if (pendingMatchData.athlete2 && pendingMatchData.winnerId === pendingMatchData.athlete2.id) {
      state.winnerFlash = "ao";
    }
  }

  // Start restoring SQLite history before any secondary UI work.  A failure
  // in an unrelated widget must never prevent the match log from loading.
  const earlyMatchId = state.matchId;
  if (earlyMatchId) {
    restoreMatchLogForMatch(earlyMatchId).catch((error) => {
      console.error("Khong the khoi phuc log som:", error);
    });
  }

  // Update UI components that are not bound directly to state in updateUI
  if (document.getElementById('redName')) document.getElementById('redName').value = akaName;
  if (document.getElementById('blueName')) document.getElementById('blueName').value = aoName;
  if (document.getElementById('category')) document.getElementById('category').value = state.category;
  if (document.getElementById('tournamentTitle')) document.getElementById('tournamentTitle').value = state.tournamentTitle;
  if (document.getElementById('eventTitle')) document.getElementById('eventTitle').value = state.eventTitle;
  
  // Reset search inputs
  if (document.getElementById("redAthleteSearch")) document.getElementById("redAthleteSearch").value = "";
  if (document.getElementById("blueAthleteSearch")) document.getElementById("blueAthleteSearch").value = "";

  // Reset timer to default
  resetTimer();
  
  saveState();
  updateUI();
  updatePreview();
  populateRegisteredTeamAthletes();
  
  console.log('✅ Đã load VĐV từ sơ đồ thi đấu:', pendingMatchData);
  
  // Always restore history by matchId, including unfinished matches.
  const loadedMatchId = state.matchId;
  const restoredEvents = await restoreMatchLogForMatch(loadedMatchId);
  /* Legacy localStorage log restore disabled.
    const key = `kumite_log_${state.matchId}`;
    try {
      if (!restoredEvents.length && window.electronAPI?.db?.getSessionData) {
        const sqliteValue = await window.electronAPI.db.getSessionData('GLOBAL', `match_log_${state.matchId}`);
        if (sqliteValue) {
          restoredEvents = JSON.parse(sqliteValue) || [];
        }
      }
    } catch (error) {
      console.error('Không thể tải lịch sử trận đấu:', error);
    }
  }

  */
  if (!restoredEvents.length) {
    addMatchLog('system', '', `📋 Trận mới: ${akaName} vs ${aoName}`);
  }
}

/**
 * Kết thúc trận đấu và gửi kết quả về React app (bracket)
 * @param {boolean} autoSubmit - Nếu true, bỏ qua confirm box
 */
function finishTeamMatch(autoSubmit = false) {
  if (!state.teamMode) return false;

  if (!pendingMatchData && state.matchId) {
     pendingMatchData = {
       matchId: state.matchId,
       athlete1: { id: 'aka', name: state.akaName },
       athlete2: { id: 'ao', name: state.aoName }
     };
  }

  if (!pendingMatchData) {
    if (!autoSubmit) alert('Khong co tran dau nao dang cho tu so do!');
    return false;
  }

  let winnerSide = null;
  if (state.teamMode.akaWins > state.teamMode.aoWins) {
    winnerSide = "aka";
  } else if (state.teamMode.aoWins > state.teamMode.akaWins) {
    winnerSide = "ao";
  }

  if (!winnerSide) {
    if (!autoSubmit) alert('Tran dong doi dang hoa, chua the chot nguoi thang chung cuoc.');
    return false;
  }

  const winnerId = winnerSide === "aka"
    ? (pendingMatchData.athlete1?.id || 'aka')
    : (pendingMatchData.athlete2?.id || 'ao');
  const winnerName = winnerSide === "aka" ? state.akaName : state.aoName;

  if (!autoSubmit) {
    if (!confirm(`Xac nhan ket thuc tran dong doi?\n\nNguoi thang: ${winnerName}\nTi so round: ${state.teamMode.akaWins} - ${state.teamMode.aoWins}`)) {
      return false;
    }
  }

  const result = {
    matchId: pendingMatchData.matchId,
    categoryId: pendingMatchData.categoryId || null,
    winnerId: winnerId,
    score1: state.teamMode.akaWins,
    score2: state.teamMode.aoWins,
    timestamp: Date.now(),
    winMethod: state.hantei?.status === "confirmed" ? "HANTEI" : undefined,
    hantei: state.hantei?.status === "confirmed"
      ? { akaFlags: state.hantei.akaFlags, aoFlags: state.hantei.aoFlags } : undefined,
  };

  persistMatchLogSnapshot(result.matchId);
  localStorage.setItem(MATCH_RESULT_KEY, JSON.stringify(result));

  if (window.opener) {
    window.opener.postMessage({
      type: 'MATCH_RESULT',
      result: result,
    }, '*');
  }

  localStorage.removeItem(PENDING_MATCH_KEY);
  pendingMatchData = null;

  alert('Da gui ket qua dong doi ve so do thi dau!');
  resetAll();
  return true;
}

function finishMatch(autoSubmit = false) {
  if (state.mode === "team") {
    return finishTeamMatch(autoSubmit);
  }

  if (!autoSubmit && !state.winnerFlash && (pendingMatchData || state.matchId)) {
    const proposal = buildEndTimeWinProposal();
    if (proposal) {
      maybeProposeWinner("timer-ended");
      return;
    }
    alert("Kh\u00f4ng th\u1ec3 t\u1ef1 x\u00e1c \u0111\u1ecbnh ng\u01b0\u1eddi th\u1eafng. Th\u01b0 k\u00fd ph\u1ea3i ch\u1ecdn Red Wins ho\u1eb7c Blue Wins.");
    return;
  }

  // If no actively pending match data from bracket load, but we do have a matchId in state, 
  // try to reconstruct pendingMatchData so it can submit
  if (!pendingMatchData && state.matchId) {
     pendingMatchData = {
       matchId: state.matchId,
       athlete1: { id: 'aka', name: state.akaName },
       athlete2: { id: 'ao', name: state.aoName }
     };
  }

  if (!pendingMatchData) {
    if (!autoSubmit) alert('Không có trận đấu nào đang chờ từ sơ đồ!');
    return;
  }
  
  // Xác định winner dựa vào điểm hoặc flash
  let winnerId = null;
  let winnerName = '';
  
  if (state.winnerFlash === 'aka') {
    winnerId = pendingMatchData.athlete1?.id || 'aka';
    winnerName = state.akaName;
  } else if (state.winnerFlash === 'ao') {
    winnerId = pendingMatchData.athlete2?.id || 'ao';
    winnerName = state.aoName;
  } else if (state.akaScore > state.aoScore) {
    winnerId = pendingMatchData.athlete1?.id || 'aka';
    winnerName = state.akaName;
  } else if (state.aoScore > state.akaScore) {
    winnerId = pendingMatchData.athlete2?.id || 'ao';
    winnerName = state.aoName;
  }
  
  if (!winnerId) {
    if (!autoSubmit) alert('Chưa có người thắng! Hãy bấm AKA Win hoặc AO Win, hoặc đảm bảo điểm không bằng nhau.');
    return;
  }
  
  // Confirm (skip if autoSubmit is true)
  if (!autoSubmit) {
    if (!confirm(`Xác nhận kết thúc trận?\n\n🏆 Người thắng: ${winnerName}\n📊 Tỉ số: ${state.akaScore} - ${state.aoScore}`)) {
      return;
    }
  }
  
  const result = {
    matchId: pendingMatchData.matchId,
    categoryId: pendingMatchData.categoryId || null,
    winnerId: winnerId,
    score1: state.akaScore,
    score2: state.aoScore,
    timestamp: Date.now(),
    winMethod: state.hantei?.status === "confirmed" ? "HANTEI" : undefined,
    hantei: state.hantei?.status === "confirmed"
      ? { akaFlags: state.hantei.akaFlags, aoFlags: state.hantei.aoFlags } : undefined,
  };
  
  persistMatchLogSnapshot(result.matchId);
  // Lưu vào localStorage
  localStorage.setItem(MATCH_RESULT_KEY, JSON.stringify(result));
  
  // Gửi postMessage đến opener window (React app)
  if (window.opener) {
    window.opener.postMessage({
      type: 'MATCH_RESULT',
      result: result,
    }, '*');
  }
  
  // Clear pending match
  localStorage.removeItem(PENDING_MATCH_KEY);
  pendingMatchData = null;
  
  alert('✅ Đã gửi kết quả về sơ đồ thi đấu!\n\nCửa sổ sẽ sẵn sàng cho trận tiếp theo.');
  
  // Reset cho trận tiếp theo
  resetAll();
}

// ==================== MATCH EVENT LOG ====================

const MATCH_LOG_ENTRIES = []; // in-memory log for current match

/**
 * Add an event to the match log UI and persist to server DB.
 * @param {string} type  - 'point' | 'remove' | 'penalty' | 'senshu' | 'win' | 'system'
 * @param {string} side  - 'aka' | 'ao' | ''
 * @param {string} label - Human-readable action label
 * @param {number|null} scoreAfter - score after event (optional)
 */
function addMatchLog(type, side, label, scoreAfter = null) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Build timer string
  const m = String(state.timer.minutes).padStart(2, '0');
  const s = String(state.timer.seconds).padStart(2, '0');
  const ds = Number(state.timer.deciseconds) || 0;
  const timerStr = `${m}:${s}.${ds}`;

  // Nếu đấu đồng đội, thêm prefix Round vào để log rõ ràng
  let displayLabel = label;
  if (state.mode === 'team' && state.teamMode && type !== 'system') {
    displayLabel = `[R${state.teamMode.currentRound}] ${label}`;
  }

  const entry = {
    type,
    side,
    label: displayLabel,
    scoreAfter,
    time: timeStr,
    timer: timerStr,
    akaScore: state.akaScore,
    aoScore: state.aoScore,
    timestamp: now.toISOString(),
    techniqueCounts: side ? { ...ensureTechniqueCounts()[side] } : null,
  };

  MATCH_LOG_ENTRIES.unshift(entry); // newest on top

  // Render to UI
  renderMatchLogUI(entry);

  // Save to server DB (non-blocking, best-effort)
  const matchId = state.matchId || ('local_' + Date.now());
  saveMatchLogToServer(matchId, entry);
}

function renderMatchLogUI(entry) {
  const logEl = document.getElementById('matchEventLog');
  if (!logEl) return;

  // Remove placeholder
  const placeholder = logEl.querySelector('[data-placeholder]');
  if (placeholder) placeholder.remove();
  // Also clear first-time placeholder text
  if (logEl.innerHTML.includes('Chưa có sự kiện')) logEl.innerHTML = '';

  const matchTime = entry.timer || '00:00.0';
  const sideLabel = entry.side ? `  [${entry.side.toUpperCase()}]` : '';
  let message = entry.label || '';
  if ((entry.type === 'point' || entry.type === 'remove') && entry.side) {
    const counts = entry.techniqueCounts || { ippon: 0, wazaari: 0, yuko: 0 };
    const total = entry.side === 'aka' ? entry.akaScore : entry.aoScore;
    message = `IPPON:${counts.ippon || 0} WAZA-ARI:${counts.wazaari || 0} YUKO:${counts.yuko || 0} TOTAL:${total || 0}`;
  }
  const row = document.createElement('div');
  row.style.cssText = 'color:#fff;padding:3px 6px;white-space:pre;font-family:monospace;animation:logFadeIn 0.25s ease;';
  row.textContent = `${matchTime} [INFO]${sideLabel}  ${message}`;

  // Insert as first child (newest on top since flex-direction: column-reverse)
  logEl.prepend(row);
}

let _logSaveTimer = null;

async function loadMatchLogFromDatabase(matchId) {
  if (!matchId) return [];
  if (window.electronAPI?.db?.getSessionData) {
    try {
      const value = await window.electronAPI.db.getSessionData("GLOBAL", `match_log_${matchId}`);
      const rawValue = typeof value === "string" ? value : (value?.value ?? value?.data ?? null);
      if (rawValue) {
        const logs = typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;
        if (Array.isArray(logs) && logs.length) return logs;
      }
    } catch (error) {
      console.error("Khong the doc log truc tiep tu SQLite:", error);
    }
  }
  if (!window.opener) return [];
  return new Promise((resolve) => {
    let settled = false;
    const finish = (logs = []) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", handleResponse);
      resolve(Array.isArray(logs) ? logs : []);
    };
    const handleResponse = (event) => {
      if (event.data?.type === "MATCH_LOG_RESPONSE" && event.data.matchId === matchId) {
        finish(event.data.logs);
      }
    };
    window.addEventListener("message", handleResponse);
    window.opener.postMessage({ type: "MATCH_LOG_REQUEST", matchId }, "*");
    setTimeout(() => finish([]), 2500);
  });
}

async function restoreMatchLogForMatch(matchId, retry = false) {
  if (!matchId) {
    clearMatchLog();
    return [];
  }
  let logs = [];
  try {
    logs = await loadMatchLogFromDatabase(matchId);
  } catch (error) {
    console.error("Khong the tai lich su tran dau tu SQLite:", error);
  }
  if (state.matchId !== matchId) return [];
  if (!Array.isArray(logs) || !logs.length) {
    if (!retry) clearMatchLog();
    return [];
  }
  clearMatchLog();
  logs.forEach((event) => {
    const entry = { ...event };
    MATCH_LOG_ENTRIES.push(entry);
    renderMatchLogUI(entry);
    if (entry.side && entry.techniqueCounts) {
      ensureTechniqueCounts()[entry.side] = { ...entry.techniqueCounts };
    }
  });
  saveState();
  const status = document.getElementById("logSaveStatus");
  if (status) {
    status.textContent = `\u0110\u00e3 t\u1ea3i ${logs.length} s\u1ef1 ki\u1ec7n t\u1eeb Database`;
    status.style.color = "#4caf50";
  }
  return logs;
}

function saveMatchLogToServer(matchId, event) {
  const databaseLogs = [...MATCH_LOG_ENTRIES].reverse().slice(-100);
  const serialized = JSON.stringify(databaseLogs);
  if (window.electronAPI?.db?.setSessionData) {
    window.electronAPI.db.setSessionData("GLOBAL", `match_log_${matchId}`, serialized)
      .catch((error) => console.error("Khong the luu log vao SQLite:", error));
  }
  if (window.opener) {
    window.opener.postMessage({
      type: "MATCH_LOG_UPDATE",
      matchId,
      logs: databaseLogs,
    }, "*");
  }
  const databaseStatus = document.getElementById("logSaveStatus");
  if (databaseStatus) {
    databaseStatus.textContent = "\u2713 \u0110\u00e3 \u0111\u1ed3ng b\u1ed9 Database";
    databaseStatus.style.color = "#4caf50";
    clearTimeout(_logSaveTimer);
    _logSaveTimer = setTimeout(() => { databaseStatus.textContent = ""; }, 2000);
  }
  return;

  // 1. Lưu backup cục bộ (localStorage)
  let logs = [];
  try {
    const key = `kumite_log_${matchId}`;
    
    event.timestamp = new Date().toISOString();
    logs.push(event);
    if (logs.length > 100) logs = logs.slice(logs.length - 100);
    if (window.electronAPI?.db?.setSessionData) {
      window.electronAPI.db.setSessionData('GLOBAL', `match_log_${matchId}`, JSON.stringify(logs))
        .catch((error) => console.error('Không thể lưu log vào SQLite:', error));
    }
  } catch (err) {}

  // 2. Gửi lệnh qua postMessage về phần mềm chính để lưu vào SQLite
  if (window.opener) {
    window.opener.postMessage({
      type: 'MATCH_LOG_UPDATE',
      matchId: matchId,
      logs: logs
    }, '*');
  }

  // Cập nhật UI
  const statusEl = document.getElementById('logSaveStatus');
  if (statusEl) {
    statusEl.textContent = '✓ Đã đồng bộ Database';
    statusEl.style.color = '#4caf50';
    clearTimeout(_logSaveTimer);
    _logSaveTimer = setTimeout(() => { statusEl.textContent = ''; }, 2000);
  }
}

function persistMatchLogSnapshot(matchId) {
  if (!matchId || MATCH_LOG_ENTRIES.length === 0) return;
  const logs = [...MATCH_LOG_ENTRIES].reverse();
  const databaseValue = JSON.stringify(logs);
  if (window.electronAPI?.db?.setSessionData) {
    window.electronAPI.db.setSessionData("GLOBAL", `match_log_${matchId}`, databaseValue)
      .catch((error) => console.error("Khong the luu snapshot log vao SQLite:", error));
  }
  if (window.opener) {
    window.opener.postMessage({
      type: "MATCH_LOG_UPDATE",
      matchId,
      logs,
    }, "*");
  }
  return;

  const key = `kumite_log_${matchId}`;
  const serialized = JSON.stringify(logs);

  if (window.electronAPI?.db?.setSessionData) {
    window.electronAPI.db.setSessionData("GLOBAL", `match_log_${matchId}`, serialized)
      .catch((error) => console.error("Khong the luu snapshot log tran dau:", error));
  }
  if (window.opener) {
    window.opener.postMessage({
      type: "MATCH_LOG_UPDATE",
      matchId,
      logs,
    }, "*");
  }
  if (!restoredEvents.length && loadedMatchId) {
    setTimeout(() => {
      if (state.matchId === loadedMatchId && MATCH_LOG_ENTRIES.length <= 1) {
        restoreMatchLogForMatch(loadedMatchId, true);
      }
    }, 600);
  }
}

function clearMatchLog(deletePersisted = false) {
  MATCH_LOG_ENTRIES.length = 0;
  const logEl = document.getElementById('matchEventLog');
  if (logEl) {
    logEl.innerHTML = '<div style="color:#555;text-align:center;padding:20px 0" data-placeholder="true">— Chưa có sự kiện —</div>';
  }
  if (deletePersisted && state.matchId) {
    localStorage.removeItem(`kumite_log_${state.matchId}`);
    if (window.opener) {
      window.opener.postMessage({
        type: "MATCH_LOG_DELETE",
        matchId: state.matchId,
      }, "*");
    }
    if (window.electronAPI?.db?.deleteSessionData) {
      window.electronAPI.db.deleteSessionData('GLOBAL', `match_log_${state.matchId}`)
        .catch((error) => console.error('Không thể xóa log trong SQLite:', error));
    }
  }
}

// ==================== END MATCH EVENT LOG ====================

// ==================== END BRACKET INTEGRATION FUNCTIONS ====================


// Initialize
document.addEventListener("DOMContentLoaded", function () {
  loadState();

  // Restore timer if it was running
  if (state.timer.isRunning) {
    state.timer.isRunning = false;
    startTimer();
  }

  // Add match round change listener
  const matchRoundSelect = document.getElementById("matchRound");
  if (matchRoundSelect) {
    matchRoundSelect.addEventListener("change", updateMatchRound);
  }
  
  // Tự động kiểm tra và load VĐV từ bracket
  checkForPendingMatch();

  // Listen for storage changes to update match data when switching matches in bracket
  window.addEventListener("storage", function (e) {
    if (e.key === PENDING_MATCH_KEY && e.newValue) {
      checkForPendingMatch();
    }
    // Also sync state if changed in another window
    if (e.key === STORAGE_KEY) {
      loadState();
    }
  });
});

// Keyboard shortcuts
document.addEventListener("keydown", function (e) {
  // Space to toggle timer
  if (e.code === "Space" && !e.target.matches("input")) {
    e.preventDefault();
    toggleTimer();
  }
  // R to reset timer
  if (e.code === "KeyR" && e.ctrlKey) {
    e.preventDefault();
    resetTimer();
  }
});

// ==================== MEDICAL TIMER FUNCTIONS ====================
function formatMedicalTimeStr(timerObj) {
  const m = String(timerObj.minutes || 0).padStart(2, "0");
  const s = String(timerObj.seconds || 0).padStart(2, "0");
  const ds = timerObj.deciseconds || 0;
  return `${m}:${s}.${ds}`;
}

function startMedicalTimer(kind = "medical") {
  const isRest = kind === "rest";
  const durationMinutes = isRest ? 5 : 3;
  const icon = isRest ? "☕" : "👨‍⚕️";
  const label = isRest ? "Nghỉ giữa trận" : "Yêu cầu Cứu thương";

  if (state.timer.isRunning) stopTimer();

  const matchM = String(state.timer.minutes).padStart(2, "0");
  const matchS = String(state.timer.seconds).padStart(2, "0");
  const matchDs = state.timer.deciseconds || 0;
  const matchTimeStr = `${matchM}:${matchS}.${matchDs}`;
  addMatchLog("system", "", `${icon} ${label} tại thời điểm trận đấu ${matchTimeStr}`);

  state.medicalTimer = {
    kind: isRest ? "rest" : "medical",
    durationMinutes,
    isOpen: true,
    minutes: durationMinutes,
    seconds: 0,
    deciseconds: 0,
    isRunning: true,
    hasStarted: true,
    expired: false,
    endAt: Date.now() + durationMinutes * 60000,
    category: state.category || "KUMITE",
    akaName: state.akaName || "AKA",
    aoName: state.aoName || "AO",
  };

  addMatchLog("system", "", `${icon} ${isRest ? "Rest Timer" : "Medical Timer"} started – 0${durationMinutes}:00`);
  renderMedicalAdmin();
  saveState();
  runMedicalTimerInterval();
}

function startRestTimer() {
  startMedicalTimer("rest");
}
function runMedicalTimerInterval() {
  stopMedicalTimerInterval();

  const intervalTime = 100 / (state.timerSpeed || 1);

  medicalTimerInterval = setInterval(() => {
    if (!state.medicalTimer || !state.medicalTimer.isOpen || !state.medicalTimer.isRunning) {
      stopMedicalTimerInterval();
      return;
    }

    if (!Number.isFinite(state.medicalTimer.endAt)) {
      const remaining = ((state.medicalTimer.minutes || 0) * 60 + (state.medicalTimer.seconds || 0)) * 1000
        + (state.medicalTimer.deciseconds || 0) * 100;
      state.medicalTimer.endAt = Date.now() + remaining;
    }
    const remainingDs = Math.max(0, Math.ceil((state.medicalTimer.endAt - Date.now()) / 100));
    state.medicalTimer.minutes = Math.floor(remainingDs / 600);
    state.medicalTimer.seconds = Math.floor((remainingDs % 600) / 10);
    state.medicalTimer.deciseconds = remainingDs % 10;
    if (remainingDs === 0) {
      // Expired (reached 00:00.0)
      stopMedicalTimerInterval();
      state.medicalTimer.isRunning = false;
      state.medicalTimer.expired = true;

      playManualKumiteBeep();
      const timerLabel = state.medicalTimer.kind === "rest" ? "Rest Timer expired (Hết 5 phút)" : "Medical Timer expired (Hết 3 phút)";
      addMatchLog("system", "", `⚠️ ${timerLabel}`);

      saveState();
      renderMedicalAdmin();
      return;
    }

    // Audio warning alerts at 30s and 10s
    const totalSec = state.medicalTimer.minutes * 60 + state.medicalTimer.seconds;
    if (state.medicalTimer.deciseconds === 0) {
      if (totalSec === 30 || totalSec === 10) {
        playManualKumiteBeep();
      }
    }

    saveState();
    renderMedicalAdmin();
  }, intervalTime);
}

function stopMedicalTimerInterval() {
  if (medicalTimerInterval) {
    clearInterval(medicalTimerInterval);
    medicalTimerInterval = null;
  }
}

function toggleMedicalTimer() {
  if (!state.medicalTimer) return;

  if (state.medicalTimer.isRunning) {
    // STOP action
    stopMedicalTimerInterval();
    state.medicalTimer.isRunning = false;
    const curTime = formatMedicalTimeStr(state.medicalTimer);
    const timerName = state.medicalTimer.kind === "rest" ? "☕ Rest Timer" : "👨‍⚕️ Medical Timer";
    addMatchLog("system", "", `${timerName} stopped – ${curTime}`);
  } else if (!state.medicalTimer.expired) {
    // RESUME action
    state.medicalTimer.isRunning = true;
    const remaining = ((state.medicalTimer.minutes || 0) * 60 + (state.medicalTimer.seconds || 0)) * 1000
      + (state.medicalTimer.deciseconds || 0) * 100;
    state.medicalTimer.endAt = Date.now() + remaining;
    const curTime = formatMedicalTimeStr(state.medicalTimer);
    const timerName = state.medicalTimer.kind === "rest" ? "☕ Rest Timer" : "👨‍⚕️ Medical Timer";
    addMatchLog("system", "", `${timerName} resumed – ${curTime}`);
    runMedicalTimerInterval();
  }

  saveState();
  renderMedicalAdmin();
}

function resetMedicalTimer() {
  if (!state.medicalTimer) return;
  stopMedicalTimerInterval();
  const isRest = state.medicalTimer.kind === "rest";
  const durationMinutes = isRest ? 5 : 3;
  state.medicalTimer.durationMinutes = durationMinutes;
  state.medicalTimer.minutes = durationMinutes;
  state.medicalTimer.seconds = 0;
  state.medicalTimer.deciseconds = 0;
  state.medicalTimer.expired = false;
  state.medicalTimer.isRunning = true;
  state.medicalTimer.hasStarted = true;
  state.medicalTimer.endAt = Date.now() + durationMinutes * 60000;

  addMatchLog("system", "", `${isRest ? "☕ Rest" : "👨‍⚕️ Medical"} Timer reset – 0${durationMinutes}:00`);
  saveState();
  renderMedicalAdmin();
  runMedicalTimerInterval();
}
function closeMedicalTimer() {
  if (!state.medicalTimer) return;

  stopMedicalTimerInterval();
  state.medicalTimer.isRunning = false;
  state.medicalTimer.isOpen = false;
  const timerName = state.medicalTimer.kind === "rest" ? "☕ Rest Timer" : "👨‍⚕️ Medical Timer";
  addMatchLog("system", "", `${timerName} closed`);

  saveState();
  renderMedicalAdmin();
}

function renderMedicalAdmin() {
  const overlay = document.getElementById("medicalModalOverlay");
  if (!overlay) return;

  const med = state.medicalTimer;
  const isOpen = med && med.isOpen === true;
  const isRest = med?.kind === "rest";

  overlay.classList.toggle("show", isOpen);
  overlay.classList.toggle("rest-mode", isRest);
  overlay.style.display = isOpen ? "flex" : "none";
  if (!isOpen) return;

  const titleEl = document.getElementById("medicalTitle");
  const iconEl = document.getElementById("medicalHeaderIcon");
  const resetBtn = document.getElementById("medicalResetBtn");
  if (titleEl) titleEl.textContent = isRest ? "NGHỈ 5 PHÚT" : "MEDICAL TIME";
  if (iconEl) iconEl.textContent = isRest ? "☕" : "👨‍⚕️";
  if (resetBtn) resetBtn.textContent = isRest ? "🔄 05:00" : "🔄 03:00";
  const minutes = String(med.minutes || 0).padStart(2, "0");
  const seconds = String(med.seconds || 0).padStart(2, "0");
  const deciseconds = med.deciseconds || 0;

  const categoryEl = document.getElementById("medicalCategory");
  const akaEl = document.getElementById("medicalAkaName");
  const aoEl = document.getElementById("medicalAoName");
  if (categoryEl) categoryEl.textContent = med.category || state.category || "KUMITE";
  if (akaEl) akaEl.textContent = med.akaName || state.akaName || "AKA";
  if (aoEl) aoEl.textContent = med.aoName || state.aoName || "AO";

  const mainEl = document.getElementById("medicalTimerMain");
  const decEl = document.getElementById("medicalTimerDecimal");
  if (mainEl) mainEl.textContent = `${minutes}:${seconds}`;
  if (decEl) decEl.textContent = `.${deciseconds}`;

  const stopBtn = document.getElementById("medicalStopResumeBtn");
  if (stopBtn) {
    if (med.expired) {
      stopBtn.textContent = "EXPIRED";
      stopBtn.disabled = true;
      stopBtn.classList.remove("is-resume");
    } else if (med.isRunning) {
      stopBtn.textContent = "STOP";
      stopBtn.disabled = false;
      stopBtn.classList.remove("is-resume");
    } else {
      stopBtn.textContent = "RESUME";
      stopBtn.disabled = false;
      stopBtn.classList.add("is-resume");
    }
  }

  const badge = document.getElementById("medicalStatusBadge");
  const notice = document.getElementById("medicalNotice");
  const timerBox = document.getElementById("medicalTimerBox");

  const totalSec = (med.minutes || 0) * 60 + (med.seconds || 0);

  if (timerBox) {
    timerBox.classList.remove("med-warning-30", "med-warning-10", "med-expired");
    if (med.expired || (totalSec === 0 && deciseconds === 0)) {
      timerBox.classList.add("med-expired");
    } else if (totalSec <= 10) {
      timerBox.classList.add("med-warning-10");
    } else if (totalSec <= 30) {
      timerBox.classList.add("med-warning-30");
    }
  }

  if (badge) {
    if (med.expired) {
      badge.textContent = isRest ? "HẾT 5 PHÚT" : "HẾT 3 PHÚT";
      badge.style.color = isRest ? "#facc15" : "#ef4444";
    } else if (!med.isRunning) {
      badge.textContent = "TẠM DỪNG";
      badge.style.color = "#f59e0b";
    } else {
      badge.textContent = "ĐANG ĐẾM NGUỢC";
      badge.style.color = isRest ? "#facc15" : "#10b981";
    }
  }

  if (notice) {
    if (med.expired) {
      notice.textContent = isRest
        ? "⚠️ THỜI GIAN NGHỈ ĐÃ HẾT 5 PHÚT!"
        : "⚠️ THỜI GIAN CỨU THƯƠNG ĐÃ HẾT 3 PHÚT!";
    } else if (!med.isRunning) {
      notice.textContent = isRest
        ? "Thời gian nghỉ đang tạm dừng. Bấm RESUME để tiếp tục."
        : "Thời gian cứu thương đang tạm dừng. Bấm RESUME để tiếp tục.";
    } else {
      notice.textContent = isRest
        ? "Match Timer is paused. Rest Timer 5 minutes."
        : "Match Timer is paused. Medical Timer 3 minutes.";
    }
  }
}
// ==================== END MEDICAL TIMER FUNCTIONS ====================
