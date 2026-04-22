import { useState, useEffect, useRef } from "react";
import {
  collection, query, where, onSnapshot, addDoc, updateDoc,
  doc, serverTimestamp, orderBy
} from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import Layout from "../components/Layout";
import {
  Package, AlertTriangle, Download, Loader2,
  CheckCircle, Save, Info, CalendarDays
} from "lucide-react";

const REASONS = [
  { value: "", label: "— Select reason —" },
  { value: "peak_buildup", label: "Peak Buildup" },
  { value: "strategic_reserve", label: "Strategic Reserve" },
  { value: "expiry_compensation", label: "Expiry Compensation" },
  { value: "demand_revision", label: "Demand Revision" },
  { value: "other", label: "Other" },
];

const REASON_LABELS = Object.fromEntries(REASONS.map(r => [r.value, r.label]));

// ─── Expiry bucket helpers ────────────────────────────────────────────────────
function expiryBucket(date) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((date - today) / (1000 * 60 * 60 * 24));
  if (days < 0) return { days, label: "Expired", cls: "bg-red-200 text-red-800" };
  if (days < 30) return { days, label: `${days}d`, cls: "bg-red-100 text-red-700" };
  if (days <= 90) return { days, label: `${days}d`, cls: "bg-yellow-100 text-yellow-700" };
  return { days, label: `${days}d`, cls: "bg-green-100 text-green-700" };
}

// ─── Stock summary per row ────────────────────────────────────────────────────
function stockForRow(inventory, productKey, sourceEntity) {
  const relevant = inventory.filter(item =>
    item.productKey === productKey &&
    (!sourceEntity || item.entity === sourceEntity)
  );
  const totalQty = relevant.reduce((s, i) => s + (i.qty || 0), 0);
  const expiries = relevant
    .map(i => i.expiryDate?.toDate?.())
    .filter(Boolean);
  const earliestExpiry = expiries.length > 0
    ? expiries.reduce((min, d) => d < min ? d : min)
    : null;
  return { totalQty, earliestExpiry };
}

