import { useState, useEffect } from "react";
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp, orderBy
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import Layout from "../components/Layout";
import {
  Package, Send, History, CheckCircle2, AlertCircle,
  Loader2, TrendingUp, Edit3, Save, X, BarChart2, Table, MessageSquare, Info
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

const DEFAULT_PRODUCTS = [
  { key: "product1Tons", name: "Product 1", order: 0 },
  { key: "product2Tons", name: "Product 2", order: 1 },
  { key: "product3Tons", name: "Product 3", order: 2 },
];

const ALL_COLORS = ["#F5C500", "#2D6A2D", "#4A9E4A", "#1e6091", "#a8440c", "#6b21a8"];

function shortMonthLabel(monthStr) {
  const [name, year] = monthStr.split(" ");
  return `${name.slice(0, 3)} '${year.slice(2)}`;
}

function parseMonthToDate(monthStr) {
  const [name, year] = monthStr.split(" ");
  return new Date(Number(year), MONTHS.indexOf(name), 1);
}

// ─── Simple bar chart ──────────────────────────────────────────────────────────
function BarChart({ groups, barColors, barLabels, height = 140 }) {
  const maxVal = Math.max(...groups.flatMap(g => g.values), 0.01);

  return (
    <div>
      <div className="flex flex-wrap gap-4 mb-4">
        {barLabels.map((lbl, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: barColors[i] }} />
            <span className="text-xs text-gray-500">{lbl}</span>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto pb-1">
        <div
          className="flex items-end gap-3"
          style={{ minWidth: `${Math.max(groups.length * 64, 200)}px`, height: `${height + 32}px` }}
        >
          {groups.map((group, i) => (
            <div key={i} className="flex-1 min-w-[48px] flex flex-col">
              <div className="flex items-end gap-0.5" style={{ height: `${height}px` }}>
                {group.values.map((val, j) => (
                  <div
                    key={j}
                    className="flex-1 rounded-t-sm transition-all"
                    style={{
                      height: val > 0 ? `${Math.max((val / maxVal) * height, 3)}px` : "0px",
                      backgroundColor: barColors[j],
                    }}
                    title={`${barLabels[j]}: ${val.toFixed(2)}t`}
                  />
                ))}
              </div>
              <span className="text-[10px] text-gray-400 text-center mt-2 leading-tight">
                {group.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Product Info View Modal (read-only for country heads) ────────────────────
function ProductInfoViewModal({ product, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="font-bold text-gray-900 text-base">{product.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">Product information</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Product-ID
            </p>
            <div className="px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 text-sm min-h-[40px]">
              {product.productId
                ? <span className="text-gray-800">{product.productId}</span>
                : <span className="text-gray-300 italic">Not set</span>}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Notes
            </p>
            <div className="px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 text-sm min-h-[80px] whitespace-pre-wrap">
              {product.notes
                ? <span className="text-gray-800">{product.notes}</span>
                : <span className="text-gray-300 italic">No notes</span>}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-5 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function CountryHeadDashboard() {
  const { currentUser, userProfile } = useAuth();

  const [products, setProducts] = useState(DEFAULT_PRODUCTS);
  const [productsLoading, setProductsLoading] = useState(true);

  const [productValues, setProductValues] = useState({});
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyView, setHistoryView] = useState("table");

  const [existingDoc, setExistingDoc] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [infoProduct, setInfoProduct] = useState(null);

  // Load products from Firestore
  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("order"));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
        setProductsLoading(false);
      },
      () => setProductsLoading(false)
    );
    return unsubscribe;
  }, []);

  // Load submission history
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, "demands"),
      where("userId", "==", currentUser.uid)
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const aTime = a.submittedAt?.seconds ?? 0;
            const bTime = b.submittedAt?.seconds ?? 0;
            return bTime - aTime;
          });

        setHistory(data);
        const thisMonth = data.find(d => d.month === CURRENT_MONTH);
        setExistingDoc(thisMonth || null);
        setHistoryLoading(false);
      },
      (err) => {
        console.error("History query error:", err);
        setHistoryLoading(false);
      }
    );
    return unsubscribe;
  }, [currentUser]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");
    setSubmitSuccess(false);

    const values = {};
    for (const p of products) {
      const val = parseFloat(productValues[p.key] || "");
      if (isNaN(val) || val < 0) {
        setSubmitError("Please enter valid non-negative numbers for all products.");
        return;
      }
      values[p.key] = val;
    }

    setSubmitting(true);
    try {
      if (existingDoc && editMode) {
        await updateDoc(doc(db, "demands", existingDoc.id), {
          ...values,
          comment: comment.trim(),
          submittedAt: serverTimestamp(),
        });
      } else if (!existingDoc) {
        await addDoc(collection(db, "demands"), {
          userId: currentUser.uid,
          username: userProfile?.username || "Unknown",
          month: CURRENT_MONTH,
          ...values,
          comment: comment.trim(),
          submittedAt: serverTimestamp(),
        });
      }
      setSubmitSuccess(true);
      setEditMode(false);
      if (!existingDoc) {
        setProductValues({});
        setComment("");
      }
      setTimeout(() => setSubmitSuccess(false), 4000);
    } catch {
      setSubmitError("Failed to save. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = () => {
    if (existingDoc) {
      const vals = {};
      products.forEach(p => { vals[p.key] = String(existingDoc[p.key] ?? ""); });
      setProductValues(vals);
      setComment(existingDoc.comment || "");
      setEditMode(true);
      setSubmitSuccess(false);
    }
  };

  const cancelEdit = () => {
    setEditMode(false);
    setProductValues({});
    setComment("");
    setSubmitError("");
  };

  const productColors = products.map((_, i) => ALL_COLORS[i % ALL_COLORS.length]);
  const productLabels = products.map(p => p.name);

  const chartGroups = [...history]
    .sort((a, b) => {
      try { return parseMonthToDate(a.month) - parseMonthToDate(b.month); } catch { return 0; }
    })
    .map(d => ({
      label: shortMonthLabel(d.month),
      values: products.map(p => Number(d[p.key]) || 0),
    }));

  if (productsLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-[#4A9E4A]" />
        </div>
      </Layout>
    );
  }

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
                {userProfile?.customFunction ? `${userProfile.customFunction} · ` : ""}
                {CURRENT_MONTH}
              </p>
            </div>
          </div>
        </div>

        {/* Submission Form / Status Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
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
            {existingDoc && !editMode ? (
              <div>
                <div className="flex items-center gap-2 mb-5 p-3 bg-green-50 rounded-xl border border-green-200">
                  <CheckCircle2 className="w-4 h-4 text-[#2D6A2D] shrink-0" />
                  <p className="text-sm text-[#2D6A2D] font-medium">
                    Submission recorded for {CURRENT_MONTH}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {products.map((p) => (
                    <div key={p.key} className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <p className="text-xs text-gray-500 font-medium">{p.name}</p>
                        <button
                          type="button"
                          onClick={() => setInfoProduct(p)}
                          title="Product information"
                          className="text-gray-300 hover:text-[#2D6A2D] transition-colors"
                        >
                          <Info className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-2xl font-bold text-[#2D6A2D]">{Number(existingDoc[p.key] || 0).toFixed(2)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">tons</p>
                    </div>
                  ))}
                </div>
                {existingDoc.comment && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
                    <div className="flex items-center gap-1.5 mb-1">
                      <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Comment</span>
                    </div>
                    <p className="text-sm text-blue-800">{existingDoc.comment}</p>
                  </div>
                )}
                {existingDoc.submittedAt?.toDate && (
                  <p className="text-xs text-gray-400 mt-4 text-right">
                    Last updated:{" "}
                    {existingDoc.submittedAt.toDate().toLocaleString("en-US", {
                      month: "long", day: "numeric", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                )}
              </div>
            ) : (
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
                  {products.map((p) => (
                    <div key={p.key}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          {p.name}
                        </label>
                        <button
                          type="button"
                          onClick={() => setInfoProduct(p)}
                          title="Product information"
                          className="text-gray-300 hover:text-[#2D6A2D] transition-colors"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={productValues[p.key] || ""}
                          onChange={e => setProductValues(prev => ({ ...prev, [p.key]: e.target.value }))}
                          placeholder="0.00"
                          required
                          className="w-full px-4 py-3 pr-14 rounded-xl border border-gray-200 text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] focus:border-transparent transition text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">
                          tons
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Optional comment */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Comments <span className="font-normal text-gray-400 normal-case">(optional)</span>
                  </label>
                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Add any remarks or context for this forecast..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] focus:border-transparent transition text-sm resize-none"
                  />
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
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-[#2D6A2D]" />
              <h2 className="text-base font-bold text-gray-800">Submission History</h2>
            </div>
            {history.length > 0 && (
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                <button
                  onClick={() => setHistoryView("table")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    historyView === "table"
                      ? "bg-white text-[#2D6A2D] shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Table className="w-3.5 h-3.5" />
                  Table
                </button>
                <button
                  onClick={() => setHistoryView("graph")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    historyView === "graph"
                      ? "bg-white text-[#2D6A2D] shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                  Graph
                </button>
              </div>
            )}
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
            ) : historyView === "graph" ? (
              <BarChart
                groups={chartGroups}
                barColors={productColors}
                barLabels={productLabels}
                height={140}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Month</th>
                      {products.map(p => (
                        <th key={p.key} className="text-right pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{p.name} (t)</th>
                      ))}
                      <th className="text-right pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total (t)</th>
                      <th className="text-left pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Submitted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {history.map(d => {
                      const total = products.reduce((s, p) => s + (Number(d[p.key]) || 0), 0);
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
                          {products.map(p => (
                            <td key={p.key} className="py-3 text-right tabular-nums text-gray-700">{Number(d[p.key] || 0).toFixed(2)}</td>
                          ))}
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

      {infoProduct && (
        <ProductInfoViewModal
          product={infoProduct}
          onClose={() => setInfoProduct(null)}
        />
      )}
    </Layout>
  );
}
