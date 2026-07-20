import { useState } from "react";
import { isTeamCategory } from "../../utils/teamDraw";
import "./AthleteList.css";

export default function AthleteList({
  athletes,
  onEdit,
  onDelete,
  onClearAll,
  category,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const isTeamEvent = isTeamCategory(category);

  const filteredAthletes = athletes.filter(
    (athlete) =>
      athlete.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      athlete.club?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getFlagEmoji = (countryCode) => {
    if (!countryCode) return "🏳️";
    const code = countryCode.toUpperCase();
    return (
      <img
        src={`${import.meta.env.BASE_URL}flags/${code}.png`}
        alt={code}
        style={{
          width: "18px",
          height: "12px",
          objectFit: "cover",
          display: "inline-block",
          verticalAlign: "middle",
          border: "1px solid #cbd5e1",
          borderRadius: "2px",
          marginRight: "6px",
        }}
        onError={(e) => {
          e.target.style.display = "none";
        }}
      />
    );
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
      </div>

      {filteredAthletes.length === 0 ? (
        <div className="empty-list">
          {athletes.length === 0 ? (
            <>
              <span className="empty-icon">👥</span>
              <p>Chưa có vận động viên nào.</p>
              <p className="empty-hint">Thêm VĐV thủ công từ nút phía trên.</p>
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
                        ? new Date(athlete.birthDate).toLocaleDateString("vi-VN")
                        : "-"}
                    </td>
                    <td className="col-club">{athlete.club || "-"}</td>
                    {category?.type === "kumite" && (
                      <td className="col-weight">{athlete.weight || "-"}</td>
                    )}
                    <td className="col-country">
                      <span className="country-flag">
                        {getFlagEmoji(athlete.country)}
                      </span>
                      {athlete.country}
                    </td>
                    <td className="col-team">{isTeamEvent && athlete.isTeam ? "✅" : "-"}</td>
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
            <button className="btn btn-secondary clear-all" onClick={onClearAll}>
              🗑️ Xóa tất cả VĐV
            </button>
          )}
        </>
      )}
    </div>
  );
}