// ─── HF Planner Cockpit ───────────────────────────────────────────────────────
export default function HFPlannerCockpit() {
  const { currentUser, userProfile } = useAuth();

  const [activeMrp, setActiveMrp] = useState(null);
  const [mrpLoading, setMrpLoading] = useState(true);

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);

  const [inventory, setInventory] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);

  // localAdj: { [rowKey]: { plannedQty, reason, comment, docId, dirty, saving } }
  const [localAdj, setLocalAdj] = useState({});
  const localAdjRef = useRef({});
  const saveTimers = useRef({});

  // Keep ref in sync
  useEffect(() => {
    localAdjRef.current = localAdj;
  }, [localAdj]);

  // Load active MRP import
  useEffect(() => {
    const q = query(collection(db, "mrpImports"), where("isActive", "==", true));
    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) {
        setActiveMrp(null);
      } else {
        setActiveMrp({ id: snap.docs[0].id, ...snap.docs[0].data() });
      }
      setMrpLoading(false);
    }, () => setMrpLoading(false));
    return unsub;
  }, []);

  // Load HF products
  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("order"));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.archived);
      // Include products with type "HF" or without a type (legacy)
      setProducts(all.filter(p => !p.type || p.type === "HF"));
      setProductsLoading(false);
    }, () => setProductsLoading(false));
    return unsub;
  }, []);

  // Load inventory
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "inventory"), (snap) => {
      setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setInventoryLoading(false);
    }, () => setInventoryLoading(false));
    return unsub;
  }, []);

  // Load existing adjustments when active MRP changes
  useEffect(() => {
    if (!activeMrp) return;
    const q = query(
      collection(db, "planningAdjustments"),
      where("mrpImportId", "==", activeMrp.id)
    );
    const unsub = onSnapshot(q, (snap) => {
      const next = {};
      snap.docs.forEach(d => {
        const data = d.data();
        const rowKey = `${data.productKey}__${data.period}`;
        next[rowKey] = {
          plannedQty: data.plannedQty !== undefined && data.plannedQty !== null ? String(data.plannedQty) : "",
          reason: data.reason || "",
          comment: data.comment || "",
          docId: d.id,
          dirty: false,
          saving: false,
        };
      });
      setLocalAdj(prev => {
        // Merge: keep dirty local edits, populate the rest from Firestore
        const merged = { ...next };
        Object.entries(prev).forEach(([key, val]) => {
          if (val.dirty) merged[key] = val;
        });
        return merged;
      });
    }, () => {});
    return unsub;
  }, [activeMrp?.id]);

  const saveAdjustment = async (rowKey, row) => {
    const adj = localAdjRef.current[rowKey];
    if (!adj || !adj.dirty) return;

    setLocalAdj(prev => ({ ...prev, [rowKey]: { ...prev[rowKey], saving: true } }));

    try {
      const plannedQtyNum = adj.plannedQty !== "" ? parseFloat(adj.plannedQty) : null;
      const data = {
        mrpImportId: activeMrp.id,
        productKey: row.productKey,
        period: row.period,
        plannedQty: isNaN(plannedQtyNum) ? null : plannedQtyNum,
        reason: adj.reason || "",
        comment: adj.comment || "",
        updatedAt: serverTimestamp(),
        updatedBy: userProfile?.username || "Unknown",
      };

      if (adj.docId) {
        await updateDoc(doc(db, "planningAdjustments", adj.docId), data);
        setLocalAdj(prev => ({ ...prev, [rowKey]: { ...prev[rowKey], dirty: false, saving: false } }));
      } else {
        const newDoc = await addDoc(collection(db, "planningAdjustments"), data);
        setLocalAdj(prev => ({ ...prev, [rowKey]: { ...prev[rowKey], docId: newDoc.id, dirty: false, saving: false } }));
      }
    } catch (err) {
      console.error("Failed to save adjustment:", err);
      setLocalAdj(prev => ({ ...prev, [rowKey]: { ...prev[rowKey], saving: false } }));
    }
  };

  const scheduleAutoSave = (rowKey, row) => {
    if (saveTimers.current[rowKey]) clearTimeout(saveTimers.current[rowKey]);
    saveTimers.current[rowKey] = setTimeout(() => saveAdjustment(rowKey, row), 900);
  };

  const handleAdjChange = (rowKey, row, field, value) => {
    setLocalAdj(prev => ({
      ...prev,
      [rowKey]: {
        ...prev[rowKey],
        plannedQty: prev[rowKey]?.plannedQty ?? "",
        reason: prev[rowKey]?.reason ?? "",
        comment: prev[rowKey]?.comment ?? "",
        [field]: value,
        dirty: true,
        saving: false,
      },
    }));
    scheduleAutoSave(rowKey, row);
  };

  const productMap = Object.fromEntries(products.map(p => [p.key, p]));

  // Build table rows from active MRP rows, only for HF products
  const tableRows = activeMrp?.rows
    ? activeMrp.rows.filter(r => {
        const prod = productMap[r.productKey];
        return prod; // only rows whose productKey matches an HF product
      })
    : [];

  // Export
  const handleExport = () => {
    if (!activeMrp || tableRows.length === 0) return;

    const today = new Date();
    const headers = [
      "Product", "Period", "MRP Suggested (t)", "Current Stock (t)",
      "Earliest Expiry", "Planned Order Qty (t)", "Reason", "Comment", "Variance %"
    ];

    const dataRows = tableRows.map(row => {
      const { totalQty, earliestExpiry } = stockForRow(inventory, row.productKey, row.sourceEntity);
      const rowKey = `${row.productKey}__${row.period}`;
      const adj = localAdjRef.current[rowKey] || {};
      const plannedQty = adj.plannedQty !== "" && adj.plannedQty !== undefined ? parseFloat(adj.plannedQty) : null;
      const variance = plannedQty !== null && row.suggestedQty > 0
        ? (((plannedQty - row.suggestedQty) / row.suggestedQty) * 100).toFixed(1) + "%"
        : "—";

      const expiryStr = earliestExpiry
        ? earliestExpiry.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
        : "—";

      return [
        productMap[row.productKey]?.name ?? row.productKey,
        row.period,
        row.suggestedQty ?? 0,
        totalQty.toFixed(2),
        expiryStr,
        plannedQty !== null ? plannedQty : "",
        REASON_LABELS[adj.reason] || "",
        adj.comment || "",
        variance,
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    ws["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 22 }, { wch: 30 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "HF Cockpit");
    XLSX.writeFile(wb, `Ricola_HF_Cockpit_${activeMrp.label.replace(/\s+/g, "_")}.xlsx`);
  };

  const isLoading = mrpLoading || productsLoading || inventoryLoading;

  if (isLoading) {
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
      <div className="space-y-6 max-w-full">
        {/* Page Header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#2D6A2D] flex items-center justify-center shrink-0">
                <Package className="w-6 h-6 text-[#F5C500]" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">HF Planning Cockpit</h1>
                <p className="text-gray-500 text-sm mt-0.5">
                  {activeMrp
                    ? <>Active MRP: <span className="font-semibold text-[#2D6A2D]">{activeMrp.label}</span> · {activeMrp.rows?.length ?? 0} rows</>
                    : "No active MRP import"}
                </p>
              </div>
            </div>
            {activeMrp && tableRows.length > 0 && (
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#2D6A2D] text-[#2D6A2D] hover:bg-green-50 text-sm font-medium transition-colors"
              >
                <Download className="w-4 h-4" />Export Cockpit
              </button>
            )}
          </div>
        </div>

        {/* No active MRP */}
        {!activeMrp && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <Package className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No active MRP import.</p>
            <p className="text-gray-400 text-sm mt-1">Ask an administrator to upload and activate an MRP run.</p>
          </div>
        )}

        {/* Main table */}
        {activeMrp && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {tableRows.length === 0 ? (
              <div className="p-12 text-center">
                <Package className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">No HF product rows found in the active MRP import.</p>
                <p className="text-gray-300 text-xs mt-1">Rows are filtered to products of type "HF". Check your product settings.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Product</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Period</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">MRP Suggested (t)</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Current Stock (t)</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Earliest Expiry</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Planned Order (t)</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Reason</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Comment</th>
                      <th className="px-4 py-3 w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tableRows.map((row) => {
                      const rowKey = `${row.productKey}__${row.period}`;
                      const adj = localAdj[rowKey] || { plannedQty: "", reason: "", comment: "", dirty: false, saving: false };
                      const { totalQty, earliestExpiry } = stockForRow(inventory, row.productKey, row.sourceEntity);
                      const bucket = expiryBucket(earliestExpiry);

                      const plannedQtyNum = adj.plannedQty !== "" ? parseFloat(adj.plannedQty) : null;
                      const suggestedQty = row.suggestedQty ?? 0;
                      const hasVariance = plannedQtyNum !== null &&
                        suggestedQty > 0 &&
                        Math.abs(plannedQtyNum - suggestedQty) / suggestedQty > 0.20;

                      const prodName = productMap[row.productKey]?.name ?? row.productKey;

                      return (
                        <tr key={rowKey} className={`hover:bg-gray-50 transition-colors ${adj.dirty ? "bg-yellow-50/30" : ""}`}>
                          {/* Product */}
                          <td className="px-4 py-3">
                            <span className="font-medium text-gray-800">{prodName}</span>
                            {row.sourceEntity && (
                              <span className="ml-1.5 text-xs text-gray-400">({row.sourceEntity})</span>
                            )}
                          </td>

                          {/* Period */}
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{row.period}</td>

                          {/* MRP Suggested */}
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-blue-700">
                            {suggestedQty.toFixed(2)}
                          </td>

                          {/* Current Stock */}
                          <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                            {totalQty.toFixed(2)}
                          </td>

                          {/* Earliest Expiry */}
                          <td className="px-4 py-3 text-center">
                            {bucket ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${bucket.cls}`}>
                                <CalendarDays className="w-3 h-3" />
                                {bucket.label}
                              </span>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>

                          {/* Planned Order Qty */}
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              {hasVariance && (
                                <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" title={`Variance >20% vs MRP suggestion (${suggestedQty.toFixed(2)}t)`} />
                              )}
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={adj.plannedQty}
                                onChange={e => handleAdjChange(rowKey, row, "plannedQty", e.target.value)}
                                placeholder={suggestedQty.toFixed(2)}
                                className="w-24 px-2 py-1.5 rounded-lg border border-gray-200 text-right tabular-nums text-sm focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>
                          </td>

                          {/* Reason */}
                          <td className="px-4 py-3">
                            <select
                              value={adj.reason}
                              onChange={e => handleAdjChange(rowKey, row, "reason", e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] focus:border-transparent bg-white text-gray-700 min-w-[140px]"
                            >
                              {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                          </td>

                          {/* Comment */}
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={adj.comment}
                              onChange={e => handleAdjChange(rowKey, row, "comment", e.target.value)}
                              placeholder="Optional note…"
                              className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] focus:border-transparent min-w-[160px]"
                            />
                          </td>

                          {/* Save indicator */}
                          <td className="px-4 py-3 text-center">
                            {adj.saving ? (
                              <Loader2 className="w-4 h-4 animate-spin text-gray-400 mx-auto" />
                            ) : adj.dirty ? (
                              <div className="w-2 h-2 rounded-full bg-yellow-400 mx-auto" title="Unsaved changes" />
                            ) : adj.docId ? (
                              <CheckCircle className="w-4 h-4 text-[#4A9E4A] mx-auto" title="Saved" />
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        {activeMrp && tableRows.length > 0 && (
          <div className="flex flex-wrap gap-4 text-xs text-gray-500 px-1">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
              Variance &gt;20% vs MRP suggestion
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">30d</span> Expiry &lt;30 days
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">60d</span> Expiry 30–90 days
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">120d</span> Expiry &gt;90 days
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-yellow-400" /> Pending auto-save (900ms)
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-[#4A9E4A]" /> Saved
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
