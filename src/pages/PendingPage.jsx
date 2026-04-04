import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { Clock, LogOut, RefreshCw } from "lucide-react";
import RicolaIcon from "../components/RicolaIcon";

export default function PendingPage() {
  const { userProfile, refreshProfile } = useAuth();

  const handleSignOut = async () => {
    await signOut(auth);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#2D6A2D] via-[#1A4A1A] to-[#0f2e0f] px-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex mb-6 shadow-lg rounded-full">
          <RicolaIcon size={64} />
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-yellow-100 mb-4">
            <Clock className="w-7 h-7 text-[#D4A800]" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Awaiting Approval</h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-1">
            Welcome, <span className="font-semibold text-[#2D6A2D]">{userProfile?.username}</span>.
          </p>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            Your account has been created and is pending administrator review. You will receive access once approved.
          </p>

          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
            <p className="text-xs text-yellow-700 font-medium">
              This process typically takes 1–2 business days. Please contact your system administrator if you require urgent access.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={refreshProfile}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-[#4A9E4A] text-[#2D6A2D] hover:bg-green-50 text-sm font-medium transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Check Approval Status
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 text-sm font-medium transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
