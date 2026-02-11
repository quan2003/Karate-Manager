import { useEffect, useState } from 'react';
import { getLicenseStatus, isTrialLicense } from '../../services/licenseService';
import './LicenseBadge.css';

/**
 * Badge hiển thị trạng thái license ở góc màn hình
 * Giúp người dùng phân biệt đang dùng bản TRIAL hay FULL
 */
export default function LicenseBadge() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const updateStatus = () => {
      setStatus(getLicenseStatus());
    };

    updateStatus();
    
    // Listen for license changes
    window.addEventListener('licenseChanged', updateStatus);
    
    return () => {
      window.removeEventListener('licenseChanged', updateStatus);
    };
  }, []);

  if (!status) return null;

  // Determine badge type
  const isTrial = status.status === 'trial';
  const isActive = status.status === 'active';
  const isExpired = status.status === 'expired';
  const isNone = status.status === 'none';

  // Don't show badge if no license and not trial
  if (isNone) return null;

  return (
    <div className={`license-badge ${isTrial ? 'trial' : ''} ${isActive ? 'active' : ''} ${isExpired ? 'expired' : ''}`}>
      <div className="badge-icon">
        {isTrial && '🔓'}
        {isActive && '✅'}
        {isExpired && '❌'}
      </div>
      <div className="badge-content">
        <div className="badge-label">
          {isTrial && 'BẢN DÙNG THỬ'}
          {isActive && 'BẢN QUYỀN'}
          {isExpired && 'HẾT HẠN'}
        </div>
        <div className="badge-detail">
          {status.daysRemaining !== undefined && status.daysRemaining > 0 && (
            <span>Còn {status.daysRemaining} ngày</span>
          )}
          {isExpired && <span>Vui lòng gia hạn</span>}
        </div>
      </div>
    </div>
  );
}
