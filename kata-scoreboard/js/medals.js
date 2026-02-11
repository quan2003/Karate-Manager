// Medals Management JavaScript
const MEDALS_STORAGE_KEY = "karate_medals_results";

let medalsData = {
  eventName: "GIẢI VÔ ĐỊCH KARATE QUỐC GIA 2025",
  categories: [],
};

// Load data from localStorage
function loadMedalsData() {
  const saved = localStorage.getItem(MEDALS_STORAGE_KEY);
  if (saved) {
    medalsData = JSON.parse(saved);
    document.getElementById("eventName").value = medalsData.eventName || "";
  }
  updateResultsTable();
  updateStatistics();
}

// Save data to localStorage
function saveMedalsData() {
  localStorage.setItem(MEDALS_STORAGE_KEY, JSON.stringify(medalsData));
}

// Save medal results
function saveMedalResults() {
  const eventName = document.getElementById("eventName").value.trim();
  const categoryName = document.getElementById("categoryName").value.trim();

  if (!categoryName) {
    alert("⚠️ Vui lòng nhập nội dung thi đấu!");
    return;
  }

  const goldAthlete = document.getElementById("goldAthlete").value.trim();
  const goldUnit = document.getElementById("goldUnit").value.trim();
  const silverAthlete = document.getElementById("silverAthlete").value.trim();
  const silverUnit = document.getElementById("silverUnit").value.trim();
  const bronze1Athlete = document.getElementById("bronze1Athlete").value.trim();
  const bronze1Unit = document.getElementById("bronze1Unit").value.trim();
  const bronze2Athlete = document.getElementById("bronze2Athlete").value.trim();
  const bronze2Unit = document.getElementById("bronze2Unit").value.trim();

  if (!goldAthlete || !silverAthlete || !bronze1Athlete || !bronze2Athlete) {
    alert("⚠️ Vui lòng nhập đầy đủ tên VĐV/Đội cho tất cả huy chương!");
    return;
  }

  // Check if category exists, update or add new
  const existingIndex = medalsData.categories.findIndex(
    (c) => c.categoryName === categoryName
  );

  const categoryData = {
    categoryName: categoryName,
    gold: {
      athlete: goldAthlete,
      unit: goldUnit,
      round: "Chung Kết",
    },
    silver: {
      athlete: silverAthlete,
      unit: silverUnit,
      round: "Chung Kết",
    },
    bronze1: {
      athlete: bronze1Athlete,
      unit: bronze1Unit,
      round: "Bán Kết",
    },
    bronze2: {
      athlete: bronze2Athlete,
      unit: bronze2Unit,
      round: "Bán Kết",
    },
    timestamp: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    medalsData.categories[existingIndex] = categoryData;
    alert("✅ Đã cập nhật kết quả!");
  } else {
    medalsData.categories.push(categoryData);
    alert("✅ Đã lưu kết quả thành công!");
  }

  medalsData.eventName = eventName;
  saveMedalsData();
  updateResultsTable();
  updateStatistics();
  clearInputFields();
}

// Clear input fields
function clearInputFields() {
  document.getElementById("categoryName").value = "";
  document.getElementById("goldAthlete").value = "";
  document.getElementById("goldUnit").value = "";
  document.getElementById("silverAthlete").value = "";
  document.getElementById("silverUnit").value = "";
  document.getElementById("bronze1Athlete").value = "";
  document.getElementById("bronze1Unit").value = "";
  document.getElementById("bronze2Athlete").value = "";
  document.getElementById("bronze2Unit").value = "";
}

// Add new category
function addNewCategory() {
  clearInputFields();
  document.getElementById("categoryName").focus();
}

