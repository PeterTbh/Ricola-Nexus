import { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { LogOut, ChevronDown } from "lucide-react";
import RicolaIcon from "./RicolaIcon";

export default function Layout({ children }) {
  const { userProfile, currentUser } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const roleLabel =
    userProfile?.role === "admin" ? "Administrator" :
    userProfile?.role === "hf_planner" ? "HF Planner" :
    "Country Head";
  const roleBadgeColor =
    userProfile?.role === "admin" ? "bg-yellow-100 text-yellow-800" :
    userProfile?.role === "hf_planner" ? "bg-blue-100 text-blue-800" :
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
