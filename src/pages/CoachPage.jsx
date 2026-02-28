import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useRole, TIME_STATUS, ROLES } from "../context/RoleContext";
import { openKrtFile, validateAthlete } from "../services/krtService";
import { exportCoachData } from "../services/coachExportService";
import { parseExcelFile } from "../services/excelService";
import * as XLSX from "xlsx";
import ConfirmDialog from "../components/common/ConfirmDialog";
import DateInput from "../components/common/DateInput";
import SearchableSelect from "../components/common/SearchableSelect";
import { useToast } from "../components/common/Toast";
import "./CoachPage.css";

/**
 * Trang HLV - Mở file .krt và nhập danh sách VĐV
 */
function CoachPage() {
  const navigate = useNavigate();
  const {
    role,
    tournamentData,
    timeStatus,
    coachAthletes,
    coachName,
    clubName,
    canEdit,
    loadKrtData,
    refreshTimeStatus,
    addAthlete,
    updateAthlete,
    deleteAthlete,
    updateCoachName,
    updateClubName,
    getExportData,
    resetRole,
  } = useRole();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingAthlete, setEditingAthlete] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    birthDate: "",
    gender: "male",
    eventId: "",
    weight: "",
    isTeam: false,
    seed: "",
  });
  const [formErrors, setFormErrors] = useState([]);
  const [ageWarning, setAgeWarning] = useState("");
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    message: "",
    onConfirm: null,
  });
  const [countdown, setCountdown] = useState("");
  const [importing, setImporting] = useState(false);
  const excelFileInputRef = useRef(null);

  // Redirect nếu không phải Coach
  useEffect(() => {
    if (role !== ROLES.COACH) {
      navigate("/");
    }
  }, [role, navigate]);

  // Refresh time status mỗi phút
  useEffect(() => {
    const interval = setInterval(() => {
      refreshTimeStatus();
    }, 60000);
    return () => clearInterval(interval);
  }, [refreshTimeStatus]);

  // Countdown timer
  useEffect(() => {
    if (!tournamentData) return;

    const updateCountdown = () => {
      const now = new Date();
      const start = new Date(tournamentData.startTime);
      const end = new Date(tournamentData.endTime);

      let diff;
      let prefix;

      if (now < start) {
        diff = start - now;
        prefix = "Bắt đầu sau: ";
      } else if (now < end) {
        diff = end - now;
        prefix = "Còn lại: ";
      } else {
        setCountdown("Đã hết hạn");
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      let timeStr = "";
      if (days > 0) timeStr += `${days} ngày `;
      if (hours > 0) timeStr += `${hours} giờ `;
      if (minutes > 0) timeStr += `${minutes} phút `;
      timeStr += `${seconds} giây`;

      setCountdown(prefix + timeStr);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [tournamentData]);

  // Mở file .krt
  const handleOpenFile = async () => {
    setLoading(true);
    setError("");

    try {
      const result = await openKrtFile();

      if (result.success) {
        loadKrtData(result.data);
      } else if (!result.canceled) {
        setError(result.error || "Không thể mở file");
      }
    } catch (err) {
      setError("Lỗi khi mở file: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Reset form
  const resetForm = useCallback(() => {
    setFormData({
      name: "",
      birthDate: "",
      gender: "male",
      eventId: "",
      weight: "",
      isTeam: false,
      seed: "",
    });
    setFormErrors([]);
    setAgeWarning("");
    setEditingAthlete(null);
    setShowForm(false);
  }, []);

  // Mở form thêm mới
  const handleAddNew = () => {
    resetForm();
    setShowForm(true);
  };

  // Mở form chỉnh sửa
  const handleEdit = (athlete) => {
    setFormData({
      name: athlete.name,
      birthDate: athlete.birthDate || "",
      gender: athlete.gender || "male",
      eventId: athlete.eventId,
      weight: athlete.weight || "",
      isTeam: athlete.isTeam || false,
      seed: athlete.seed || "",
    });
    setEditingAthlete(athlete);
    setShowForm(true);
  };

  // Check age warning when birthDate or eventId changes
  const checkAgeWarning = (birthDate, eventId) => {
    if (!birthDate || !eventId || !tournamentData) {
      setAgeWarning("");
      return;
    }
    const event = tournamentData.events.find((ev) => ev.id === eventId);
    if (!event) {
      setAgeWarning("");
      return;
    }

    // Parse age from event name (e.g., "6-8 tuổi", "15-17 tuổi", "18+ tuổi")
    const eventName = event.name || "";
    const rangeMatch = eventName.match(/(\d+)\s*[-–]\s*(\d+)\s*tuổi/i);
    const plusMatch = eventName.match(/(\d+)\+\s*tuổi/i);

    let minAge = null,
      maxAge = null;
    if (rangeMatch) {
      minAge = parseInt(rangeMatch[1]);
      maxAge = parseInt(rangeMatch[2]);
    } else if (plusMatch) {
      minAge = parseInt(plusMatch[1]);
      maxAge = 99;
    } else if (event.minAge || event.maxAge) {
      minAge = event.minAge || 0;
      maxAge = event.maxAge || 99;
    }

    if (minAge === null) {
      setAgeWarning("");
      return;
    }

    const birth = new Date(birthDate);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;

    if (age < minAge || age > maxAge) {
      setAgeWarning(
        `⚠️ VĐV ${age} tuổi không phù hợp lứa tuổi "${minAge}-${maxAge} tuổi" của nội dung ${eventName}`
      );
    } else {
      setAgeWarning("");
    }
  };

  // Check if selected event is kumite
  const getSelectedEvent = () => {
    return tournamentData?.events.find((ev) => ev.id === formData.eventId);
  };
  const isKumiteEvent = () => {
    const event = getSelectedEvent();
    if (!event) return false;
    return (
      event.type === "kumite" || event.name?.toLowerCase().includes("kumite")
    );
  };

  // Excel template download
  const handleDownloadTemplate = () => {
    if (!tournamentData) return;
    const headers = [
      "Tên VĐV",
      "Giới tính",
      "Ngày sinh (DD/MM/YYYY)",
      "Đơn vị/CLB",
      "Nội dung thi đấu",
      "Cân nặng (kg)",
      "Đồng đội (Có/Không)",
      "Hạt giống (1-8)",
    ];
    const data = [headers];
    // Add sample rows with available events
    tournamentData.events.slice(0, 3).forEach((ev, i) => {
      data.push([
        `VĐV mẫu ${i + 1}`,
        "Nam",
        "15/03/2008",
        clubName || "CLB ...",
        ev.name,
        ev.type === "kumite" || ev.name?.toLowerCase().includes("kumite")
          ? "60"
          : "",
        "Không",
        i === 0 ? 1 : "",
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mẫu nhập VĐV");
    ws["!cols"] = [
      { wch: 25 },
      { wch: 10 },
      { wch: 18 },
      { wch: 20 },
      { wch: 30 },
      { wch: 14 },
      { wch: 18 },
      { wch: 12 },
    ];
    XLSX.writeFile(
      wb,
      `mau_nhap_vdv_${tournamentData.tournamentName || "hlv"}.xlsx`
    );
  };

  // Excel import
  const handleImportExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        codepage: 65001,
      });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

      // Detect header
      let startRow = 0;
      if (
        rows[0] &&
        rows[0].some((h) =>
          String(h || "")
            .toLowerCase()
            .includes("tên")
        )
      )
        startRow = 1;

      // Detect if "Nội dung" column exists
      let hasEventCol = false;
      if (startRow === 1) {
        const headerStr = rows[0].map((h) => String(h || "").toLowerCase());
        hasEventCol = headerStr.some((h) => h.includes("nội dung"));
      }

      let imported = 0;
      const importErrors = [];

      for (let i = startRow; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[0]) continue;
        const name = String(row[0] || "").trim();
        if (!name) continue;

        const genderRaw = String(row[1] || "")
          .trim()
          .toLowerCase();
        const gender =
          genderRaw.includes("nữ") ||
          genderRaw === "female" ||
          genderRaw === "f"
            ? "female"
            : "male";

        // Parse birth date
        let birthDate = "";
        const dateVal = row[2];
        if (dateVal) {
          if (typeof dateVal === "number") {
            const d = new Date(1899, 11, 30 + dateVal);
            birthDate = d.toISOString().split("T")[0];
          } else {
            const str = String(dateVal).trim();
            const sep = /[-\/.]/;
            const parts = str.split(sep);
            if (parts.length === 3) {
              const a = parseInt(parts[0]),
                b = parseInt(parts[1]),
                c = parseInt(parts[2]);
              if (c > 1900) {
                birthDate = `${c}-${String(b).padStart(2, "0")}-${String(
                  a
                ).padStart(2, "0")}`;
              } else if (a > 1900) {
                birthDate = `${a}-${String(b).padStart(2, "0")}-${String(
                  c
                ).padStart(2, "0")}`;
              }
            }
          }
        }

        const club = String(row[3] || clubName || "").trim();
        let eventName, weight, isTeam, seed;

        if (hasEventCol) {
          eventName = String(row[4] || "").trim();
          weight = row[5] ? parseFloat(row[5]) : null;
          const teamRaw = String(row[6] || "")
            .trim()
            .toLowerCase();
          isTeam =
            teamRaw === "có" ||
            teamRaw === "co" ||
            teamRaw === "yes" ||
            teamRaw === "x";
          seed = parseInt(row[7]) || null;
        } else {
          eventName = "";
          weight = row[4] ? parseFloat(row[4]) : null;
          const teamRaw = String(row[6] || "")
            .trim()
            .toLowerCase();
          isTeam =
            teamRaw === "có" ||
            teamRaw === "co" ||
            teamRaw === "yes" ||
            teamRaw === "x";
          seed = parseInt(row[7]) || null;
        }

        // Match event by name
        let matchedEvent = null;
        if (eventName) {
          matchedEvent = tournamentData.events.find((ev) => {
            const evN = ev.name.toLowerCase();
            const inN = eventName.toLowerCase();
            return evN === inN || evN.includes(inN) || inN.includes(evN);
          });
        }

        if (!matchedEvent && !eventName) {
          importErrors.push(`Dòng ${i + 1} (${name}): Thiếu nội dung thi đấu`);
          continue;
        }
        if (!matchedEvent) {
          importErrors.push(
            `Dòng ${i + 1} (${name}): Không tìm thấy nội dung "${eventName}"`
          );
          continue;
        }

        const birthYear = birthDate ? new Date(birthDate).getFullYear() : null;

        // Validate age
        const evName = matchedEvent.name || "";
        const rangeMatch = evName.match(
          /(\d+)\s*[-\u2013]\s*(\d+)\s*tu\u1ed5i/i
        );
        const plusMatch = evName.match(/(\d+)\+\s*tu\u1ed5i/i);
        let minAge = null,
          maxAge = null;
        if (rangeMatch) {
          minAge = parseInt(rangeMatch[1]);
          maxAge = parseInt(rangeMatch[2]);
        } else if (plusMatch) {
          minAge = parseInt(plusMatch[1]);
          maxAge = 99;
        }

        if (birthDate && minAge !== null) {
          const birth = new Date(birthDate);
          const now = new Date();
          let age = now.getFullYear() - birth.getFullYear();
          const mo = now.getMonth() - birth.getMonth();
          if (mo < 0 || (mo === 0 && now.getDate() < birth.getDate())) age--;
          if (age < minAge || age > maxAge) {
            importErrors.push(
              `\u26a0\ufe0f D\u00f2ng ${
                i + 1
              } (${name}): ${age} tu\u1ed5i - kh\u00f4ng ph\u00f9 h\u1ee3p l\u1ee9a tu\u1ed5i "${minAge}-${maxAge}" c\u1ee7a "${evName}"`
            );
          }
        }

        // Validate weight for kumite
        const isKumiteEv =
          matchedEvent.type === "kumite" ||
          evName.toLowerCase().includes("kumite");
        if (isKumiteEv && (!weight || isNaN(weight))) {
          importErrors.push(
            `\u26a0\ufe0f D\u00f2ng ${
              i + 1
            } (${name}): Thi\u1ebfu c\u00e2n n\u1eb7ng cho n\u1ed9i dung Kumite "${evName}"`
          );
        }

        const result = addAthlete({
          name,
          birthDate,
          birthYear,
          gender,
          club,
          eventId: matchedEvent.id,
          eventName: matchedEvent.name,
          weight: weight && !isNaN(weight) ? weight : undefined,
          isTeam,
          seed: seed && seed >= 1 && seed <= 8 ? seed : null,
        });
        if (result.success) imported++;
        else
          importErrors.push(
            `\u274c D\u00f2ng ${i + 1} (${name}): ${result.error}`
          );
      }

      if (importErrors.length > 0) {
        toast.warning(
          `\u0110\u00e3 import ${imported} V\u0110V.\n\nC\u1ea3nh b\u00e1o/L\u1ed7i (${
            importErrors.length
          }):\n${importErrors.join(
            "\n"
          )}\n\nVui l\u00f2ng ki\u1ec3m tra v\u00e0 s\u1eeda l\u1ea1i c\u00e1c V\u0110V c\u00f3 v\u1ea5n \u0111\u1ec1.`
        );
      } else {
        toast.success(
          `\u0110\u00e3 import th\u00e0nh c\u00f4ng ${imported} V\u0110V! T\u1ea5t c\u1ea3 h\u1ee3p l\u1ec7.`
        );
      }
    } catch (err) {
      toast.error("Lỗi đọc file: " + err.message);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };
  // Submit form
  const handleSubmit = (e) => {
    e.preventDefault();

    const event = tournamentData.events.find(
      (ev) => ev.id === formData.eventId
    );
    const errors = [];

    // Derive birthYear from birthDate for validation
    let birthYear = null;
    if (formData.birthDate) {
      birthYear = new Date(formData.birthDate).getFullYear();
    }

    // Custom validation: weight required for kumite
    const isKumite =
      event &&
      (event.type === "kumite" || event.name?.toLowerCase().includes("kumite"));
    if (isKumite && !formData.weight) {
      errors.push("Cân nặng (kg) là bắt buộc cho nội dung Kumite");
    }

    // Age validation: compute directly instead of relying on state
    if (formData.birthDate && event) {
      const eventName = event.name || "";
      const rangeMatch = eventName.match(
        /(\d+)\s*[-\u2013]\s*(\d+)\s*tu\u1ed5i/i
      );
      const plusMatch = eventName.match(/(\d+)\+\s*tu\u1ed5i/i);
      let minAge = null,
        maxAge = null;
      if (rangeMatch) {
        minAge = parseInt(rangeMatch[1]);
        maxAge = parseInt(rangeMatch[2]);
      } else if (plusMatch) {
        minAge = parseInt(plusMatch[1]);
        maxAge = 99;
      } else if (event.minAge || event.maxAge) {
        minAge = event.minAge || 0;
        maxAge = event.maxAge || 99;
      }
      if (minAge !== null) {
        const birth = new Date(formData.birthDate);
        const now = new Date();
        let age = now.getFullYear() - birth.getFullYear();
        const m = now.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
        if (age < minAge || age > maxAge) {
          errors.push(
            `VĐV ${age} tuổi không phù hợp lứa tuổi "${minAge}-${maxAge} tuổi" của nội dung ${eventName}`
          );
        }
      }
    }

    const validation = validateAthlete(
      {
        ...formData,
        birthYear,
        club: clubName,
        weight: formData.weight ? parseFloat(formData.weight) : undefined,
      },
      event || {}
    );

    if (!validation.valid) {
      errors.push(...validation.errors);
    }

    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }

    const athleteData = {
      name: formData.name.trim(),
      birthDate: formData.birthDate,
      birthYear,
      gender: formData.gender,
      club: clubName.trim(),
      eventId: formData.eventId,
      eventName: event?.name || "",
      weight: formData.weight ? parseFloat(formData.weight) : undefined,
      isTeam: formData.isTeam || false,
      seed: formData.seed ? parseInt(formData.seed) : null,
    };

    if (editingAthlete) {
      const result = updateAthlete(editingAthlete.id, athleteData);
      if (!result.success) {
        setFormErrors([result.error]);
        return;
      }
    } else {
      const result = addAthlete(athleteData);
      if (!result.success) {
        setFormErrors([result.error]);
        return;
      }
    }

    resetForm();
  };
  // Xóa VĐV
  const handleDelete = (athlete) => {
    setConfirmDialog({
      open: true,
      message: `Bạn có chắc muốn xóa VĐV "${athlete.name}"?`,
      onConfirm: () => {
        const result = deleteAthlete(athlete.id);
        if (!result.success) {
          toast.error(result.error);
        }
        setConfirmDialog({ open: false, message: "", onConfirm: null });
      },
    });
  };

  // Xuất file
  const handleExport = async () => {
    if (!coachName.trim() && !clubName.trim()) {
      toast.warning("Vui lòng nhập tên HLV hoặc tên CLB trước khi xuất file");
      return;
    }

    // Validate tất cả VĐV trước khi xuất
    const warnings = [];
    coachAthletes.forEach((a, idx) => {
      const event = tournamentData.events.find((ev) => ev.id === a.eventId);
      if (!event) return;
      const evName = event.name || "";

      // Check age
      if (a.birthDate) {
        const rangeMatch = evName.match(
          /(\d+)\s*[-\u2013]\s*(\d+)\s*tu\u1ed5i/i
        );
        const plusMatch = evName.match(/(\d+)\+\s*tu\u1ed5i/i);
        let minAge = null,
          maxAge = null;
        if (rangeMatch) {
          minAge = parseInt(rangeMatch[1]);
          maxAge = parseInt(rangeMatch[2]);
        } else if (plusMatch) {
          minAge = parseInt(plusMatch[1]);
          maxAge = 99;
        }
        if (minAge !== null) {
          const birth = new Date(a.birthDate);
          const now = new Date();
          let age = now.getFullYear() - birth.getFullYear();
          const m = now.getMonth() - birth.getMonth();
          if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
          if (age < minAge || age > maxAge) {
            warnings.push(
              `#${idx + 1} ${
                a.name
              }: ${age} tu\u1ed5i - kh\u00f4ng ph\u00f9 h\u1ee3p "${minAge}-${maxAge} tu\u1ed5i" (${evName})`
            );
          }
        }
      }

      // Check weight for kumite
      const isKumite =
        event.type === "kumite" || evName.toLowerCase().includes("kumite");
      if (isKumite && !a.weight) {
        warnings.push(
          `#${idx + 1} ${
            a.name
          }: Thi\u1ebfu c\u00e2n n\u1eb7ng cho Kumite (${evName})`
        );
      }
    });

    if (warnings.length > 0) {
      toast.error(
        `\u274c Kh\u00f4ng th\u1ec3 xu\u1ea5t file! C\u00f2n ${
          warnings.length
        } v\u1ea5n \u0111\u1ec1 c\u1ea7n s\u1eeda:\n\n${warnings.join(
          "\n"
        )}\n\nVui l\u00f2ng s\u1eeda l\u1ea1i r\u1ed3i xu\u1ea5t l\u1ea1i.`
      );
      return;
    }

    try {
      const data = getExportData();
      const result = await exportCoachData(data, "excel");

      if (result.success) {
        toast.success("Xu\u1ea5t file Excel th\u00e0nh c\u00f4ng!");
      } else if (!result.canceled) {
        toast.error("L\u1ed7i xu\u1ea5t file: " + result.error);
      }
    } catch (err) {
      toast.error("L\u1ed7i xu\u1ea5t file: " + err.message);
    }
  };

  // Quay lại trang chọn role
  const handleBack = () => {
    resetRole();
    navigate("/");
  };

  // Lấy tên trạng thái thời gian
  const getTimeStatusLabel = () => {
    switch (timeStatus) {
      case TIME_STATUS.BEFORE:
        return { text: "Chưa đến thời gian nhập", class: "status-before" };
      case TIME_STATUS.DURING:
        return { text: "Đang trong thời gian nhập", class: "status-during" };
      case TIME_STATUS.AFTER:
        return { text: "Đã hết thời gian nhập", class: "status-after" };
      default:
        return { text: "", class: "" };
    }
  };

  // Render khi chưa mở file
  if (!tournamentData) {
    return (
      <div className="coach-page">
        <div className="coach-container">
          <div className="coach-header">
            <button className="back-btn" onClick={handleBack}>
              ← Quay lại
            </button>
            <h1>🏆 Huấn luyện viên</h1>
          </div>

          <div className="no-file-section">
            <div className="no-file-icon">📂</div>
            <h2>Chưa có file giải đấu</h2>
            <p>
              Vui lòng mở file .krt do Admin cung cấp để bắt đầu nhập danh sách
              VĐV
            </p>

            <button
              className="open-file-btn"
              onClick={handleOpenFile}
              disabled={loading}
            >
              {loading ? "Đang mở..." : "📁 Mở file .krt"}
            </button>

            {error && <div className="error-message">{error}</div>}
          </div>
        </div>
      </div>
    );
  }

  const statusInfo = getTimeStatusLabel();

  return (
    <div className="coach-page">
      <div className="coach-container">
        {/* Header */}
        <div className="coach-header">
          <button className="back-btn" onClick={handleBack}>
            ← Quay lại
          </button>
          <h1>🏆 {tournamentData.tournamentName}</h1>
          <button className="open-file-btn small" onClick={handleOpenFile}>
            📁 Đổi file
          </button>
        </div>
        {/* Time Status Banner */}
        <div className={`time-status-banner ${statusInfo.class}`}>
          <div className="status-info">
            <span className="status-label">{statusInfo.text}</span>
            <span className="countdown">{countdown}</span>
          </div>
          <div className="time-range">
            <span>
              Từ: {new Date(tournamentData.startTime).toLocaleString("vi-VN")}
            </span>
            <span>
              Đến: {new Date(tournamentData.endTime).toLocaleString("vi-VN")}
            </span>
          </div>
        </div>{" "}
        {/* Coach Name + Club Name */}
        <div className="coach-name-section">
          <div className="coach-name-field">
            <label>Tên HLV:</label>
            <input
              type="text"
              value={coachName}
              onChange={(e) => updateCoachName(e.target.value)}
              placeholder="Nguyễn Văn B"
              disabled={!canEdit && timeStatus === TIME_STATUS.BEFORE}
            />
          </div>
          <div className="coach-name-field">
            <label>Tên CLB:</label>
            <input
              type="text"
              value={clubName}
              onChange={(e) => updateClubName(e.target.value)}
              placeholder="CLB Karate Hà Nội"
              disabled={!canEdit && timeStatus === TIME_STATUS.BEFORE}
            />
          </div>
        </div>
        {/* Events List */}
        <div className="events-section">
          <h3>📋 Nội dung thi đấu</h3>
          <div className="events-list">
            {tournamentData.events.map((event) => (
              <span key={event.id} className="event-tag">
                {event.name}
              </span>
            ))}
          </div>
        </div>
        {/* Athletes Section */}
        <div className="athletes-section">
          <div className="section-header">
            <h3>👥 Danh sách VĐV ({coachAthletes.length})</h3>
            <div className="section-header-actions">
              <button className="template-btn" onClick={handleDownloadTemplate}>
                📥 Tải mẫu Excel
              </button>
              <label className="import-btn" style={{ cursor: "pointer" }}>
                {importing ? "⏳ Đang nhập..." : "📤 Import Excel"}
                <input
                  ref={excelFileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImportExcel}
                  style={{ display: "none" }}
                  disabled={importing || !canEdit}
                />
              </label>
              {canEdit && (
                <button className="add-btn" onClick={handleAddNew}>
                  + Thêm VĐV
                </button>
              )}
            </div>
          </div>
          {/* Add/Edit Form */}
          {showForm && (
            <div className="athlete-form-overlay">
              <form
                className="athlete-form coach-athlete-form"
                onSubmit={handleSubmit}
              >
                <h4>{editingAthlete ? "Sửa VĐV" : "Thêm VĐV mới"}</h4>

                {formErrors.length > 0 && (
                  <div className="form-errors">
                    {formErrors.map((err, i) => (
                      <div key={i} className="error-item">
                        ❌ {err}
                      </div>
                    ))}
                  </div>
                )}

                <div className="form-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label>
                      Họ tên <span className="required-star">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="Nguyễn Văn A"
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>
                      Giới tính <span className="required-star">*</span>
                    </label>
                    <select
                      value={formData.gender}
                      onChange={(e) =>
                        setFormData({ ...formData, gender: e.target.value })
                      }
                    >
                      <option value="male">Nam</option>
                      <option value="female">Nữ</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Ngày sinh</label>
                    <DateInput
                      value={formData.birthDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData({ ...formData, birthDate: val });
                        checkAgeWarning(val, formData.eventId);
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Cân nặng (kg)</label>
                    <input
                      type="number"
                      value={formData.weight}
                      onChange={(e) =>
                        setFormData({ ...formData, weight: e.target.value })
                      }
                      placeholder="60"
                      step="0.1"
                      min="0"
                    />
                  </div>
                </div>

                {/* Age warning */}
                {ageWarning && (
                  <div
                    className="form-errors"
                    style={{
                      background: "rgba(255, 200, 0, 0.15)",
                      borderColor: "#f59e0b",
                    }}
                  >
                    <div className="error-item" style={{ color: "#d97706" }}>
                      {ageWarning}
                    </div>
                  </div>
                )}

                {/* Weight required warning for kumite */}
                {isKumiteEvent() && !formData.weight && (
                  <div
                    className="form-errors"
                    style={{
                      background: "rgba(255, 200, 0, 0.15)",
                      borderColor: "#f59e0b",
                    }}
                  >
                    <div className="error-item" style={{ color: "#d97706" }}>
                      ⚠️ Nội dung Kumite yêu cầu phải nhập cân nặng
                    </div>
                  </div>
                )}

                <div className="form-row form-row-single">
                  <div className="form-group">
                    <label>
                      Nội dung thi đấu <span className="required-star">*</span>
                    </label>
                    <SearchableSelect
                      options={tournamentData.events.map((ev) => ({
                        value: ev.id,
                        label: ev.name,
                      }))}
                      value={formData.eventId}
                      onChange={(val) => {
                        setFormData({ ...formData, eventId: val });
                        checkAgeWarning(formData.birthDate, val);
                      }}
                      placeholder="-- Chọn nội dung --"
                    />
                  </div>
                </div>

                {/* Đồng đội + Hạt giống */}
                <div className="form-row">
                  <div className="form-group">
                    <label
                      className="checkbox-label"
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                        marginTop: "1.5rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={formData.isTeam}
                        onChange={(e) =>
                          setFormData({ ...formData, isTeam: e.target.checked })
                        }
                      />
                      Thi đấu đồng đội
                    </label>
                  </div>
                  <div className="form-group">
                    <label>Hạt giống (1-8)</label>
                    <input
                      type="number"
                      value={formData.seed}
                      onChange={(e) =>
                        setFormData({ ...formData, seed: e.target.value })
                      }
                      placeholder=""
                      min="1"
                      max="8"
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={resetForm}
                  >
                    Hủy
                  </button>
                  <button type="submit" className="submit-btn">
                    {editingAthlete ? "Cập nhật" : "Thêm"}
                  </button>
                </div>
              </form>
            </div>
          )}
          {/* Athletes Table */}{" "}
          {coachAthletes.length > 0 ? (
            <div className="athletes-table-wrapper">
              <table className="athletes-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Họ tên</th>
                    <th>Ngày sinh</th>
                    <th>Giới tính</th>
                    <th>Nội dung</th>
                    <th>Cân nặng</th>
                    <th>Hạt giống</th>
                    <th>Đồng đội</th>
                    {canEdit && <th>Thao tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {coachAthletes.map((athlete, index) => (
                    <tr key={athlete.id}>
                      <td>{index + 1}</td>
                      <td>{athlete.name}</td>
                      <td>
                        {athlete.birthDate
                          ? (() => {
                              const [y, m, d] = athlete.birthDate.split("-");
                              return `${d}/${m}/${y}`;
                            })()
                          : athlete.birthYear || "-"}
                      </td>
                      <td>{athlete.gender === "male" ? "Nam" : "Nữ"}</td>
                      <td>{athlete.eventName}</td>
                      <td>{athlete.weight ? `${athlete.weight}kg` : "-"}</td>
                      <td>{athlete.seed || "-"}</td>
                      <td>{athlete.isTeam ? "✅" : "-"}</td>
                      {canEdit && (
                        <td className="actions-cell">
                          <button
                            className="edit-btn"
                            onClick={() => handleEdit(athlete)}
                          >
                            ✏️
                          </button>
                          <button
                            className="delete-btn"
                            onClick={() => handleDelete(athlete)}
                          >
                            🗑️
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>{" "}
              </table>
            </div>
          ) : (
            <div className="no-athletes">
              <p>Chưa có VĐV nào</p>
              {canEdit && <p className="hint">Nhấn "Thêm VĐV" để bắt đầu</p>}
            </div>
          )}
        </div>
        {/* Stats bar */}
        {coachAthletes.length > 0 && (
          <div className="coach-stats-bar">
            <div className="coach-stat-item">
              <span className="coach-stat-value">{coachAthletes.length}</span>
              <span className="coach-stat-label">Tổng VĐV</span>
            </div>
            <div className="coach-stat-item">
              <span className="coach-stat-value" style={{ color: "#3b82f6" }}>
                {coachAthletes.filter((a) => a.gender === "male").length}
              </span>
              <span className="coach-stat-label">Nam</span>
            </div>
            <div className="coach-stat-item">
              <span className="coach-stat-value" style={{ color: "#ec4899" }}>
                {coachAthletes.filter((a) => a.gender === "female").length}
              </span>
              <span className="coach-stat-label">Nữ</span>
            </div>
            <div className="coach-stat-item">
              <span className="coach-stat-value">
                {new Set(coachAthletes.map((a) => a.eventId)).size}
              </span>
              <span className="coach-stat-label">Nội dung</span>
            </div>
          </div>
        )}
        {/* Export Section */}
        <div className="export-section">
          <h3>📤 Xuất file gửi Admin</h3>
          <p className="export-note">
            Xuất danh sách VĐV để gửi cho Admin import vào hệ thống
          </p>
          <div className="export-buttons">
            <button
              className="export-btn excel"
              onClick={handleExport}
              disabled={coachAthletes.length === 0}
            >
              📊 Xuất Excel
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.open}
        title="Xác nhận xóa"
        message={confirmDialog.message}
        onConfirm={() => confirmDialog.onConfirm?.()}
        onCancel={() =>
          setConfirmDialog({ open: false, message: "", onConfirm: null })
        }
        confirmText="Xóa"
        cancelText="Hủy"
        type="danger"
      />
    </div>
  );
}

export default CoachPage;
