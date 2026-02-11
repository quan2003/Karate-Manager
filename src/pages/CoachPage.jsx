import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRole, TIME_STATUS, ROLES } from '../context/RoleContext';
import { openKrtFile, validateAthlete } from '../services/krtService';
import { exportCoachData } from '../services/coachExportService';
import './CoachPage.css';

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
    canEdit,
    loadKrtData,
    refreshTimeStatus,
    addAthlete,
    updateAthlete,
    deleteAthlete,
    updateCoachName,
    getExportData,
    resetRole
  } = useRole();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingAthlete, setEditingAthlete] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    birthYear: '',
    gender: '',
    club: '',
    eventId: '',
    weight: ''
  });
  const [formErrors, setFormErrors] = useState([]);
  const [countdown, setCountdown] = useState('');

  // Redirect nếu không phải Coach
  useEffect(() => {
    if (role !== ROLES.COACH) {
      navigate('/');
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
        prefix = 'Bắt đầu sau: ';
      } else if (now < end) {
        diff = end - now;
        prefix = 'Còn lại: ';
      } else {
        setCountdown('Đã hết hạn');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      let timeStr = '';
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
    setError('');

    try {
      const result = await openKrtFile();
      
      if (result.success) {
        loadKrtData(result.data);
      } else if (!result.canceled) {
        setError(result.error || 'Không thể mở file');
      }
    } catch (err) {
      setError('Lỗi khi mở file: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Reset form
  const resetForm = useCallback(() => {
    setFormData({
      name: '',
      birthYear: '',
      gender: '',
      club: '',
      eventId: '',
      weight: ''
    });
    setFormErrors([]);
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
      birthYear: athlete.birthYear,
      gender: athlete.gender,
      club: athlete.club,
      eventId: athlete.eventId,
      weight: athlete.weight || ''
    });
    setEditingAthlete(athlete);
    setShowForm(true);
  };

  // Submit form
  const handleSubmit = (e) => {
    e.preventDefault();
    
    const event = tournamentData.events.find(ev => ev.id === formData.eventId);
    const validation = validateAthlete({
      ...formData,
      birthYear: parseInt(formData.birthYear),
      weight: formData.weight ? parseFloat(formData.weight) : undefined
    }, event || {});

    if (!validation.valid) {
      setFormErrors(validation.errors);
      return;
    }

    const athleteData = {
      name: formData.name.trim(),
      birthYear: parseInt(formData.birthYear),
      gender: formData.gender,
      club: formData.club.trim(),
      eventId: formData.eventId,
      eventName: event?.name || '',
      weight: formData.weight ? parseFloat(formData.weight) : undefined
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
    if (confirm(`Bạn có chắc muốn xóa VĐV "${athlete.name}"?`)) {
      const result = deleteAthlete(athlete.id);
      if (!result.success) {
        alert(result.error);
      }
    }
  };

  // Xuất file
  const handleExport = async (format) => {
    if (!coachName.trim()) {
      alert('Vui lòng nhập tên HLV/CLB trước khi xuất file');
      return;
    }

    try {
      const data = getExportData();
      const result = await exportCoachData(data, format);
      
      if (result.success) {
        alert('Xuất file thành công!');
      } else if (!result.canceled) {
        alert('Lỗi xuất file: ' + result.error);
      }
    } catch (err) {
      alert('Lỗi xuất file: ' + err.message);
    }
  };

  // Quay lại trang chọn role
  const handleBack = () => {
    resetRole();
    navigate('/');
  };

  // Lấy tên trạng thái thời gian
  const getTimeStatusLabel = () => {
    switch (timeStatus) {
      case TIME_STATUS.BEFORE:
        return { text: 'Chưa đến thời gian nhập', class: 'status-before' };
      case TIME_STATUS.DURING:
        return { text: 'Đang trong thời gian nhập', class: 'status-during' };
      case TIME_STATUS.AFTER:
        return { text: 'Đã hết thời gian nhập', class: 'status-after' };
      default:
        return { text: '', class: '' };
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
            <p>Vui lòng mở file .krt do Admin cung cấp để bắt đầu nhập danh sách VĐV</p>
            
            <button 
              className="open-file-btn"
              onClick={handleOpenFile}
              disabled={loading}
            >
              {loading ? 'Đang mở...' : '📁 Mở file .krt'}
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
            <span>Từ: {new Date(tournamentData.startTime).toLocaleString('vi-VN')}</span>
            <span>Đến: {new Date(tournamentData.endTime).toLocaleString('vi-VN')}</span>
          </div>
        </div>

        {/* Coach Name Input */}
        <div className="coach-name-section">
          <label>Tên HLV / CLB:</label>
          <input
            type="text"
            value={coachName}
            onChange={(e) => updateCoachName(e.target.value)}
            placeholder="Nhập tên HLV hoặc CLB..."
            disabled={!canEdit && timeStatus === TIME_STATUS.BEFORE}
          />
        </div>

        {/* Events List */}
        <div className="events-section">
          <h3>📋 Nội dung thi đấu</h3>
          <div className="events-list">
            {tournamentData.events.map(event => (
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
            {canEdit && (
              <button className="add-btn" onClick={handleAddNew}>
                + Thêm VĐV
              </button>
            )}
          </div>

          {/* Add/Edit Form */}
          {showForm && (
            <div className="athlete-form-overlay">
              <form className="athlete-form" onSubmit={handleSubmit}>
                <h4>{editingAthlete ? 'Sửa VĐV' : 'Thêm VĐV mới'}</h4>
                
                {formErrors.length > 0 && (
                  <div className="form-errors">
                    {formErrors.map((err, i) => (
                      <div key={i} className="error-item">❌ {err}</div>
                    ))}
                  </div>
                )}

                <div className="form-row">
                  <div className="form-group">
                    <label>Họ tên *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      placeholder="Nguyễn Văn A"
                    />
                  </div>
                  <div className="form-group">
                    <label>Năm sinh *</label>
                    <input
                      type="number"
                      value={formData.birthYear}
                      onChange={e => setFormData({...formData, birthYear: e.target.value})}
                      placeholder="2005"
                      min="1950"
                      max={new Date().getFullYear()}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Giới tính *</label>
                    <select
                      value={formData.gender}
                      onChange={e => setFormData({...formData, gender: e.target.value})}
                    >
                      <option value="">-- Chọn --</option>
                      <option value="male">Nam</option>
                      <option value="female">Nữ</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>CLB *</label>
                    <input
                      type="text"
                      value={formData.club}
                      onChange={e => setFormData({...formData, club: e.target.value})}
                      placeholder="CLB Karate ABC"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Nội dung *</label>
                    <select
                      value={formData.eventId}
                      onChange={e => setFormData({...formData, eventId: e.target.value})}
                    >
                      <option value="">-- Chọn nội dung --</option>
                      {tournamentData.events.map(event => (
                        <option key={event.id} value={event.id}>
                          {event.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Cân nặng (kg)</label>
                    <input
                      type="number"
                      value={formData.weight}
                      onChange={e => setFormData({...formData, weight: e.target.value})}
                      placeholder="60"
                      step="0.1"
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <button type="button" className="cancel-btn" onClick={resetForm}>
                    Hủy
                  </button>
                  <button type="submit" className="submit-btn">
                    {editingAthlete ? 'Cập nhật' : 'Thêm'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Athletes Table */}
          {coachAthletes.length > 0 ? (
            <div className="athletes-table-wrapper">
              <table className="athletes-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Họ tên</th>
                    <th>Năm sinh</th>
                    <th>Giới tính</th>
                    <th>CLB</th>
                    <th>Nội dung</th>
                    <th>Cân nặng</th>
                    {canEdit && <th>Thao tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {coachAthletes.map((athlete, index) => (
                    <tr key={athlete.id}>
                      <td>{index + 1}</td>
                      <td>{athlete.name}</td>
                      <td>{athlete.birthYear}</td>
                      <td>{athlete.gender === 'male' ? 'Nam' : 'Nữ'}</td>
                      <td>{athlete.club}</td>
                      <td>{athlete.eventName}</td>
                      <td>{athlete.weight ? `${athlete.weight}kg` : '-'}</td>
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
                </tbody>
              </table>
            </div>
          ) : (
            <div className="no-athletes">
              <p>Chưa có VĐV nào</p>
              {canEdit && <p className="hint">Nhấn "Thêm VĐV" để bắt đầu</p>}
            </div>
          )}
        </div>

        {/* Export Section */}
        <div className="export-section">
          <h3>📤 Xuất file gửi Admin</h3>
          <p className="export-note">
            Xuất danh sách VĐV để gửi cho Admin import vào hệ thống
          </p>
          <div className="export-buttons">
            <button 
              className="export-btn json"
              onClick={() => handleExport('json')}
              disabled={coachAthletes.length === 0}
            >
              📄 Xuất JSON
            </button>
            <button 
              className="export-btn excel"
              onClick={() => handleExport('excel')}
              disabled={coachAthletes.length === 0}
            >
              📊 Xuất Excel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CoachPage;
