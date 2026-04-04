import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { Shield, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";

/**
 * AdminSetup — one-time utility to create the initial admin account.
 * Credentials: teamtwo@admin.ricola / PeterLeoDavid
 * This component should be removed or hidden after the admin is created.
 */
export default function AdminSetup() {
  const [status, setStatus] = useState("idle"); // idle | loading | success | exists | error
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);

  const ADMIN_EMAIL = "teamtwo@admin.ricola";
  const ADMIN_PASSWORD = "PeterLeoDavid";
  const ADMIN_USERNAME = "Team Two";

  const createAdmin = async () => {
    setStatus("loading");
    setMessage("");
    try {
      let uid;
      try {
        const cred = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
        uid = cred.user.uid;
      } catch (authErr) {
        if (authErr.code === "auth/email-already-in-use") {
          setStatus("exists");
          setMessage("Admin account already exists in Firebase Auth.");
          return;
        }
        throw authErr;
      }

      await setDoc(doc(db, "users", uid), {
        uid,
        username: ADMIN_USERNAME,
        email: ADMIN_EMAIL,
        role: "admin",
        customFunction: "System Administrator",
        isApproved: true,
      });

      setStatus("success");
      setMessage(`Admin account created: ${ADMIN_EMAIL}`);
    } catch (err) {
      setStatus("error");
      setMessage(err.message || "An unexpected error occurred.");
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!visible ? (
        <button
          onClick={() => setVisible(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 text-xs font-medium shadow-lg border border-gray-700"
        >
          <Shield className="w-3.5 h-3.5" />
          Admin Setup
        </button>
      ) : (
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-5 w-80">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#2D6A2D]" />
              Initial Admin Setup
            </h3>
            <button onClick={() => setVisible(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 mb-3 text-xs text-gray-600 space-y-1">
            <p><span className="font-semibold">Email:</span> {ADMIN_EMAIL}</p>
            <p><span className="font-semibold">Password:</span> {ADMIN_PASSWORD}</p>
            <p><span className="font-semibold">Username:</span> {ADMIN_USERNAME}</p>
            <p><span className="font-semibold">Role:</span> admin · approved</p>
          </div>

          {status === "success" && (
            <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg text-xs text-green-700 mb-3">
              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              {message}
            </div>
          )}
          {status === "exists" && (
            <div className="flex items-center gap-2 p-2 bg-yellow-50 rounded-lg text-xs text-yellow-700 mb-3">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {message}
            </div>
          )}
          {status === "error" && (
            <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg text-xs text-red-600 mb-3">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {message}
            </div>
          )}

          <button
            onClick={createAdmin}
            disabled={status === "loading" || status === "success"}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white text-xs font-semibold disabled:opacity-50 transition-colors"
          >
            {status === "loading" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {status === "success" ? "Created!" : "Create Admin Account"}
          </button>

          <p className="text-xs text-gray-400 mt-2 text-center">
            Remove this component after first use.
          </p>
        </div>
      )}
    </div>
  );
}
