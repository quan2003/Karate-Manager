// Shared state between admin and display
const STORAGE_KEY = "karate_scoreboard";
const MATCH_HISTORY_KEY = "karate_match_history";

// Initialize state
let state = {
  contentType: "individual", // 'individual' or 'team'
  athletes: [],
  teams: [],
  swapPositions: false, // Track if positions are swapped
  tournamentTitle:
    "GIẢI KARATE-DO SINH VIÊN TRƯỜNG ĐẠI HỌC CNTT VÀ TT VIỆT-HÀN MỞ RỘNG LẦN THỨ I - 2025", // Tournament title
  eventTitle: "Thảm 1", // Event title for header
  matchInfo: "KATA CÁ NHÂN NAM LỨA TUỔI 10 TUỔI ĐẾN 11 TUỔI", // Match info for header
  sponsorText: "NHÀ TÀI TRỢ", // Sponsor text
  currentRound: "Vòng Loại", // Current round
  globalFontScale: 100, // Global font scale percentage (30, 35, 40, 45, 50... 150)
  fontSizes: {
    athleteName: 5.5,
    unitName: 3.2,
    kata: 3.5,
    header: 4,
    matchInfo: 2,
  },
  scoringStarted: false, // Track if scoring has started
  aka: {
    athlete: "",
    unit: "",
    team: "",
    score: 0,
    kataName: "Kata Name",
  },
  ao: {
    athlete: "",
    unit: "",
    team: "",
    score: 0,
    kataName: "Kata Name",
  },
  timer: {
    seconds: 300,
    isRunning: false,
  },
};

// Match history storage
let matchHistory = [];

// Load state from localStorage
function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    state = JSON.parse(saved);
    // Đảm bảo score luôn là số, không bao giờ null/undefined
    if (state.aka) state.aka.score = state.aka.score ?? 0;
    if (state.ao) state.ao.score = state.ao.score ?? 0;
  }

  // Load match history
  loadMatchHistory();

  updateUI();

  // Sync global font scale slider
  const globalFontScaleSlider = document.getElementById("globalFontScale");
  if (globalFontScaleSlider) {
    globalFontScaleSlider.value = state.globalFontScale;
    const label = document.getElementById("globalFontScaleLabel");
    if (label) {
      label.textContent = state.globalFontScale + "%";
    }
  }
}

// Save state to localStorage
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  // Broadcast to display window
  window.dispatchEvent(new Event("storage"));
}

// Update UI from state
function updateUI() {
  // Update content type buttons
  document.querySelectorAll(".btn-primary").forEach((btn) => {
    btn.classList.remove("active");
  });
  const activeBtn = state.contentType === "individual" ? 0 : 1;
  document.querySelectorAll(".btn-primary")[activeBtn].classList.add("active"); // Update event info inputs
  document.getElementById("tournamentTitle").value =
    state.tournamentTitle ||
    "GIẢI KARATE-DO SINH VIÊN TRƯỜNG ĐẠI HỌC CNTT VÀ TT VIỆT-HÀN MỞ RỘNG LẦN THỨ I - 2025";
  document.getElementById("eventTitle").value = state.eventTitle || "Thảm 1";
  document.getElementById("matchInfo").value =
    state.matchInfo ||
    "KATA CÁ NHÂN NAM LỨA TUỔI 10 TUỔI ĐẾN 11 TUỔI | ROUND OF 64 POOL 1 #1";

  // Update sponsor text input - allow empty value
  if (document.getElementById("sponsorText")) {
    document.getElementById("sponsorText").value =
      state.sponsorText !== undefined ? state.sponsorText : "NHÀ TÀI TRỢ";
  }

  // Show/hide input sections
  document.getElementById("akaInputIndividual").style.display =
    state.contentType === "individual" ? "block" : "none";
  document.getElementById("akaInputTeam").style.display =
    state.contentType === "team" ? "block" : "none";
  document.getElementById("aoInputIndividual").style.display =
    state.contentType === "individual" ? "block" : "none";
  document.getElementById("aoInputTeam").style.display =
    state.contentType === "team" ? "block" : "none"; // Update scores
  document.getElementById("akaScore").textContent = state.aka.score ?? 0;
  document.getElementById("aoScore").textContent = state.ao.score ?? 0;

  // Update global font scale slider
  const globalFontScaleSlider = document.getElementById("globalFontScale");
  const globalFontScaleLabel = document.getElementById("globalFontScaleLabel");
  if (globalFontScaleSlider) {
    globalFontScaleSlider.value = state.globalFontScale || 100;
  }
  if (globalFontScaleLabel) {
    globalFontScaleLabel.textContent = (state.globalFontScale || 100) + "%";
  }

  // Update font size sliders
  if (state.fontSizes) {
    const athleteNameSlider = document.getElementById("athleteNameSize");
    const unitNameSlider = document.getElementById("unitNameSize");
    const kataSlider = document.getElementById("kataSize");
    const headerSlider = document.getElementById("headerSize");
    const matchInfoSlider = document.getElementById("matchInfoSize");

    if (athleteNameSlider) {
      athleteNameSlider.value = state.fontSizes.athleteName;
      document.getElementById("athleteNameSizeLabel").textContent =
        state.fontSizes.athleteName + "vw";
    }
    if (unitNameSlider) {
      unitNameSlider.value = state.fontSizes.unitName;
      document.getElementById("unitNameSizeLabel").textContent =
        state.fontSizes.unitName + "vw";
    }
    if (kataSlider) {
      kataSlider.value = state.fontSizes.kata;
      document.getElementById("kataSizeLabel").textContent =
        state.fontSizes.kata + "vw";
    }
    if (headerSlider) {
      headerSlider.value = state.fontSizes.header;
      document.getElementById("headerSizeLabel").textContent =
        state.fontSizes.header + "vw";
    }
    if (matchInfoSlider) {
      matchInfoSlider.value = state.fontSizes.matchInfo;
      document.getElementById("matchInfoSizeLabel").textContent =
        state.fontSizes.matchInfo + "vw";
    }
  }
  // Update timer
  updateTimerDisplay();

  // Populate athlete/team selects
  populateSelects();

  // Update filter status
  updateFilterStatus();
}

// Set content type
function setContentType(type) {
  state.contentType = type;
  saveState();
  updateUI();
  updateFilterStatus();
}

// Update event info (title and match info)
function updateEventInfo() {
  const tournamentTitle = document.getElementById("tournamentTitle").value;
  const eventTitle = document.getElementById("eventTitle").value;
  const matchInfo = document.getElementById("matchInfo").value;
  state.tournamentTitle =
    tournamentTitle ||
    "GIẢI KARATE-DO SINH VIÊN TRƯỜNG ĐẠI HỌC CNTT VÀ TT VIỆT-HÀN MỞ RỘNG LẦN THỨ I - 2025";
  state.eventTitle = eventTitle || "Thảm 1";
  state.matchInfo =
    matchInfo ||
    "KATA CÁ NHÂN NAM LỨA TUỔI 10 TUỔI ĐẾN 11 TUỔI | ROUND OF 64 POOL 1 #1";

  saveState();
}

// Update sponsor text
function updateSponsorText() {
  const sponsorText = document.getElementById("sponsorText").value;
  // Allow empty string - user can clear it completely
  state.sponsorText = sponsorText;
  saveState();
}

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
  } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
    statusDiv.textContent =
      "📋 Để sử dụng Excel, vui lòng chuyển đổi sang CSV hoặc nhập thủ công";
    statusDiv.style.color = "#ffd700";
  } else if (file.name.endsWith(".pdf")) {
    statusDiv.textContent =
      "📋 Để sử dụng PDF, vui lòng chuyển đổi sang CSV hoặc nhập thủ công";
    statusDiv.style.color = "#ffd700";
  } else {
    reader.readAsText(file);
  }
}

