import { Navigate } from 'react-router-dom';
import { isLicenseValid } from '../services/licenseService';

/**
 * Route guard - block access when license is expired.
 * Wraps protected routes and redirects to role selection page if license invalid.
 */
export default function LicenseGuard({ children }) {
  if (!isLicenseValid()) {
    return <Navigate to="/" replace />;
  }
  return children;
}
