import { useEffect, useState } from 'react';
import { getLicenseStatus, isTrialLicense } from '../../services/licenseService';
import LicenseManager from '../LicenseManager/LicenseManager';
import './LicenseBadge.css';

/**
 * Badge hiển thị trạng thái license ở góc màn hình
 * Click vào để mở popup Quản lý Bản quyền
 */
export default function LicenseBadge() {
  const [status, setStatus] = useState(null);
  const [showManager, setShowManager] = useState(false);

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

  const handleLicenseChanged = () => {
    setStatus(getLicenseStatus());
    // Dispatch event so other components update too
    window.dispatchEvent(new CustomEvent('licenseChanged'));
  };

  if (!status) return null;

  // Determine badge type
  const isTrial = status.status === 'trial';
  const isActive = status.status === 'active';
  const isExpired = status.status === 'expired';
  const isNone = status.status === 'none';

  // Don't show badge if no license and not trial
  if (isNone) return null;

  return (
    <>
      <div 
        className={`license-badge ${isTrial ? 'trial' : ''} ${isActive ? 'active' : ''} ${isExpired ? 'expired' : ''}`}
        onClick={() => setShowManager(true)}
        style={{ cursor: 'pointer' }}
        title="Click để quản lý bản quyền"
      >
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

      {/* License Manager Popup */}
      {showManager && (
        <LicenseManager 
          onClose={() => setShowManager(false)}
          onLicenseChanged={handleLicenseChanged}
        />
      )}
    </>
  );
}
