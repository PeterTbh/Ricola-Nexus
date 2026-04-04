import { useState, useEffect } from "react";
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp, getDocs
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import Layout from "../components/Layout";
import {
  Package, Send, History, CheckCircle2, AlertCircle,
  Loader2, TrendingUp, Edit3, Save, X
} from "lucide-react";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function currentMonthStr() {
  const d = new Date();
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const CURRENT_MONTH = currentMonthStr();

export default function CountryHeadDashboard() {
  const { currentUser, userProfile } = useAuth();

  const [product1, setProduct1] = useState("");
  const [product2, setProduct2] = useState("");
  const [product3, setProduct3] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [existingDoc, setExistingDoc] = useState(null); // current month's doc if it exists
  const [editMode, setEditMode] = useState(false);

  // Load submission history
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, "demands"),
      where("userId", "==", currentUser.uid),
      orderBy("submittedAt", "desc")
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setHistory(data);

      // Check if current month already submitted
      const thisMonth = data.find(d => d.month === CURRENT_MONTH);
      if (thisMonth) {
        setExistingDoc(thisMonth);
      } else {
        setExistingDoc(null);
      }

      setHistoryLoading(false);
    });
    return unsubscribe;
  }, [currentUser]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");
    setSubmitSuccess(false);

    const p1 = parseFloat(product1);
    const p2 = parseFloat(product2);
    const p3 = parseFloat(product3);

    if (isNaN(p1) || isNaN(p2) || isNaN(p3) || p1 < 0 || p2 < 0 || p3 < 0) {
      setSubmitError("Please enter valid non-negative numbers for all products.");
      return;
    }

    setSubmitting(true);
    try {
      if (existingDoc && editMode) {
        // Update existing document
        await updateDoc(doc(db, "demands", existingDoc.id), {
          product1Tons: p1,
          product2Tons: p2,
          product3Tons: p3,
          submittedAt: serverTimestamp(),
        });
      } else if (!existingDoc) {
        // Create new document
        await addDoc(collection(db, "demands"), {
          userId: currentUser.uid,
          username: userProfile?.username || "Unknown",
          month: CURRENT_MONTH,
          product1Tons: p1,
          product2Tons: p2,
          product3Tons: p3,
          submittedAt: serverTimestamp(),
        });
      }
      setSubmitSuccess(true);
      setEditMode(false);
      if (!existingDoc) {
        setProduct1("");
        setProduct2("");
        setProduct3("");
      }
      setTimeout(() => setSubmitSuccess(false), 4000);
    } catch (err) {
      setSubmitError("Failed to save. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = () => {
    if (existingDoc) {
      setProduct1(String(existingDoc.product1Tons));
      setProduct2(String(existingDoc.product2Tons));
      setProduct3(String(existingDoc.product3Tons));
      setEditMode(true);
      setSubmitSuccess(false);
    }
  };

  const cancelEdit = () => {
    setEditMode(false);
    setProduct1("");
    setProduct2("");
    setProduct3("");
    setSubmitError("");
  };

  const showForm = !existingDoc || editMode;

  return (
    <Layout>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Page Header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#2D6A2D] flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-[#F5C500]" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900">Demand Submission</h1>
              <p className="text-gray-500 text-sm mt-0.5">
                {userProfile?.customFunction
                  ? `${userProfile.customFunction} · `
                  : ""}
                {CURRENT_MONTH}
              </p>
            </div>
          </div>
        </div>

        {/* Submission Form / Status Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Card header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-[#2D6A2D]" />
              <h2 className="text-base font-bold text-gray-800">
                Expected Demand — {CURRENT_MONTH}
              </h2>
            </div>
            {existingDoc && !editMode && (
              <button
                onClick={startEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-[#4A9E4A] hover:text-[#2D6A2D] text-xs font-medium transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit Submission
              </button>
            )}
          </div>

          <div className="p-6">
            {/* Already submitted & not editing */}
            {existingDoc && !editMode ? (
              <div>
                <div className="flex items-center gap-2 mb-5 p-3 bg-green-50 rounded-xl border border-green-200">
                  <CheckCircle2 className="w-4 h-4 text-[#2D6A2D] shrink-0" />
                  <p className="text-sm text-[#2D6A2D] font-medium">
                    Submission recorded for {CURRENT_MONTH}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Product 1", value: existingDoc.product1Tons },
                    { label: "Product 2", value: existingDoc.product2Tons },
                    { label: "Product 3", value: existingDoc.product3Tons },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
                      <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
                      <p className="text-2xl font-bold text-[#2D6A2D]">{Number(value).toFixed(2)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">tons</p>
                    </div>
                  ))}
                </div>
                {existingDoc.submittedAt?.toDate && (
                  <p className="text-xs text-gray-400 mt-4 text-right">
                    Last updated: {existingDoc.submittedAt.toDate().toLocaleString("en-US", {
                      month: "long", day: "numeric", year: "numeric",
                      hour: "2-digit", minute: "2-digit"
                    })}
                  </p>
                )}
              </div>
            ) : (
              // Form
              <form onSubmit={handleSubmit} className="space-y-5">
                {editMode && (
                  <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-xl border border-yellow-200">
                    <Edit3 className="w-4 h-4 text-yellow-600 shrink-0" />
                    <p className="text-sm text-yellow-700 font-medium">
                      Editing submission for {CURRENT_MONTH}. Changes will overwrite your current entry.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  {[
                    { label: "Product 1", state: product1, setter: setProduct1, hint: "Classic Herb Drops" },
                    { label: "Product 2", state: product2, setter: setProduct2, hint: "Honey & Herb Drops" },
                    { label: "Product 3", state: product3, setter: setProduct3, hint: "Sugar Free Drops" },
                  ].map(({ label, state, setter, hint }) => (
                    <div key={label}>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                        {label}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={state}
                          onChange={e => setter(e.target.value)}
                          placeholder="0.00"
                          required
                          className="w-full px-4 py-3 pr-14 rounded-xl border border-gray-200 text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] focus:border-transparent transition text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">
                          tons
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{hint}</p>
                    </div>
                  ))}
                </div>

                {submitError && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    <p className="text-sm text-red-600">{submitError}</p>
                  </div>
                )}

                {submitSuccess && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                    <CheckCircle2 className="w-4 h-4 text-[#2D6A2D] shrink-0" />
                    <p className="text-sm text-[#2D6A2D] font-medium">Demand submitted successfully!</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white text-sm font-semibold transition-colors disabled:opacity-60 shadow-sm"
                  >
                    {submitting
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : editMode ? <Save className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    {editMode ? "Save Changes" : "Submit Demand"}
                  </button>

                  {editMode && (
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="flex items-center gap-2 px-5 py-3 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium transition-colors"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Submission History */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
            <History className="w-4 h-4 text-[#2D6A2D]" />
            <h2 className="text-base font-bold text-gray-800">Submission History</h2>
          </div>

          <div className="p-6">
            {historyLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-[#4A9E4A]" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-8">
                <History className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">No submissions yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Month</th>
                      <th className="text-right pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Product 1 (t)</th>
                      <th className="text-right pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Product 2 (t)</th>
                      <th className="text-right pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Product 3 (t)</th>
                      <th className="text-right pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total (t)</th>
                      <th className="text-left pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Submitted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {history.map(d => {
                      const total = (Number(d.product1Tons) || 0) + (Number(d.product2Tons) || 0) + (Number(d.product3Tons) || 0);
                      const submittedAt = d.submittedAt?.toDate?.();
                      const isCurrent = d.month === CURRENT_MONTH;
                      return (
                        <tr key={d.id} className={`hover:bg-gray-50 transition-colors ${isCurrent ? "bg-green-50/50" : ""}`}>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-800">{d.month}</span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-[#2D6A2D] text-white">
                                  Current
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 text-right tabular-nums text-gray-700">{Number(d.product1Tons).toFixed(2)}</td>
                          <td className="py-3 text-right tabular-nums text-gray-700">{Number(d.product2Tons).toFixed(2)}</td>
                          <td className="py-3 text-right tabular-nums text-gray-700">{Number(d.product3Tons).toFixed(2)}</td>
                          <td className="py-3 text-right tabular-nums font-semibold text-[#2D6A2D]">{total.toFixed(2)}</td>
                          <td className="py-3 text-xs text-gray-400">
                            {submittedAt
                              ? submittedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
