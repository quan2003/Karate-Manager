import { Navigate } from 'react-router-dom';
import { isLicenseValid } from '../services/licenseService';
import { useRole, ROLES } from '../context/RoleContext';

/**
 * Route guard - block access when license is expired.
 * Wraps protected routes and redirects to role selection page if license invalid for admin.
 */
export default function LicenseGuard({ children }) {
  const { role } = useRole();

  if (role === ROLES.ADMIN && !isLicenseValid()) {
    return <Navigate to="/" replace />;
  }
  return children;
}