// Parse file content
function parseFileContent(text, filename) {
  const lines = text.split("\n").filter((line) => line.trim());

  state.athletes = [];
  state.teams = new Set();

  lines.forEach((line, index) => {
    if (index === 0) return; // Skip header if exists

    const parts = line.split(/[,;\t]/).map((p) => p.trim());

    if (parts.length >= 2) {
      const athlete = {
        name: parts[0],
        unit: parts[1],
        type: parts[2] ? parts[2].toLowerCase() : "", // kata or kumite
        category: parts[3] ? parts[3].toLowerCase() : "", // cá nhân or đồng đội
      };
      state.athletes.push(athlete);
      state.teams.add(parts[1]);
    }
  });

  state.teams = Array.from(state.teams);
  saveState();
  updateUI();

  // Show filter status
  updateFilterStatus();
}

// Populate select dropdowns
function populateSelects() {
  // Save current selections BEFORE repopulating
  const akaAthleteSelect = document.getElementById("akaAthleteSelect");
  const aoAthleteSelect = document.getElementById("aoAthleteSelect");

  const savedSelections = {
    akaAthlete: akaAthleteSelect.value,
    aoAthlete: aoAthleteSelect.value,
  };

  akaAthleteSelect.innerHTML = '<option value="">-- Chọn VĐV --</option>';
  aoAthleteSelect.innerHTML = '<option value="">-- Chọn VĐV --</option>';

  // Filter: Only show Kata + Individual athletes
  const filteredAthletes = state.athletes.filter((athlete) => {
    const isKata = !athlete.type || athlete.type.includes("kata");
    const isIndividual =
      !athlete.category ||
      athlete.category.includes("cá nhân") ||
      athlete.category.includes("individual");
    return isKata && isIndividual;
  });

  filteredAthletes.forEach((athlete, index) => {
    // Find original index in state.athletes
    const originalIndex = state.athletes.indexOf(athlete);

    const optionAka = document.createElement("option");
    optionAka.value = originalIndex;
    optionAka.textContent = `${athlete.name} - ${athlete.unit}`;
    akaAthleteSelect.appendChild(optionAka);

    const optionAo = document.createElement("option");
    optionAo.value = originalIndex;
    optionAo.textContent = `${athlete.name} - ${athlete.unit}`;
    aoAthleteSelect.appendChild(optionAo);
  });

  // Team selects
  const akaTeamSelect = document.getElementById("akaTeamSelect");
  const aoTeamSelect = document.getElementById("aoTeamSelect");

  akaTeamSelect.innerHTML = '<option value="">-- Chọn Đơn Vị --</option>';
  aoTeamSelect.innerHTML = '<option value="">-- Chọn Đơn Vị --</option>';

  // Filter: Only show Kata + Team
  const filteredTeamAthletes = state.athletes.filter((athlete) => {
    const isKata = !athlete.type || athlete.type.includes("kata");
    const isTeam =
      athlete.category &&
      (athlete.category.includes("đồng đội") ||
        athlete.category.includes("team"));
    return isKata && isTeam;
  });

  // Get unique teams from filtered athletes
  const filteredTeams = new Set();
  filteredTeamAthletes.forEach((athlete) => {
    filteredTeams.add(athlete.unit);
  });

  filteredTeams.forEach((team) => {
    const optionAka = document.createElement("option");
    optionAka.value = team;
    optionAka.textContent = team;
    akaTeamSelect.appendChild(optionAka);
    const optionAo = document.createElement("option");
    optionAo.value = team;
    optionAo.textContent = team;
    aoTeamSelect.appendChild(optionAo);
  });

  // Restore saved selections AFTER repopulating
  if (savedSelections.akaAthlete) {
    akaAthleteSelect.value = savedSelections.akaAthlete;
  }
  if (savedSelections.aoAthlete) {
    aoAthleteSelect.value = savedSelections.aoAthlete;
  }
}

// Update filter status display
function updateFilterStatus() {
  const filterStatusDiv = document.getElementById("filterStatus");
  if (!filterStatusDiv) return;

  const totalAthletes = state.athletes.length;

  // Count Kata athletes
  const kataIndividual = state.athletes.filter((a) => {
    const isKata = !a.type || a.type.includes("kata");
    const isIndividual =
      !a.category ||
      a.category.includes("cá nhân") ||
      a.category.includes("individual");
    return isKata && isIndividual;
  }).length;

  const kataTeam = state.athletes.filter((a) => {
    const isKata = !a.type || a.type.includes("kata");
    const isTeam =
      a.category &&
      (a.category.includes("đồng đội") || a.category.includes("team"));
    return isKata && isTeam;
  }).length;

  // Count Kumite athletes
  const kumiteIndividual = state.athletes.filter((a) => {
    const isKumite = a.type && a.type.includes("kumite");
    const isIndividual =
      !a.category ||
      a.category.includes("cá nhân") ||
      a.category.includes("individual");
    return isKumite && isIndividual;
  }).length;

  const kumiteTeam = state.athletes.filter((a) => {
    const isKumite = a.type && a.type.includes("kumite");
    const isTeam =
      a.category &&
      (a.category.includes("đồng đội") || a.category.includes("team"));
    return isKumite && isTeam;
  }).length;

  filterStatusDiv.innerHTML = `
    ✅ Đã tải <strong>${totalAthletes}</strong> VĐV<br>
    📊 Kata: <strong>${kataIndividual}</strong> cá nhân, <strong>${kataTeam}</strong> đồng đội | 
    Kumite: <strong>${kumiteIndividual}</strong> cá nhân, <strong>${kumiteTeam}</strong> đồng đội<br>
    🎯 Hiển thị: <strong>${
      state.contentType === "individual" ? kataIndividual : kataTeam
    }</strong> VĐV (Kata ${
    state.contentType === "individual" ? "Cá nhân" : "Đồng đội"
  })
  `;
}

// Update AKA display
function updateAkaDisplay() {
  if (state.contentType === "individual") {
    const select = document.getElementById("akaAthleteSelect");
    const manualName = document.getElementById("akaAthleteName").value;
    const unit = document.getElementById("akaUnit").value;

    if (select.value !== "") {
      const athlete = state.athletes[select.value];
      state.aka.athlete = athlete.name;
      state.aka.unit = athlete.unit;
      document.getElementById("akaUnit").value = athlete.unit;
    } else if (manualName) {
      state.aka.athlete = manualName;
      state.aka.unit = unit;
    }
  } else {
    const select = document.getElementById("akaTeamSelect");
    const manualTeam = document.getElementById("akaTeamName").value;
    const manualMembers = document.getElementById("akaTeamMembers")
      ? document.getElementById("akaTeamMembers").value
      : "";

    if (select.value !== "") {
      state.aka.team = select.value;
      // To match sigma notation, we just store the team name in team and use athlete for members if needed
    } else if (manualTeam) {
      state.aka.team = manualTeam;
    }

    if (manualMembers) {
      state.aka.athlete = manualMembers;
    } else {
      state.aka.athlete = "";
    }
  }

  saveState();
}

// Update AO display
function updateAoDisplay() {
  if (state.contentType === "individual") {
    const select = document.getElementById("aoAthleteSelect");
    const manualName = document.getElementById("aoAthleteName").value;
    const unit = document.getElementById("aoUnit").value;

    if (select.value !== "") {
      const athlete = state.athletes[select.value];
      state.ao.athlete = athlete.name;
      state.ao.unit = athlete.unit;
      document.getElementById("aoUnit").value = athlete.unit;
    } else if (manualName) {
      state.ao.athlete = manualName;
      state.ao.unit = unit;
    }
  } else {
    const select = document.getElementById("aoTeamSelect");
    const manualTeam = document.getElementById("aoTeamName").value;
    const manualMembers = document.getElementById("aoTeamMembers")
      ? document.getElementById("aoTeamMembers").value
      : "";

    if (select.value !== "") {
      state.ao.team = select.value;
    } else if (manualTeam) {
      state.ao.team = manualTeam;
    }

    if (manualMembers) {
      state.ao.athlete = manualMembers;
    } else {
      state.ao.athlete = "";
    }
  }

  saveState();
}

// Update Kata name for specific side (aka or ao)
function updateKataName(side) {
  const select = document.getElementById(side + "KataSelect");
  const kataName = select.value || "";

  if (side === "aka") {
    state.aka.kataName = kataName;
  } else {
    state.ao.kataName = kataName;
  }

  saveState();
}

