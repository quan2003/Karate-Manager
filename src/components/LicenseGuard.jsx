import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { isLicenseValid } from "../services/licenseService";
import { useRole, ROLES } from "../context/RoleContext";

/**
 * Route guard - block Admin access when license is expired or revoked.
 * Secretary and Coach work from exported files and do not require a license.
 * Reacts immediately when the background server check invalidates a license.
 */
export default function LicenseGuard({ children }) {
  const { role } = useRole();
  const [, setLicenseRevision] = useState(0);

  useEffect(() => {
    const handleLicenseChange = () => {
      setLicenseRevision((revision) => revision + 1);
    };

    window.addEventListener("licenseChanged", handleLicenseChange);
    return () => {
      window.removeEventListener("licenseChanged", handleLicenseChange);
    };
  }, []);

  if (role === ROLES.ADMIN && !isLicenseValid()) {
    return <Navigate to="/" replace />;
  }
  return children;
}
