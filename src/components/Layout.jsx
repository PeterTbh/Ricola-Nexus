import { useState, useContext } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { DemoViewContext } from "../contexts/DemoContext";
import { LogOut, ChevronDown, Eye } from "lucide-react";
import RicolaIcon from "./RicolaIcon";

export default function Layout({ children }) {
  const { userProfile, currentUser, isDemo } = useAuth();
  const { demoView, setDemoView } = useContext(DemoViewContext);
  const [profileOpen, setProfileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const roleLabel =
    isDemo ? (demoView === "admin" ? "Administrator" : "Demand Planner") :
    userProfile?.role === "admin" ? "Administrator" :
    "Demand Planner";
  const roleBadgeColor =
    userProfile?.role === "admin" || (isDemo && demoView === "admin") ? "bg-yellow-100 text-yellow-800" :
    "bg-green-100 text-green-800";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Nav */}
      <header className="bg-[#2D6A2D] shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <RicolaIcon size={36} />
              <div>
                <span className="text-white font-bold text-lg leading-none">Ricola Nexus</span>
                <p className="text-[#a8d5a8] text-xs leading-none mt-0.5 hidden sm:block">Demand Intelligence</p>
              </div>
            </div>

            {/* Demo view switcher */}
            {isDemo && (
              <div className="flex items-center gap-1 bg-[#1A4A1A] rounded-xl p-1">
                <button
                  onClick={() => setDemoView("admin")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${demoView === "admin" ? "bg-[#F5C500] text-[#2D6A2D]" : "text-[#a8d5a8] hover:text-white"}`}
                >
                  Admin View
                </button>
                <button
                  onClick={() => setDemoView("planner")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${demoView === "planner" ? "bg-[#F5C500] text-[#2D6A2D]" : "text-[#a8d5a8] hover:text-white"}`}
                >
                  Demand Planner
                </button>
              </div>
            )}

            {/* Profile dropdown */}
            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 bg-[#1A4A1A] hover:bg-[#0f2e0f] text-white rounded-xl px-3 py-2 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-[#F5C500] flex items-center justify-center">
                  <span className="text-[#2D6A2D] font-bold text-xs">
                    {userProfile?.username?.charAt(0)?.toUpperCase() || "U"}
                  </span>
                </div>
                <div className="text-left hidden sm:block">
                  <p className="text-sm font-medium leading-none">{userProfile?.username}</p>
                  <p className="text-xs text-[#a8d5a8] mt-0.5">{roleLabel}</p>
                </div>
                <ChevronDown className="w-4 h-4 text-[#a8d5a8]" />
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-800">{userProfile?.username}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{currentUser?.email}</p>
                    {userProfile?.customFunction && (
                      <p className="text-xs text-[#2D6A2D] mt-1 font-medium">{userProfile.customFunction}</p>
                    )}
                    <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${roleBadgeColor}`}>
                      {roleLabel}
                    </span>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Click outside to close profile */}
      {profileOpen && (
        <div className="fixed inset-0 z-30" onClick={() => setProfileOpen(false)} />
      )}

      {/* Demo banner */}
      {isDemo && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-center gap-2">
          <Eye className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
          <span className="text-xs font-semibold text-amber-700">Demo Mode — Read Only. No changes can be saved.</span>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 py-4">
        <p className="text-center text-xs text-gray-400">
          © {new Date().getFullYear()} Ricola Group AG · Ricola Nexus · Confidential Internal Use Only
        </p>
      </footer>
    </div>
  );
}
