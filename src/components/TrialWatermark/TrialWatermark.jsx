import { useEffect, useState } from 'react';
import { isTrialLicense, getLicenseStatus } from '../../services/licenseService';
import './TrialWatermark.css';

export default function TrialWatermark() {
  const [isTrial, setIsTrial] = useState(false);

  useEffect(() => {
    const checkTrial = () => {
      setIsTrial(isTrialLicense());
    };

    checkTrial();
    
    // Listen for license changes
    const handleLicenseChange = () => {
      checkTrial();
    };
    
    window.addEventListener('licenseChanged', handleLicenseChange);
    
    // Also check periodically as backup
    const interval = setInterval(checkTrial, 5000);
    
    return () => {
      window.removeEventListener('licenseChanged', handleLicenseChange);
      clearInterval(interval);
    };
  }, []);

  if (!isTrial) return null;

  return (
    <>
      <div className="trial-background-text">
        BẢN DÙNG THỬ
      </div>
      <div className="trial-watermark">
        <div className="trial-content">
          <div className="trial-title">CHẾ ĐỘ DEMO</div>
          <div className="trial-subtitle">Chưa đăng ký bản quyền</div>
        </div>
      </div>
    </>
  );
}
