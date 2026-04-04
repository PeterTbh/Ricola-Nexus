import { useState, useEffect } from "react";
import {
  collection, query, where, getDocs, doc, updateDoc,
  deleteDoc, onSnapshot, orderBy
} from "firebase/firestore";
import { db } from "../firebase";
import Layout from "../components/Layout";
import {
  Users, CheckCircle, XCircle, BarChart3, Package,
  ChevronDown, ChevronUp, Loader2, UserCheck, UserX,
  TrendingUp, AlertCircle, Shield, Activity
} from "lucide-react";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function currentMonthStr() {
  const d = new Date();
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ─── Section: Pending Approvals ───────────────────────────────────────────────
function PendingApprovals({ onApprove }) {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [functionInputs, setFunctionInputs] = useState({});
  const [actionLoading, setActionLoading] = useState({});
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const q = query(collection(db, "users"), where("isApproved", "==", false), where("role", "==", "pending"));
    const unsubscribe = onSnapshot(q, (snap) => {
      setPendingUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleApprove = async (user) => {
    const fn = (functionInputs[user.id] || "").trim();
    if (!fn) {
      setErrors(prev => ({ ...prev, [user.id]: "Please assign a function before approving." }));
      return;
    }
    setErrors(prev => ({ ...prev, [user.id]: "" }));
    setActionLoading(prev => ({ ...prev, [user.id]: "approving" }));
    try {
      await updateDoc(doc(db, "users", user.id), {
        role: "country_head",
        isApproved: true,
        customFunction: fn,
      });
      onApprove?.();
    } finally {
      setActionLoading(prev => ({ ...prev, [user.id]: null }));
    }
  };

  const handleReject = async (userId) => {
    setActionLoading(prev => ({ ...prev, [userId]: "rejecting" }));
    try {
      await deleteDoc(doc(db, "users", userId));
    } finally {
      setActionLoading(prev => ({ ...prev, [userId]: null }));
    }
  };

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-[#4A9E4A]" />
    </div>
  );

  if (pendingUsers.length === 0) return (
    <div className="text-center py-10">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-3">
        <CheckCircle className="w-6 h-6 text-[#2D6A2D]" />
      </div>
      <p className="text-gray-500 text-sm">No pending approvals at this time.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {pendingUsers.map(user => (
        <div key={user.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                  <span className="text-gray-600 font-semibold text-sm">
                    {user.username?.charAt(0)?.toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{user.username}</p>
                  <p className="text-xs text-gray-400">{user.email}</p>
                </div>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-semibold">
              Pending Review
            </span>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row gap-3 items-start sm:items-end">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Assign Function / Role Title
              </label>
              <input
                type="text"
                placeholder="e.g. European Market Lead"
                value={functionInputs[user.id] || ""}
                onChange={e => {
                  setFunctionInputs(prev => ({ ...prev, [user.id]: e.target.value }));
                  setErrors(prev => ({ ...prev, [user.id]: "" }));
                }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] focus:border-transparent"
              />
              {errors[user.id] && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {errors[user.id]}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleApprove(user)}
                disabled={!!actionLoading[user.id]}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white text-sm font-medium transition-colors disabled:opacity-60"
              >
                {actionLoading[user.id] === "approving"
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <UserCheck className="w-4 h-4" />}
                Approve
              </button>
              <button
                onClick={() => handleReject(user.id)}
                disabled={!!actionLoading[user.id]}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium transition-colors disabled:opacity-60 border border-red-200"
              >
                {actionLoading[user.id] === "rejecting"
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <UserX className="w-4 h-4" />}
                Reject
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Section: Active Accounts ──────────────────────────────────────────────────
function ActiveAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "users"), where("isApproved", "==", true));
    const unsubscribe = onSnapshot(q, (snap) => {
      setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-[#4A9E4A]" />
    </div>
  );

  if (accounts.length === 0) return (
    <p className="text-gray-500 text-sm text-center py-6">No active accounts yet.</p>
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Function</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {accounts.map(acc => (
            <tr key={acc.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#2D6A2D] flex items-center justify-center shrink-0">
                    <span className="text-white font-bold text-xs">
                      {acc.username?.charAt(0)?.toUpperCase()}
                    </span>
                  </div>
                  <span className="font-medium text-gray-800">{acc.username}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-gray-500">{acc.email}</td>
              <td className="px-4 py-3 text-gray-600">{acc.customFunction || <span className="text-gray-300 italic">—</span>}</td>
              <td className="px-4 py-3">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  acc.role === "admin"
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-green-100 text-green-800"
                }`}>
                  {acc.role === "admin" ? "Administrator" : "Country Head"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section: Demand Overview ──────────────────────────────────────────────────
function DemandOverview() {
  const [demands, setDemands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr());
  const [availableMonths, setAvailableMonths] = useState([currentMonthStr()]);
  const [view, setView] = useState("individual"); // "individual" | "aggregated"

  useEffect(() => {
    const q = query(collection(db, "demands"), orderBy("submittedAt", "desc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDemands(data);
      // Build unique months list
      const months = [...new Set(data.map(d => d.month))];
      if (!months.includes(currentMonthStr())) months.unshift(currentMonthStr());
      setAvailableMonths(months);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const filtered = demands.filter(d => d.month === selectedMonth);

  const aggregated = {
    product1: filtered.reduce((s, d) => s + (Number(d.product1Tons) || 0), 0),
    product2: filtered.reduce((s, d) => s + (Number(d.product2Tons) || 0), 0),
    product3: filtered.reduce((s, d) => s + (Number(d.product3Tons) || 0), 0),
  };

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-[#4A9E4A]" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          <button
            onClick={() => setView("individual")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === "individual" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Individual View
          </button>
          <button
            onClick={() => setView("aggregated")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === "aggregated" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Aggregated View
          </button>
        </div>

        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] bg-white text-gray-700"
        >
          {availableMonths.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {view === "aggregated" ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Product 1", value: aggregated.product1, color: "bg-yellow-50 border-yellow-200", text: "text-yellow-700", accent: "bg-yellow-100" },
            { label: "Product 2", value: aggregated.product2, color: "bg-green-50 border-green-200", text: "text-green-700", accent: "bg-green-100" },
            { label: "Product 3", value: aggregated.product3, color: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", accent: "bg-emerald-100" },
          ].map(({ label, value, color, text, accent }) => (
            <div key={label} className={`border rounded-xl p-5 ${color}`}>
              <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${accent} mb-3`}>
                <Package className={`w-5 h-5 ${text}`} />
              </div>
              <p className={`text-xs font-semibold uppercase tracking-wider ${text} mb-1`}>{label}</p>
              <p className={`text-3xl font-bold ${text}`}>{value.toFixed(2)}</p>
              <p className={`text-xs ${text} opacity-70 mt-1`}>Total tons · {selectedMonth}</p>
              <p className={`text-xs ${text} opacity-60 mt-0.5`}>From {filtered.length} submission{filtered.length !== 1 ? "s" : ""}</p>
            </div>
          ))}
        </div>
      ) : (
        <>
          {filtered.length === 0 ? (
            <div className="text-center py-10">
              <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No submissions for {selectedMonth}.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Country Head</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Product 1 (t)</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Product 2 (t)</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Product 3 (t)</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total (t)</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(d => {
                    const total = (Number(d.product1Tons) || 0) + (Number(d.product2Tons) || 0) + (Number(d.product3Tons) || 0);
                    const submittedAt = d.submittedAt?.toDate?.();
                    return (
                      <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-[#2D6A2D] flex items-center justify-center shrink-0">
                              <span className="text-white font-bold text-xs">
                                {d.username?.charAt(0)?.toUpperCase()}
                              </span>
                            </div>
                            <span className="font-medium text-gray-800">{d.username}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{Number(d.product1Tons).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{Number(d.product2Tons).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{Number(d.product3Tons).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-[#2D6A2D] tabular-nums">{total.toFixed(2)}</td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {submittedAt ? submittedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-green-50 border-t-2 border-green-200">
                    <td className="px-4 py-3 font-semibold text-[#2D6A2D] text-sm">Total</td>
                    <td className="px-4 py-3 text-right font-bold text-[#2D6A2D] tabular-nums">{aggregated.product1.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-bold text-[#2D6A2D] tabular-nums">{aggregated.product2.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-bold text-[#2D6A2D] tabular-nums">{aggregated.product3.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-bold text-[#2D6A2D] tabular-nums">
                      {(aggregated.product1 + aggregated.product2 + aggregated.product3).toFixed(2)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Admin Dashboard ──────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [activeSection, setActiveSection] = useState("pending");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const q = query(collection(db, "users"), where("isApproved", "==", false), where("role", "==", "pending"));
    const unsubscribe = onSnapshot(q, (snap) => setPendingCount(snap.size));
    return unsubscribe;
  }, []);

  const sections = [
    { id: "pending", label: "Pending Approvals", icon: Users, badge: pendingCount > 0 ? pendingCount : null },
    { id: "active", label: "Active Accounts", icon: Shield },
    { id: "demand", label: "Demand Overview", icon: BarChart3 },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#2D6A2D] flex items-center justify-center">
              <Activity className="w-6 h-6 text-[#F5C500]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Information Leads</h1>
              <p className="text-gray-500 text-sm mt-0.5">Administrator Control Panel · Ricola Nexus</p>
            </div>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex flex-col sm:flex-row gap-3">
          {sections.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`flex-1 flex items-center justify-center sm:justify-start gap-3 px-5 py-3.5 rounded-xl text-sm font-semibold border transition-all ${
                activeSection === id
                  ? "bg-[#2D6A2D] text-white border-[#2D6A2D] shadow-md"
                  : "bg-white text-gray-600 border-gray-200 hover:border-[#4A9E4A] hover:text-[#2D6A2D]"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{label}</span>
              {badge !== null && badge !== undefined && (
                <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-bold ${
                  activeSection === id ? "bg-[#F5C500] text-[#2D6A2D]" : "bg-red-100 text-red-600"
                }`}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Section Content */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-bold text-gray-800 mb-5 flex items-center gap-2">
            {sections.find(s => s.id === activeSection) && (
              <>
                {(() => { const Icon = sections.find(s => s.id === activeSection).icon; return <Icon className="w-4 h-4 text-[#2D6A2D]" />; })()}
                {sections.find(s => s.id === activeSection).label}
              </>
            )}
          </h2>

          {activeSection === "pending" && <PendingApprovals />}
          {activeSection === "active" && <ActiveAccounts />}
          {activeSection === "demand" && <DemandOverview />}
        </div>
      </div>
    </Layout>
  );
}
