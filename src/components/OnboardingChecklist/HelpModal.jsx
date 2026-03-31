import { useOnboarding } from "../../context/OnboardingContext";
import { useRole, ROLES } from "../../context/RoleContext";
import { useNavigate } from "react-router-dom";
import "./HelpModal.css";

const HelpModal = () => {
  const { 
    showHelpModal, 
    setShowHelpModal, 
    selectedHelpRole, 
    setSelectedHelpRole, 
    handleReproduceFunction 
  } = useOnboarding();
  const { setRole } = useRole();
  const navigate = useNavigate();

  if (!showHelpModal) return null;

  return (
    <div className="help-modal-overlay" onClick={() => setShowHelpModal(false)}>
      <div className="help-modal" onClick={e => e.stopPropagation()}>
        <div className="help-modal-header">
          <div className="help-header-main">
            <h2>📖 Hướng dẫn & Tái hiện chức năng</h2>
            <div className="help-role-tabs">
              <button 
                className={`help-tab ${selectedHelpRole === ROLES.ADMIN ? 'active' : ''}`}
                onClick={() => setSelectedHelpRole(ROLES.ADMIN)}
              >👨‍💼 Admin</button>
              <button 
                className={`help-tab ${selectedHelpRole === ROLES.SECRETARY ? 'active' : ''}`}
                onClick={() => setSelectedHelpRole(ROLES.SECRETARY)}
              >🎯 Thư ký</button>
              <button 
                className={`help-tab ${selectedHelpRole === ROLES.COACH ? 'active' : ''}`}
                onClick={() => setSelectedHelpRole(ROLES.COACH)}
              >🏆 Coach</button>
            </div>
          </div>
          <button className="close-btn" onClick={() => setShowHelpModal(false)}>×</button>
        </div>
        <div className="help-modal-body">
          {selectedHelpRole === ROLES.ADMIN && (
            <section className="help-role-section">
              <p className="role-summary">Người quản lý giải: Thiết lập, điều phối và tổng hợp kết quả.</p>
              <div className="help-function-grid">
                <div className="help-func-item">
                  <div className="func-info">
                    <strong>🏆 Tạo giải đấu</strong>
                    <span>Thiết lập tên, địa điểm, thời gian.</span>
                  </div>
                  <button className="btn-repro" onClick={() => handleReproduceFunction('create_tournament', setRole, navigate)}>Tái hiện 🔄</button>
                </div>
                <div className="help-func-item">
                  <div className="func-info">
                    <strong>➕ Thêm hạng mục</strong>
                    <span>Tạo lứa tuổi, hạng cân Kata / Kumite.</span>
                  </div>
                  <button className="btn-repro" onClick={() => handleReproduceFunction('create_category', setRole, navigate)}>Tái hiện 🔄</button>
                </div>
                <div className="help-func-item">
                  <div className="func-info">
                    <strong>🏢 Import VĐV</strong>
                    <span>Nạp danh sách từ file Excel của các đơn vị.</span>
                  </div>
                  <button className="btn-repro" onClick={() => handleReproduceFunction('import_athletes', setRole, navigate)}>Tái hiện 🔄</button>
                </div>
                <div className="help-func-item">
                  <div className="func-info">
                    <strong>🎲 Bốc thăm (Smart Draw)</strong>
                    <span>Tự động chia nhánh tránh cùng đoàn vòng đầu.</span>
                  </div>
                  <button className="btn-repro" onClick={() => handleReproduceFunction('smart_draw', setRole, navigate)}>Tái hiện 🔄</button>
                </div>
                <div className="help-func-item">
                  <div className="func-info">
                    <strong>📅 Lịch thi đấu (5 Bước)</strong>
                    <span>1.⚙️Setup {"->"} 2.📅Xếp tất cả {"->"} 3.➕Sự kiện {"->"} 4.💾Lưu {"->"} 5.📄Xuất file</span>
                  </div>
                  <button className="btn-repro" onClick={() => handleReproduceFunction('setup_schedule', setRole, navigate)}>Tái hiện 🔄</button>
                </div>
                <div className="help-func-item">
                  <div className="func-info">
                    <strong>🏅 In GCN (6 Bước)</strong>
                    <span>1.➕Tạo {"->"} 2.🖼Nền {"->"} 3.📐Kéo thả {"->"} 4.🔍Lọc {"->"} 5.👁Xem {"->"} 6.🖨In</span>
                  </div>
                  <button className="btn-repro" onClick={() => handleReproduceFunction('closing_ceremony', setRole, navigate)}>Tái hiện 🔄</button>
                </div>
                <div className="help-func-item">
                  <div className="func-info">
                    <strong>💰 Thống kê Lệ phí</strong>
                    <span>Kiểm tra tiền đóng, nợ của các đơn vị.</span>
                  </div>
                  <button className="btn-repro" onClick={() => handleReproduceFunction('check_fees', setRole, navigate)}>Tái hiện 🔄</button>
                </div>
                <div className="help-func-item">
                  <div className="func-info">
                    <strong>✂️ Chia nhánh Sigma</strong>
                    <span>Tự động chia bảng A/B khi quá đông VĐV.</span>
                  </div>
                  <button className="btn-repro" onClick={() => handleReproduceFunction('sigma_split', setRole, navigate)}>Tái hiện 🔄</button>
                </div>
                <div className="help-func-item">
                  <div className="func-info">
                    <strong>🌐 Đồng bộ LAN (Tác chiến)</strong>
                    <span>Kết nối máy Admin và máy Thư ký qua WIFI nội bộ.</span>
                  </div>
                  <button className="btn-repro" onClick={() => handleReproduceFunction('lan_sync', setRole, navigate)}>Tái hiện 🔄</button>
                </div>
                <div className="help-func-item">
                  <div className="func-info">
                    <strong>🏷️ Logo & Nhà tài trợ</strong>
                    <span>Tùy chỉnh logo, chữ ký cho các văn bản PDF.</span>
                  </div>
                  <button className="btn-repro" onClick={() => handleReproduceFunction('logo_sponsor', setRole, navigate)}>Tái hiện 🔄</button>
                </div>
              </div>
            </section>
          )}

          {selectedHelpRole === ROLES.SECRETARY && (
            <section className="help-role-section">
              <p className="role-summary">Bàn thư ký: Nhập điểm trận đấu và báo cáo kết quả LAN.</p>
              <div className="help-function-grid">
                <div className="help-func-item">
                  <div className="func-info">
                    <strong>📂 Mở file thi đấu</strong>
                    <span>Nạp dữ liệu từ file .kmatch do Admin cung cấp.</span>
                  </div>
                  <button className="btn-repro" onClick={() => handleReproduceFunction('import_kmatch_secretary', setRole, navigate)}>Tái hiện 🔄</button>
                </div>
                <div className="help-func-item">
                  <div className="func-info">
                    <strong>🎯 Chấm điểm trận đấu</strong>
                    <span>Nhập kết quả thắng/thua trực tiếp trên thảm.</span>
                  </div>
                  <button className="btn-repro" onClick={() => handleReproduceFunction('update_results', setRole, navigate)}>Tái hiện 🔄</button>
                </div>
              </div>
            </section>
          )}

          {selectedHelpRole === ROLES.COACH && (
            <section className="help-role-section">
              <p className="role-summary">Đoàn tham gia: Đăng ký vận động viên dự giải.</p>
              <div className="help-function-grid">
                <div className="help-func-item">
                  <div className="func-info">
                    <strong>Đăng ký VĐV</strong>
                    <span>Nhập danh sách VĐV của đơn vị vào file .krt.</span>
                  </div>
                  <button className="btn-repro" onClick={() => { setRole(ROLES.COACH); navigate('/coach'); setShowHelpModal(false); }}>Mở trang 🔄</button>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