// Filter kata list for specific side with enhanced search (prioritizes number search)
function filterKata(side) {
  const searchInput = document.getElementById(side + "KataSearch");
  const searchTerm = removeVietnameseAccents(
    searchInput.value.toLowerCase().trim()
  );
  const select = document.getElementById(side + "KataSelect");
  const options = select.options;

  if (searchTerm === "") {
    // Show all options if search is empty
    for (let i = 0; i < options.length; i++) {
      options[i].style.display = "";
      options[i].style.background = "";
      options[i].style.color = "";
    }
    select.selectedIndex = 0;
    return;
  }

  // Check if search term is a number
  const isNumberSearch = /^\d+$/.test(searchTerm);

  let visibleOptions = [];
  let exactNumberMatch = -1;
  let partialNumberMatches = [];
  let nameMatches = [];

  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    if (i === 0) {
      // Always hide the placeholder option
      option.style.display = "none";
      continue;
    }

    const text = removeVietnameseAccents(option.textContent.toLowerCase());
    const number = option.textContent.split(".")[0].trim();

    let isMatch = false;
    let matchType = "";
    if (isNumberSearch) {
      // Number search mode - prioritize number matching
      if (number === searchTerm) {
        // Exact number match - highlight it (don't auto-update)
        isMatch = true;
        matchType = "exactNumber";
        partialNumberMatches.push(i); // Add to front of list
      } else if (number.startsWith(searchTerm)) {
        // Partial number match (e.g., "4" matches "42", "43", etc.)
        isMatch = true;
        matchType = "partialNumber";
        partialNumberMatches.push(i);
      }
    } else {
      // Text search mode - search in kata name
      if (text.includes(searchTerm)) {
        isMatch = true;
        matchType = "name";
        nameMatches.push(i);
      }
    } // Show/hide and style options
    if (isMatch) {
      option.style.display = "";
      // Highlight matches - gold for exact number, darker yellow for partial, light yellow for name
      if (matchType === "exactNumber") {
        option.style.background = "#FFD700"; // Gold for exact match
      } else if (matchType === "partialNumber") {
        option.style.background = "#FFED4E"; // Bright yellow for partial number
      } else {
        option.style.background = "#FFFACD"; // Light yellow for name match
      }
      option.style.color = "#000";
      visibleOptions.push(i);
    } else {
      option.style.display = "none";
      option.style.background = "";
      option.style.color = "";
    }
  }
  // Auto-select behavior - ONLY highlight, don't auto-update
  if (visibleOptions.length === 1) {
    // Only one match - select it but DON'T update (wait for Enter key)
    select.selectedIndex = visibleOptions[0];
    // Don't call updateKataName() here - user must press Enter
  } else if (visibleOptions.length > 1) {
    // Multiple matches - prioritize number matches and select first
    if (partialNumberMatches.length > 0) {
      select.selectedIndex = partialNumberMatches[0];
    } else if (nameMatches.length > 0) {
      select.selectedIndex = nameMatches[0];
    } else {
      select.selectedIndex = visibleOptions[0];
    }
    // Don't call updateKataName() here - user must press Enter or click
  } else {
    // No matches
    select.selectedIndex = 0;
  }

  // Update search indicator
  updateKataSearchIndicator(side, visibleOptions.length);
}

// Update kata search indicator
function updateKataSearchIndicator(side, count) {
  const searchInput = document.getElementById(side + "KataSearch");

  if (count === 0) {
    searchInput.style.borderColor = "#ff4444";
    searchInput.title = "❌ Không tìm thấy kata";
  } else if (count === 1) {
    searchInput.style.borderColor = "#38ef7d";
    searchInput.title = "✅ 1 kata - Nhấn Enter để chọn";
  } else {
    searchInput.style.borderColor = "#ffd700";
    searchInput.title = `🔍 ${count} kata - Nhấn Enter hoặc click để chọn`;
  }
}

// Handle Enter key in kata search
function handleKataSearchKeyPress(event, side) {
  if (event.key === "Enter") {
    const select = document.getElementById(side + "KataSelect");
    const searchInput = document.getElementById(side + "KataSearch");
    if (select.selectedIndex > 0) {
      updateKataName(side);
      // Show selected kata name in search box
      const selectedText = select.options[select.selectedIndex].text;
      searchInput.value = selectedText;
      searchInput.style.borderColor = "";
      searchInput.title = "";
      // Reset dropdown display
      resetKataDropdownDisplay(side);
    }
  } else if (event.key === "Escape") {
    clearKataSearch(side);
  }
}

// Auto-update kata search when selecting from dropdown (click)
function handleKataSelectChange(side) {
  const select = document.getElementById(side + "KataSelect");
  const searchInput = document.getElementById(side + "KataSearch");

  if (select.selectedIndex > 0) {
    // User selected from dropdown - update and show selected name
    updateKataName(side);
    const selectedText = select.options[select.selectedIndex].text;
    searchInput.value = selectedText;
    searchInput.style.borderColor = "";
    searchInput.title = "";
    // Reset dropdown display but keep selection
    const currentSelection = select.selectedIndex;
    resetKataDropdownDisplay(side);
    select.selectedIndex = currentSelection; // Restore selection
  } else {
    // Normal dropdown change without search
    updateKataName(side);
  }
}

// Reset kata dropdown display (show all, remove highlights)
function resetKataDropdownDisplay(side) {
  const select = document.getElementById(side + "KataSelect");
  const options = select.options;
  for (let i = 0; i < options.length; i++) {
    options[i].style.display = "";
    options[i].style.background = "";
    options[i].style.color = "";
  }
}

// Clear kata search
function clearKataSearch(side) {
  const searchInput = document.getElementById(side + "KataSearch");
  searchInput.value = "";
  searchInput.style.borderColor = "";
  searchInput.title = "";
  filterKata(side); // Reset the dropdown
}

