import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import AuthPage from "./pages/AuthPage";
import PendingPage from "./pages/PendingPage";
import AdminDashboard from "./pages/AdminDashboard";
import CountryHeadDashboard from "./pages/CountryHeadDashboard";
import HFPlannerCockpit from "./pages/HFPlannerCockpit";
import { Loader2 } from "lucide-react";
import RicolaIcon from "./components/RicolaIcon";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#2D6A2D] to-[#0f2e0f]">
      <div className="mb-4 shadow-lg rounded-full">
        <RicolaIcon size={64} />
      </div>
      <Loader2 className="w-6 h-6 text-[#F5C500] animate-spin" />
    </div>
  );
}

function AppRoutes() {
  const { currentUser, userProfile, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  // Not logged in
  if (!currentUser) {
    return (
      <Routes>
        <Route path="*" element={<AuthPage />} />
      </Routes>
    );
  }

  // Logged in but profile missing or not yet approved
  if (!userProfile || !userProfile.isApproved) {
    return (
      <Routes>
        <Route path="*" element={<PendingPage />} />
      </Routes>
    );
  }

  // Admin
  if (userProfile.role === "admin") {
    return (
      <Routes>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    );
  }

  // Country Head
  if (userProfile.role === "country_head") {
    return (
      <Routes>
        <Route path="/dashboard" element={<CountryHeadDashboard />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    );
  }

  // HF Planner
  if (userProfile.role === "hf_planner") {
    return (
      <Routes>
        <Route path="/cockpit" element={<HFPlannerCockpit />} />
        <Route path="*" element={<Navigate to="/cockpit" replace />} />
      </Routes>
    );
  }

  // Fallback for any unknown state
  return (
    <Routes>
      <Route path="*" element={<PendingPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