// Update results table
function updateResultsTable() {
  const tbody = document.getElementById("resultsTableBody");
  tbody.innerHTML = "";

  if (medalsData.categories.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align: center; padding: 30px; color: #999;">Chưa có kết quả nào được lưu</td></tr>';
    return;
  }

  medalsData.categories.forEach((category, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td><strong>${category.categoryName}</strong></td>
      <td>
        <strong>${category.gold.athlete}</strong><br>
        <small style="color: #666;">${category.gold.unit}</small>
      </td>
      <td>
        <strong>${category.silver.athlete}</strong><br>
        <small style="color: #666;">${category.silver.unit}</small>
      </td>
      <td>
        <strong>${category.bronze1.athlete}</strong><br>
        <small style="color: #666;">${category.bronze1.unit}</small>
      </td>
      <td>
        <strong>${category.bronze2.athlete}</strong><br>
        <small style="color: #666;">${category.bronze2.unit}</small>
      </td>
      <td>
        <button class="action-btn edit" onclick="editCategory(${index})">✏️ Sửa</button>
        <button class="action-btn delete" onclick="deleteCategory(${index})">🗑️ Xóa</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Edit category
function editCategory(index) {
  const category = medalsData.categories[index];

  document.getElementById("categoryName").value = category.categoryName;
  document.getElementById("goldAthlete").value = category.gold.athlete;
  document.getElementById("goldUnit").value = category.gold.unit;
  document.getElementById("silverAthlete").value = category.silver.athlete;
  document.getElementById("silverUnit").value = category.silver.unit;
  document.getElementById("bronze1Athlete").value = category.bronze1.athlete;
  document.getElementById("bronze1Unit").value = category.bronze1.unit;
  document.getElementById("bronze2Athlete").value = category.bronze2.athlete;
  document.getElementById("bronze2Unit").value = category.bronze2.unit;

  // Scroll to top
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Delete category
function deleteCategory(index) {
  if (
    confirm(
      `🗑️ Bạn có chắc chắn muốn xóa kết quả "${medalsData.categories[index].categoryName}"?`
    )
  ) {
    medalsData.categories.splice(index, 1);
    saveMedalsData();
    updateResultsTable();
    updateStatistics();
    alert("✅ Đã xóa kết quả!");
  }
}

// Clear all data
function clearAllData() {
  if (
    confirm(
      "⚠️ BẠN CÓ CHẮC CHẮN MUỐN XÓA TẤT CẢ DỮ LIỆU?\n\nHành động này không thể hoàn tác!"
    )
  ) {
    if (confirm("⚠️ XÁC NHẬN LẦN CUỐI: Xóa tất cả kết quả đã lưu?")) {
      medalsData.categories = [];
      saveMedalsData();
      updateResultsTable();
      updateStatistics();
      clearInputFields();
      alert("✅ Đã xóa tất cả dữ liệu!");
    }
  }
}

// Update statistics
function updateStatistics() {
  const totalCategories = medalsData.categories.length;
  const totalGold = medalsData.categories.filter((c) => c.gold.athlete).length;
  const totalSilver = medalsData.categories.filter(
    (c) => c.silver.athlete
  ).length;
  const totalBronze = medalsData.categories.reduce((acc, c) => {
    let count = 0;
    if (c.bronze1.athlete) count++;
    if (c.bronze2.athlete) count++;
    return acc + count;
  }, 0);

  document.getElementById("totalCategories").textContent = totalCategories;
  document.getElementById("totalGold").textContent = totalGold;
  document.getElementById("totalSilver").textContent = totalSilver;
  document.getElementById("totalBronze").textContent = totalBronze;
}

// Export to Excel
function exportToExcel() {
  if (medalsData.categories.length === 0) {
    alert("⚠️ Không có dữ liệu để xuất!");
    return;
  }

  // Prepare data for Excel
  const excelData = [];

  // Header row
  excelData.push(["BẢNG KẾT QUẢ THI ĐẤU VÀ TRAO HUY CHƯƠNG"]);
  excelData.push([medalsData.eventName]);
  excelData.push([]); // Empty row
  excelData.push([
    "STT",
    "Nội dung thi đấu",
    "HCV - Chung Kết",
    "Đơn vị",
    "HCB - Chung Kết",
    "Đơn vị",
    "HCĐ #1 - Bán Kết",
    "Đơn vị",
    "HCĐ #2 - Bán Kết",
    "Đơn vị",
  ]);

  // Data rows
  medalsData.categories.forEach((category, index) => {
    excelData.push([
      index + 1,
      category.categoryName,
      category.gold.athlete,
      category.gold.unit,
      category.silver.athlete,
      category.silver.unit,
      category.bronze1.athlete,
      category.bronze1.unit,
      category.bronze2.athlete,
      category.bronze2.unit,
    ]);
  });

  // Add statistics
  excelData.push([]); // Empty row
  excelData.push(["THỐNG KÊ HUY CHƯƠNG"]);
  excelData.push(["Tổng số nội dung thi đấu:", medalsData.categories.length]);
  excelData.push(["Tổng số HCV:", medalsData.categories.length]);
  excelData.push(["Tổng số HCB:", medalsData.categories.length]);
  excelData.push(["Tổng số HCĐ:", medalsData.categories.length * 2]);

  // Create workbook
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(excelData);

  // Set column widths
  ws["!cols"] = [
    { wch: 5 }, // STT
    { wch: 35 }, // Nội dung
    { wch: 25 }, // HCV
    { wch: 25 }, // Đơn vị
    { wch: 25 }, // HCB
    { wch: 25 }, // Đơn vị
    { wch: 25 }, // HCĐ 1
    { wch: 25 }, // Đơn vị
    { wch: 25 }, // HCĐ 2
    { wch: 25 }, // Đơn vị
  ];

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, "Kết Quả");

  // Generate filename with timestamp
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .substring(0, 19);
  const filename = `KetQua_HuyChuong_${timestamp}.xlsx`;

  // Save file
  XLSX.writeFile(wb, filename);

  alert("✅ Đã xuất file Excel thành công!");
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", function () {
  loadMedalsData();

  // Auto-save event name when changed
  document.getElementById("eventName").addEventListener("change", function () {
    medalsData.eventName = this.value;
    saveMedalsData();
  });
});