// Helper function to remove Vietnamese accents for better search
function removeVietnameseAccents(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

// Filter athlete list for specific side with enhanced search
function filterAthlete(side) {
  const searchInput = document.getElementById(side + "AthleteSearch");
  const searchTerm = removeVietnameseAccents(
    searchInput.value.toLowerCase().trim()
  );
  const select = document.getElementById(side + "AthleteSelect");
  const options = select.options;

  if (searchTerm === "") {
    // Show all options if search is empty
    for (let i = 0; i < options.length; i++) {
      options[i].style.display = "";
      options[i].style.background = "";
      options[i].style.color = "";
    }
    select.selectedIndex = 0;
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
  // Auto-select behavior - ONLY highlight, don't auto-update
  if (visibleOptions.length === 1) {
    // Only one match - select it but DON'T update (wait for Enter key)
    select.selectedIndex = visibleOptions[0];
    // Don't call updateAkaDisplay/updateAoDisplay here - user must press Enter
  } else if (visibleOptions.length > 1) {
    // Multiple matches - select first one (but don't update display yet)
    select.selectedIndex = firstMatchIndex;
  } else {
    // No matches
    select.selectedIndex = 0;
  }

  // Show count of results
  updateSearchResultCount(side, visibleOptions.length);
}

// Update search result count
function updateSearchResultCount(side, count) {
  const searchInput = document.getElementById(side + "AthleteSearch");

  if (count === 0) {
    searchInput.style.borderColor = "#ff4444";
    searchInput.title = "❌ Không tìm thấy kết quả";
  } else if (count === 1) {
    searchInput.style.borderColor = "#38ef7d";
    searchInput.title = "✅ 1 kết quả - Nhấn Enter để chọn";
  } else {
    searchInput.style.borderColor = "#ffd700";
    searchInput.title = `🔍 ${count} kết quả - Nhấn Enter hoặc chọn từ danh sách`;
  }
}

// Handle Enter key in athlete search
function handleAthleteSearchKeyPress(event, side) {
  if (event.key === "Enter") {
    const select = document.getElementById(side + "AthleteSelect");
    const searchInput = document.getElementById(side + "AthleteSearch");
    if (select.selectedIndex > 0) {
      // Update display when Enter is pressed
      if (side === "aka") {
        updateAkaDisplay();
      } else {
        updateAoDisplay();
      }

      // Show selected athlete name in search box
      const selectedText = select.options[select.selectedIndex].text;
      searchInput.value = selectedText;
      searchInput.style.borderColor = "";
      searchInput.title = "";
      // Reset dropdown display
      resetAthleteDropdownDisplay(side);
    }
  } else if (event.key === "Escape") {
    clearAthleteSearch(side);
  }
}

// Auto-update athlete search when selecting from dropdown (click)
function handleAthleteSelectChange(side) {
  const select = document.getElementById(side + "AthleteSelect");
  const searchInput = document.getElementById(side + "AthleteSearch");

  if (select.selectedIndex > 0) {
    // User selected from dropdown - update and show selected name
    if (side === "aka") {
      updateAkaDisplay();
    } else {
      updateAoDisplay();
    }

    const selectedText = select.options[select.selectedIndex].text;
    searchInput.value = selectedText;
    searchInput.style.borderColor = "";
    searchInput.title = "";
    // Reset dropdown display but keep selection
    const currentSelection = select.selectedIndex;
    resetAthleteDropdownDisplay(side);
    select.selectedIndex = currentSelection; // Restore selection
  } else {
    // Normal dropdown change without search
    if (side === "aka") {
      updateAkaDisplay();
    } else {
      updateAoDisplay();
    }
  }
}

// Reset athlete dropdown display (show all, remove highlights)
function resetAthleteDropdownDisplay(side) {
  const select = document.getElementById(side + "AthleteSelect");
  const options = select.options;
  for (let i = 0; i < options.length; i++) {
    options[i].style.display = "";
    options[i].style.background = "";
    options[i].style.color = "";
  }
}

// Clear athlete search
function clearAthleteSearch(side) {
  const searchInput = document.getElementById(side + "AthleteSearch");
  searchInput.value = "";
  searchInput.style.borderColor = "";
  searchInput.title = "";
  filterAthlete(side); // Reset the dropdown
}

// Adjust score
function adjustScore(side, delta) {
  // Mark that scoring has started
  state.scoringStarted = true;

  if (side === "aka") {
    state.aka.score = Math.max(0, state.aka.score + delta);
  } else {
    state.ao.score = Math.max(0, state.ao.score + delta);
  }
  saveState();
  updateUI();
}

// Lưu kết quả vào medals (gọi khi nhấn nút Lưu Kết Quả)
function saveToMedals() {
  // Kiểm tra điều kiện cơ bản
  if (!state.aka.athlete && !state.aka.team) return;
  if (!state.ao.athlete && !state.ao.team) return;

  // Kiểm tra có người thắng không (không hòa và không phải cả 2 đều 0)
  if (state.aka.score === state.ao.score) {
    console.log("Trận hòa - không lưu vào medals");
    return;
  }

  // Chỉ lưu cho Chung Kết và Bán Kết
  const currentRound = state.currentRound.toLowerCase();
  if (
    !currentRound.includes("chung kết") &&
    !currentRound.includes("bán kết")
  ) {
    console.log(`Vòng ${state.currentRound} - không lưu vào medals`);
    return;
  }

  // Xác định người thắng và người thua
  let winner, loser;
  if (state.aka.score > state.ao.score) {
    winner = {
      name: state.aka.athlete || state.aka.team,
      unit: state.aka.unit,
      score: state.aka.score,
    };
    loser = {
      name: state.ao.athlete || state.ao.team,
      unit: state.ao.unit,
      score: state.ao.score,
    };
  } else {
    winner = {
      name: state.ao.athlete || state.ao.team,
      unit: state.ao.unit,
      score: state.ao.score,
    };
    loser = {
      name: state.aka.athlete || state.aka.team,
      unit: state.aka.unit,
      score: state.aka.score,
    };
  }

  // Lưu thông tin vào localStorage của medals
  const MEDALS_STORAGE_KEY = "karate_medals_results";
  let medalsData = JSON.parse(
    localStorage.getItem(MEDALS_STORAGE_KEY) ||
      '{"eventName":"","categories":[]}'
  );

  // Tìm hoặc tạo category cho match info này (không bao gồm round trong category name)
  const categoryName = state.matchInfo;
  let categoryIndex = medalsData.categories.findIndex(
    (c) => c.categoryName === categoryName
  );

  if (categoryIndex === -1) {
    // Tạo category mới
    categoryIndex = medalsData.categories.length;
    medalsData.categories.push({
      categoryName: categoryName,
      gold: { athlete: "", unit: "" },
      silver: { athlete: "", unit: "" },
      bronze1: { athlete: "", unit: "" },
      bronze2: { athlete: "", unit: "" },
    });
  }

  // Cập nhật theo vòng đấu
  if (currentRound.includes("chung kết")) {
    // Chung Kết: Người thắng = HCV (Gold), Người thua = HCB (Silver)
    medalsData.categories[categoryIndex].gold = {
      athlete: winner.name,
      unit: winner.unit,
    };
    medalsData.categories[categoryIndex].silver = {
      athlete: loser.name,
      unit: loser.unit,
    };

    console.log(
      `✅ Đã lưu Chung Kết vào medals: ${winner.name} (HCV), ${loser.name} (HCB)`
    );
  } else if (currentRound.includes("bán kết")) {
    // Bán Kết: Người thua = HCĐ (Bronze)
    // Lưu vào bronze1 nếu trống, nếu không thì bronze2
    if (!medalsData.categories[categoryIndex].bronze1.athlete) {
      medalsData.categories[categoryIndex].bronze1 = {
        athlete: loser.name,
        unit: loser.unit,
      };
      console.log(`✅ Đã lưu Bán Kết vào medals: ${loser.name} (HCĐ #1)`);
    } else if (!medalsData.categories[categoryIndex].bronze2.athlete) {
      medalsData.categories[categoryIndex].bronze2 = {
        athlete: loser.name,
        unit: loser.unit,
      };
      console.log(`✅ Đã lưu Bán Kết vào medals: ${loser.name} (HCĐ #2)`);
    } else {
      // Cả 2 đồng đã đầy, hỏi xem thay thế cái nào
      if (
        confirm(
          `Đã có 2 HCĐ:\n1. ${medalsData.categories[categoryIndex].bronze1.athlete}\n2. ${medalsData.categories[categoryIndex].bronze2.athlete}\n\nThay thế HCĐ #1 bằng ${loser.name}?`
        )
      ) {
        medalsData.categories[categoryIndex].bronze1 = {
          athlete: loser.name,
          unit: loser.unit,
        };
        console.log(`✅ Đã cập nhật Bán Kết: ${loser.name} (HCĐ #1)`);
      }
    }
  }

  // Lưu vào localStorage
  localStorage.setItem(MEDALS_STORAGE_KEY, JSON.stringify(medalsData));
}

// Timer functions
let timerInterval = null;

function updateTimerDisplay() {
  const minutes = Math.floor(state.timer.seconds / 60);
  const seconds = state.timer.seconds % 60;
  const display = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  document.getElementById("timeDisplay").textContent = display;
}

function startTimer() {
  if (timerInterval) return;

  state.timer.isRunning = true;
  saveState();

  timerInterval = setInterval(() => {
    if (state.timer.seconds > 0) {
      state.timer.seconds--;
      saveState();
      updateTimerDisplay();
    } else {
      stopTimer();
      // Play sound or alert
      alert("Hết giờ!");
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  state.timer.isRunning = false;
  saveState();
}

function resetTimer() {
  stopTimer();
  state.timer.seconds = 300;
  saveState();
  updateTimerDisplay();
}

function setTime(seconds) {
  stopTimer();
  state.timer.seconds = seconds;
  saveState();
  updateTimerDisplay();
}

function resetAll() {
  if (confirm("Bạn có chắc muốn reset tất cả?")) {
    stopTimer();
    state.aka.score = 0;
    state.ao.score = 0;
    state.timer.seconds = 300;
    state.aka.kataName = "";
    state.ao.kataName = "";
    state.aka.athlete = "";
    state.aka.unit = "";
    state.aka.team = "";
    state.ao.athlete = "";
    state.ao.unit = "";
    state.ao.team = "";
    state.scoringStarted = false; // Reset scoring status
    
    // Clear pending match data
    pendingMatchData = null;
    localStorage.removeItem(PENDING_MATCH_KEY);
    
    saveState();
    updateUI();
  }
}

// Reset match for new game (reset scores, athletes, and kata)
function resetMatch() {
  if (
    confirm(
      "🆕 Reset cho trận mới?\n\nSẽ xóa:\n- Điểm số (AKA & AO)\n- Thông tin VĐV/Đội\n- Bài Kata\n- Reset thời gian về 5:00\n\nLưu ý: Vòng đấu và nội dung thi sẽ được giữ nguyên"
    )
  ) {
    stopTimer();

    // Reset scores
    state.aka.score = 0;
    state.ao.score = 0;

    // Reset athletes/teams
    state.aka.athlete = "";
    state.aka.unit = "";
    state.aka.team = "";
    state.ao.athlete = "";
    state.ao.unit = "";
    state.ao.team = "";

    // Reset kata
    state.aka.kataName = "";
    state.ao.kataName = "";

    // Reset timer
    state.timer.seconds = 300;
    state.scoringStarted = false;

    // Clear UI inputs
    document.getElementById("akaAthleteSelect").selectedIndex = 0;
    document.getElementById("aoAthleteSelect").selectedIndex = 0;
    document.getElementById("akaAthleteName").value = "";
    document.getElementById("aoAthleteName").value = "";
    document.getElementById("akaUnit").value = "";
    document.getElementById("aoUnit").value = "";
    document.getElementById("akaTeamSelect").selectedIndex = 0;
    document.getElementById("aoTeamSelect").selectedIndex = 0;
    document.getElementById("akaTeamName").value = "";
    document.getElementById("aoTeamName").value = "";
    if (document.getElementById("akaTeamMembers"))
      document.getElementById("akaTeamMembers").value = "";
    if (document.getElementById("aoTeamMembers"))
      document.getElementById("aoTeamMembers").value = "";
    document.getElementById("akaKataSelect").selectedIndex = 0;
    document.getElementById("aoKataSelect").selectedIndex = 0;
    saveState();
    updateUI();

    alert("🆕 Đã reset cho trận mới! Sẵn sàng nhập thông tin VĐV tiếp theo.");
  }
}

// Open display window
function openDisplay() {
  displayWindow = window.open(
    "display.html",
    "KarateScoreboardDisplay",
    "width=1920,height=1080"
  );
}

// Swap AKA and AO positions
function swapPositions() {
  state.swapPositions = !state.swapPositions;
  saveState();

  // Show confirmation
  const status = state.swapPositions
    ? "Đã đổi: AO bên trái, AKA bên phải"
    : "Đã đổi về: AKA bên trái, AO bên phải";
  alert("🔄 " + status);
}

// Update font size
function updateFontSize(type, value) {
  const size = parseFloat(value);

  switch (type) {
    case "athleteName":
      state.fontSizes.athleteName = size;
      document.getElementById("athleteNameSizeLabel").textContent = size + "vw";
      break;
    case "unitName":
      state.fontSizes.unitName = size;
      document.getElementById("unitNameSizeLabel").textContent = size + "vw";
      break;
    case "kata":
      state.fontSizes.kata = size;
      document.getElementById("kataSizeLabel").textContent = size + "vw";
      break;
    case "header":
      state.fontSizes.header = size;
      document.getElementById("headerSizeLabel").textContent = size + "vw";
      break;
    case "matchInfo":
      state.fontSizes.matchInfo = size;
      document.getElementById("matchInfoSizeLabel").textContent = size + "vw";
      break;
  }

  saveState();
}

// Reset font sizes to default
function resetFontSizes() {
  state.fontSizes = {
    athleteName: 5.5,
    unitName: 3.2,
    kata: 3.5,
    header: 4,
    matchInfo: 2,
  };

  // Update UI
  document.getElementById("athleteNameSize").value = 5.5;
  document.getElementById("unitNameSize").value = 3.2;
  document.getElementById("kataSize").value = 3.5;
  document.getElementById("headerSize").value = 4;
  document.getElementById("matchInfoSize").value = 2;

  document.getElementById("athleteNameSizeLabel").textContent = "5.5vw";
  document.getElementById("unitNameSizeLabel").textContent = "3.2vw";
  document.getElementById("kataSizeLabel").textContent = "3.5vw";
  document.getElementById("headerSizeLabel").textContent = "4vw";
  document.getElementById("matchInfoSizeLabel").textContent = "2vw";

  saveState();
}

// Update global font scale
function updateGlobalFontScale(value) {
  const scale = parseInt(value);
  state.globalFontScale = scale;

  // Update label
  const label = document.getElementById("globalFontScaleLabel");
  if (label) {
    label.textContent = scale + "%";
  }

  saveState();
}

// Reset global font scale to 100%
function resetGlobalFontScale() {
  state.globalFontScale = 100;

  // Update slider
  const slider = document.getElementById("globalFontScale");
  if (slider) {
    slider.value = 100;
  }
  // Update label
  const label = document.getElementById("globalFontScaleLabel");
  if (label) {
    label.textContent = "100%";
  }

  saveState();
}

// ==================== MEDAL MANAGEMENT FUNCTIONS ====================

// Load match history from localStorage
function loadMatchHistory() {
  const saved = localStorage.getItem(MATCH_HISTORY_KEY);
  if (saved) {
    matchHistory = JSON.parse(saved);
  }
}

// Save match history to localStorage
function saveMatchHistory() {
  localStorage.setItem(MATCH_HISTORY_KEY, JSON.stringify(matchHistory));
}

// Update round selection
function updateRound() {
  const roundSelect = document.getElementById("roundSelect");
  state.currentRound = roundSelect.value;
  saveState();
}

// Get match count
function getMatchCount() {
  return matchHistory.length;
}

// Save current match result
function saveMatchResult() {
  // Validate that we have complete match data
  if (!state.aka.athlete && !state.aka.team) {
    alert("⚠️ Vui lòng nhập thông tin VĐV/Đội ĐỎ (AKA)");
    return;
  }

  if (!state.ao.athlete && !state.ao.team) {
    alert("⚠️ Vui lòng nhập thông tin VĐV/Đội XANH (AO)");
    return;
  }

  if (state.aka.score === 0 && state.ao.score === 0) {
    if (!confirm("Cả 2 bên đều 0 điểm. Bạn có chắc muốn lưu?")) {
      return;
    }
  }

  // Determine winner
  let winner = "";
  if (state.aka.score > state.ao.score) {
    winner = "AKA";
  } else if (state.ao.score > state.aka.score) {
    winner = "AO";
  } else {
    winner = "DRAW";
  }

  // Create match record
  const match = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    eventTitle: state.eventTitle,
    matchInfo: state.matchInfo,
    round: state.currentRound,
    contentType: state.contentType,
    aka: {
      athlete: state.aka.athlete || state.aka.team,
      unit: state.aka.unit,
      score: state.aka.score,
      kataName: state.aka.kataName,
    },
    ao: {
      athlete: state.ao.athlete || state.ao.team,
      unit: state.ao.unit,
      score: state.ao.score,
      kataName: state.ao.kataName,
    },
    winner: winner,
  };

  // Add to history
  matchHistory.push(match);
  saveMatchHistory();

  // Lưu vào medals nếu là vòng Chung Kết hoặc Bán Kết
  saveToMedals();

  // Show success message
  alert(
    `✅ Đã lưu kết quả trận đấu!\n\n${state.matchInfo}\n${
      state.currentRound
    }\n\n🔴 ${match.aka.athlete} (${match.aka.score}) vs 🔵 ${
      match.ao.athlete
    } (${match.ao.score})\n\nNgười thắng: ${
      winner === "AKA"
        ? "🔴 " + match.aka.athlete
        : winner === "AO"
        ? "🔵 " + match.ao.athlete
        : "HÒA"
    }\n\nTổng số trận đã lưu: ${matchHistory.length}`
  );

  // Update match count display
  updateMatchCountDisplay();
}

// Update match count in button
function updateMatchCountDisplay() {
  const btn = document.querySelector('button[onclick="viewMatchHistory()"]');
  if (btn) {
    btn.innerHTML = `📜 Xem Lịch Sử Trận (${matchHistory.length})`;
  }
}

// View match history
function viewMatchHistory() {
  const display = document.getElementById("matchHistoryDisplay");
  const list = document.getElementById("matchHistoryList");

  if (matchHistory.length === 0) {
    alert("📭 Chưa có trận đấu nào được lưu!");
    return;
  }

  // Toggle display
  if (display.style.display === "none") {
    display.style.display = "block";

    // Group matches by event
    const groupedMatches = {};
    matchHistory.forEach((match) => {
      const key = match.matchInfo;
      if (!groupedMatches[key]) {
        groupedMatches[key] = [];
      }
      groupedMatches[key].push(match);
    });

    // Build HTML
    let html = "";
    for (const [eventName, matches] of Object.entries(groupedMatches)) {
      html += `<div style="margin-bottom: 20px; border: 2px solid #ffd700; border-radius: 10px; padding: 15px; background: rgba(255,215,0,0.1);">`;
      html += `<h4 style="color: #ffd700; margin-bottom: 10px;">📌 ${eventName} (${matches.length} trận)</h4>`;

      matches.forEach((match, index) => {
        const winnerStyle =
          match.winner === "AKA"
            ? "color: #ff4444; font-weight: bold;"
            : match.winner === "AO"
            ? "color: #4444ff; font-weight: bold;"
            : "color: #ffd700;";

        html += `
          <div style="margin-bottom: 10px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; border-left: 4px solid ${
            match.winner === "AKA"
              ? "#ff4444"
              : match.winner === "AO"
              ? "#4444ff"
              : "#ffd700"
          };">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: #aaa; font-size: 0.9em;">#${
                matches.length - index
              } - ${match.round}</span>
              <span style="color: #aaa; font-size: 0.8em;">${new Date(
                match.timestamp
              ).toLocaleString("vi-VN")}</span>
            </div>
            <div style="margin-top: 5px; font-size: 1.1em;">
              <span style="color: #ff4444;">🔴 ${match.aka.athlete} (${
          match.aka.unit
        })</span>
              <span style="color: white; margin: 0 10px;">${
                match.aka.score
              } - ${match.ao.score}</span>
              <span style="color: #4444ff;">🔵 ${match.ao.athlete} (${
          match.ao.unit
        })</span>
            </div>
            <div style="margin-top: 5px; ${winnerStyle}">
              ${
                match.winner === "DRAW"
                  ? "⚖️ HÒA"
                  : `🏆 Thắng: ${
                      match.winner === "AKA"
                        ? match.aka.athlete
                        : match.ao.athlete
                    }`
              }
            </div>
          </div>
        `;
      });

      html += `</div>`;
    }

    list.innerHTML = html;
  } else {
    display.style.display = "none";
  }
}

// Generate medal standings
function generateMedals() {
  if (matchHistory.length === 0) {
    alert(
      "📭 Chưa có trận đấu nào được lưu!\n\nVui lòng lưu kết quả các trận đấu trước."
    );
    return;
  }

  // Group matches by event
  const eventGroups = {};
  matchHistory.forEach((match) => {
    const key = match.matchInfo;
    if (!eventGroups[key]) {
      eventGroups[key] = {
        eventName: match.matchInfo,
        matches: [],
      };
    }
    eventGroups[key].matches.push(match);
  });

  // Calculate medals for each event
  const medalResults = [];

  for (const [eventName, eventData] of Object.entries(eventGroups)) {
    const matches = eventData.matches;

    // Find final match (Chung Kết)
    const finalMatch = matches.find((m) => m.round === "Chung Kết");

    // Find semi-final matches (Bán Kết)
    const semiFinals = matches.filter((m) => m.round === "Bán Kết");

    // Only process events that have completed (with final)
    if (!finalMatch) {
      continue; // Skip events without final
    }

    const result = {
      eventName: eventName,
      gold: null,
      silver: null,
      bronze1: null,
      bronze2: null,
    };

    // Gold: Winner of final
    if (finalMatch.winner === "AKA") {
      result.gold = {
        athlete: finalMatch.aka.athlete,
        unit: finalMatch.aka.unit,
      };
      result.silver = {
        athlete: finalMatch.ao.athlete,
        unit: finalMatch.ao.unit,
      };
    } else if (finalMatch.winner === "AO") {
      result.gold = {
        athlete: finalMatch.ao.athlete,
        unit: finalMatch.ao.unit,
      };
      result.silver = {
        athlete: finalMatch.aka.athlete,
        unit: finalMatch.aka.unit,
      };
    }

    // Bronze: Losers of semi-finals
    if (semiFinals.length >= 1) {
      const semi1 = semiFinals[0];
      if (semi1.winner === "AKA") {
        result.bronze1 = {
          athlete: semi1.ao.athlete,
          unit: semi1.ao.unit,
        };
      } else if (semi1.winner === "AO") {
        result.bronze1 = {
          athlete: semi1.aka.athlete,
          unit: semi1.aka.unit,
        };
      }
    }

    if (semiFinals.length >= 2) {
      const semi2 = semiFinals[1];
      if (semi2.winner === "AKA") {
        result.bronze2 = {
          athlete: semi2.ao.athlete,
          unit: semi2.ao.unit,
        };
      } else if (semi2.winner === "AO") {
        result.bronze2 = {
          athlete: semi2.aka.athlete,
          unit: semi2.aka.unit,
        };
      }
    }

    medalResults.push(result);
  }

  if (medalResults.length === 0) {
    alert(
      "⚠️ Chưa có nội dung nào hoàn thành đủ vòng Chung Kết!\n\nCần có ít nhất:\n- 1 trận Chung Kết\n- 2 trận Bán Kết (để xác định 2 HCĐ)"
    );
    return;
  }

  // Display results
  displayMedalResults(medalResults);
}

// Display medal results
function displayMedalResults(medalResults) {
  const display = document.getElementById("medalResultsDisplay");
  const list = document.getElementById("medalResultsList");

  display.style.display = "block";

  let html = `<div style="margin-bottom: 15px; text-align: center;">
    <span style="font-size: 1.2em; color: #ffd700;">Tổng cộng: ${medalResults.length} nội dung đã hoàn thành</span>
  </div>`;

  medalResults.forEach((result, index) => {
    html += `
      <div style="margin-bottom: 20px; border: 2px solid #ffd700; border-radius: 10px; padding: 15px; background: rgba(255,215,0,0.05);">
        <h4 style="color: #ffd700; margin-bottom: 15px;">🏆 ${
          result.eventName
        }</h4>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
          ${
            result.gold
              ? `
            <div style="padding: 10px; background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); border-radius: 8px; color: #000;">
              <div style="font-weight: bold; margin-bottom: 5px;">🥇 HCV</div>
              <div style="font-size: 1.1em; font-weight: bold;">${result.gold.athlete}</div>
              <div style="font-size: 0.9em; opacity: 0.8;">${result.gold.unit}</div>
            </div>
          `
              : ""
          }
          
          ${
            result.silver
              ? `
            <div style="padding: 10px; background: linear-gradient(135deg, #C0C0C0 0%, #A8A8A8 100%); border-radius: 8px; color: #000;">
              <div style="font-weight: bold; margin-bottom: 5px;">🥈 HCB</div>
              <div style="font-size: 1.1em; font-weight: bold;">${result.silver.athlete}</div>
              <div style="font-size: 0.9em; opacity: 0.8;">${result.silver.unit}</div>
            </div>
          `
              : ""
          }
          
          ${
            result.bronze1
              ? `
            <div style="padding: 10px; background: linear-gradient(135deg, #CD7F32 0%, #B87333 100%); border-radius: 8px; color: #fff;">
              <div style="font-weight: bold; margin-bottom: 5px;">🥉 HCĐ</div>
              <div style="font-size: 1.1em; font-weight: bold;">${result.bronze1.athlete}</div>
              <div style="font-size: 0.9em; opacity: 0.9;">${result.bronze1.unit}</div>
            </div>
          `
              : ""
          }
          
          ${
            result.bronze2
              ? `
            <div style="padding: 10px; background: linear-gradient(135deg, #CD7F32 0%, #B87333 100%); border-radius: 8px; color: #fff;">
              <div style="font-weight: bold; margin-bottom: 5px;">🥉 HCĐ</div>
              <div style="font-size: 1.1em; font-weight: bold;">${result.bronze2.athlete}</div>
              <div style="font-size: 0.9em; opacity: 0.9;">${result.bronze2.unit}</div>
            </div>
          `
              : ""
          }
        </div>
      </div>
    `;
  });

  list.innerHTML = html;

  // Scroll to results
  display.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Export medals to Excel
function exportMedalsToExcel() {
  if (matchHistory.length === 0) {
    alert("📭 Chưa có trận đấu nào được lưu!");
    return;
  }

  // Generate medal data first
  const eventGroups = {};
  matchHistory.forEach((match) => {
    const key = match.matchInfo;
    if (!eventGroups[key]) {
      eventGroups[key] = { eventName: match.matchInfo, matches: [] };
    }
    eventGroups[key].matches.push(match);
  });

  const medalData = [];

  for (const [eventName, eventData] of Object.entries(eventGroups)) {
    const matches = eventData.matches;
    const finalMatch = matches.find((m) => m.round === "Chung Kết");
    const semiFinals = matches.filter((m) => m.round === "Bán Kết");

    if (!finalMatch) continue;

    const row = {
      "Nội Dung": eventName,
      HCV: "",
      "Đơn Vị HCV": "",
      HCB: "",
      "Đơn Vị HCB": "",
      "HCĐ 1": "",
      "Đơn Vị HCĐ 1": "",
      "HCĐ 2": "",
      "Đơn Vị HCĐ 2": "",
    };

    // Gold & Silver
    if (finalMatch.winner === "AKA") {
      row["HCV"] = finalMatch.aka.athlete;
      row["Đơn Vị HCV"] = finalMatch.aka.unit;
      row["HCB"] = finalMatch.ao.athlete;
      row["Đơn Vị HCB"] = finalMatch.ao.unit;
    } else if (finalMatch.winner === "AO") {
      row["HCV"] = finalMatch.ao.athlete;
      row["Đơn Vị HCV"] = finalMatch.ao.unit;
      row["HCB"] = finalMatch.aka.athlete;
      row["Đơn Vị HCB"] = finalMatch.aka.unit;
    }

    // Bronze medals
    if (semiFinals.length >= 1) {
      const semi1 = semiFinals[0];
      if (semi1.winner === "AKA") {
        row["HCĐ 1"] = semi1.ao.athlete;
        row["Đơn Vị HCĐ 1"] = semi1.ao.unit;
      } else if (semi1.winner === "AO") {
        row["HCĐ 1"] = semi1.aka.athlete;
        row["Đơn Vị HCĐ 1"] = semi1.aka.unit;
      }
    }

    if (semiFinals.length >= 2) {
      const semi2 = semiFinals[1];
      if (semi2.winner === "AKA") {
        row["HCĐ 2"] = semi2.ao.athlete;
        row["Đơn Vị HCĐ 2"] = semi2.ao.unit;
      } else if (semi2.winner === "AO") {
        row["HCĐ 2"] = semi2.aka.athlete;
        row["Đơn Vị HCĐ 2"] = semi2.aka.unit;
      }
    }

    medalData.push(row);
  }

  if (medalData.length === 0) {
    alert("⚠️ Chưa có nội dung nào hoàn thành!");
    return;
  }

  // Create workbook
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(medalData);

  // Set column widths
  ws["!cols"] = [
    { wch: 40 }, // Nội Dung
    { wch: 25 }, // HCV
    { wch: 25 }, // Đơn Vị HCV
    { wch: 25 }, // HCB
    { wch: 25 }, // Đơn Vị HCB
    { wch: 25 }, // HCĐ 1
    { wch: 25 }, // Đơn Vị HCĐ 1
    { wch: 25 }, // HCĐ 2
    { wch: 25 }, // Đơn Vị HCĐ 2
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Huy Chương");

  // Sheet 2: Format tương thích admin import
  const importCompatData = [];
  medalData.forEach((row) => {
    importCompatData.push({
      "Hạng mục": row["Nội Dung"],
      "HCV (Vàng)": row["HCV"],
      "CLB HCV": row["Đơn Vị HCV"],
      "HCB (Bạc)": row["HCB"],
      "CLB HCB": row["Đơn Vị HCB"],
      "HCĐ 1 (Đồng)": row["HCĐ 1"],
      "CLB HCĐ 1": row["Đơn Vị HCĐ 1"],
      "HCĐ 2 (Đồng)": row["HCĐ 2"],
      "CLB HCĐ 2": row["Đơn Vị HCĐ 2"],
    });
  });
  const wsImport = XLSX.utils.json_to_sheet(importCompatData);
  wsImport["!cols"] = [
    { wch: 40 },
    { wch: 25 },
    { wch: 25 },
    { wch: 25 },
    { wch: 25 },
    { wch: 25 },
    { wch: 25 },
    { wch: 25 },
    { wch: 25 },
  ];
  XLSX.utils.book_append_sheet(wb, wsImport, "Kết Quả Import");

  // Generate filename with date
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}`;
  const filename = `Karate_HuyChuong_${dateStr}.xlsx`;

  // Download
  XLSX.writeFile(wb, filename);

  alert(
    `✅ Đã xuất file Excel thành công!\n\nFile: ${filename}\nSố nội dung: ${medalData.length}`
  );
}

// Clear match history
function clearMatchHistory() {
  if (matchHistory.length === 0) {
    alert("📭 Lịch sử trống!");
    return;
  }

  if (
    confirm(
      `⚠️ BẠN CÓ CHẮC MUỐN XÓA TẤT CẢ ${matchHistory.length} TRẬN ĐẤU?\n\nHành động này không thể hoàn tác!`
    )
  ) {
    matchHistory = [];
    saveMatchHistory();

    // Hide displays
    document.getElementById("matchHistoryDisplay").style.display = "none";
    document.getElementById("medalResultsDisplay").style.display = "none";

    updateMatchCountDisplay();

    alert("✅ Đã xóa toàn bộ lịch sử trận đấu!");
  }
}

// ==================== BRACKET INTEGRATION FUNCTIONS ====================

// Key dùng chung với React app
const PENDING_MATCH_KEY = "pending_match";
const MATCH_RESULT_KEY = "match_result";

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

      // Chỉ load nếu là trận kata
      if (pendingMatchData.categoryType === "kata") {
        loadPendingMatch();
      }
    }
  } catch (error) {
    console.error("Error checking pending match:", error);
  }
}

/**
 * Load thông tin VĐV từ pending match vào scoreboard
 */
function loadPendingMatch() {
  if (!pendingMatchData) {
    alert("Không có trận đấu nào đang chờ!");
    return;
  }

  // Set tên VĐV (AKA = athlete1, AO = athlete2) - IN HOA
  if (pendingMatchData.athlete1) {
    const name = pendingMatchData.athlete1.name.toUpperCase();
    const club = pendingMatchData.athlete1.club
      ? pendingMatchData.athlete1.club.toUpperCase()
      : "";

    // Set for individual config
    state.aka.athlete = name;
    state.aka.unit = club;

    // Set for team config
    state.aka.team = name;

    // Process members if exist for sigma format display in team mode
    if (
      pendingMatchData.athlete1.members &&
      pendingMatchData.athlete1.members.length > 0
    ) {
      const membersText = pendingMatchData.athlete1.members
        .map((m) => {
          const parts = m.name.trim().split(" ");
          return parts.length > 0 ? parts[parts.length - 1] : m.name;
        })
        .join(", ");
      state.aka.athlete = membersText.toUpperCase();
    }

    const akaNameInput = document.getElementById("akaAthleteName");
    const akaUnitInput = document.getElementById("akaUnit");
    const akaTeamNameInput = document.getElementById("akaTeamName");
    const akaTeamMembersInput = document.getElementById("akaTeamMembers");

    if (akaNameInput)
      akaNameInput.value = pendingMatchData.athlete1.name.toUpperCase();
    if (akaUnitInput) akaUnitInput.value = state.aka.unit;
    if (akaTeamNameInput) akaTeamNameInput.value = state.aka.team;
    if (akaTeamMembersInput) akaTeamMembersInput.value = state.aka.athlete;
  }
  if (pendingMatchData.athlete2) {
    const name = pendingMatchData.athlete2.name.toUpperCase();
    const club = pendingMatchData.athlete2.club
      ? pendingMatchData.athlete2.club.toUpperCase()
      : "";

    // Set for individual config
    state.ao.athlete = name;
    state.ao.unit = club;

    // Set for team config
    state.ao.team = name;

    // Process members if exist for sigma format display in team mode
    if (
      pendingMatchData.athlete2.members &&
      pendingMatchData.athlete2.members.length > 0
    ) {
      const membersText = pendingMatchData.athlete2.members
        .map((m) => {
          const parts = m.name.trim().split(" ");
          return parts.length > 0 ? parts[parts.length - 1] : m.name;
        })
        .join(", ");
      state.ao.athlete = membersText.toUpperCase();
    }

    const aoNameInput = document.getElementById("aoAthleteName");
    const aoUnitInput = document.getElementById("aoUnit");
    const aoTeamNameInput = document.getElementById("aoTeamName");
    const aoTeamMembersInput = document.getElementById("aoTeamMembers");

    if (aoNameInput)
      aoNameInput.value = pendingMatchData.athlete2.name.toUpperCase();
    if (aoUnitInput) aoUnitInput.value = state.ao.unit;
    if (aoTeamNameInput) aoTeamNameInput.value = state.ao.team;
    if (aoTeamMembersInput) aoTeamMembersInput.value = state.ao.athlete;
  }

  // Set thông tin giải đấu
  if (pendingMatchData.tournamentName) {
    state.tournamentTitle = pendingMatchData.tournamentName;
    const tournamentInput = document.getElementById("tournamentTitle");
    if (tournamentInput)
      tournamentInput.value = pendingMatchData.tournamentName;
  }

  if (pendingMatchData.categoryName) {
    state.matchInfo = pendingMatchData.categoryName;
    const matchInfoInput = document.getElementById("matchInfo");
    if (matchInfoInput) matchInfoInput.value = pendingMatchData.categoryName;

    // Auto-detect team vs individual mode
    const lowerName = pendingMatchData.categoryName.toLowerCase();
    if (lowerName.includes("đồng đội") || lowerName.includes("hỗn hợp")) {
      setContentType("team");
    } else {
      setContentType("individual");
    }
  }

  if (pendingMatchData.roundName) {
    state.currentRound = pendingMatchData.roundName;
  }

  // Load schedule mat number
  if (pendingMatchData.matNumber) {
    state.eventTitle = `Thảm ${pendingMatchData.matNumber}`;
    const eventInput = document.getElementById("eventTitle");
    if (eventInput) eventInput.value = state.eventTitle;
  }

  // Load sponsor logos (ALWAYS update to reflect bracket settings, even if null/empty)
  state.sponsorLogos = pendingMatchData.sponsorLogos || null;

  // ALWAYS reset match-specific state for a clean start
  state.swapPositions = false;
  state.scoringStarted = false;

  // Load existing scores if match has data (for re-editing), otherwise reset to 0
  if (
    (pendingMatchData.score1 && pendingMatchData.score1 > 0) ||
    (pendingMatchData.score2 && pendingMatchData.score2 > 0) ||
    pendingMatchData.hasWinner
  ) {
    state.aka.score = pendingMatchData.score1 || 0;
    state.ao.score = pendingMatchData.score2 || 0;
    state.scoringStarted = true;
  } else {
    state.aka.score = 0;
    state.ao.score = 0;
    state.scoringStarted = false;
  }

  // Reset timer
  if (typeof resetTimer === "function") {
    resetTimer();
  } else {
    state.timer.seconds = 300;
    state.timer.isRunning = false;
  }

  // Clear or Set Kata info from previous match
  state.aka.kataName = pendingMatchData.kata1 || "";
  state.ao.kataName = pendingMatchData.kata2 || "";
  if (document.getElementById("akaKataSelect"))
    document.getElementById("akaKataSelect").selectedIndex = 0;
  if (document.getElementById("aoKataSelect"))
    document.getElementById("aoKataSelect").selectedIndex = 0;
  if (document.getElementById("akaKataSearch"))
    document.getElementById("akaKataSearch").value = state.aka.kataName;
  if (document.getElementById("aoKataSearch"))
    document.getElementById("aoKataSearch").value = state.ao.kataName;

  saveState();
  updateUI();

  console.log("✅ Đã load VĐV từ sơ đồ thi đấu:", pendingMatchData);
}

/**
 * Kết thúc trận đấu và gửi kết quả về React app (bracket)
 * Đối với Kata, so sánh tổng điểm của 2 VĐV
 */
function finishMatch() {
  if (!pendingMatchData) {
    alert("Không có trận đấu nào đang chờ từ sơ đồ!");
    return;
  }

  // Xác định winner dựa vào điểm kata
  let winnerId = null;
  let winnerName = "";

  if (state.aka.score > state.ao.score) {
    winnerId = pendingMatchData.athlete1?.id;
    winnerName = state.aka.athlete || "AKA";
  } else if (state.ao.score > state.aka.score) {
    winnerId = pendingMatchData.athlete2?.id;
    winnerName = state.ao.athlete || "AO";
  }

  if (!winnerId) {
    alert("Chưa có người thắng! Đảm bảo điểm của 2 VĐV không bằng nhau.");
    return;
  }

  // Confirm
  if (
    !confirm(
      `Xác nhận kết thúc trận?\\n\\n🏆 Người thắng: ${winnerName}\\n📊 Điểm: ${state.aka.score} - ${state.ao.score}`
    )
  ) {
    return;
  }

  const result = {
    matchId: pendingMatchData.matchId,
    winnerId: winnerId,
    score1: state.aka.score,
    score2: state.ao.score,
    timestamp: Date.now(),
  };

  // Lưu vào localStorage
  localStorage.setItem(MATCH_RESULT_KEY, JSON.stringify(result));

  // Gửi postMessage đến opener window (React app)
  if (window.opener) {
    window.opener.postMessage(
      {
        type: "MATCH_RESULT",
        result: result,
      },
      "*"
    );
  }

  // Clear pending match
  localStorage.removeItem(PENDING_MATCH_KEY);
  pendingMatchData = null;

  alert(
    "✅ Đã gửi kết quả về sơ đồ thi đấu!\\n\\nCửa sổ sẽ sẵn sàng cho trận tiếp theo."
  );

  // Reset cho trận tiếp theo
  state.aka.athlete = "";
  state.aka.unit = "";
  state.aka.team = "";
  state.ao.athlete = "";
  state.ao.unit = "";
  state.ao.team = "";
  state.aka.score = 0;
  state.ao.score = 0;
  state.aka.kataName = "";
  state.ao.kataName = "";
  state.scoringStarted = false;

  if (document.getElementById("akaScore")) document.getElementById("akaScore").textContent = 0;
  if (document.getElementById("aoScore")) document.getElementById("aoScore").textContent = 0;
  if (document.getElementById("akaKataSelect")) document.getElementById("akaKataSelect").selectedIndex = 0;
  if (document.getElementById("aoKataSelect")) document.getElementById("aoKataSelect").selectedIndex = 0;
  if (document.getElementById("akaKataSearch")) document.getElementById("akaKataSearch").value = "";
  if (document.getElementById("aoKataSearch")) document.getElementById("aoKataSearch").value = "";
  
  if (document.getElementById("akaAthleteSelect")) document.getElementById("akaAthleteSelect").selectedIndex = 0;
  if (document.getElementById("aoAthleteSelect")) document.getElementById("aoAthleteSelect").selectedIndex = 0;
  if (document.getElementById("akaAthleteSearch")) {
    document.getElementById("akaAthleteSearch").value = "";
    document.getElementById("akaAthleteSearch").style.borderColor = "";
  }
  if (document.getElementById("aoAthleteSearch")) {
    document.getElementById("aoAthleteSearch").value = "";
    document.getElementById("aoAthleteSearch").style.borderColor = "";
  }

  ['akaAthleteName', 'aoAthleteName', 'akaUnit', 'aoUnit', 'akaTeamName', 'aoTeamName', 'akaTeamMembers', 'aoTeamMembers'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  saveState();
  updateUI();
}

// ==================== END BRACKET INTEGRATION FUNCTIONS ====================

// Initialize on load
window.addEventListener("DOMContentLoaded", () => {
  loadState();
  loadMatchHistory();
  updateMatchCountDisplay();

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

  // Tự động kiểm tra và load VĐV từ bracket
  checkForPendingMatch();
});
