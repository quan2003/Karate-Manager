import { useState, useEffect } from "react";
import DateInput from "../common/DateInput";
import "./AthleteForm.css";

function parseAgeGroup(ageGroup) {
  if (!ageGroup) return null;
  const ag = ageGroup.trim().toUpperCase();
  const matchU = ag.match(/^U(\d+)$/);
  if (matchU) return { minAge: 0, maxAge: parseInt(matchU[1]) - 1 };
  if (ag.includes("SENIOR") || ag.includes("OPEN") || ag.includes("TUYỂN"))
    return { minAge: 18, maxAge: 99 };
  if (ag.includes("CADET") || ag.includes("THIẾU NIÊN"))
    return { minAge: 12, maxAge: 14 };
  if (ag.includes("JUNIOR") || ag.includes("THANH NIÊN") || ag.includes("TRẺ"))
    return { minAge: 15, maxAge: 17 };
  const matchRange = ag.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (matchRange)
    return { minAge: parseInt(matchRange[1]), maxAge: parseInt(matchRange[2]) };
  return null;
}

function calculateAge(birthDate) {
  if (!birthDate) return null;
  const now = new Date();
  const birth = new Date(birthDate);
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

export default function AthleteForm({
  onSubmit,
  initialData = null,
  onCancel,
  category = null,
}) {
  const isKumite = category?.type === "kumite";

  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    gender: initialData?.gender || category?.gender || "male",
    birthDate: initialData?.birthDate || "",
    club: initialData?.club || "",
    country: initialData?.country || "VN",
    weight: initialData?.weight || "",
    isTeam: initialData?.isTeam || false,
    seed: initialData?.seed || "",
  });

  const [errors, setErrors] = useState({});
  const [ageError, setAgeError] = useState("");

  // Validate age whenever birthDate changes
  useEffect(() => {
    if (!formData.birthDate || !category?.ageGroup) {
      setAgeError("");
      return;
    }
    const age = calculateAge(formData.birthDate);
    if (age === null) {
      setAgeError("");
      return;
    }
    const range = parseAgeGroup(category.ageGroup);
    if (!range) {
      setAgeError("");
      return;
    }

    if (age < range.minAge || age > range.maxAge) {
      setAgeError(
        `VĐV ${age} tuổi không phù hợp lứa tuổi "${category.ageGroup}" (${range.minAge}–${range.maxAge} tuổi)`
      );
    } else {
      setAgeError("");
    }
  }, [formData.birthDate, category?.ageGroup]);

  const validate = () => {
    const e = {};
    if (!formData.name.trim()) e.name = "Vui lòng nhập tên VĐV";
    if (!formData.gender) e.gender = "Vui lòng chọn giới tính";
    if (isKumite) {
      if (!formData.weight && formData.weight !== 0) {
        e.weight = "Vui lòng nhập cân nặng cho nội dung Kumite";
      } else if (isNaN(parseFloat(formData.weight))) {
        e.weight = "Cân nặng phải là số";
      }
    }
    if (ageError) e.birthDate = ageError;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (ev) => {
    ev.preventDefault();
    if (validate()) {
      onSubmit({
        ...formData,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        seed: formData.seed ? parseInt(formData.seed) : null,
      });
      if (!initialData) {
        setFormData({
          name: "",
          gender: category?.gender || "male",
          birthDate: "",
          club: "",
          country: "VN",
          weight: "",
          isTeam: false,
          seed: "",
        });
        setAgeError("");
      }
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  return (
    <form className="athlete-form compact" onSubmit={handleSubmit}>
      {/* Row 1: Tên VĐV (2fr) + Giới tính (1fr) */}
      <div className="form-row form-row-name">
        <div className="input-group">
          <label className="input-label">
            Tên VĐV <span className="required">*</span>
          </label>
          <input
            type="text"
            name="name"
            className={`input ${errors.name ? "error" : ""}`}
            value={formData.name}
            onChange={handleChange}
            placeholder="Nguyễn Văn A"
          />
          {errors.name && <span className="error-message">{errors.name}</span>}
        </div>
        <div className="input-group">
          <label className="input-label">
            Giới tính <span className="required">*</span>
          </label>
          <select
            name="gender"
            className={`input ${errors.gender ? "error" : ""}`}
            value={formData.gender}
            onChange={handleChange}
          >
            <option value="male">Nam</option>
            <option value="female">Nữ</option>
          </select>
        </div>
      </div>

      {/* Row 2: Ngày sinh + CLB */}
      <div className="form-row">
        <div className="input-group">
          <label className="input-label">Ngày sinh</label>
          <DateInput
            value={formData.birthDate}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, birthDate: e.target.value }));
              if (errors.birthDate)
                setErrors((prev) => ({ ...prev, birthDate: null }));
            }}
          />
        </div>
        <div className="input-group">
          <label className="input-label">Đơn vị / CLB</label>
          <input
            type="text"
            name="club"
            className="input"
            value={formData.club}
            onChange={handleChange}
            placeholder="CLB Karate Hà Nội"
          />
        </div>
      </div>

      {/* Age error */}
      {(ageError || errors.birthDate) && (
        <div className="age-error">⚠️ {ageError || errors.birthDate}</div>
      )}

      {/* Row 3: Cân nặng (kumite) + Quốc gia */}
      <div className="form-row">
        {isKumite && (
          <div className="input-group">
            <label className="input-label">Cân nặng (kg) <span className="required">*</span></label>
            <input
              type="number"
              name="weight"
              className={`input ${errors.weight ? "error" : ""}`}
              value={formData.weight}
              onChange={handleChange}
              placeholder="59.5"
              step="0.1"
              min="0"
            />
            {errors.weight && (
              <span className="error-message">{errors.weight}</span>
            )}
          </div>
        )}
        <div className="input-group">
          <label className="input-label">Quốc gia</label>
          <select
            name="country"
            className="input"
            value={formData.country}
            onChange={handleChange}
          >
            <option value="VN">🇻🇳 Việt Nam</option>
            <option value="JP">🇯🇵 Nhật Bản</option>
            <option value="KR">🇰🇷 Hàn Quốc</option>
            <option value="CN">🇨🇳 Trung Quốc</option>
            <option value="TH">🇹🇭 Thái Lan</option>
            <option value="ID">🇮🇩 Indonesia</option>
            <option value="MY">🇲🇾 Malaysia</option>
            <option value="SG">🇸🇬 Singapore</option>
            <option value="PH">🇵🇭 Philippines</option>
            <option value="US">🇺🇸 Hoa Kỳ</option>
            <option value="GB">🇬🇧 Anh</option>
            <option value="FR">🇫🇷 Pháp</option>
            <option value="DE">🇩🇪 Đức</option>
            <option value="IT">🇮🇹 Italy</option>
            <option value="ES">🇪🇸 Tây Ban Nha</option>
            <option value="AU">🇦🇺 Úc</option>
          </select>
        </div>
      </div>

      {/* Row 4: Hạt giống + Đồng đội + Actions */}
      <div className="form-footer">
        <div className="form-footer-left">
          <div className="input-group input-group-inline">
            <label className="input-label">Hạt giống</label>
            <select
              name="seed"
              className="input"
              value={formData.seed}
              onChange={handleChange}
              style={{width: '80px'}}
            >
              <option value="">Không</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
              <option value="6">6</option>
              <option value="7">7</option>
              <option value="8">8</option>
            </select>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="isTeam"
              checked={formData.isTeam}
              onChange={handleChange}
            />
            <span>Đồng đội</span>
          </label>
        </div>
        <div className="form-actions">
          {onCancel && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
            >
              Hủy
            </button>
          )}
          <button type="submit" className="btn btn-primary">
            {initialData ? "Cập nhật" : "Thêm VĐV"}
          </button>
        </div>
      </div>
    </form>
  );
}
