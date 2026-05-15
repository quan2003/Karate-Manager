// Kumite Scoreboard - Admin JavaScript
const STORAGE_KEY = "kumite_scoreboard";

// State management
let state = {
  mode: "individual", // 'individual' or 'team'
  category: "PENALTY",
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
};

let timerInterval = null;
let displayWindow = null;
let athletes = []; // Array to store athletes data from CSV

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
  }
  updateUI();
  updatePreview();
}

// Save state to localStorage
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event("storage"));
  updatePreview();
}

// Update UI from state
function updateUI() {
  // Update mode buttons
  if (document.getElementById("individualModeBtn")) {
    document
      .getElementById("individualModeBtn")
      .classList.toggle("active", state.mode === "individual");
    document
      .getElementById("teamModeBtn")
      .classList.toggle("active", state.mode === "team");
    document.getElementById("teamRoundSection").style.display =
      state.mode === "team" ? "block" : "none";

    // Update team mode display if in team mode
    if (state.mode === "team") {
      updateTeamModeDisplay();
    }
  }

  // Update names
  document.getElementById("redName").value = state.akaName;
  document.getElementById("blueName").value = state.aoName;
  document.getElementById("category").value = state.category;

  // Update penalties
  ["C1", "C2", "C3", "HC", "H"].forEach((penalty) => {
    const akaCheck = document.getElementById(`aka${penalty}`);
    if (akaCheck) akaCheck.checked = state.akaPenalties[penalty];
    
    const aoCheck = document.getElementById(`ao${penalty}`);
    if (aoCheck) aoCheck.checked = state.aoPenalties[penalty];
  });

  // Update seconds input
  const totalSeconds = state.timer.minutes * 60 + state.timer.seconds;
  document.getElementById("secondsInput").value = totalSeconds;

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
  document.getElementById("startStopBtn").textContent = state.timer.isRunning
    ? "Stop"
    : "Start";
}

