import { useState, useEffect } from 'react';
import './LicenseSplash.css';

export default function LicenseSplash({ onDismiss }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Show on mount
    setShow(true);
  }, []);

  const handleAccept = () => {
    setShow(false);
    if (onDismiss) onDismiss();
  };

  if (!show) return null;

  return (
    <div className="license-splash-overlay">
      <div className="license-splash-container">
        {/* Sidebar */}
        <div className="license-sidebar">
          <span className="license-sidebar-text">LUU QUAN KARATE</span> {/* Giữ nguyên tên branding */}
        </div>

        {/* Main Content */}
        <div className="license-content">
          <div className="license-header">
            <h1 className="license-title">THÔNG TIN BẢN QUYỀN</h1>
            <div className="license-subtitle">ĐIỀU KHOẢN SỬ DỤNG VÀ CẤP PHÉP</div>
          </div>

          <div className="license-body">
            <p>
              Giấy phép này được cấp duy nhất để sử dụng cho các giải đấu được tổ chức, đăng cai hoặc 
              điều hành chính thức bởi chủ sở hữu bản quyền. Việc sử dụng phần mềm cho bất kỳ sự kiện nào khác, 
              bao gồm các sự kiện do bên thứ ba tổ chức hoặc cho mục đích cá nhân, thương mại hoặc quảng cáo 
              không liên quan đến các sự kiện chính thức của chủ sở hữu, đều bị <strong>NGHIÊM CẤM</strong>.
            </p>
            <p>
              Mọi quyền lợi không được cấp phép rõ ràng đều thuộc về bản quyền của <strong>LƯU QUÂN KARATE</strong> 
              (đặc biệt nhưng không giới hạn ở các sự kiện đa môn thể thao, đại hội thể thao hoặc bất kỳ sự kiện nào 
              khác có sự tham gia của Lưu Quân Karate). Chúng tôi giữ toàn quyền sở hữu phần mềm và có thể 
              chấm dứt giấy phép này ngay lập tức nếu phát hiện sử dụng trái phép.
            </p>
            <p>
              Bằng việc sử dụng phần mềm này, bạn đồng ý tuân thủ các điều khoản và điều kiện trên.
            </p>
            
            <div className="license-contact">
              MỌI THẮC MẮC VUI LÒNG LIÊN HỆ ĐỂ ĐƯỢC GIẢI ĐÁP:<br />
              EMAIL: <strong>LUUQUANKARATE@GMAIL.COM</strong>
            </div>

            <p style={{ marginTop: '1rem', color: '#faad14', fontWeight: 'bold', fontSize: '0.9rem' }}>
              CẢM ƠN BẠN ĐÃ SỬ DỤNG DỊCH VỤ CỦA CHÚNG TÔI!
            </p>
          </div>

          <div className="license-footer">
            <button className="license-accept-btn" onClick={handleAccept}>
              ĐỒNG Ý (AGREE)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
