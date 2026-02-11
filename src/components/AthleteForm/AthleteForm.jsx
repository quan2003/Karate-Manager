import { useState } from 'react';
import './AthleteForm.css';

export default function AthleteForm({ onSubmit, initialData = null, onCancel }) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    club: initialData?.club || '',
    country: initialData?.country || 'VN',
    seed: initialData?.seed || '',
  });
  
  const [errors, setErrors] = useState({});
  
  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Vui lòng nhập tên VĐV';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      onSubmit({
        ...formData,
        seed: formData.seed ? parseInt(formData.seed) : null,
      });
      // Reset form if not editing
      if (!initialData) {
        setFormData({ name: '', club: '', country: 'VN', seed: '' });
      }
    }
  };
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };
  
  return (
    <form className="athlete-form" onSubmit={handleSubmit}>
      <div className="input-group">
        <label className="input-label" htmlFor="name">
          Tên VĐV <span className="required">*</span>
        </label>
        <input
          type="text"
          id="name"
          name="name"
          className={`input ${errors.name ? 'error' : ''}`}
          value={formData.name}
          onChange={handleChange}
          placeholder="Nguyễn Văn A"
        />
        {errors.name && <span className="error-message">{errors.name}</span>}
      </div>
      
      <div className="input-group">
        <label className="input-label" htmlFor="club">
          Đơn vị / CLB
        </label>
        <input
          type="text"
          id="club"
          name="club"
          className="input"
          value={formData.club}
          onChange={handleChange}
          placeholder="CLB Karate Hà Nội"
        />
      </div>
      
      <div className="form-row">
        <div className="input-group">
          <label className="input-label" htmlFor="country">
            Quốc gia
          </label>
          <select
            id="country"
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
        
        <div className="input-group">
          <label className="input-label" htmlFor="seed">
            Hạt giống
          </label>
          <select
            id="seed"
            name="seed"
            className="input"
            value={formData.seed}
            onChange={handleChange}
          >
            <option value="">Không</option>
            <option value="1">1 - Số 1</option>
            <option value="2">2 - Số 2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
            <option value="6">6</option>
            <option value="7">7</option>
            <option value="8">8</option>
          </select>
        </div>
      </div>
      
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Hủy
          </button>
        )}
        <button type="submit" className="btn btn-primary">
          {initialData ? 'Cập nhật' : 'Thêm VĐV'}
        </button>
      </div>
    </form>
  );
}
