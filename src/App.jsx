import { useEffect } from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import { TournamentProvider } from "./context/TournamentContext";
import { RoleProvider } from "./context/RoleContext";
import RoleSelectPage from "./pages/RoleSelectPage";
import HomePage from "./pages/HomePage";
import TournamentPage from "./pages/TournamentPage";
import CategoryPage from "./pages/CategoryPage";
import BracketPage from "./pages/BracketPage";
import CoachPage from "./pages/CoachPage";
import SecretaryPage from "./pages/SecretaryPage";
import OwnerPage from "./pages/OwnerPage";
import { initializeTrialIfNeeded } from "./services/licenseService";
import TrialWatermark from "./components/TrialWatermark/TrialWatermark";
import LicenseBadge from "./components/LicenseBadge/LicenseBadge";
import LicenseGuard from "./components/LicenseGuard";
import "./index.css";

function App() {
  // Tự động kích hoạt Trial khi người dùng mới tải ứng dụng
  useEffect(() => {
    initializeTrialIfNeeded();
  }, []);

  return (
    <RoleProvider>
      <TournamentProvider>
        <Router>
          <div className="app">
            <TrialWatermark />
            <LicenseBadge />
            <Routes>
              {/* Role Selection */}
              <Route path="/" element={<RoleSelectPage />} />

              {/* Admin Routes */}
              <Route path="/admin" element={<LicenseGuard><HomePage /></LicenseGuard>} />
              <Route path="/tournament/:id" element={<LicenseGuard><TournamentPage /></LicenseGuard>} />
              <Route path="/category/:id" element={<LicenseGuard><CategoryPage /></LicenseGuard>} />
              <Route path="/bracket/:id" element={<LicenseGuard><BracketPage /></LicenseGuard>} />

              {/* Coach Routes */}
              <Route path="/coach" element={<LicenseGuard><CoachPage /></LicenseGuard>} />

              {/* Secretary Routes */}
              <Route path="/secretary" element={<LicenseGuard><SecretaryPage /></LicenseGuard>} />

              {/* Owner Routes - Không guard vì Owner cần truy cập để quản lý license */}
              <Route path="/owner" element={<OwnerPage />} />
            </Routes>

            <footer className="app-footer">
              <div className="container">
                <p>🥋 Karate Tournament Manager © 2026</p>
                <p className="footer-note">
                  Tác giả: Trương Lưu Quân - 0336.440.523
                </p>
              </div>
            </footer>
          </div>
        </Router>
      </TournamentProvider>
    </RoleProvider>
  );
}

export default App;
