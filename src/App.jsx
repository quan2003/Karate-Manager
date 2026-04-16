import { useEffect } from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import { TournamentProvider } from "./context/TournamentContext";
import { RoleProvider } from "./context/RoleContext";
import { OnboardingProvider, useOnboarding } from "./context/OnboardingContext";
import RoleSelectPage from "./pages/RoleSelectPage";
import HomePage from "./pages/HomePage";
import TournamentPage from "./pages/TournamentPage";
import CategoryPage from "./pages/CategoryPage";
import BracketPage from "./pages/BracketPage";
import CoachPage from "./pages/CoachPage";
import SecretaryPage from "./pages/SecretaryPage";
import StatisticsPage from "./pages/StatisticsPage";
import SchedulePage from "./pages/SchedulePage";
import AthletesPage from "./pages/AthletesPage";
import CertificatePage from "./pages/CertificatePage";
import SmartFileRouter from "./components/SmartFileRouter/SmartFileRouter";
import OnboardingChecklist, { NavHintBanner } from "./components/OnboardingChecklist/OnboardingChecklist";
import WelcomePopup from "./components/OnboardingChecklist/WelcomePopup";
import HelpModal from "./components/OnboardingChecklist/HelpModal";
import HelpFloatingButton from "./components/OnboardingChecklist/HelpFloatingButton";
import GlobalHelpHandler from "./components/OnboardingChecklist/GlobalHelpHandler";

import {
  initializeTrialIfNeeded,
  revalidateLicenseWithServer,
} from "./services/licenseService";
import TrialWatermark from "./components/TrialWatermark/TrialWatermark";
import LicenseBadge from "./components/LicenseBadge/LicenseBadge";
import LicenseGuard from "./components/LicenseGuard";
import ErrorBoundary from "./components/ErrorBoundary/ErrorBoundary";
import { ToastProvider } from "./components/common/Toast";
import appIcon from "./assets/icon.png";
import "./index.css";

// Inner shell that reads sidebar state to apply layout class
function AppShell({ children }) {
  const { sidebarOpen } = useOnboarding();
  return (
    <div className={`app${sidebarOpen ? " app--sidebar-open" : ""}`}>
      {children}
    </div>
  );
}

function App() {
  // Tự động kích hoạt Trial khi người dùng mới tải ứng dụng
  // Kiểm tra lại với Server mỗi khi mở app
  useEffect(() => {
    initializeTrialIfNeeded();
    revalidateLicenseWithServer();
  }, []);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <RoleProvider>
          <TournamentProvider>
            <Router>
              <OnboardingProvider>
              <AppShell>
                <TrialWatermark />
                <LicenseBadge />
                <SmartFileRouter />
                <OnboardingChecklist />
                <WelcomePopup />
                <NavHintBanner />
                <GlobalHelpHandler />
                <HelpModal />
                <HelpFloatingButton />
                <Routes>
                  {/* Role Selection */}
                  <Route path="/" element={<RoleSelectPage />} />

                  {/* Admin Routes */}
                  <Route
                    path="/admin"
                    element={
                      <LicenseGuard>
                        <HomePage />
                      </LicenseGuard>
                    }
                  />
                  <Route
                    path="/tournament/:id"
                    element={
                      <LicenseGuard>
                        <TournamentPage />
                      </LicenseGuard>
                    }
                  />
                  <Route
                    path="/category/:id"
                    element={
                      <LicenseGuard>
                        <CategoryPage />
                      </LicenseGuard>
                    }
                  />
                  <Route
                    path="/bracket/:id"
                    element={
                      <LicenseGuard>
                        <BracketPage />
                      </LicenseGuard>
                    }
                  />
                  <Route
                    path="/statistics/:id"
                    element={
                      <LicenseGuard>
                        <StatisticsPage />
                      </LicenseGuard>
                    }
                  />
                  <Route
                    path="/schedule/:id"
                    element={
                      <LicenseGuard>
                        <SchedulePage />
                      </LicenseGuard>
                    }
                  />
                  <Route
                    path="/athletes/:id"
                    element={
                      <LicenseGuard>
                        <AthletesPage />
                      </LicenseGuard>
                    }
                  />
                  <Route
                    path="/certificate/:id"
                    element={
                      <LicenseGuard>
                        <CertificatePage />
                      </LicenseGuard>
                    }
                  />

                  {/* Coach Routes */}
                  <Route
                    path="/coach"
                    element={
                      <LicenseGuard>
                        <CoachPage />
                      </LicenseGuard>
                    }
                  />

                  {/* Secretary Routes */}
                  <Route
                    path="/secretary"
                    element={
                      <LicenseGuard>
                        <SecretaryPage />
                      </LicenseGuard>
                    }
                  />
                </Routes>

                <footer className="app-footer">
                  <div className="container">
                    <p>
                      <img
                        src={appIcon}
                        alt=""
                        style={{
                          width: 18,
                          height: 18,
                          verticalAlign: "middle",
                          marginRight: 6,
                        }}
                      />
                      K-SPORT © 2026
                    </p>
                    <p className="footer-note">
                      Tác giả: Trương Lưu Quân - 0336.440.523
                    </p>
                  </div>
                </footer>
              </AppShell>
              </OnboardingProvider>
            </Router>
          </TournamentProvider>
        </RoleProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