// Update preview display
function updatePreview() {
  document.getElementById("previewCategory").textContent = state.category;
  document.getElementById("previewAkaName").textContent = state.akaName;
  document.getElementById("previewAoName").textContent = state.aoName;
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
function toggleTimer() {
  if (state.timer.isRunning) {
    stopTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
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

function resetTimer() {
  stopTimer();
  const totalSeconds =
    parseInt(document.getElementById("secondsInput").value) || 180;
  state.timer.minutes = Math.floor(totalSeconds / 60);
  state.timer.seconds = totalSeconds % 60;
  state.timer.deciseconds = 0;
  saveState();
}

function adjustSeconds(amount) {
  const input = document.getElementById("secondsInput");
  let value = parseInt(input.value) || 180;
  value = Math.max(0, value + amount);
  input.value = value;

  if (!state.timer.isRunning) {
    state.timer.minutes = Math.floor(value / 60);
    state.timer.seconds = value % 60;
    state.timer.deciseconds = 0;
    saveState();
  }
}

function setSeconds() {
  const totalSeconds =
    parseInt(document.getElementById("secondsInput").value) || 180;
  if (!state.timer.isRunning) {
    state.timer.minutes = Math.floor(totalSeconds / 60);
    state.timer.seconds = totalSeconds % 60;
    state.timer.deciseconds = 0;
    saveState();
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
    const typeName = type === 'wazaari' ? 'Waza-ari' : type.charAt(0).toUpperCase() + type.slice(1);
    if (competitor === "aka") {
      state.akaScore += points;
      addMatchLog('point', 'aka', `+${typeName} (+${points}đ)`);
    } else {
      state.aoScore += points;
      addMatchLog('point', 'ao', `+${typeName} (+${points}đ)`);
    }
    triggerFullscreenDisplay(competitor, type, points);
  }
  saveState();
}

function removePoint(competitor, type) {
  const points = POINT_VALUES[type];
  const typeName = type === 'wazaari' ? 'Waza-ari' : type.charAt(0).toUpperCase() + type.slice(1);
  if (competitor === "aka") {
    state.akaScore = Math.max(0, state.akaScore - points);
    addMatchLog('remove', 'aka', `-${typeName} (-${points}đ)`);
  } else {
    state.aoScore = Math.max(0, state.aoScore - points);
    addMatchLog('remove', 'ao', `-${typeName} (-${points}đ)`);
  }
  saveState();
}

function redWins() {
  state.winnerFlash = "aka";
  addMatchLog('win', 'aka', '🏆 AKA THẮNG');
  saveState();
  
  // Tự động Gửi kết quả về sơ đồ thi đấu (nếu trận được load từ bracket)
  if (state.mode !== "team" && (pendingMatchData || state.matchId)) {
    setTimeout(() => finishMatch(true), 1500); // Đợi 1.5s để người xem thấy ai thắng rồi tự đóng
  }
}

function blueWins() {
  state.winnerFlash = "ao";
  addMatchLog('win', 'ao', '🏆 AO THẮNG');
  saveState();

  // Tự động Gửi kết quả về sơ đồ thi đấu (nếu trận được load từ bracket)
  if (state.mode !== "team" && (pendingMatchData || state.matchId)) {
    setTimeout(() => finishMatch(true), 1500); // Đợi 1.5s để người xem thấy ai thắng rồi tự đóng
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
}

// Update functions
function updateNames() {
  state.akaName = document.getElementById("redName").value || "AKA";
  state.aoName = document.getElementById("blueName").value || "AO";
  saveState();
}

function updateCategory() {
  state.category = document.getElementById("category").value || "PENALTY";
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
  state.akaPenalties = { C1: false, C2: false, C3: false, HC: false, H: false };
  state.aoPenalties = { C1: false, C2: false, C3: false, HC: false, H: false };
  state.akaSenshu = false;
  state.aoSenshu = false;
  state.winnerFlash = null; // Reset winner flash
  state.fullscreenDisplay = null; // Clear any pending overlays
  
  // Clear pending match data to ensure next match is fresh
  pendingMatchData = null;
  localStorage.removeItem(PENDING_MATCH_KEY);

  // Reset team mode if active
  if (state.mode === "team") {
    initializeTeamMode();
  }

  // Clear event log for next match
  clearMatchLog();

  resetTimer();
  saveState();
  updateUI();
}

function resetAllSettings() {
  state = {
    category: "PENALTY",
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
    winnerFlash: null, // Reset winner flash
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
  state.akaPenalties = { C1: false, C2: false, C3: false, HC: false, H: false };
  state.aoPenalties = { C1: false, C2: false, C3: false, HC: false, H: false };
  state.akaSenshu = false;
  state.aoSenshu = false;
  state.winnerFlash = null;
  resetTimer();

  updateNames();
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

  // Update UI buttons
  document
    .getElementById("individualModeBtn")
    .classList.toggle("active", mode === "individual");
  document
    .getElementById("teamModeBtn")
    .classList.toggle("active", mode === "team");

  // Show/hide team round section
  document.getElementById("teamRoundSection").style.display =
    mode === "team" ? "block" : "none";

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
  state.akaScore = 0;
  state.aoScore = 0;
  state.akaPenalties = { C1: false, C2: false, C3: false, HC: false, H: false };
  state.aoPenalties = { C1: false, C2: false, C3: false, HC: false, H: false };
  state.akaSenshu = false;
  state.aoSenshu = false;
  state.winnerFlash = null;
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
        loadPendingMatch();
      }
    }
  } catch (error) {
    console.error('Error checking pending match:', error);
  }
}

/**
 * Load thông tin VĐV từ pending match vào scoreboard
 */
function loadPendingMatch() {
  if (!pendingMatchData) {
    alert('Không có trận đấu nào đang chờ!');
    return;
  }
  
  const isTeam = pendingMatchData.categoryName && 
                 (pendingMatchData.categoryName.toLowerCase().includes('đồng đội') || 
                  pendingMatchData.categoryName.toLowerCase().includes('hỗn hợp'));

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

  // KILL TIMER COMPLETELY
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // RE-INITIALIZE STATE TO DEFAULTS
  // This is the "nuclear" reset to ensure no data from previous match leaks
  state = {
    mode: isTeam ? "team" : "individual",
    category: pendingMatchData.categoryName || "PENALTY",
    akaName: akaName,
    aoName: aoName,
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
    fontScale: currentFontScale || 100,
    winnerFlash: null,
    fullscreenDisplay: null,
    tournamentTitle: currentTournamentTitle,
    eventTitle: currentEventTitle,
    sponsorText: currentSponsorText,
    sponsorLogos: pendingMatchData.sponsorLogos || state.sponsorLogos,
    swapPositions: false,
    matchId: pendingMatchData.matchId || null,
    matchRound: pendingMatchData.roundName || "",
    timerSpeed: 1,
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
  
  console.log('✅ Đã load VĐV từ sơ đồ thi đấu:', pendingMatchData);
  
  // Clear log for fresh match OR fetch old log
  clearMatchLog();
  if (pendingMatchData.hasWinner || pendingMatchData.score1 || pendingMatchData.score2) {
    addMatchLog('system', '', `📋 (Đã xong) Tỉ số cũ: ${state.akaScore}-${state.aoScore}. Xem lại/Sửa điểm.`);
    // Tải logs từ server (nếu mạng kết nối)
    if (state.matchId) {
      try {
        const key = `kumite_log_${state.matchId}`;
        const existing = localStorage.getItem(key);
        if (existing) {
          const events = JSON.parse(existing);
          if (events && events.length > 0) {
            clearMatchLog();
            addMatchLog('system', '', `📋 (Đã xong) Đã tải lịch sử ${events.length} sự kiện.`);
            events.forEach(e => {
               const entry = { ...e };
               MATCH_LOG_ENTRIES.unshift(entry);
               renderMatchLogUI(entry);
            });
          }
        }
      } catch(err) { console.log(err); }
    }
  } else {
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
    winnerId: winnerId,
    score1: state.teamMode.akaWins,
    score2: state.teamMode.aoWins,
    timestamp: Date.now(),
  };

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
    winnerId: winnerId,
    score1: state.akaScore,
    score2: state.aoScore,
    timestamp: Date.now(),
  };
  
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
  const timerStr = `${m}:${s}`;

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

  const COLOR_MAP = {
    aka: '#ff6b6b',
    ao: '#6b9fff',
    '': '#aaa',
  };
  const TYPE_ICON = {
    point: '🟢',
    remove: '🔴',
    penalty: '⚠️',
    senshu: '🟡',
    win: '🏆',
    system: '⚙️',
  };

  const sideColor = COLOR_MAP[entry.side] || '#aaa';
  const icon = TYPE_ICON[entry.type] || '•';
  const sideLabel = entry.side === 'aka' ? `<span style="color:#ff6b6b">[AKA]</span>` :
                    entry.side === 'ao'  ? `<span style="color:#6b9fff">[AO]</span>` : '';
  const scoreStr = `<span style="color:#888">(${entry.akaScore}-${entry.aoScore})</span>`;

  const row = document.createElement('div');
  row.style.cssText = `
    display: flex; align-items: baseline; gap: 6px;
    padding: 3px 6px; border-radius: 4px;
    background: rgba(255,255,255,0.03);
    border-left: 3px solid ${sideColor};
    animation: logFadeIn 0.25s ease;
  `;
  row.innerHTML = `
    <span style="color:#555;flex-shrink:0">${entry.timer}</span>
    <span>${icon}</span>
    ${sideLabel}
    <span style="color:#e2e8f0;flex:1">${entry.label}</span>
    ${scoreStr}
  `;

  // Insert as first child (newest on top since flex-direction: column-reverse)
  logEl.prepend(row);
}

let _logSaveTimer = null;
function saveMatchLogToServer(matchId, event) {
  // 1. Lưu backup cục bộ (localStorage)
  let logs = [];
  try {
    const key = `kumite_log_${matchId}`;
    const existing = localStorage.getItem(key);
    if (existing) logs = JSON.parse(existing);
    
    event.timestamp = new Date().toISOString();
    logs.push(event);
    if (logs.length > 100) logs = logs.slice(logs.length - 100);
    localStorage.setItem(key, JSON.stringify(logs));
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

function clearMatchLog() {
  MATCH_LOG_ENTRIES.length = 0;
  const logEl = document.getElementById('matchEventLog');
  if (logEl) {
    logEl.innerHTML = '<div style="color:#555;text-align:center;padding:20px 0" data-placeholder="true">— Chưa có sự kiện —</div>';
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
