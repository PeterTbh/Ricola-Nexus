import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import AuthPage from "./pages/AuthPage";
import PendingPage from "./pages/PendingPage";
import AdminDashboard from "./pages/AdminDashboard";
import CountryHeadDashboard from "./pages/CountryHeadDashboard";
import { Leaf, Loader2 } from "lucide-react";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#2D6A2D] to-[#0f2e0f]">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-[#F5C500] mb-4 shadow-lg">
        <Leaf className="w-8 h-8 text-[#2D6A2D]" />
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
