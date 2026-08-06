import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ROLES, useRole } from "../context/RoleContext";

export default function DisplayPage() {
  const { role } = useRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (role && role !== ROLES.DISPLAY && role !== ROLES.ADMIN) navigate("/admin", { replace: true });
  }, [navigate, role]);

  return (
    <iframe
      src="http://127.0.0.1:3000/display"
      title="K-SPORT DISPLAY"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: 0, zIndex: 10000, background: "#050a12" }}
    />
  );
}
