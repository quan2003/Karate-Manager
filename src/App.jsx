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
import StatisticsPage from "./pages/StatisticsPage";
import SchedulePage from "./pages/SchedulePage";

import { initializeTrialIfNeeded, revalidateLicenseWithServer } from "./services/licenseService";
import TrialWatermark from "./components/TrialWatermark/TrialWatermark";
import LicenseBadge from "./components/LicenseBadge/LicenseBadge";
import LicenseGuard from "./components/LicenseGuard";
import { ToastProvider } from "./components/common/Toast";
import "./index.css";

function App() {
  // Tự động kích hoạt Trial khi người dùng mới tải ứng dụng
  // Kiểm tra lại với Server mỗi khi mở app
  useEffect(() => {
    initializeTrialIfNeeded();
    revalidateLicenseWithServer();
  }, []);

  return (
    <ToastProvider>
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
              <Route path="/statistics/:id" element={<LicenseGuard><StatisticsPage /></LicenseGuard>} />
              <Route path="/schedule/:id" element={<LicenseGuard><SchedulePage /></LicenseGuard>} />

              {/* Coach Routes */}
              <Route path="/coach" element={<LicenseGuard><CoachPage /></LicenseGuard>} />

              {/* Secretary Routes */}
              <Route path="/secretary" element={<LicenseGuard><SecretaryPage /></LicenseGuard>} />


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
    </ToastProvider>
  );
}

export default App;
