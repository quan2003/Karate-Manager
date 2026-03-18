import { useState, useRef } from "react";
import {
  parseExcelFile,
  generateTemplateExcel,
} from "../../services/excelService";
import "./AthleteList.css";

export default function AthleteList({
  athletes,
  onEdit,
  onDelete,
  onImport,
  onClearAll,
  category,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState([]);
  const fileInputRef = useRef(null);

  const filteredAthletes = athletes.filter(
    (athlete) =>
      athlete.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      athlete.club?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImporting(true);
    setImportErrors([]);

    try {
      const { athletes: importedAthletes, errors } = await parseExcelFile(file);
      if (errors.length > 0) {
        setImportErrors(errors);
      }
      if (importedAthletes.length > 0) {
        onImport(importedAthletes);
      }
    } catch (error) {
      setImportErrors([error.message]);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const getFlagEmoji = (countryCode) => {
    if (!countryCode || countryCode.length !== 2) return "🏳️";
    const codePoints = countryCode
      .toUpperCase()
      .split("")
      .map((char) => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  };

  return (
    <div className="athlete-list-container">
      <div className="athlete-list-header">
        <div className="search-box">
          <svg
            className="search-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Tìm kiếm VĐV..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="list-actions">
          <button
            className="btn btn-secondary"
            onClick={() => generateTemplateExcel(category)}
          >
            📥 Tải mẫu Excel
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? "⏳ Đang nhập..." : "📤 Import Excel"}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".xlsx,.xls"
            style={{ display: "none" }}
          />
        </div>
      </div>

      {importErrors.length > 0 && (
        <div className="import-errors">
          <strong>⚠️ Lỗi khi import:</strong>
          <ul>
            {importErrors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
          <button onClick={() => setImportErrors([])}>Đóng</button>
        </div>
      )}

      {filteredAthletes.length === 0 ? (
        <div className="empty-list">
          {athletes.length === 0 ? (
            <>
              <span className="empty-icon">👥</span>
              <p>Chưa có vận động viên nào.</p>
              <p className="empty-hint">
                Thêm VĐV thủ công hoặc import từ file Excel.
              </p>
            </>
          ) : (
            <p>Không tìm thấy VĐV phù hợp.</p>
          )}
        </div>
      ) : (
        <>
          <div className="athlete-count">
            Tổng: <strong>{filteredAthletes.length}</strong> VĐV
            {athletes.filter((a) => a.seed).length > 0 && (
              <span className="seed-count">
                ({athletes.filter((a) => a.seed).length} hạt giống)
              </span>
            )}
          </div>

          <div className="table-container">
            {" "}
            <table className="athlete-table">
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Tên VĐV</th>
                  <th>Giới tính</th>
                  <th>Ngày sinh</th>
                  <th>Đơn vị</th>
                  {category?.type === "kumite" && <th>Cân nặng</th>}
                  <th>Quốc gia</th>
                  <th>Đ.Đội</th>
                  <th>Hạt giống</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredAthletes.map((athlete, index) => (
                  <tr key={athlete.id}>
                    <td className="col-stt">{index + 1}</td>
                    <td className="col-name">{athlete.name}</td>
                    <td className="col-gender">
                      {athlete.gender === "female" ? "Nữ" : "Nam"}
                    </td>
                    <td className="col-birth">
                      {athlete.birthDate
                        ? new Date(athlete.birthDate).toLocaleDateString(
                            "vi-VN"
                          )
                        : "-"}
                    </td>
                    <td className="col-club">{athlete.club || "-"}</td>
                    {category?.type === "kumite" && (
                      <td className="col-weight">
                        {athlete.weight || "-"}
                      </td>
                    )}
                    <td className="col-country">
                      <span className="country-flag">
                        {getFlagEmoji(athlete.country)}
                      </span>
                      {athlete.country}
                    </td>
                    <td className="col-team">{athlete.isTeam ? "✅" : "-"}</td>
                    <td className="col-seed">
                      {athlete.seed ? (
                        <span className="seed-badge">#{athlete.seed}</span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="col-actions">
                      <button
                        className="action-btn edit"
                        onClick={() => onEdit(athlete)}
                        title="Sửa"
                      >
                        ✏️
                      </button>
                      <button
                        className="action-btn delete"
                        onClick={() => onDelete(athlete.id)}
                        title="Xóa"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {athletes.length > 0 && (
            <button
              className="btn btn-secondary clear-all"
              onClick={onClearAll}
            >
              🗑️ Xóa tất cả VĐV
            </button>
          )}
        </>
      )}
    </div>
  );
}
