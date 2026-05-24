import { useState, useEffect } from "react";
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, getDocs, increment
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import Layout from "../components/Layout";
import {
  Package, Send, History, CheckCircle2, AlertCircle,
  Loader2, TrendingUp, Edit3, Save, X, BarChart2, Table, MessageSquare, Info,
  Layers, ChevronDown, ChevronRight, Truck, ShoppingCart, AlertTriangle, Trash2, TrendingDown, RotateCcw
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

function generateMonthOptions(historyMonths = []) {
  const set = new Set(historyMonths.filter(Boolean));
  const now = new Date();
  for (let i = -6; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    set.add(`${MONTHS[d.getMonth()]} ${d.getFullYear()}`);
  }
  return [...set].sort((a, b) => parseMonthToDate(a) - parseMonthToDate(b));
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

function fmtDateStr(ts) {
  if (!ts) return "—";
  const d = ts.toDate?.() ?? (ts instanceof Date ? ts : null);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// Deterministic "random" March 2026 date for initial inventory without a receipt timestamp
function defaultMarchDelivery(batchId) {
  let h = 0;
  for (const c of (batchId || "x")) h = ((h << 5) - h) + c.charCodeAt(0);
  return new Date(2026, 2, (Math.abs(h) % 28) + 1);
}

// Match an inventory batch to a period month string, falling back to deliveredAt when period field is absent
function batchBelongsToPeriod(batch, monthStr) {
  if (batch.period) return batch.period === monthStr;
  const d = batch.deliveredAt?.toDate?.() ?? (batch.deliveredAt instanceof Date ? batch.deliveredAt : null);
  if (!d) return false;
  const [mName, mYear] = monthStr.split(" ");
  return d.getFullYear() === Number(mYear) && MONTHS.indexOf(mName) === d.getMonth();
}

// ─── Change Country Modal ─────────────────────────────────────────────────────
function ChangeCountryModal({ userId, currentCountry, onClose, onSaved }) {
  const [knownCountries, setKnownCountries] = useState([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [mode, setMode] = useState("existing");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [newCountry, setNewCountry] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, "mrpImports")),
      getDocs(query(collection(db, "users"), where("isApproved", "==", true))),
    ]).then(([mrpSnap, usersSnap]) => {
      const fromMrp = mrpSnap.docs.flatMap(d => (d.data().rows || []).map(r => r.country).filter(Boolean));
      const fromUsers = usersSnap.docs.map(d => d.data().country).filter(Boolean);
      const unique = [...new Set([...fromMrp, ...fromUsers])].sort();
      setKnownCountries(unique);
      if (unique.length === 0) {
        setMode("new");
      } else if (currentCountry && unique.includes(currentCountry)) {
        setSelectedCountry(currentCountry);
        setMode("existing");
      } else {
        setSelectedCountry(unique[0]);
        setMode("existing");
      }
      setLoadingCountries(false);
    }).catch(() => { setMode("new"); setLoadingCountries(false); });
  }, [currentCountry]);

  const handleSave = async () => {
    const value = mode === "existing" ? selectedCountry : newCountry.trim();
    if (!value) { setError("Please enter a country."); return; }
    setSaving(true); setError("");
    try {
      await updateDoc(doc(db, "users", userId), { country: value });
      onSaved(value);
      onClose();
    } catch {
      setError("Failed to update. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <h3 className="font-bold text-gray-900 text-sm">Set Your Country</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {loadingCountries ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[#4A9E4A]" /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
              <button
                onClick={() => setMode("existing")}
                disabled={knownCountries.length === 0}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 ${mode === "existing" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                Existing country
              </button>
              <button
                onClick={() => setMode("new")}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${mode === "new" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                New country
              </button>
            </div>

            {mode === "existing" ? (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Select country</label>
                <select
                  value={selectedCountry}
                  onChange={e => setSelectedCountry(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A9E4A]"
                >
                  {knownCountries.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1.5">Countries from MRP imports and existing accounts.</p>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Country name</label>
                <input
                  type="text"
                  value={newCountry}
                  onChange={e => { setNewCountry(e.target.value); setError(""); }}
                  placeholder="e.g. Germany"
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 placeholder-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A9E4A]"
                />
                <p className="text-xs text-gray-400 mt-1.5">Must match exactly the value in MRP imports for discrepancy detection to work.</p>
              </div>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-60">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || (mode === "existing" && !selectedCountry) || (mode === "new" && !newCountry.trim())}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white text-sm font-semibold disabled:opacity-60 transition-colors"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
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
              Delivery Type
            </p>
            <div className="px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 text-sm min-h-[40px]">
              {product.type === "FG"
                ? <span className="text-gray-800">FG — Finished Good (external)</span>
                : <span className="text-gray-800">HF — Halbfabrikat (internal)</span>}
            </div>
          </div>
          {product.shelfLifeMonths != null && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Shelf Life
              </p>
              <div className="px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 text-sm">
                <span className="text-gray-800">{product.shelfLifeMonths} months</span>
              </div>
            </div>
          )}
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

// ─── Waste Record Modal ───────────────────────────────────────────────────────
function WasteRecordModal({ userProfile, products, inventory, currentUser, wasteRecords, onClose }) {
  const country = userProfile?.country || "";
  const currentBatches = inventory.filter(i => !i.levelType || i.levelType === "current");

  const [selectedProduct, setSelectedProduct] = useState(products[0]?.key || "");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [wastedQty, setWastedQty] = useState("");
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [undoing, setUndoing] = useState(null);

  const selectedProductObj = products.find(p => p.key === selectedProduct);
  const selectedProductAllKeys = selectedProductObj ? [selectedProductObj.key, ...(selectedProductObj.keyHistory || [])] : [selectedProduct];
  const productBatches = currentBatches.filter(b => selectedProductAllKeys.includes(b.productKey));
  const selectedBatch = productBatches.find(b => b.id === selectedBatchId);

  const sortedHistory = [...(wasteRecords || [])].sort(
    (a, b) => (b.submittedAt?.seconds ?? 0) - (a.submittedAt?.seconds ?? 0)
  );

  useEffect(() => {
    const first = productBatches[0];
    setSelectedBatchId(first ? first.id : "");
    setWastedQty(first ? String(first.qty ?? "") : "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct]);

  const monthOptions = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    monthOptions.push(`${MONTHS[d.getMonth()]} ${d.getFullYear()}`);
  }

  const handleSubmit = async () => {
    const qty = parseFloat(wastedQty);
    if (!selectedBatchId || !qty || qty <= 0 || saving) return;
    setSaving(true);
    try {
      const product = products.find(p => p.key === selectedProduct);
      await addDoc(collection(db, "waste"), {
        userId: currentUser.uid,
        username: userProfile?.username || "",
        userCountry: country,
        productKey: selectedProduct,
        productName: product?.name || selectedProduct,
        inventoryDocId: selectedBatchId,
        batchId: selectedBatch?.batchId || selectedBatchId.slice(-6),
        originalBatchQty: selectedBatch?.qty ?? 0,
        wastedQty: qty,
        month,
        note: note.trim(),
        submittedAt: serverTimestamp(),
      });
      // Reduce the physical batch qty so all stock views reflect the loss
      await updateDoc(doc(db, "inventory", selectedBatchId), { qty: increment(-qty) });
      setSaved(true);
      setTimeout(() => { setSaved(false); onClose(); }, 1200);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleUndo = async (w) => {
    setUndoing(w.id);
    try {
      await deleteDoc(doc(db, "waste", w.id));
      // Restore the wasted qty back to the inventory batch
      await updateDoc(doc(db, "inventory", w.inventoryDocId), { qty: increment(w.wastedQty) });
    } catch (e) { console.error(e); }
    finally { setUndoing(null); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="font-bold text-gray-900">Record Waste / Spoilage</h3>
            <p className="text-xs text-gray-400 mt-0.5">Report stock discarded due to expiry or damage</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {sortedHistory.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Waste History — undo to restore</p>
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {sortedHistory.map(w => (
                <div key={w.id} className="flex items-start gap-2 py-2.5 px-3 rounded-xl bg-red-50 border border-red-100">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-gray-800">{w.productName}</span>
                      <span className="text-[10px] text-gray-400">·</span>
                      <span className="text-[10px] text-gray-500">Batch {w.batchId}</span>
                      <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-semibold ml-auto whitespace-nowrap">
                        −{(w.wastedQty ?? 0).toFixed(2)} t
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-gray-400">{w.month}</span>
                      {w.note && <span className="text-[10px] text-gray-400 italic truncate">· {w.note}</span>}
                      <span className="text-[10px] text-gray-300 ml-auto whitespace-nowrap">
                        {w.submittedAt?.toDate?.().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) ?? ""}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUndo(w)}
                    disabled={!!undoing}
                    title="Undo — restore this quantity to inventory"
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 transition-colors">
                    {undoing === w.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <RotateCcw className="w-3 h-3" />}
                    Undo
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-5 mb-0 border-t border-gray-100" />
          </div>
        )}

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">New Entry</p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Product</label>
            <select value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A9E4A]">
              {products.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Batch</label>
            {productBatches.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-1.5">No batches found for this product.</p>
            ) : (
              <select value={selectedBatchId}
                onChange={e => {
                  setSelectedBatchId(e.target.value);
                  const b = productBatches.find(b => b.id === e.target.value);
                  if (b) setWastedQty(String(b.qty ?? ""));
                }}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A9E4A]">
                {productBatches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.batchId || b.id.slice(-6)} — {(b.qty ?? 0).toFixed(2)} t{b.period ? ` (${b.period})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Quantity Wasted (t)</label>
            <input type="number" min="0.001" step="0.01" max={selectedBatch?.qty ?? undefined}
              value={wastedQty} onChange={e => setWastedQty(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A9E4A]" />
            {selectedBatch && (
              <p className="text-xs text-gray-400 mt-1">Full batch: {(selectedBatch.qty ?? 0).toFixed(2)} t</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Period Waste Occurred</label>
            <select value={month} onChange={e => setMonth(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A9E4A]">
              {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Note <span className="font-normal text-gray-400 normal-case">(optional)</span>
            </label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder="Reason, e.g. expired, damaged..."
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] resize-none" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSubmit}
            disabled={saving || saved || !selectedBatchId || !wastedQty || parseFloat(wastedQty) <= 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-60 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" />
              : saved ? <CheckCircle2 className="w-4 h-4" />
              : <Trash2 className="w-4 h-4" />}
            {saved ? "Recorded!" : "Record Waste"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stock Flow Sub-Tab (demand planner — single country) ─────────────────────
function StockFlowSubTab({ demands, inventory, wasteRecords, messages, products }) {
  const [expandedProduct, setExpandedProduct] = useState(null);

  const orderBatches = inventory.filter(i => i.source === "order" && (!i.levelType || i.levelType === "current"));
  const initialBatches = inventory.filter(i => i.source !== "order" && i.source !== "mrp" && (!i.levelType || i.levelType === "current"));
  const sortedDemands = [...demands].sort((a, b) => parseMonthToDate(a.month) - parseMonthToDate(b.month));

  // Map inventoryDocId → total wasted qty, so ordersIn always reflects original delivered amount
  const batchWasteMap = {};
  for (const w of wasteRecords) {
    if (w.inventoryDocId) batchWasteMap[w.inventoryDocId] = (batchWasteMap[w.inventoryDocId] || 0) + (w.wastedQty || 0);
  }
  const origQty = (b) => (b.qty || 0) + (batchWasteMap[b.id] || 0);

  const ledger = products.map(product => {
    const pKey = product.key;
    const allPKeys = [pKey, ...(product.keyHistory || [])];
    const shelfLife = product.shelfLifeMonths ?? null;
    const productOrderBatches = orderBatches.filter(b => allPKeys.includes(b.productKey));
    const hasAnyOrders = productOrderBatches.length > 0;

    // Compute a stable expiry for initial/manual stock — treated as earliest in FIFO
    const initBatch = initialBatches.find(b => allPKeys.includes(b.productKey));
    let manualExpiry = null;
    if (shelfLife) {
      const seed = initBatch?.id || initBatch?.batchId || pKey;
      const base = initBatch?.deliveredAt?.toDate?.() ?? defaultMarchDelivery(seed);
      manualExpiry = new Date(base);
      manualExpiry.setMonth(manualExpiry.getMonth() + shelfLife);
    }

    const rows = [];
    let prevRow = null;
    for (let i = 0; i < sortedDemands.length; i++) {
      const demandM = sortedDemands[i];
      const demandNext = sortedDemands[i + 1] ?? null;
      // Check opening stock under current key or any historical key
      const openingStock = allPKeys.reduce((val, k) => val ?? demandM.currentInventory?.[k] ?? null, null);
      if (openingStock === null) { prevRow = null; continue; }

      const ordersIn = productOrderBatches.filter(b => batchBelongsToPeriod(b, demandM.month)).reduce((s, b) => s + origQty(b), 0);

      // Attribute waste to the demand row whose window covers the waste month:
      // waste belongs here if wDate >= demandM.month AND wDate < demandNext.month (or any future waste if this is the last row)
      const demDate = parseMonthToDate(demandM.month);
      const nextDate = demandNext ? parseMonthToDate(demandNext.month) : null;
      const periodWaste = wasteRecords.filter(w => {
        if (!allPKeys.includes(w.productKey)) return false;
        const wDate = parseMonthToDate(w.month);
        return wDate >= demDate && (nextDate === null || wDate < nextDate);
      });
      const wasteQty = periodWaste.reduce((s, w) => s + (w.wastedQty || 0), 0);

      // Stock unexplained by previous period's FIFO = manual/initial adjustment, shown separately with earliest expiry
      let manualDelta = 0;
      if (!prevRow && !hasAnyOrders) {
        manualDelta = openingStock; // Case 1: first period, no order batches received yet
      } else if (prevRow) {
        const fifoMax = prevRow.openingStock + prevRow.ordersIn - prevRow.wasteQty;
        if (openingStock > fifoMax + 0.001) manualDelta = openingStock - fifoMax; // Case 2: surplus beyond FIFO
      }

      const postDelivery = openingStock + ordersIn;
      const closingStock = demandNext ? allPKeys.reduce((val, k) => val ?? demandNext.currentInventory?.[k] ?? null, null) : null;
      const consumption = closingStock !== null ? Math.max(0, postDelivery - closingStock - wasteQty) : null;
      const resolvedMsg = messages.find(m => allPKeys.includes(m.productKey) && m.period === demandM.month && (m.status === "resolved" || m.status === "admin_resolved"));
      const submittedDemand = allPKeys.reduce((val, k) => val ?? (demandM[k] !== undefined ? demandM[k] : null), null);
      const effectiveDemand = resolvedMsg?.resolvedQty ?? submittedDemand;
      // Sort by expiry ascending so earliest-expiring batches are displayed first (FIFO)
      const periodBatches = productOrderBatches
        .filter(b => batchBelongsToPeriod(b, demandM.month))
        .sort((a, b) => (a.expiryDate?.seconds ?? a.deliveredAt?.seconds ?? Infinity) - (b.expiryDate?.seconds ?? b.deliveredAt?.seconds ?? Infinity));
      const row = { month: demandM.month, openingStock, ordersIn, manualDelta, postDelivery, wasteQty, closingStock, consumption, submittedDemand, effectiveDemand, resolvedMsg, periodBatches, periodWaste };
      rows.push(row);
      prevRow = row;
    }
    return { product, rows, manualExpiry };
  }).filter(g => g.rows.length > 0);

  if (ledger.length === 0) return (
    <div className="text-center py-10">
      <TrendingDown className="w-8 h-8 text-gray-200 mx-auto mb-2" />
      <p className="text-gray-400 text-sm">No inventory flow data yet. Submit current inventory data to see the ledger.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">Monthly stock ledger per product (FIFO). Consumption = post-delivery − closing − waste. Variance between actual and submitted demand shown for completed periods.</p>
      {ledger.map(({ product, rows, manualExpiry }) => {
        const isExp = expandedProduct === product.key;
        return (
          <div key={product.key} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <button onClick={() => setExpandedProduct(isExp ? null : product.key)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#2D6A2D]/10 flex items-center justify-center">
                  <Package className="w-4 h-4 text-[#2D6A2D]" />
                </div>
                <span className="font-semibold text-sm text-gray-800">{product.name}</span>
                <span className="text-xs text-gray-400">{rows.length} period{rows.length !== 1 ? "s" : ""}</span>
              </div>
              {isExp ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
            </button>
            {isExp && (
              <div className="border-t border-gray-100">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Period</th>
                        <th className="text-right px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Opening (t)</th>
                        <th className="text-right px-3 py-2.5 font-semibold text-green-600 uppercase tracking-wider whitespace-nowrap">Orders In (t)</th>
                        <th className="text-right px-3 py-2.5 font-semibold text-blue-600 uppercase tracking-wider whitespace-nowrap">Post-Delivery (t)</th>
                        <th className="text-right px-3 py-2.5 font-semibold text-red-500 uppercase tracking-wider whitespace-nowrap">Waste (t)</th>
                        <th className="text-right px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Closing (t)</th>
                        <th className="text-right px-3 py-2.5 font-semibold text-[#2D6A2D] uppercase tracking-wider whitespace-nowrap">Actual Demand (t)</th>
                        <th className="text-right px-3 py-2.5 font-semibold text-amber-600 uppercase tracking-wider whitespace-nowrap">Submitted (t)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {rows.map(row => {
                        const variance = row.consumption !== null && row.effectiveDemand != null ? row.consumption - row.effectiveDemand : null;
                        return (
                          <tr key={row.month} className="hover:bg-gray-50">
                            <td className="px-3 py-2.5 font-medium text-gray-700 whitespace-nowrap">{shortMonthLabel(row.month)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{row.openingStock?.toFixed(2) ?? "—"}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-green-700">{row.ordersIn > 0 ? `+${row.ordersIn.toFixed(2)}` : "—"}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-blue-700">{row.postDelivery.toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-red-600">{row.wasteQty > 0 ? `−${row.wasteQty.toFixed(2)}` : "—"}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{row.closingStock?.toFixed(2) ?? <span className="text-gray-300 italic text-[10px]">pending</span>}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {row.consumption !== null
                                ? <span className="font-bold text-[#2D6A2D]">{row.consumption.toFixed(2)}</span>
                                : <span className="text-gray-300 italic text-[10px]">pending</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {row.effectiveDemand != null ? (
                                <div>
                                  <span className={row.resolvedMsg ? "font-semibold text-[#2D6A2D]" : "text-amber-700"}>{row.effectiveDemand.toFixed(2)}</span>
                                  {variance !== null && (
                                    <div className={`text-[10px] mt-0.5 ${Math.abs(variance) < 0.01 ? "text-green-500" : variance > 0 ? "text-red-500" : "text-blue-500"}`}>
                                      {Math.abs(variance) < 0.01 ? "✓" : variance > 0 ? `+${variance.toFixed(2)}` : `${variance.toFixed(2)}`}
                                    </div>
                                  )}
                                </div>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {rows.some(r => r.manualDelta > 0 || r.periodBatches.length > 0 || r.periodWaste.length > 0) && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50/60 space-y-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Batch Movements (FIFO — earliest expiry first)</p>
                    {rows.map(row => (
                      (row.manualDelta > 0 || row.periodBatches.length > 0 || row.periodWaste.length > 0) && (
                        <div key={row.month}>
                          <p className="text-xs font-medium text-gray-600 mb-1.5">{row.month}</p>
                          <div className="space-y-1">
                            {row.manualDelta > 0 && (
                              <div className="flex items-center gap-3 text-xs bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
                                <span className="text-amber-700 font-bold shrink-0">⬆ INIT</span>
                                <span className="text-gray-700 font-medium">Initial / Manual Stock</span>
                                <span className="text-gray-500">{row.manualDelta.toFixed(2)} t</span>
                                {manualExpiry && <span className="text-amber-600 ml-auto text-[10px]">exp {manualExpiry.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · consumed first</span>}
                              </div>
                            )}
                            {row.periodBatches.map(b => {
                              const orig = origQty(b);
                              const wasted = batchWasteMap[b.id] || 0;
                              return (
                                <div key={b.id} className="flex items-center gap-3 text-xs bg-white rounded-lg px-3 py-2 border border-green-100">
                                  <span className="text-green-600 font-bold shrink-0">↑ IN</span>
                                  <span className="text-gray-700 font-medium">{b.batchId || b.id.slice(-6)}</span>
                                  <span className="text-gray-500">
                                    {orig.toFixed(2)} t
                                    {wasted > 0 && <span className="text-red-500 ml-1">({(b.qty ?? 0).toFixed(2)} t remaining)</span>}
                                  </span>
                                  {b.expiryDate && <span className="text-amber-600 ml-auto">exp {fmtDateStr(b.expiryDate)}</span>}
                                </div>
                              );
                            })}
                            {row.periodWaste.map(w => (
                              <div key={w.id} className="flex items-center gap-3 text-xs bg-red-50 rounded-lg px-3 py-2 border border-red-100">
                                <span className="text-red-600 font-bold shrink-0">↓ WASTE</span>
                                <span className="text-gray-700 font-medium">{w.batchId}</span>
                                <span className="text-red-700">−{(w.wastedQty ?? 0).toFixed(2)} t</span>
                                {w.note && <span className="text-gray-400 italic ml-auto">{w.note}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Inventory Tab ─────────────────────────────────────────────────────────────
function CountryInventoryTab({ userProfile, products }) {
  const { currentUser, isDemo } = useAuth();
  const [inventory, setInventory] = useState([]);
  const [demands, setDemands] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeMrp, setActiveMrp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState("stock");
  const [expandedProduct, setExpandedProduct] = useState(null);
  const [marking, setMarking] = useState(null);
  const [waste, setWaste] = useState([]);
  const [showWasteModal, setShowWasteModal] = useState(false);

  const country = userProfile?.country || "";
  const MONTH = currentMonthStr();

  useEffect(() => {
    if (!country) { setLoading(false); return; }
    return onSnapshot(query(collection(db, "inventory"), where("entity", "==", country)), snap => {
      setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
  }, [country]);

  useEffect(() => {
    if (!currentUser) return;
    return onSnapshot(query(collection(db, "demands"), where("userId", "==", currentUser.uid)), snap => {
      setDemands(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    return onSnapshot(query(collection(db, "messages"), where("toUserId", "==", currentUser.uid)), snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [currentUser]);

  useEffect(() => {
    if (!country) return;
    return onSnapshot(query(collection(db, "waste"), where("userCountry", "==", country)), snap => {
      setWaste(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [country]);

  useEffect(() => {
    return onSnapshot(query(collection(db, "mrpImports"), where("isActive", "==", true)), snap => {
      setActiveMrp(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
    });
  }, []);

  const fmtDate = (d) => {
    if (!d) return "—";
    const dt = d.toDate?.() ?? (d instanceof Date ? d : null);
    if (!dt) return "—";
    return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };

  const fmtDateTime = (ts) => {
    if (!ts) return "—";
    const d = ts.toDate?.();
    if (!d) return "—";
    return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const getComputedExpiry = (batch, shelfLifeMonths) => {
    if (batch.expiryDate) return batch.expiryDate.toDate?.() ?? null;
    const base = batch.deliveredAt?.toDate?.() ?? null;
    if (base && shelfLifeMonths) {
      const exp = new Date(base); exp.setMonth(exp.getMonth() + shelfLifeMonths); return exp;
    }
    // Initial inventory with no receipt timestamp: use deterministic March 2026 delivery date
    if (!batch.deliveredAt && batch.source !== "order" && shelfLifeMonths) {
      const march = defaultMarchDelivery(batch.id || batch.batchId || "x");
      const exp = new Date(march); exp.setMonth(exp.getMonth() + shelfLifeMonths); return exp;
    }
    return null;
  };

  const handleMarkDelivered = async (item) => {
    setMarking(item.id);
    try {
      await updateDoc(doc(db, "inventory", item.id), {
        deliveredAt: serverTimestamp(),
        deliveredBy: userProfile?.username || currentUser?.uid || "Unknown",
      });
    } catch (e) { console.error(e); }
    finally { setMarking(null); }
  };

  const currentDemand = demands.find(d => d.month === MONTH) ?? null;
  const latestDemand = [...demands].sort((a, b) => (b.submittedAt?.seconds ?? 0) - (a.submittedAt?.seconds ?? 0))[0] ?? null;
  // baseDemand: prefer current month; fall back to most recent for inventory display
  const baseDemand = currentDemand ?? latestDemand;
  const baseDemandTimeSec = baseDemand?.month ? Math.floor(parseMonthToDate(baseDemand.month).getTime() / 1000) : 0;

  const getExpectedDemand = (productKey, allPKeys = [productKey]) => {
    const resolvedMsg = messages.find(m =>
      !m.type && allPKeys.includes(m.productKey) && m.period === MONTH &&
      (m.status === "resolved" || m.status === "admin_resolved")
    );
    if (resolvedMsg) return { qty: resolvedMsg.resolvedQty ?? 0, source: "resolved" };
    const submittedQty = allPKeys.reduce((val, k) => val ?? (currentDemand?.[k] != null ? Number(currentDemand[k]) : null), null);
    if (submittedQty !== null) return { qty: submittedQty || 0, source: "submitted" };
    if (activeMrp?.rows) {
      const row = activeMrp.rows.find(r => allPKeys.includes(r.productKey) && r.country?.trim().toLowerCase() === country.trim().toLowerCase());
      if (row) return { qty: parseFloat(row.suggestedQty) || 0, source: "mrp" };
    }
    return { qty: 0, source: "none" };
  };

  const currentBatchItems = inventory.filter(i => i.source !== "mrp" && (!i.levelType || i.levelType === "current"));

  const productGroups = products.map(p => {
    const allPKeys = [p.key, ...(p.keyHistory || [])];
    const batches = currentBatchItems.filter(i => allPKeys.includes(i.productKey));
    // Only count order batches received after the base demand submission to avoid double-counting
    const receivedOrderQty = batches.filter(b => b.source === "order" && b.deliveredAt && (baseDemandTimeSec === 0 || (b.deliveredAt.seconds ?? 0) >= baseDemandTimeSec)).reduce((s, b) => s + (b.qty || 0), 0);
    // Check current inventory under current key or any historical key
    const submittedCurrentQty = allPKeys.reduce((val, k) => val ?? baseDemand?.currentInventory?.[k] ?? null, null);
    // Only use demand submission as opening balance when it reports actual stock (> 0).
    // Submission = 0 means "nothing on hand at time of submission" — fall back to physical batches
    // so pre-submission order records are still counted (matches StockLevelsTab behaviour).
    const hasSubmittedInventory = submittedCurrentQty != null && submittedCurrentQty > 0;
    const allPhysicalQty = batches.reduce((s, b) => s + (b.qty || 0), 0);
    const totalCurrentQty = hasSubmittedInventory
      ? submittedCurrentQty + receivedOrderQty
      : allPhysicalQty;

    const expiries = batches.map(b => getComputedExpiry(b, p.shelfLifeMonths)).filter(Boolean);
    const earliestExpiry = expiries.length > 0 ? expiries.reduce((min, d) => d < min ? d : min) : null;

    const desiredManual = allPKeys.reduce((val, k) => val ?? currentDemand?.desiredInventory?.[k] ?? null, null);
    const desiredMrpRow = activeMrp?.rows?.find(r => allPKeys.includes(r.productKey) && r.country?.trim().toLowerCase() === country.trim().toLowerCase());
    const desiredMrp = desiredMrpRow?.desiredQty != null ? parseFloat(desiredMrpRow.desiredQty) : null;

    const { qty: expectedDemandQty, source: demandSource } = getExpectedDemand(p.key, allPKeys);
    const safetyStock = totalCurrentQty - expectedDemandQty;

    return { product: p, batches, receivedOrderQty, submittedCurrentQty, totalCurrentQty, earliestExpiry, desiredManual, desiredMrp, expectedDemandQty, demandSource, safetyStock };
  });

  const stockGroups = productGroups.filter(g => g.batches.length > 0 || g.submittedCurrentQty != null);

  if (!country) return (
    <div className="text-center py-10">
      <Layers className="w-8 h-8 text-gray-200 mx-auto mb-2" />
      <p className="text-gray-400 text-sm">No country assigned. Contact an administrator.</p>
    </div>
  );

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#4A9E4A]" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          {[{ id: "stock", label: "Stock Levels" }, { id: "safety", label: "Safety Stock" }, { id: "flow", label: "Stock Flow" }].map(t => (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${subTab === t.id ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              {t.label}
            </button>
          ))}
        </div>
        {!isDemo && (
          <button
            onClick={() => setShowWasteModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
          >
            <TrendingDown className="w-3.5 h-3.5" />
            Record Waste
          </button>
        )}
      </div>

      {subTab === "stock" && (
        stockGroups.length === 0 ? (
          <div className="text-center py-10">
            <Layers className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">No inventory records for {country}.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {stockGroups.map(({ product, batches, receivedOrderQty, submittedCurrentQty, totalCurrentQty, earliestExpiry }) => {
              const isExpanded = expandedProduct === product.key;
              return (
                <div key={product.key} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="flex items-center gap-4 px-4 py-3">
                    <div className="w-9 h-9 rounded-lg bg-[#2D6A2D]/10 flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-[#2D6A2D]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-800">{product.name}</p>
                      <div className="flex flex-wrap gap-3 mt-0.5">
                        <span className="text-xs text-gray-500">Total: <span className="font-bold text-[#2D6A2D]">{totalCurrentQty.toFixed(2)} t</span></span>
                        {submittedCurrentQty != null && receivedOrderQty > 0 && (
                          <span className="text-xs text-gray-400">(submitted {submittedCurrentQty.toFixed(2)} + received {receivedOrderQty.toFixed(2)})</span>
                        )}
                        {earliestExpiry && (
                          <span className="text-xs text-gray-500">Earliest expiry: <span className="font-medium text-amber-700">{earliestExpiry.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></span>
                        )}
                        {product.shelfLifeMonths != null && (
                          <span className="text-xs text-gray-500">Shelf life: <span className="font-medium text-gray-700">{product.shelfLifeMonths} mo</span></span>
                        )}
                      </div>
                    </div>
                    {batches.length > 0 && (
                      <button onClick={() => setExpandedProduct(isExpanded ? null : product.key)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-[#2D6A2D] hover:bg-green-50 border border-gray-200 hover:border-[#4A9E4A] transition-colors">
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        Batches ({batches.length})
                      </button>
                    )}
                  </div>
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100">
                            {["Batch ID","Qty (t)","Expiry","Status",""].map(h => (
                              <th key={h} className="text-left px-4 py-2.5 text-gray-500 font-semibold uppercase tracking-wider">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {batches.map(batch => {
                            const computedExpiry = getComputedExpiry(batch, product.shelfLifeMonths);
                            return (
                              <tr key={batch.id} className="hover:bg-white transition-colors">
                                <td className="px-4 py-2.5 text-gray-700">{batch.batchId || <span className="text-gray-300 italic">—</span>}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[#2D6A2D]">{(batch.qty ?? 0).toFixed(2)}</td>
                                <td className="px-4 py-2.5 text-gray-600">{fmtDate(computedExpiry)}</td>
                                <td className="px-4 py-2.5">
                                  {batch.deliveredAt ? (
                                    <div className="flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                                      <span className="text-green-700 font-medium">Delivered {fmtDateTime(batch.deliveredAt)}</span>
                                    </div>
                                  ) : <span className="text-gray-400">Not delivered</span>}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  {!batch.deliveredAt && !isDemo && (
                                    <button onClick={() => handleMarkDelivered(batch)} disabled={marking === batch.id}
                                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[#2D6A2D] border border-[#2D6A2D] hover:bg-green-50 disabled:opacity-60 transition-colors">
                                      {marking === batch.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Truck className="w-3 h-3" />}
                                      Mark Delivered
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {subTab === "safety" && (
        <div className="space-y-4">
          <p className="text-xs text-gray-400">
            Safety Stock = submitted current inventory + received orders − expected demand ({MONTH}). Desired shows your target from the demand submission.
          </p>
          {!currentDemand && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <p className="text-sm text-amber-700">No demand submitted for {MONTH} yet. Submit your demand to see safety stock estimates.</p>
            </div>
          )}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {["Product","Current (t)","Demand (t)","Safety Stock (t)","Desired Target (t)"].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {productGroups.map(({ product, totalCurrentQty, expectedDemandQty, demandSource, safetyStock, desiredManual, desiredMrp }) => {
                  const desired = desiredManual ?? desiredMrp ?? null;
                  const bothDesired = desiredManual != null && desiredMrp != null;
                  const desiredMismatch = bothDesired && Math.abs(desiredManual - desiredMrp) > 0.001;
                  return (
                    <tr key={product.key} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-800">{product.name}</span>
                        {demandSource === "resolved" && <span className="ml-2 text-xs text-green-600 font-medium">(resolved)</span>}
                        {demandSource === "mrp" && <span className="ml-2 text-xs text-amber-600 font-medium">(MRP)</span>}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-gray-600">{totalCurrentQty.toFixed(2)}</td>
                      <td className="px-4 py-3 tabular-nums text-gray-600">{expectedDemandQty.toFixed(2)}</td>
                      <td className={`px-4 py-3 tabular-nums font-bold text-base ${safetyStock < 0 ? "text-red-600" : "text-[#2D6A2D]"}`}>
                        {safetyStock.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        {desired != null ? (
                          <div>
                            <span className="tabular-nums font-semibold text-purple-700">{desired.toFixed(2)}</span>
                            {desiredMismatch && (
                              <div className="text-xs text-amber-600 mt-0.5">
                                Manual: {desiredManual.toFixed(2)} · MRP: {desiredMrp.toFixed(2)}
                                <span className="ml-1">(Δ {Math.abs(desiredManual - desiredMrp).toFixed(2)})</span>
                              </div>
                            )}
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === "flow" && (
        <StockFlowSubTab
          demands={demands}
          inventory={inventory}
          wasteRecords={waste}
          messages={messages}
          products={products}
        />
      )}

      {showWasteModal && (
        <WasteRecordModal
          userProfile={userProfile}
          products={products}
          inventory={inventory}
          currentUser={currentUser}
          wasteRecords={waste}
          onClose={() => setShowWasteModal(false)}
        />
      )}
    </div>
  );
}

// ─── Messages Tab ──────────────────────────────────────────────────────────────
function MessagesTab({ userProfile }) {
  const { currentUser, isDemo } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [responses, setResponses] = useState({});
  const [choices, setChoices] = useState({});
  const [submitting, setSubmitting] = useState(null);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "messages"), where("toUserId", "==", currentUser.uid));
    return onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime;
      });
      setMessages(data);
      setLoading(false);
    }, () => setLoading(false));
  }, [currentUser]);

  const fmtDateTime = (ts) => {
    if (!ts) return "—";
    const d = ts.toDate?.();
    if (!d) return "—";
    return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const handleSubmitDecision = async (msg) => {
    const choice = choices[msg.id];
    if (!choice) return;
    const resolvedQty = choice === "demand" ? msg.demandQty : msg.mrpQty;
    setSubmitting(msg.id);
    try {
      await updateDoc(doc(db, "messages", msg.id), {
        countryHeadResponse: (responses[msg.id] || "").trim(),
        countryHeadChoice: choice,
        resolvedQty,
        status: "resolved",
        resolvedAt: serverTimestamp(),
      });
      setResponses(prev => ({ ...prev, [msg.id]: "" }));
      setChoices(prev => { const n = { ...prev }; delete n[msg.id]; return n; });
    } catch (e) { console.error(e); }
    finally { setSubmitting(null); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#4A9E4A]" /></div>;

  if (messages.length === 0) {
    return (
      <div className="text-center py-10">
        <MessageSquare className="w-8 h-8 text-gray-200 mx-auto mb-2" />
        <p className="text-gray-400 text-sm">No messages from the admin team.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map(msg => (
        <div
          key={msg.id}
          className={`rounded-xl border p-4 ${
            msg.status === "resolved" ? "border-green-200 bg-green-50/40" :
            msg.status === "admin_resolved" ? "border-blue-200 bg-blue-50/30" :
            "border-amber-200 bg-amber-50/30"
          }`}
        >
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-gray-800">{msg.productKey}</span>
                <span className="text-gray-400 text-sm">·</span>
                <span className="text-sm text-gray-600">{msg.period}</span>
                {msg.status === "resolved"
                  ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Resolved</span>
                  : msg.status === "admin_resolved"
                  ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Admin Resolved</span>
                  : <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Pending</span>
                }
              </div>
              <p className="text-xs text-gray-400 mt-0.5">From {msg.fromUsername} · {fmtDateTime(msg.createdAt)}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-3 p-3 bg-white rounded-lg border border-gray-100 text-xs">
            <div>
              <p className="text-gray-400 mb-0.5">Demand submitted</p>
              <p className="font-bold text-gray-800">{msg.demandQty?.toFixed(2)} t</p>
            </div>
            <div>
              <p className="text-gray-400 mb-0.5">MRP suggested</p>
              <p className="font-bold text-amber-700">{msg.mrpQty?.toFixed(2)} t</p>
            </div>
            <div>
              <p className="text-gray-400 mb-0.5">Difference</p>
              <p className={`font-bold ${(msg.demandQty - msg.mrpQty) > 0 ? "text-blue-600" : "text-red-600"}`}>
                {((msg.demandQty || 0) - (msg.mrpQty || 0)).toFixed(2)} t
              </p>
            </div>
          </div>

          <div className="mb-3 p-3 bg-white rounded-lg border border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Admin note</p>
            <p className="text-sm text-gray-700">{msg.adminNote}</p>
          </div>

          {msg.status === "admin_resolved" ? (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Admin resolved</p>
              <p className="text-sm text-blue-800">
                Admin chose: <span className="font-semibold">{msg.resolvedQty?.toFixed(2)} t</span>
                {" "}({msg.adminChoice === "demand" ? "your submitted value" : "MRP expected value"})
              </p>
              <p className="text-xs text-gray-400 mt-1">Resolved {fmtDateTime(msg.resolvedAt)}</p>
            </div>
          ) : msg.status === "resolved" ? (
            <div className="p-3 bg-green-50 rounded-lg border border-green-100">
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1">Your decision</p>
              <p className="text-sm text-green-800">
                {msg.countryHeadChoice === "demand"
                  ? <>Kept submitted value: <span className="font-semibold">{(msg.resolvedQty ?? msg.demandQty)?.toFixed(2)} t</span></>
                  : msg.countryHeadChoice === "mrp"
                  ? <>Used MRP value: <span className="font-semibold">{(msg.resolvedQty ?? msg.mrpQty)?.toFixed(2)} t</span></>
                  : msg.countryHeadResponse}
              </p>
              {msg.countryHeadResponse && msg.countryHeadChoice && (
                <p className="text-xs text-green-700 italic mt-1">{msg.countryHeadResponse}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">Resolved {fmtDateTime(msg.resolvedAt)}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Your decision</p>
              <div className="space-y-2">
                <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${choices[msg.id] === "demand" ? "border-[#2D6A2D] bg-green-50" : "border-gray-200 hover:border-gray-300"}`}>
                  <input
                    type="radio"
                    name={`choice-${msg.id}`}
                    value="demand"
                    checked={choices[msg.id] === "demand"}
                    onChange={() => setChoices(prev => ({ ...prev, [msg.id]: "demand" }))}
                    className="mt-0.5 accent-[#2D6A2D]"
                  />
                  <div>
                    <p className="font-semibold text-sm text-gray-800">Keep my submitted value</p>
                    <p className="text-xs text-gray-500 mt-0.5">{msg.demandQty?.toFixed(2)} t</p>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${choices[msg.id] === "mrp" ? "border-amber-400 bg-amber-50" : "border-gray-200 hover:border-gray-300"}`}>
                  <input
                    type="radio"
                    name={`choice-${msg.id}`}
                    value="mrp"
                    checked={choices[msg.id] === "mrp"}
                    onChange={() => setChoices(prev => ({ ...prev, [msg.id]: "mrp" }))}
                    className="mt-0.5 accent-amber-600"
                  />
                  <div>
                    <p className="font-semibold text-sm text-gray-800">Use MRP expected value</p>
                    <p className="text-xs text-gray-500 mt-0.5">{msg.mrpQty?.toFixed(2)} t</p>
                  </div>
                </label>
              </div>
              <textarea
                value={responses[msg.id] || ""}
                onChange={e => setResponses(prev => ({ ...prev, [msg.id]: e.target.value }))}
                placeholder="Add an optional comment or explanation..."
                rows={2}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] text-sm resize-none"
              />
              {!isDemo && (
                <button
                  onClick={() => handleSubmitDecision(msg)}
                  disabled={submitting === msg.id || !choices[msg.id]}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {submitting === msg.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Submit Decision
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Country Orders Tab ───────────────────────────────────────────────────────
function CountryOrdersTab({ userProfile, products }) {
  const { currentUser, isDemo } = useAuth();
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [activeMrp, setActiveMrp] = useState(null);
  const [demands, setDemands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState({});
  const [submittingComment, setSubmittingComment] = useState(null);
  const [marking, setMarking] = useState(null);
  const [undoing, setUndoing] = useState(null);

  const country = userProfile?.country || "";
  const MONTHS_LIST = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const CURRENT_MONTH_STR = (() => { const d = new Date(); return `${MONTHS_LIST[d.getMonth()]} ${d.getFullYear()}`; })();

  useEffect(() => {
    if (!country) { setLoading(false); return; }
    const q = query(collection(db, "orders"), where("country", "==", country), orderBy("createdAt", "desc"));
    return onSnapshot(q, snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
  }, [country]);

  useEffect(() => {
    if (!country) return;
    return onSnapshot(query(collection(db, "inventory"), where("entity", "==", country)), snap => {
      setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [country]);

  useEffect(() => {
    return onSnapshot(query(collection(db, "mrpImports"), where("isActive", "==", true)), snap => {
      setActiveMrp(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
    });
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    return onSnapshot(query(collection(db, "demands"), where("userId", "==", currentUser.uid)), snap => {
      setDemands(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [currentUser]);

  const getCalculatedQty = (productKey) => {
    const product = products.find(p => p.key === productKey || (p.keyHistory || []).includes(productKey));
    const allPKeys = product ? [product.key, ...(product.keyHistory || [])] : [productKey];
    const thisMonth = demands.find(d => d.month === CURRENT_MONTH_STR);
    const baseCurrent = allPKeys.reduce((val, k) => val ?? thisMonth?.currentInventory?.[k] ?? null, null) ?? 0;
    const receivedOrderQty = inventory.filter(i => (!i.levelType || i.levelType === "current") && i.source === "order" && i.deliveredAt && allPKeys.includes(i.productKey)).reduce((s, b) => s + (b.qty || 0), 0);
    const currentQty = baseCurrent + receivedOrderQty;
    const desiredQty = allPKeys.reduce((val, k) => val ?? thisMonth?.desiredInventory?.[k] ?? null, null) ?? 0;
    let expectedDemand = allPKeys.reduce((val, k) => val ?? (thisMonth?.[k] != null ? Number(thisMonth[k]) : null), null) ?? 0;
    if (!expectedDemand && activeMrp?.rows) {
      const mrpRow = activeMrp.rows.find(r => allPKeys.includes(r.productKey) && r.country?.trim().toLowerCase() === country.trim().toLowerCase());
      if (mrpRow) expectedDemand = typeof mrpRow.suggestedQty === "number" ? mrpRow.suggestedQty : parseFloat(mrpRow.suggestedQty) || 0;
    }
    return Math.max(0, desiredQty + expectedDemand - currentQty);
  };

  const handleMarkReceived = async (order) => {
    if (order.status === "received" || marking) return;
    setMarking(order.id);
    try {
      const batchIds = [];
      for (const item of order.items) {
        const currentProduct = products.find(p => p.key === item.productKey || (p.keyHistory || []).includes(item.productKey));
        const ref = await addDoc(collection(db, "inventory"), {
          productKey: currentProduct?.key ?? item.productKey, entity: country,
          batchId: `ORDER-${order.id.slice(-6)}`,
          qty: item.orderedQty, levelType: "current",
          deliveredAt: serverTimestamp(),
          deliveredBy: userProfile?.username || currentUser?.uid || "Unknown",
          orderId: order.id, source: "order", period: order.period,
          updatedAt: serverTimestamp(),
        });
        batchIds.push(ref.id);
      }
      await updateDoc(doc(db, "orders", order.id), {
        status: "received",
        receivedAt: serverTimestamp(),
        receivedBy: userProfile?.username || currentUser?.uid || "Unknown",
        inventoryBatchIds: batchIds,
        adminSeenReceipt: false,
      });
    } catch (e) { console.error(e); }
    finally { setMarking(null); }
  };

  const handleUndoReceipt = async (order) => {
    setUndoing(order.id);
    try {
      for (const batchId of (order.inventoryBatchIds || [])) {
        await deleteDoc(doc(db, "inventory", batchId));
      }
      await updateDoc(doc(db, "orders", order.id), {
        status: "open",
        receivedAt: null,
        receivedBy: null,
        inventoryBatchIds: [],
        adminSeenReceipt: null,
      });
    } catch (e) { console.error(e); }
    finally { setUndoing(null); }
  };

  const handleSendComment = async (order) => {
    const comment = (comments[order.id] || "").trim();
    if (!comment) return;
    setSubmittingComment(order.id);
    try {
      await updateDoc(doc(db, "orders", order.id), {
        countryHeadComment: comment,
        countryHeadCommentAt: serverTimestamp(),
      });
      setComments(prev => ({ ...prev, [order.id]: "" }));
    } catch (e) { console.error(e); }
    finally { setSubmittingComment(null); }
  };

  const fmtDate = (ts) => {
    if (!ts) return "—";
    const d = ts.toDate?.();
    return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
  };

  if (!country) return (
    <div className="text-center py-10">
      <AlertTriangle className="w-8 h-8 text-gray-200 mx-auto mb-2" />
      <p className="text-gray-400 text-sm">No country assigned. Contact an administrator.</p>
    </div>
  );

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#4A9E4A]" /></div>;

  if (orders.length === 0) return (
    <div className="text-center py-10">
      <ShoppingCart className="w-8 h-8 text-gray-200 mx-auto mb-2" />
      <p className="text-gray-400 text-sm">No orders created for {country} yet.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {orders.map(order => {
        const isReceived = order.status === "received";
        return (
          <div key={order.id} className={`rounded-xl border p-5 space-y-4 ${isReceived ? "border-green-200 bg-green-50/30" : "border-gray-200 bg-white"}`}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800">{order.period || "—"}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${isReceived ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                    {isReceived ? "Received" : "Open"}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">Created {fmtDate(order.createdAt)} by {order.createdBy || "Admin"}</p>
                {isReceived && order.receivedAt && (
                  <p className="text-xs text-green-600 mt-0.5">Received {fmtDate(order.receivedAt)} by {order.receivedBy}</p>
                )}
              </div>
            </div>

            {/* Order items with deviation */}
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {["Product", "Ordered Qty (t)", "Your Calc. (t)", "Deviation", "Admin Note"].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(order.items || []).map(item => {
                    const prod = products.find(p => p.key === item.productKey || (p.keyHistory || []).includes(item.productKey));
                    const calcQty = getCalculatedQty(item.productKey);
                    const deviation = item.orderedQty - calcQty;
                    return (
                      <tr key={item.productKey} className="hover:bg-gray-50">
                        <td className="px-3 py-2.5 font-medium text-gray-800">{prod?.name ?? item.productKey}</td>
                        <td className="px-3 py-2.5 tabular-nums font-semibold text-[#2D6A2D]">{(item.orderedQty ?? 0).toFixed(2)}</td>
                        <td className="px-3 py-2.5 tabular-nums text-gray-600">{calcQty.toFixed(2)}</td>
                        <td className={`px-3 py-2.5 tabular-nums font-semibold ${Math.abs(deviation) < 0.001 ? "text-gray-400" : deviation > 0 ? "text-blue-600" : "text-red-600"}`}>
                          {Math.abs(deviation) < 0.001 ? "—" : `${deviation > 0 ? "+" : ""}${deviation.toFixed(2)}`}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500">{item.adminNote || <span className="text-gray-300 italic">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Comment */}
            {order.countryHeadComment && (
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Your comment</p>
                <p className="text-sm text-blue-800">{order.countryHeadComment}</p>
              </div>
            )}
            {!isDemo && (
              <div className="space-y-2">
                <textarea
                  value={comments[order.id] || ""}
                  onChange={e => setComments(prev => ({ ...prev, [order.id]: e.target.value }))}
                  placeholder="Add a comment for the admin…"
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] text-sm resize-none"
                />
                <button
                  onClick={() => handleSendComment(order)}
                  disabled={submittingComment === order.id || !(comments[order.id] || "").trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white disabled:opacity-50 transition-colors"
                >
                  {submittingComment === order.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Send Comment
                </button>
              </div>
            )}

            {/* Receive / Undo buttons */}
            {!isDemo && (
              <div className="flex gap-3 pt-1 border-t border-gray-100">
                {!isReceived ? (
                  <button
                    onClick={() => handleMarkReceived(order)}
                    disabled={marking !== null || order.status === "received" || undoing !== null}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white disabled:opacity-60 transition-colors"
                  >
                    {marking === order.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                    Order Received
                  </button>
                ) : (
                  <button
                    onClick={() => handleUndoReceipt(order)}
                    disabled={undoing === order.id}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-60 transition-colors"
                  >
                    {undoing === order.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                    Undo Receipt
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Calculated Order Tab ─────────────────────────────────────────────────────
function CalculatedOrderTab({ userProfile, products }) {
  const { currentUser, isDemo } = useAuth();
  const [inventory, setInventory] = useState([]);
  const [activeMrp, setActiveMrp] = useState(null);
  const [demands, setDemands] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(null);

  const country = userProfile?.country || "";

  useEffect(() => {
    if (!country) { setLoading(false); return; }
    const q = query(collection(db, "inventory"), where("entity", "==", country));
    return onSnapshot(q, snap => {
      setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
  }, [country]);

  useEffect(() => {
    const q = query(collection(db, "mrpImports"), where("isActive", "==", true));
    return onSnapshot(q, snap => {
      setActiveMrp(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
    });
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "demands"), where("userId", "==", currentUser.uid));
    return onSnapshot(q, snap => {
      setDemands(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "messages"), where("toUserId", "==", currentUser.uid));
    return onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [currentUser]);

  const handleMarkReceived = async (batch) => {
    setMarking(batch.id);
    try {
      await updateDoc(doc(db, "inventory", batch.id), {
        deliveredAt: serverTimestamp(),
        deliveredBy: userProfile?.username || currentUser?.uid || "Unknown",
      });
    } catch (e) { console.error(e); }
    finally { setMarking(null); }
  };

  if (!country) {
    return (
      <div className="text-center py-10">
        <AlertTriangle className="w-8 h-8 text-gray-200 mx-auto mb-2" />
        <p className="text-gray-400 text-sm">No country assigned to your account. Contact an administrator.</p>
      </div>
    );
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#4A9E4A]" /></div>;

  const CURRENT_MONTH_STR = (() => {
    const MONTHS_L = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const d = new Date();
    return `${MONTHS_L[d.getMonth()]} ${d.getFullYear()}`;
  })();

  const currentItems = inventory.filter(i => !i.levelType || i.levelType === "current");

  // pending deliveries = current batches without deliveredAt
  const pendingDeliveries = currentItems.filter(b => !b.deliveredAt);

  const fmtDate = (ts) => {
    if (!ts) return "—";
    const d = ts.toDate?.();
    if (!d) return "—";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };

  return (
    <div className="space-y-6">
      {/* Calculated Order Cards */}
      <div>
        <h3 className="text-sm font-bold text-gray-700 mb-3">Calculated Order Quantities</h3>
        <p className="text-xs text-gray-400 mb-4">
          Formula: <span className="font-mono">Desired Inventory + Expected Demand − Current Inventory</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map(p => {
            const allPKeys = [p.key, ...(p.keyHistory || [])];
            const thisMonthDemand = demands.find(d => d.month === CURRENT_MONTH_STR);

            // Current and desired come from the demand submission; check all historical keys
            const baseCurrent = allPKeys.reduce((val, k) => val ?? thisMonthDemand?.currentInventory?.[k] ?? null, null) ?? 0;
            // Add inventory batches from received orders (source: "order") for real-time update
            const receivedOrderQty = currentItems.filter(i => i.source === "order" && i.deliveredAt && allPKeys.includes(i.productKey)).reduce((s, b) => s + (b.qty || 0), 0);
            const currentQty = baseCurrent + receivedOrderQty;
            const desiredQty = allPKeys.reduce((val, k) => val ?? thisMonthDemand?.desiredInventory?.[k] ?? null, null) ?? 0;

            // Expected demand: check for resolved discrepancy first
            const resolvedMsg = messages.find(m =>
              !m.type && allPKeys.includes(m.productKey) && m.period === CURRENT_MONTH_STR &&
              (m.status === "resolved" || m.status === "admin_resolved")
            );
            const hasUnresolved = messages.some(m =>
              !m.type && allPKeys.includes(m.productKey) && m.period === CURRENT_MONTH_STR &&
              m.status === "pending"
            );
            let expectedDemand = 0;
            if (resolvedMsg) {
              expectedDemand = resolvedMsg.resolvedQty ?? 0;
            } else if (!hasUnresolved) {
              expectedDemand = thisMonthDemand ? (allPKeys.reduce((val, k) => val ?? (thisMonthDemand[k] != null ? Number(thisMonthDemand[k]) : null), null) ?? 0) : 0;
              if (!expectedDemand && activeMrp?.rows) {
                const mrpRow = activeMrp.rows.find(r =>
                  allPKeys.includes(r.productKey) &&
                  r.country?.trim().toLowerCase() === country.trim().toLowerCase()
                );
                if (mrpRow) expectedDemand = typeof mrpRow.suggestedQty === "number" ? mrpRow.suggestedQty : parseFloat(mrpRow.suggestedQty) || 0;
              }
            }

            const calculatedOrder = Math.max(0, desiredQty + expectedDemand - currentQty);
            const hasData = currentQty > 0 || desiredQty > 0 || expectedDemand > 0;

            return (
              <div key={p.key} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                <p className="font-semibold text-sm text-gray-800">{p.name}</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Desired inventory</span>
                    <span className="tabular-nums font-medium text-purple-700">{desiredQty.toFixed(2)} t</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Expected demand</span>
                    <span className="tabular-nums font-medium text-blue-700">{expectedDemand.toFixed(2)} t</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Current inventory</span>
                    <span className="tabular-nums font-medium text-gray-700">− {currentQty.toFixed(2)} t</span>
                  </div>
                  <div className="border-t border-gray-100 pt-1.5 flex justify-between">
                    <span className="font-semibold text-gray-700">Order quantity</span>
                    <span className={`tabular-nums font-bold text-base ${calculatedOrder > 0 ? "text-[#2D6A2D]" : "text-gray-400"}`}>
                      {calculatedOrder.toFixed(2)} t
                    </span>
                  </div>
                </div>
                {hasUnresolved && (
                  <p className="text-xs text-amber-600 italic">Demand discrepancy pending — order quantity on hold.</p>
                )}
                {!hasData && !hasUnresolved && (
                  <p className="text-xs text-gray-300 italic">No inventory or demand data yet.</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Pending Deliveries */}
      <div>
        <h3 className="text-sm font-bold text-gray-700 mb-3">Pending Deliveries</h3>
        {pendingDeliveries.length === 0 ? (
          <div className="text-center py-8 rounded-xl border border-dashed border-gray-200">
            <Truck className="w-7 h-7 text-gray-200 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">No pending deliveries for {country}.</p>
            <p className="text-xs text-gray-300 mt-1">Batches appear here when added by an admin without a received date.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {["Product", "Batch ID", "Qty (t)", "Expiry", ""].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingDeliveries.map(batch => {
                  const prod = products.find(p => p.key === batch.productKey || (p.keyHistory || []).includes(batch.productKey));
                  return (
                    <tr key={batch.id} className="hover:bg-amber-50/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {prod?.name ?? batch.productKey}
                        <span className="text-xs text-gray-400 ml-1">({batch.productKey})</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{batch.batchId || "—"}</td>
                      <td className="px-4 py-3 tabular-nums font-semibold text-[#2D6A2D]">{(batch.qty ?? 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-gray-500">{(() => {
                        if (batch.expiryDate) return fmtDate(batch.expiryDate);
                        if (!batch.deliveredAt || !prod?.shelfLifeMonths) return "—";
                        const base = batch.deliveredAt.toDate?.() ?? batch.deliveredAt;
                        if (!base) return "—";
                        const exp = new Date(base);
                        exp.setMonth(exp.getMonth() + prod.shelfLifeMonths);
                        return exp.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                      })()}</td>
                      <td className="px-4 py-3 text-right">
                        {!isDemo && (
                          <button
                            onClick={() => handleMarkReceived(batch)}
                            disabled={marking === batch.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white disabled:opacity-60 transition-colors"
                          >
                            {marking === batch.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Truck className="w-3.5 h-3.5" />}
                            Order Received
                          </button>
                        )}
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
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function CountryHeadDashboard() {
  const { currentUser, userProfile, refreshProfile, isDemo } = useAuth();

  const [activeTab, setActiveTab] = useState("demand");

  const [products, setProducts] = useState(DEFAULT_PRODUCTS);
  const [productsLoading, setProductsLoading] = useState(true);

  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr());

  const [productValues, setProductValues] = useState({});
  const [currentInventory, setCurrentInventory] = useState({});
  const [desiredInventory, setDesiredInventory] = useState({});
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyView, setHistoryView] = useState("table");

  const [editMode, setEditMode] = useState(false);
  const [infoProduct, setInfoProduct] = useState(null);
  const [showChangeCountry, setShowChangeCountry] = useState(false);

  const [activeMrp, setActiveMrp] = useState(null);

  const [orderBatchesForHistory, setOrderBatchesForHistory] = useState([]);
  const [wasteForHistory, setWasteForHistory] = useState([]);

  // Load products from Firestore
  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("order"));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const active = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.archived && !p.hidden);
        if (active.length > 0) {
          setProducts(active);
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
    const q = query(collection(db, "demands"), where("userId", "==", currentUser.uid));
    return onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.submittedAt?.seconds ?? 0) - (a.submittedAt?.seconds ?? 0));
      setHistory(data);
      setHistoryLoading(false);
    }, (err) => { console.error("History query error:", err); setHistoryLoading(false); });
  }, [currentUser]);

  // Load order batches and waste for actual demand calculation in history table
  useEffect(() => {
    const country = userProfile?.country;
    if (!country) return;
    return onSnapshot(query(collection(db, "inventory"), where("entity", "==", country), where("source", "==", "order")), snap => {
      setOrderBatchesForHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [userProfile?.country]);

  useEffect(() => {
    const country = userProfile?.country;
    if (!country) return;
    return onSnapshot(query(collection(db, "waste"), where("userCountry", "==", country)), snap => {
      setWasteForHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [userProfile?.country]);

  useEffect(() => {
    return onSnapshot(query(collection(db, "mrpImports"), where("isActive", "==", true)), snap => {
      setActiveMrp(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
    });
  }, []);

  // Reset form when selected month changes
  useEffect(() => {
    setEditMode(false);
    setProductValues({});
    setCurrentInventory({});
    setDesiredInventory({});
    setComment("");
    setSubmitError("");
    setSubmitSuccess(false);
  }, [selectedMonth]);

  // Compute existingDoc from history + selectedMonth (no separate state needed)
  const existingDoc = history.find(d => d.month === selectedMonth) || null;

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

    // Validate current inventory (mandatory)
    const cInv = {};
    for (const p of products) {
      const val = parseFloat(currentInventory[p.key] ?? "");
      if (isNaN(val) || val < 0) {
        setSubmitError("Current inventory is required for all products. Please fill in all current stock levels.");
        return;
      }
      cInv[p.key] = val;
    }

    // Desired inventory (optional — only save filled values)
    const dInv = {};
    for (const p of products) {
      const val = parseFloat(desiredInventory[p.key] ?? "");
      if (!isNaN(val) && val >= 0) dInv[p.key] = val;
    }

    setSubmitting(true);
    try {
      const country = userProfile?.country || "";
      const basePayload = {
        ...values,
        currentInventory: cInv,
        desiredInventory: Object.keys(dInv).length > 0 ? dInv : null,
        comment: comment.trim(),
        country,
      };
      if (existingDoc && editMode) {
        // Do NOT overwrite submittedAt on edit — the original timestamp is the order-deduplication
        // cutoff. Resetting it would exclude orders received between first submission and this edit.
        await updateDoc(doc(db, "demands", existingDoc.id), { ...basePayload, updatedAt: serverTimestamp() });
      } else if (!existingDoc) {
        await addDoc(collection(db, "demands"), {
          userId: currentUser.uid,
          username: userProfile?.username || "Unknown",
          month: selectedMonth,
          ...basePayload,
          submittedAt: serverTimestamp(),
        });
      }
      setSubmitSuccess(true);
      setEditMode(false);
      if (!existingDoc) {
        setProductValues({});
        setCurrentInventory({});
        setDesiredInventory({});
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
      const cInvVals = {};
      const dInvVals = {};
      products.forEach(p => {
        vals[p.key] = String(existingDoc[p.key] ?? "");
        cInvVals[p.key] = String(existingDoc.currentInventory?.[p.key] ?? "");
        dInvVals[p.key] = String(existingDoc.desiredInventory?.[p.key] ?? "");
      });
      setProductValues(vals);
      setCurrentInventory(cInvVals);
      setDesiredInventory(dInvVals);
      setComment(existingDoc.comment || "");
      setEditMode(true);
      setSubmitSuccess(false);
    }
  };

  const cancelEdit = () => {
    setEditMode(false);
    setProductValues({});
    setCurrentInventory({});
    setDesiredInventory({});
    setComment("");
    setSubmitError("");
  };

  const sortedHistoryAsc = [...history].sort((a, b) => {
    try { return parseMonthToDate(a.month) - parseMonthToDate(b.month); } catch { return 0; }
  });

  const calcActualDemand = (monthStr, productKey) => {
    const product = products.find(p => p.key === productKey || (p.keyHistory || []).includes(productKey));
    const allPKeys = product ? [product.key, ...(product.keyHistory || [])] : [productKey];
    const idx = sortedHistoryAsc.findIndex(d => d.month === monthStr);
    if (idx < 0) return null;
    const demandM = sortedHistoryAsc[idx];
    const demandNext = sortedHistoryAsc[idx + 1] ?? null;
    const openingStock = allPKeys.reduce((val, k) => val ?? demandM.currentInventory?.[k] ?? null, null);
    if (openingStock == null) return null;
    const closingStock = demandNext ? allPKeys.reduce((val, k) => val ?? demandNext.currentInventory?.[k] ?? null, null) : null;
    if (closingStock == null) return null;
    const ordersIn = orderBatchesForHistory.filter(b => allPKeys.includes(b.productKey) && batchBelongsToPeriod(b, monthStr)).reduce((s, b) => {
      const batchWasted = wasteForHistory.filter(w => w.inventoryDocId === b.id).reduce((sw, w) => sw + (w.wastedQty || 0), 0);
      return s + (b.qty || 0) + batchWasted;
    }, 0);
    const demDateH = parseMonthToDate(monthStr);
    const nextDateH = demandNext ? parseMonthToDate(demandNext.month) : null;
    const wasteQty = wasteForHistory.filter(w => {
      if (!allPKeys.includes(w.productKey)) return false;
      const wDate = parseMonthToDate(w.month);
      return wDate >= demDateH && (nextDateH === null || wDate < nextDateH);
    }).reduce((s, w) => s + (w.wastedQty || 0), 0);
    return Math.max(0, openingStock + ordersIn - closingStock - wasteQty);
  };

  const monthOptions = generateMonthOptions(history.map(d => d.month));

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

  const country = userProfile?.country || "";
  const getMrpRowForProduct = (p) => {
    if (!activeMrp?.rows) return null;
    const allPKeys = [p.key, ...(p.keyHistory || [])];
    return activeMrp.rows.find(r =>
      allPKeys.includes(r.productKey) &&
      r.country?.trim().toLowerCase() === country.trim().toLowerCase() &&
      r.period === selectedMonth
    ) ?? null;
  };
  const mrpRowsForMonth = products.map(p => ({ product: p, row: getMrpRowForProduct(p) }));
  const hasMrpForMonth = mrpRowsForMonth.some(({ row }) => row !== null);

  const prefillFromMrp = () => {
    const vals = {};
    const cInv = {};
    const dInv = {};
    for (const { product: p, row } of mrpRowsForMonth) {
      if (row) {
        const sq = typeof row.suggestedQty === "number" ? row.suggestedQty : parseFloat(row.suggestedQty);
        if (!isNaN(sq)) vals[p.key] = String(sq);
        const cq = typeof row.currentInventoryQty === "number" ? row.currentInventoryQty : parseFloat(row.currentInventoryQty ?? "");
        if (!isNaN(cq) && cq >= 0) cInv[p.key] = String(cq);
        const dq = typeof row.desiredQty === "number" ? row.desiredQty : parseFloat(row.desiredQty ?? "");
        if (!isNaN(dq) && dq >= 0) dInv[p.key] = String(dq);
      }
    }
    setProductValues(prev => ({ ...prev, ...vals }));
    setCurrentInventory(prev => ({ ...prev, ...cInv }));
    setDesiredInventory(prev => ({ ...prev, ...dInv }));
  };

  const tabs = [
    { id: "demand", label: "Demand", icon: TrendingUp },
    { id: "inventory", label: "Inventory", icon: Layers },
    { id: "calculated_order", label: "Calculated Order", icon: ShoppingCart },
    { id: "orders", label: "Orders", icon: Truck },
    { id: "messages", label: "Messages", icon: MessageSquare },
  ];

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
              <h1 className="text-xl font-bold text-gray-900">
                {userProfile?.country ? `${userProfile.country} Dashboard` : "Demand Planner Dashboard"}
              </h1>
              <p className="text-gray-500 text-sm mt-0.5">
                {userProfile?.customFunction ? `${userProfile.customFunction} · ` : ""}
                {CURRENT_MONTH}
              </p>
            </div>
            {!isDemo && (
              <button
                onClick={() => setShowChangeCountry(true)}
                title={userProfile?.country ? "Change your country" : "Set your country"}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-[#4A9E4A] hover:text-[#2D6A2D] text-xs font-medium transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                {userProfile?.country ? "Change Country" : "Set Country"}
              </button>
            )}
          </div>
        </div>

        {/* Tab Nav */}
        <div className="flex gap-2">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                activeTab === id
                  ? "bg-[#2D6A2D] text-white border-[#2D6A2D] shadow-sm"
                  : "bg-white text-gray-600 border-gray-200 hover:border-[#4A9E4A] hover:text-[#2D6A2D]"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Demand Tab ── */}
        {activeTab === "demand" && (
          <>
            {/* Submission Form / Status Card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3 flex-wrap">
                  <Package className="w-4 h-4 text-[#2D6A2D]" />
                  <h2 className="text-base font-bold text-gray-800">Expected Demand</h2>
                  <select
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(e.target.value)}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] bg-white text-gray-700"
                  >
                    {monthOptions.map(m => (
                      <option key={m} value={m}>{m}{history.some(d => d.month === m) ? " ✓" : ""}</option>
                    ))}
                  </select>
                </div>
                {existingDoc && !editMode && !isDemo && (
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
                        Submission recorded for {selectedMonth}
                      </p>
                    </div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Expected Demand</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                      {products.map((p) => {
                        const allPKeys = [p.key, ...(p.keyHistory || [])];
                        const submittedVal = allPKeys.reduce((val, k) => val ?? (existingDoc[k] != null ? Number(existingDoc[k]) : null), null) ?? 0;
                        const adminNoteKey = allPKeys.find(k => existingDoc[`adminNote_${k}`]);
                        return (
                          <div key={p.key} className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
                            <div className="flex items-center justify-center gap-1 mb-1">
                              <p className="text-xs text-gray-500 font-medium">{p.name}</p>
                              <button type="button" onClick={() => setInfoProduct(p)} title="Product information" className="text-gray-300 hover:text-[#2D6A2D] transition-colors"><Info className="w-3 h-3" /></button>
                            </div>
                            <p className="text-2xl font-bold text-[#2D6A2D]">{submittedVal.toFixed(2)}</p>
                            <p className="text-xs text-gray-400 mt-0.5">tons</p>
                            {adminNoteKey && (
                              <p className="text-xs text-amber-600 mt-1 leading-tight">{existingDoc[`adminNote_${adminNoteKey}`]}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {existingDoc.currentInventory && (
                      <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 mb-4">
                        <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-3">Current Inventory</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {products.map(p => {
                            const allPKeys = [p.key, ...(p.keyHistory || [])];
                            const val = allPKeys.reduce((v, k) => v ?? existingDoc.currentInventory[k] ?? null, null) ?? 0;
                            return (
                              <div key={p.key} className="bg-white rounded-lg p-3 text-center border border-blue-100">
                                <p className="text-xs text-gray-500 mb-1">{p.name}</p>
                                <p className="text-lg font-bold text-blue-700">{Number(val).toFixed(2)}</p>
                                <p className="text-xs text-gray-400">t</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {existingDoc.desiredInventory && (
                      <div className="rounded-xl border border-purple-100 bg-purple-50/30 p-4 mb-4">
                        <p className="text-xs font-bold text-purple-700 uppercase tracking-wider mb-3">Desired Inventory</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {products.map(p => {
                            const allPKeys = [p.key, ...(p.keyHistory || [])];
                            const val = allPKeys.reduce((v, k) => v ?? existingDoc.desiredInventory[k] ?? null, null);
                            if (val == null) return null;
                            return (
                              <div key={p.key} className="bg-white rounded-lg p-3 text-center border border-purple-100">
                                <p className="text-xs text-gray-500 mb-1">{p.name}</p>
                                <p className="text-lg font-bold text-purple-700">{Number(val).toFixed(2)}</p>
                                <p className="text-xs text-gray-400">t</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
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
                          Editing submission for {selectedMonth}. Changes will overwrite your current entry.
                        </p>
                      </div>
                    )}

                    {!editMode && hasMrpForMonth && (
                      <div className="flex items-start justify-between gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200">
                        <div className="flex items-start gap-2 min-w-0">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-amber-800 font-medium">MRP values available for {selectedMonth}</p>
                            <p className="text-xs text-amber-600 mt-0.5">An MRP import has suggested demand quantities for your country. You can use them as-is or enter your own values.</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={prefillFromMrp}
                          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-800 text-xs font-semibold transition-colors whitespace-nowrap"
                        >
                          Pre-fill from MRP
                        </button>
                      </div>
                    )}

                    {/* Expected Demand */}
                    <div>
                      <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Expected Demand</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {products.map((p) => {
                          const mrpRow = !editMode ? getMrpRowForProduct(p) : null;
                          const mrpSuggested = mrpRow ? (typeof mrpRow.suggestedQty === "number" ? mrpRow.suggestedQty : parseFloat(mrpRow.suggestedQty)) : null;
                          return (
                            <div key={p.key}>
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{p.name}</label>
                                <button type="button" onClick={() => setInfoProduct(p)} title="Product information" className="text-gray-300 hover:text-[#2D6A2D] transition-colors"><Info className="w-3.5 h-3.5" /></button>
                              </div>
                              <div className="relative">
                                <input type="number" min="0" step="0.01" value={productValues[p.key] || ""} onChange={e => setProductValues(prev => ({ ...prev, [p.key]: e.target.value }))} placeholder="0.00" required className="w-full px-4 py-3 pr-14 rounded-xl border border-gray-200 text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] focus:border-transparent transition text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">t</span>
                              </div>
                              {mrpSuggested != null && !isNaN(mrpSuggested) && (
                                <button
                                  type="button"
                                  onClick={() => setProductValues(prev => ({ ...prev, [p.key]: String(mrpSuggested) }))}
                                  className="mt-1 text-[11px] text-amber-600 hover:text-amber-800 font-medium transition-colors"
                                >
                                  MRP: {mrpSuggested.toFixed(2)} t — use this
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Current Inventory (mandatory) */}
                    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
                      <div>
                        <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">Current Inventory <span className="text-red-500">*</span></p>
                        <p className="text-xs text-blue-500 mt-0.5">Stock on hand as of today</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {products.map((p) => {
                          const mrpRow = !editMode ? getMrpRowForProduct(p) : null;
                          const mrpCurrent = mrpRow ? (typeof mrpRow.currentInventoryQty === "number" ? mrpRow.currentInventoryQty : parseFloat(mrpRow.currentInventoryQty ?? "")) : null;
                          return (
                            <div key={p.key}>
                              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">{p.name}</label>
                              <div className="relative">
                                <input type="number" min="0" step="0.01" value={currentInventory[p.key] ?? ""} onChange={e => setCurrentInventory(prev => ({ ...prev, [p.key]: e.target.value }))} placeholder="0.00" required className="w-full px-4 py-3 pr-8 rounded-xl border border-blue-200 bg-white text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">t</span>
                              </div>
                              {mrpCurrent != null && !isNaN(mrpCurrent) && mrpCurrent >= 0 && (
                                <button
                                  type="button"
                                  onClick={() => setCurrentInventory(prev => ({ ...prev, [p.key]: String(mrpCurrent) }))}
                                  className="mt-1 text-[11px] text-amber-600 hover:text-amber-800 font-medium transition-colors"
                                >
                                  MRP: {mrpCurrent.toFixed(2)} t — use this
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Desired Inventory (optional) */}
                    <div className="rounded-xl border border-purple-100 bg-purple-50/30 p-4 space-y-3">
                      <div>
                        <p className="text-xs font-bold text-purple-700 uppercase tracking-wider">Desired Inventory <span className="text-gray-400 font-normal normal-case">(optional)</span></p>
                        <p className="text-xs text-purple-500 mt-0.5">Target stock level</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {products.map((p) => {
                          const mrpRow = !editMode ? getMrpRowForProduct(p) : null;
                          const mrpDesired = mrpRow ? (typeof mrpRow.desiredQty === "number" ? mrpRow.desiredQty : parseFloat(mrpRow.desiredQty ?? "")) : null;
                          return (
                            <div key={p.key}>
                              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">{p.name}</label>
                              <div className="relative">
                                <input type="number" min="0" step="0.01" value={desiredInventory[p.key] ?? ""} onChange={e => setDesiredInventory(prev => ({ ...prev, [p.key]: e.target.value }))} placeholder="0.00" className="w-full px-4 py-3 pr-8 rounded-xl border border-purple-200 bg-white text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">t</span>
                              </div>
                              {mrpDesired != null && !isNaN(mrpDesired) && mrpDesired >= 0 && (
                                <button
                                  type="button"
                                  onClick={() => setDesiredInventory(prev => ({ ...prev, [p.key]: String(mrpDesired) }))}
                                  className="mt-1 text-[11px] text-amber-600 hover:text-amber-800 font-medium transition-colors"
                                >
                                  MRP: {mrpDesired.toFixed(2)} t — use this
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

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
                      {!isDemo && (
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
                      )}

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
                          <th className="text-right pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Submitted (t)</th>
                          <th className="text-right pb-3 text-xs font-semibold text-[#2D6A2D] uppercase tracking-wider whitespace-nowrap">Actual (t)</th>
                          <th className="text-left pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {history.map(d => {
                          const total = products.reduce((s, p) => s + (Number(d[p.key]) || 0), 0);
                          const submittedAt = d.submittedAt?.toDate?.();
                          const isSelected = d.month === selectedMonth;
                          const isCurrentM = d.month === currentMonthStr();
                          const actuals = products.map(p => calcActualDemand(d.month, p.key));
                          const actualTotal = actuals.every(v => v !== null) ? actuals.reduce((s, v) => s + v, 0) : null;
                          const variance = actualTotal !== null ? actualTotal - total : null;
                          return (
                            <tr key={d.id} className={`hover:bg-gray-50 transition-colors ${isSelected ? "bg-green-50/50" : ""}`}>
                              <td className="py-3 pr-4">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-800">{d.month}</span>
                                  {isCurrentM && (
                                    <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-[#2D6A2D] text-white">Current</span>
                                  )}
                                  {isSelected && !isCurrentM && (
                                    <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-500 text-white">Selected</span>
                                  )}
                                </div>
                              </td>
                              {products.map(p => (
                                <td key={p.key} className="py-3 text-right tabular-nums text-gray-700">{Number(d[p.key] || 0).toFixed(2)}</td>
                              ))}
                              <td className="py-3 text-right tabular-nums font-semibold text-[#2D6A2D]">{total.toFixed(2)}</td>
                              <td className="py-3 text-right tabular-nums">
                                {actualTotal !== null ? (
                                  <div>
                                    <span className="font-bold text-[#2D6A2D]">{actualTotal.toFixed(2)}</span>
                                    {variance !== null && (
                                      <div className={`text-[10px] mt-0.5 ${Math.abs(variance) < 0.01 ? "text-green-500" : variance > 0 ? "text-red-500" : "text-blue-500"}`}>
                                        {Math.abs(variance) < 0.01 ? "✓" : variance > 0 ? `+${variance.toFixed(2)}` : `${variance.toFixed(2)}`}
                                      </div>
                                    )}
                                  </div>
                                ) : <span className="text-gray-300 text-xs italic">pending</span>}
                              </td>
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
          </>
        )}

        {/* ── Inventory Tab ── */}
        {activeTab === "inventory" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <Layers className="w-4 h-4 text-[#2D6A2D]" />
              <h2 className="text-base font-bold text-gray-800">
                Inventory — {userProfile?.country || "Your Country"}
              </h2>
            </div>
            <CountryInventoryTab userProfile={userProfile} products={products} />
          </div>
        )}

        {/* ── Orders Tab ── */}
        {activeTab === "orders" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <Truck className="w-4 h-4 text-[#2D6A2D]" />
              <h2 className="text-base font-bold text-gray-800">My Orders</h2>
            </div>
            <CountryOrdersTab userProfile={userProfile} products={products} />
          </div>
        )}

        {/* ── Calculated Order Tab ── */}
        {activeTab === "calculated_order" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <ShoppingCart className="w-4 h-4 text-[#2D6A2D]" />
              <h2 className="text-base font-bold text-gray-800">Calculated Order</h2>
            </div>
            <CalculatedOrderTab userProfile={userProfile} products={products} />
          </div>
        )}

        {/* ── Messages Tab ── */}
        {activeTab === "messages" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <MessageSquare className="w-4 h-4 text-[#2D6A2D]" />
              <h2 className="text-base font-bold text-gray-800">Messages from Admin</h2>
            </div>
            <MessagesTab userProfile={userProfile} />
          </div>
        )}
      </div>

      {infoProduct && (
        <ProductInfoViewModal
          product={infoProduct}
          onClose={() => setInfoProduct(null)}
        />
      )}

      {showChangeCountry && currentUser && (
        <ChangeCountryModal
          userId={currentUser.uid}
          currentCountry={userProfile?.country}
          onClose={() => setShowChangeCountry(false)}
          onSaved={() => { setShowChangeCountry(false); refreshProfile?.(); }}
        />
      )}
    </Layout>
  );
}
