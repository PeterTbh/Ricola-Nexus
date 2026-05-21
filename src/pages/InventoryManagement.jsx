import { useState, useEffect, useRef, Fragment } from "react";
import {
  collection, query, onSnapshot, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, orderBy, Timestamp, where
} from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../firebase";
import {
  Plus, Pencil, Trash2, Save, X, Upload, Loader2,
  AlertCircle, HelpCircle, Layers, ChevronDown, ChevronRight,
  Info, Package, Clock, AlertTriangle, TrendingDown
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate?.() ?? (ts instanceof Date ? ts : null);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function remainingMonths(expiryDate) {
  if (!expiryDate) return null;
  const exp = expiryDate.toDate?.() ?? expiryDate;
  if (!exp || isNaN(exp.getTime())) return null;
  const diffMs = exp.getTime() - Date.now();
  return diffMs / (1000 * 60 * 60 * 24 * 30.44);
}

function defaultMarchDelivery(batchId) {
  let h = 0;
  for (const c of (batchId || "x")) h = ((h << 5) - h) + c.charCodeAt(0);
  return new Date(2026, 2, (Math.abs(h) % 28) + 1);
}

function batchBelongsToPeriodIM(batch, monthStr, monthsList) {
  if (batch.period) return batch.period === monthStr;
  const d = batch.deliveredAt?.toDate?.() ?? (batch.deliveredAt instanceof Date ? batch.deliveredAt : null);
  if (!d) return false;
  const [mName, mYear] = monthStr.split(" ");
  return d.getFullYear() === Number(mYear) && monthsList.indexOf(mName) === d.getMonth();
}

function computeExpiry(batch, shelfLifeMonths) {
  if (batch.expiryDate) return batch.expiryDate.toDate?.() ?? batch.expiryDate;
  const base = batch.deliveredAt?.toDate?.() ?? batch.deliveredAt;
  if (base && shelfLifeMonths) {
    const exp = new Date(base);
    exp.setMonth(exp.getMonth() + shelfLifeMonths);
    return exp;
  }
  // Initial inventory with no receipt timestamp: use deterministic March 2026 delivery date
  if (!batch.deliveredAt && batch.source !== "order" && shelfLifeMonths) {
    const march = defaultMarchDelivery(batch.id || batch.batchId || "x");
    const exp = new Date(march);
    exp.setMonth(exp.getMonth() + shelfLifeMonths);
    return exp;
  }
  return null;
}

function remainingLabel(months) {
  if (months === null) return { text: "—", color: "text-gray-400" };
  if (months < 0) return { text: "Expired", color: "text-red-600 font-semibold" };
  if (months < 1) return { text: `${Math.round(months * 30)}d`, color: "text-red-500 font-semibold" };
  const m = Math.floor(months);
  const d = Math.round((months - m) * 30);
  const text = d > 0 ? `${m}mo ${d}d` : `${m}mo`;
  const color = months < 2 ? "text-amber-600 font-semibold" : months < 4 ? "text-yellow-600" : "text-green-700";
  return { text, color };
}

// ─── Shelf Life Info Modal ────────────────────────────────────────────────────
function ShelfLifeModal({ country, product, batches, onClose }) {
  const shelfLife = product?.shelfLifeMonths;

  // FIFO: sort by earliest expiry first
  const sorted = [...batches]
    .map(b => ({ ...b, _computedExpiry: computeExpiry(b, shelfLife) }))
    .sort((a, b) => {
      if (!a._computedExpiry && !b._computedExpiry) return 0;
      if (!a._computedExpiry) return 1;
      if (!b._computedExpiry) return -1;
      return a._computedExpiry - b._computedExpiry;
    });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-bold text-gray-900">{product?.name ?? product?.key}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{country} · Shelf life breakdown (FIFO order)</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {shelfLife == null && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">Shelf life not set for this product. Set it in the Products tab to see remaining time calculations.</p>
          </div>
        )}

        {sorted.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No current inventory batches.</p>
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {["Batch ID", "Qty (t)", "Received", "Expiry", "Remaining"].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((b, i) => {
                  const expiry = b._computedExpiry;
                  const rem = expiry ? remainingMonths({ toDate: () => expiry }) : null;
                  const label = remainingLabel(rem);
                  return (
                    <tr key={b.id ?? i} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 text-gray-600">{b.batchId || <span className="text-gray-300 italic">—</span>}</td>
                      <td className="px-3 py-2.5 tabular-nums font-semibold text-[#2D6A2D]">{(b.qty ?? 0).toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-gray-500">{b.deliveredAt ? fmtDate(b.deliveredAt) : <span className="text-gray-300 italic">Not received</span>}</td>
                      <td className="px-3 py-2.5 text-gray-500">
                        {expiry
                          ? expiry.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
                          : <span className="text-gray-300 italic">—</span>}
                        {!b.expiryDate && b.deliveredAt && shelfLife && (
                          <span className="text-gray-400 ml-1">(calc.)</span>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 ${label.color}`}>{label.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <button onClick={onClose} className="w-full mt-4 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">Close</button>
      </div>
    </div>
  );
}

// ─── Format Info Modal ────────────────────────────────────────────────────────
function InventoryFormatModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-[#2D6A2D]" />
            <h3 className="font-bold text-gray-900">Expected Inventory Excel Format</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Row 1 must be the header row. Each subsequent row is one inventory batch.
          <span className="font-semibold"> Product Key</span>, <span className="font-semibold">Entity</span>, and <span className="font-semibold">Qty</span> are required.
        </p>
        <div className="space-y-3 mb-5">
          {[
            { col: "Column A", name: "Product Key", required: true, desc: 'The product key field (e.g. "product1Tons"). Also accepted: "Key", "ProductKey".' },
            { col: "Column B", name: "Entity", required: true, desc: 'Country/entity name (e.g. "France", "USA"). Also accepted: "Location".' },
            { col: "Column C", name: "Batch ID", required: false, desc: 'Batch or lot identifier. Also accepted: "Lot", "Batch".' },
            { col: "Column D", name: "Qty", required: true, desc: 'Quantity in tons (numeric). Also accepted: "Quantity", "Amount".' },
            { col: "Column E", name: "Expiry Date", required: false, desc: 'Date in YYYY-MM-DD format. Also accepted: "Expiry", "Best Before".' },
            { col: "Column F", name: "Source", required: false, desc: 'Data source (e.g. "SAP", "Manual"). Also accepted: "Origin".' },
            { col: "Column G", name: "Level Type", required: false, desc: '"current" (default) or "desired". Also accepted: "Typ".' },
          ].map(({ col, name, required, desc }) => (
            <div key={col} className="flex gap-3">
              <div className="w-20 text-xs font-semibold text-gray-500 shrink-0 pt-0.5">{col}</div>
              <div>
                <p className="text-xs font-semibold text-gray-800">
                  {name}
                  {required ? <span className="text-red-500 ml-1">*</span> : <span className="text-gray-400 font-normal ml-1">(optional)</span>}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="w-full mt-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">Close</button>
      </div>
    </div>
  );
}

// ─── Upload Inventory Modal ───────────────────────────────────────────────────
function UploadInventoryModal({ onClose }) {
  const [step, setStep] = useState("upload");
  const [parseError, setParseError] = useState("");
  const [parsedRows, setParsedRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [showFormat, setShowFormat] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const prevent = (e) => e.preventDefault();
    document.addEventListener("dragover", prevent);
    document.addEventListener("drop", prevent);
    return () => { document.removeEventListener("dragover", prevent); document.removeEventListener("drop", prevent); };
  }, []);

  const parseFile = (file) => {
    setParseError("");
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (rows.length < 2) { setParseError("File appears empty or has no data rows."); return; }
        const header = rows[0].map(h => String(h).toLowerCase().trim());
        const keyIdx       = header.findIndex(h => ["product key", "key", "productkey"].includes(h));
        const entityIdx    = header.findIndex(h => ["entity", "location"].includes(h));
        const batchIdx     = header.findIndex(h => ["batch id", "lot", "batch"].includes(h));
        const qtyIdx       = header.findIndex(h => ["qty", "quantity", "amount"].includes(h));
        const expiryIdx    = header.findIndex(h => ["expiry date", "expiry", "best before"].includes(h));
        const sourceIdx    = header.findIndex(h => ["source", "origin"].includes(h));
        const levelTypeIdx = header.findIndex(h => ["level type", "typ"].includes(h));
        if (keyIdx === -1) { setParseError('Could not find a "Product Key" column.'); return; }
        if (entityIdx === -1) { setParseError('Could not find an "Entity" column.'); return; }
        if (qtyIdx === -1) { setParseError('Could not find a "Qty" column.'); return; }
        const parsed = rows.slice(1)
          .filter(r => String(r[keyIdx] ?? "").trim() && String(r[entityIdx] ?? "").trim())
          .map((r, i) => {
            const rawLevel = levelTypeIdx >= 0 ? String(r[levelTypeIdx] ?? "").trim().toLowerCase() : "";
            return {
              _id: `r_${i}`,
              productKey: String(r[keyIdx] ?? "").trim(),
              entity: String(r[entityIdx] ?? "").trim(),
              batchId: batchIdx >= 0 ? String(r[batchIdx] ?? "").trim() : "",
              qty: qtyIdx >= 0 ? String(r[qtyIdx] ?? "").trim() : "",
              expiryDate: expiryIdx >= 0 ? String(r[expiryIdx] ?? "").trim() : "",
              source: sourceIdx >= 0 ? String(r[sourceIdx] ?? "").trim() : "",
              levelType: rawLevel === "desired" ? "desired" : "current",
              included: true,
            };
          });
        if (parsed.length === 0) { setParseError("No valid rows found."); return; }
        setParsedRows(parsed);
        setStep("preview");
      } catch { setParseError("Failed to read file. Please ensure it is a valid .xlsx or .xls file."); }
    };
    reader.readAsArrayBuffer(file);
  };

  const updateRow = (id, field, value) =>
    setParsedRows(prev => prev.map(r => r._id === id ? { ...r, [field]: value } : r));

  const selectedCount = parsedRows.filter(r => r.included && r.productKey && r.entity).length;

  const handleImport = async () => {
    if (selectedCount === 0) return;
    setImporting(true);
    setImportError("");
    try {
      const toImport = parsedRows.filter(r => r.included && r.productKey && r.entity);
      for (const r of toImport) {
        let expiryTs = null;
        if (r.expiryDate) {
          const d = new Date(r.expiryDate + "T00:00:00");
          if (!isNaN(d.getTime())) expiryTs = Timestamp.fromDate(d);
        }
        await addDoc(collection(db, "inventory"), {
          productKey: r.productKey,
          entity: r.entity,
          batchId: r.batchId || "",
          qty: parseFloat(r.qty) || 0,
          expiryDate: expiryTs,
          source: r.source || "",
          levelType: r.levelType || "current",
          updatedAt: serverTimestamp(),
        });
      }
      onClose();
    } catch { setImportError("Something went wrong during import. Please try again."); }
    finally { setImporting(false); }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-[#2D6A2D]" />
              <h3 className="font-bold text-gray-800 text-sm">
                {step === "upload" ? "Import Inventory from Excel" : "Import Inventory — Preview"}
              </h3>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
          <div className="overflow-y-auto flex-1 p-5">
            {step === "upload" ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">Upload an Excel file (.xlsx or .xls). Each row becomes one inventory record.</p>
                <div
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f) parseFile(f); }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 hover:border-[#4A9E4A] rounded-xl p-10 text-center cursor-pointer transition-colors group"
                >
                  <Upload className="w-8 h-8 text-gray-300 group-hover:text-[#4A9E4A] mx-auto mb-3 transition-colors" />
                  <p className="text-sm font-medium text-gray-500 group-hover:text-[#2D6A2D]">Drop a file here, or click to choose</p>
                  <p className="text-xs text-gray-400 mt-1">.xlsx · .xls</p>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={(e) => { const f = e.target.files[0]; if (f) parseFile(f); e.target.value = ""; }} className="hidden" />
                </div>
                {parseError && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600">{parseError}</p>
                  </div>
                )}
                <button onClick={() => setShowFormat(true)} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#2D6A2D] transition-colors">
                  <HelpCircle className="w-3.5 h-3.5" />Expected file format
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">
                  <span className="font-semibold text-gray-700">{parsedRows.length}</span> row{parsedRows.length !== 1 ? "s" : ""} detected. Uncheck rows to exclude.
                </p>
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-3 py-2.5 w-10" />
                        {["Product Key *", "Entity *", "Batch ID", "Qty *", "Expiry Date", "Source", "Level Type"].map(h => (
                          <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {parsedRows.map(r => (
                        <tr key={r._id} className={r.included ? "" : "opacity-40"}>
                          <td className="px-3 py-2 text-center">
                            <input type="checkbox" checked={r.included} onChange={e => updateRow(r._id, "included", e.target.checked)} className="accent-[#2D6A2D] w-4 h-4 cursor-pointer" />
                          </td>
                          {[
                            { field: "productKey", placeholder: "product1Tons" },
                            { field: "entity", placeholder: "France" },
                            { field: "batchId", placeholder: "LOT-001" },
                            { field: "qty", placeholder: "0.00" },
                            { field: "expiryDate", placeholder: "YYYY-MM-DD" },
                            { field: "source", placeholder: "SAP" },
                          ].map(({ field, placeholder }) => (
                            <td key={field} className="px-3 py-2">
                              <input
                                type="text"
                                value={r[field]}
                                onChange={e => updateRow(r._id, field, e.target.value)}
                                placeholder={placeholder}
                                className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#4A9E4A] min-w-[80px]"
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2">
                            <select
                              value={r.levelType}
                              onChange={e => updateRow(r._id, "levelType", e.target.value)}
                              className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#4A9E4A] bg-white min-w-[90px]"
                            >
                              <option value="current">Current</option>
                              <option value="desired">Desired</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importError && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600">{importError}</p>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="p-5 border-t border-gray-100 shrink-0 flex gap-3">
            {step === "preview" ? (
              <>
                <button onClick={() => { setStep("upload"); setParseError(""); }} disabled={importing} className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-60">← Back</button>
                <button onClick={handleImport} disabled={importing || selectedCount === 0} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white text-sm font-semibold transition-colors disabled:opacity-60">
                  {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                  {importing ? "Importing…" : `Import ${selectedCount} Record${selectedCount !== 1 ? "s" : ""}`}
                </button>
              </>
            ) : (
              <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
            )}
          </div>
        </div>
      </div>
      {showFormat && <InventoryFormatModal onClose={() => setShowFormat(false)} />}
    </>
  );
}

// ─── Edit Batch Modal ──────────────────────────────────────────────────────────
function EditBatchModal({ item, onClose }) {
  const [data, setData] = useState({
    productKey: item.productKey || "",
    entity: item.entity || "",
    batchId: item.batchId || "",
    qty: String(item.qty ?? ""),
    expiryDate: item.expiryDate ? (() => { const d = item.expiryDate.toDate?.(); return d ? d.toISOString().split("T")[0] : ""; })() : "",
    deliveredAt: item.deliveredAt ? (() => { const d = item.deliveredAt.toDate?.(); return d ? d.toISOString().split("T")[0] : ""; })() : "",
    source: item.source || "",
    levelType: item.levelType || "current",
  });
  const [saving, setSaving] = useState(false);

  const toTimestamp = (str) => {
    if (!str) return null;
    const d = new Date(str + "T00:00:00");
    return isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
  };

  const handleSave = async () => {
    setSaving(true);
    await updateDoc(doc(db, "inventory", item.id), {
      productKey: data.productKey,
      entity: data.entity,
      batchId: data.batchId,
      qty: parseFloat(data.qty) || 0,
      expiryDate: toTimestamp(data.expiryDate),
      deliveredAt: toTimestamp(data.deliveredAt),
      source: data.source,
      levelType: data.levelType,
      updatedAt: serverTimestamp(),
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-900 text-sm">Edit Inventory Batch</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          {[
            { label: "Product Key", field: "productKey", type: "text" },
            { label: "Entity / Country", field: "entity", type: "text" },
            { label: "Batch ID", field: "batchId", type: "text" },
            { label: "Qty (t)", field: "qty", type: "number" },
            { label: "Delivered At", field: "deliveredAt", type: "date" },
            { label: "Expiry Date", field: "expiryDate", type: "date" },
            { label: "Source", field: "source", type: "text" },
          ].map(({ label, field, type }) => (
            <div key={field}>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</label>
              <input
                type={type}
                value={data[field]}
                onChange={e => setData(p => ({ ...p, [field]: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-[#4A9E4A]"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Level Type</label>
            <select
              value={data.levelType}
              onChange={e => setData(p => ({ ...p, levelType: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-[#4A9E4A] bg-white"
            >
              <option value="current">Current</option>
              <option value="desired">Desired</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-60">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white text-sm font-semibold disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Inventory Modal ───────────────────────────────────────────────────
function DeleteInventoryModal({ item, onClose }) {
  const [loading, setLoading] = useState(false);
  const handleDelete = async () => {
    setLoading(true);
    await deleteDoc(doc(db, "inventory", item.id));
    onClose();
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Delete Inventory Record</h3>
            <p className="text-sm text-gray-500">{item.productKey} · {item.entity}</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-5">This will permanently remove this inventory record. This cannot be undone.</p>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading} className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-60">Cancel</button>
          <button onClick={handleDelete} disabled={loading} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-60">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Batch Modal ──────────────────────────────────────────────────────────
function AddBatchModal({ products, onClose }) {
  const [data, setData] = useState({ productKey: "", entity: "", batchId: "", qty: "", deliveredAt: "", expiryDate: "", source: "", levelType: "current" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toTimestamp = (str) => {
    if (!str) return null;
    const d = new Date(str + "T00:00:00");
    return isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
  };

  const handleSave = async () => {
    if (!data.productKey || !data.entity) { setError("Product key and entity are required."); return; }
    setSaving(true);
    await addDoc(collection(db, "inventory"), {
      productKey: data.productKey,
      entity: data.entity,
      batchId: data.batchId || "",
      qty: parseFloat(data.qty) || 0,
      deliveredAt: toTimestamp(data.deliveredAt),
      expiryDate: toTimestamp(data.expiryDate),
      source: data.source || "",
      levelType: data.levelType || "current",
      updatedAt: serverTimestamp(),
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-900 text-sm">Add Inventory Batch</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Product <span className="text-red-500">*</span></label>
            <select
              value={data.productKey}
              onChange={e => setData(p => ({ ...p, productKey: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-[#4A9E4A] bg-white"
            >
              <option value="">Select product…</option>
              {products.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          </div>
          {[
            { label: "Entity / Country", field: "entity", type: "text", placeholder: "France", required: true },
            { label: "Batch ID", field: "batchId", type: "text", placeholder: "LOT-001" },
            { label: "Qty (t)", field: "qty", type: "number", placeholder: "0.00" },
            { label: "Delivered At", field: "deliveredAt", type: "date" },
            { label: "Expiry Date", field: "expiryDate", type: "date" },
            { label: "Source", field: "source", type: "text", placeholder: "SAP" },
          ].map(({ label, field, type, placeholder, required }) => (
            <div key={field}>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                {label} {required && <span className="text-red-500">*</span>}
              </label>
              <input
                type={type}
                value={data[field]}
                onChange={e => setData(p => ({ ...p, [field]: e.target.value }))}
                placeholder={placeholder}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-[#4A9E4A]"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Level Type</label>
            <select
              value={data.levelType}
              onChange={e => setData(p => ({ ...p, levelType: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-[#4A9E4A] bg-white"
            >
              <option value="current">Current</option>
              <option value="desired">Desired</option>
            </select>
          </div>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-60">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white text-sm font-semibold disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? "Saving…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Submission Modal ────────────────────────────────────────────────────
function EditSubmissionModal({ demand, productKey, productName, qty, onClose }) {
  const existing = demand?.currentInventoryExpiry?.[productKey];
  const [expiryDate, setExpiryDate] = useState(
    existing ? (() => { const d = existing.toDate?.(); return d ? d.toISOString().split("T")[0] : ""; })() : ""
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const expiry = expiryDate ? Timestamp.fromDate(new Date(expiryDate + "T00:00:00")) : null;
      await updateDoc(doc(db, "demands", demand.id), {
        [`currentInventoryExpiry.${productKey}`]: expiry,
      });
      onClose();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-900 text-sm">Edit Manual Submission</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 rounded-xl">
            <p className="text-xs text-blue-600 font-semibold">{productName}</p>
            <p className="text-xs text-blue-400 mt-0.5">Submitted quantity: {qty.toFixed(2)} t</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Expiry Date</label>
            <input
              type="date"
              value={expiryDate}
              onChange={e => setExpiryDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-[#4A9E4A]"
            />
            <p className="text-xs text-gray-400 mt-1">Leave empty to remove expiry date.</p>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-60">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white text-sm font-semibold disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stock Levels Tab ─────────────────────────────────────────────────────────
function StockLevelsTab({ items, products, loading, demands, hiddenProductKeys = new Set() }) {
  const [sortBy, setSortBy] = useState("country");
  const [expandedKey, setExpandedKey] = useState(null);
  const [shelfLifeTarget, setShelfLifeTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editSubmission, setEditSubmission] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showFormat, setShowFormat] = useState(false);

  const productMap = {};
  products.forEach(p => { productMap[p.key] = p; (p.keyHistory || []).forEach(k => { productMap[k] = p; }); });
  // Normalize any historical key to the product's current key
  const normalizeProductKey = (key) => productMap[key]?.key ?? key;

  // Use the most recent demand per country so initial inventory isn't lost when no current-month submission exists
  const latestDemandByCountrySL = {};
  for (const d of (demands || [])) {
    if (!d.country || !d.currentInventory) continue;
    const cur = latestDemandByCountrySL[d.country];
    if (!cur || (d.submittedAt?.seconds ?? 0) > (cur.submittedAt?.seconds ?? 0)) {
      latestDemandByCountrySL[d.country] = d;
    }
  }

  // Build summary rows: one per (entity, productKey) — normalize historical keys to current key
  const summaryMap = {};
  for (const item of items) {
    if (item.levelType && item.levelType !== "current") continue;
    const normKey = normalizeProductKey(item.productKey);
    const key = `${item.entity}||${normKey}`;
    if (!summaryMap[key]) {
      summaryMap[key] = { entity: item.entity, productKey: normKey, currentBatches: [], submittedQty: 0, demandDoc: null, submittedExpiry: null, _baseDemandTimeSec: 0 };
    }
    summaryMap[key].currentBatches.push(item);
  }
  // Merge in demand-submitted current inventory (latest submission per country)
  for (const demand of Object.values(latestDemandByCountrySL)) {
    const country = demand.country;
    if (!country || !demand.currentInventory) continue;
    for (const [pk, qty] of Object.entries(demand.currentInventory)) {
      if (!qty) continue;
      const normPk = normalizeProductKey(pk);
      const key = `${country}||${normPk}`;
      if (!summaryMap[key]) {
        summaryMap[key] = { entity: country, productKey: normPk, currentBatches: [], submittedQty: 0, demandDoc: null, submittedExpiry: null };
      }
      summaryMap[key].submittedQty += Number(qty) || 0;
      summaryMap[key].demandDoc = demand;
      summaryMap[key].submittedExpiry = demand.currentInventoryExpiry?.[normPk] ?? demand.currentInventoryExpiry?.[pk] ?? null;
      summaryMap[key]._baseDemandTimeSec = demand.submittedAt?.seconds ?? 0;
    }
  }

  let rows = Object.values(summaryMap).map(r => {
    const baseSec = r._baseDemandTimeSec ?? 0;
    // Only count order batches received after the base demand to avoid double-counting initial stock
    const batchQty = r.currentBatches.reduce((s, b) => {
      if (b.source === "mrp") return s; // cross-validation only — qty lives in demand submissions
      if (b.source === "order" && b.deliveredAt && baseSec > 0 && (b.deliveredAt.seconds ?? 0) < baseSec) return s;
      return s + (b.qty || 0);
    }, 0);
    return { ...r, currentQty: batchQty + r.submittedQty, productName: productMap[r.productKey]?.name ?? r.productKey };
  }).filter(r => !hiddenProductKeys.has(r.productKey));

  const sortFn = {
    country: (a, b) => a.entity.localeCompare(b.entity) || a.productName.localeCompare(b.productName),
    product: (a, b) => a.productName.localeCompare(b.productName) || a.entity.localeCompare(b.entity),
    current: (a, b) => b.currentQty - a.currentQty,
  };
  rows.sort(sortFn[sortBy] ?? sortFn.country);

  // Group by country for display
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.entity]) grouped[row.entity] = [];
    grouped[row.entity].push(row);
  }
  const countries = Object.keys(grouped).sort((a, b) =>
    sortBy === "country" ? a.localeCompare(b) : a.localeCompare(b)
  );

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#4A9E4A]" /></div>;

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between mb-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sort by</label>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] bg-white text-gray-700"
          >
            <option value="country">Country</option>
            <option value="product">Product</option>
            <option value="current">Current Qty ↓</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowFormat(true)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-[#2D6A2D] hover:bg-gray-100 border border-transparent hover:border-gray-200 transition-colors">
            <HelpCircle className="w-3.5 h-3.5" />Format
          </button>
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#2D6A2D] border border-[#2D6A2D] hover:bg-green-50 transition-colors">
            <Upload className="w-3.5 h-3.5" />Upload Excel
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#2D6A2D] text-white hover:bg-[#1A4A1A] transition-colors">
            <Plus className="w-3.5 h-3.5" />Add Batch
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-12">
          <Layers className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          <p className="text-gray-400 text-sm">No inventory records yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {countries.map(country => (
            <div key={country} className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">{country}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Current (t)</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Batches</th>
                    <th className="px-4 py-2.5 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {grouped[country].map(row => {
                    const rowKey = `${row.entity}||${row.productKey}`;
                    const isExpanded = expandedKey === rowKey;
                    const product = productMap[row.productKey];
                    return (
                      <>
                        <tr key={rowKey} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-800">{row.productName}</span>
                              <span className="text-xs text-gray-400">({row.productKey})</span>
                              {product?.shelfLifeMonths == null && (
                                <span title="Shelf life not set" className="text-amber-400"><AlertTriangle className="w-3 h-3" /></span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-[#2D6A2D]">
                            {row.currentQty > 0 ? row.currentQty.toFixed(2) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-gray-400">
                            {row.currentBatches.filter(b => b.source !== "mrp").length + (row.submittedQty > 0 ? 1 : 0)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => setShelfLifeTarget({ country: row.entity, product, batches: row.currentBatches })}
                                title="Shelf life breakdown"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              >
                                <Info className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setExpandedKey(isExpanded ? null : rowKey)}
                                title="View batches"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-[#2D6A2D] hover:bg-green-50 transition-colors"
                              >
                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${rowKey}-exp`}>
                            <td colSpan={4} className="bg-gray-50 px-4 pb-3 pt-0">
                              <div className="rounded-xl border border-gray-200 overflow-hidden mt-2">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-white border-b border-gray-100">
                                      {["Batch ID", "Qty (t)", "Expiry", "Source", ""].map(h => (
                                        <th key={h} className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-50">
                                    {row.submittedQty > 0 && (
                                      <tr className="bg-blue-50/40">
                                        <td className="px-3 py-2 text-blue-600 font-medium italic">Manual submission</td>
                                        <td className="px-3 py-2 tabular-nums font-semibold text-blue-700">{row.submittedQty.toFixed(2)}</td>
                                        <td className="px-3 py-2 text-gray-500">{row.submittedExpiry ? fmtDate(row.submittedExpiry) : <span className="text-gray-300">—</span>}</td>
                                        <td className="px-3 py-2 text-blue-400 text-xs">Demand planner</td>
                                        <td className="px-3 py-2">
                                          {row.demandDoc && (
                                            <button
                                              onClick={() => setEditSubmission({ demand: row.demandDoc, productKey: row.productKey, productName: row.productName, qty: row.submittedQty })}
                                              className="p-1 rounded text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                              title="Edit submission"
                                            >
                                              <Pencil className="w-3 h-3" />
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    )}
                                    {row.currentBatches.map(b => {
                                      const isMrp = b.source === "mrp";
                                      return (
                                        <tr key={b.id} className={isMrp ? "opacity-50 bg-gray-50/50" : "hover:bg-white"}>
                                          <td className="px-3 py-2 text-gray-600">{b.batchId || "—"}</td>
                                          <td className={`px-3 py-2 tabular-nums font-semibold ${isMrp ? "text-gray-400" : "text-[#2D6A2D]"}`}>{(b.qty ?? 0).toFixed(2)}</td>
                                          <td className="px-3 py-2 text-gray-500">{fmtDate(computeExpiry(b, productMap[b.productKey]?.shelfLifeMonths))}</td>
                                          <td className="px-3 py-2 text-gray-400">{isMrp ? <span className="italic text-gray-300">mrp (ref only)</span> : (b.source || "—")}</td>
                                          <td className="px-3 py-2">
                                            <div className="flex gap-1 justify-end">
                                              <button onClick={() => setEditTarget(b)} className="p-1 rounded text-gray-300 hover:text-[#2D6A2D] hover:bg-green-50 transition-colors" title="Edit"><Pencil className="w-3 h-3" /></button>
                                              <button onClick={() => setDeleteTarget(b)} className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><Trash2 className="w-3 h-3" /></button>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {shelfLifeTarget && (
        <ShelfLifeModal
          country={shelfLifeTarget.country}
          product={shelfLifeTarget.product}
          batches={shelfLifeTarget.batches}
          onClose={() => setShelfLifeTarget(null)}
        />
      )}
      {editTarget && <EditBatchModal item={editTarget} onClose={() => setEditTarget(null)} />}
      {deleteTarget && <DeleteInventoryModal item={deleteTarget} onClose={() => setDeleteTarget(null)} />}
      {editSubmission && (
        <EditSubmissionModal
          demand={editSubmission.demand}
          productKey={editSubmission.productKey}
          productName={editSubmission.productName}
          qty={editSubmission.qty}
          onClose={() => setEditSubmission(null)}
        />
      )}
      {showAdd && <AddBatchModal products={products} onClose={() => setShowAdd(false)} />}
      {showUpload && <UploadInventoryModal onClose={() => setShowUpload(false)} />}
      {showFormat && <InventoryFormatModal onClose={() => setShowFormat(false)} />}
    </>
  );
}

// ─── Estimated Safety Stock Tab ───────────────────────────────────────────────
function EstimatedSafetyStockTab({ items, products, demands, messages, hiddenProductKeys = new Set() }) {
  const MONTHS_LIST = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const CURRENT_MONTH = `${MONTHS_LIST[new Date().getMonth()]} ${new Date().getFullYear()}`;
  const productMap = {};
  products.forEach(p => { productMap[p.key] = p; (p.keyHistory || []).forEach(k => { productMap[k] = p; }); });
  const normalizeProductKey = (key) => productMap[key]?.key ?? key;

  // Latest demand WITH currentInventory per country (matches StockLevelsTab — only consider docs that have inventory data)
  const latestDemandByCountryESS = {};
  for (const d of demands) {
    if (!d.country || !d.currentInventory) continue;
    const k = d.country;
    const cur = latestDemandByCountryESS[k];
    if (!cur || (d.submittedAt?.seconds ?? 0) > (cur.submittedAt?.seconds ?? 0)) {
      latestDemandByCountryESS[k] = d;
    }
  }
  const currentMonthDemands = demands.filter(d => d.month === CURRENT_MONTH);

  // Build summaryMap: track order batches and non-order batches separately for time-filtering
  const summaryMap = {};
  for (const item of items) {
    if (item.levelType && item.levelType !== "current") continue;
    const normKey = normalizeProductKey(item.productKey);
    const key = `${item.entity}||${normKey}`;
    if (!summaryMap[key]) summaryMap[key] = { entity: item.entity, productKey: normKey, orderBatches: [], nonOrderBatches: [] };
    if (item.source === "order" && item.deliveredAt) {
      summaryMap[key].orderBatches.push(item);
    } else {
      summaryMap[key].nonOrderBatches.push(item);
    }
  }
  // Also add placeholder entries for countries that only have demand submissions (no inventory batches)
  for (const demand of Object.values(latestDemandByCountryESS)) {
    if (!demand.country || !demand.currentInventory) continue;
    for (const [pk, qty] of Object.entries(demand.currentInventory)) {
      if (!qty) continue;
      const normPk = normalizeProductKey(pk);
      const key = `${demand.country}||${normPk}`;
      if (!summaryMap[key]) summaryMap[key] = { entity: demand.country, productKey: normPk, orderBatches: [], nonOrderBatches: [] };
    }
  }

  const rows = Object.values(summaryMap).map(r => {
    const cKey = r.entity;
    const latestDemand = latestDemandByCountryESS[cKey];
    const baseDemandTimeSec = latestDemand?.submittedAt?.seconds ?? 0;
    const allPKeys = [r.productKey, ...(productMap[r.productKey]?.keyHistory || [])];

    const submittedCurrent = allPKeys.reduce((val, k) => val ?? latestDemand?.currentInventory?.[k] ?? null, null) ?? 0;
    // Order batches received after the base demand submission (avoids double-counting initial stock)
    const orderBatchQty = r.orderBatches.filter(b => baseDemandTimeSec === 0 || (b.deliveredAt.seconds ?? 0) >= baseDemandTimeSec).reduce((s, b) => s + (b.qty || 0), 0);
    const nonOrderBatchQty = r.nonOrderBatches.filter(b => b.source !== "mrp").reduce((s, b) => s + (b.qty || 0), 0);
    // Only use demand submission as the opening balance when it actually reports stock (> 0).
    // When submission is 0, fall back to physical records — this mirrors StockLevelsTab which skips
    // zero-inventory products when setting the timestamp cutoff, causing all order batches to be counted.
    const demandHasInventory = allPKeys.some(k => latestDemand?.currentInventory?.[k] != null);
    const allOrderBatchQty = r.orderBatches.reduce((s, b) => s + (b.qty || 0), 0);
    const currentQty = (demandHasInventory && submittedCurrent > 0)
      ? submittedCurrent + orderBatchQty   // submission has stock: opening balance + post-submission orders
      : nonOrderBatchQty + allOrderBatchQty; // submission is 0 or absent: all physical non-MRP records

    // For expected demand, use current month demand
    const currentMonthDemand = currentMonthDemands.find(d => (d.country || "") === cKey);
    const resolvedMsg = currentMonthDemand ? messages.find(m =>
      !m.type && allPKeys.includes(m.productKey) && m.period === CURRENT_MONTH &&
      m.toUserId === currentMonthDemand.userId &&
      (m.status === "resolved" || m.status === "admin_resolved")
    ) : null;
    const expectedDemand = resolvedMsg
      ? (resolvedMsg.resolvedQty ?? 0)
      : currentMonthDemand ? (allPKeys.reduce((val, k) => val ?? (currentMonthDemand[k] != null ? Number(currentMonthDemand[k]) : null), null) ?? 0) : 0;
    const baseDemandDoc = currentMonthDemand ?? latestDemand;
    const desiredManual = allPKeys.reduce((val, k) => val ?? baseDemandDoc?.desiredInventory?.[k] ?? null, null);

    return {
      entity: r.entity, productKey: r.productKey,
      productName: productMap[r.productKey]?.name ?? r.productKey,
      currentQty, expectedDemand, safetyStock: currentQty - expectedDemand,
      hasResolved: !!resolvedMsg, desiredManual,
    };
  }).filter(r => !hiddenProductKeys.has(r.productKey));

  // Group by country
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.entity]) grouped[row.entity] = [];
    grouped[row.entity].push(row);
  }
  const countries = Object.keys(grouped).sort();

  if (rows.length === 0) {
    return (
      <div className="text-center py-12">
        <Layers className="w-8 h-8 text-gray-200 mx-auto mb-2" />
        <p className="text-gray-400 text-sm">No inventory records yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        Safety stock = current inventory (Stock Levels) − expected demand for {CURRENT_MONTH}. Uses resolved discrepancy values where applicable.
      </p>
      {countries.map(country => (
        <div key={country} className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
            <Package className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">{country}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Current (t)</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Demand (t)</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Safety Stock (t)</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Desired (t)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {grouped[country].map(row => (
                <tr key={`${row.entity}||${row.productKey}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800">{row.productName}</span>
                      <span className="text-xs text-gray-400">({row.productKey})</span>
                      {row.hasResolved && (
                        <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold">resolved</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">{row.currentQty.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">{row.expectedDemand.toFixed(2)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums font-bold text-lg ${row.safetyStock < 0 ? "text-red-600" : "text-[#2D6A2D]"}`}>
                    {row.safetyStock.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-purple-700">
                    {row.desiredManual != null ? row.desiredManual.toFixed(2) : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ─── Stock Flow Tab (admin — global, country → product → months) ──────────────
function StockFlowTab({ items, products, demands, waste, messages }) {
  const [expandedCountry, setExpandedCountry] = useState(null);
  const [expandedProduct, setExpandedProduct] = useState(null);

  const MONTHS_LIST = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  function parseMonth(monthStr) {
    const [name, year] = monthStr.split(" ");
    return new Date(Number(year), MONTHS_LIST.indexOf(name), 1);
  }

  function shortLabel(monthStr) {
    const [name, year] = monthStr.split(" ");
    return `${name.slice(0, 3)} '${year.slice(2)}`;
  }

  const orderBatches = items.filter(i => i.source === "order" && (!i.levelType || i.levelType === "current"));
  const initialBatches = items.filter(i => i.source !== "order" && (!i.levelType || i.levelType === "current"));
  const countries = [...new Set(demands.map(d => d.country).filter(Boolean))].sort();

  // Map inventoryDocId → total wasted qty, so ordersIn always reflects original delivered amount
  const batchWasteMapSF = {};
  for (const w of (waste || [])) {
    if (w.inventoryDocId) batchWasteMapSF[w.inventoryDocId] = (batchWasteMapSF[w.inventoryDocId] || 0) + (w.wastedQty || 0);
  }
  const origQtySF = (b) => (b.qty || 0) + (batchWasteMapSF[b.id] || 0);

  if (countries.length === 0) return (
    <div className="text-center py-10">
      <TrendingDown className="w-8 h-8 text-gray-200 mx-auto mb-2" />
      <p className="text-gray-400 text-sm">No demand submissions with country data yet.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">Global stock ledger — country → product → month. Actual Demand = post-delivery − closing − waste. Variance shown against submitted demand.</p>
      {countries.map(country => {
        const countryDemands = demands.filter(d => d.country === country);
        const sortedDemands = [...countryDemands].sort((a, b) => {
          try { return parseMonth(a.month) - parseMonth(b.month); } catch { return 0; }
        });
        const countryBatches = orderBatches.filter(b => b.entity === country);
        const countryWaste = waste.filter(w => w.userCountry === country);
        const countryUserIds = [...new Set(countryDemands.map(d => d.userId).filter(Boolean))];
        const countryMessages = messages.filter(m => countryUserIds.includes(m.toUserId));
        const isExpC = expandedCountry === country;

        return (
          <div key={country} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <button onClick={() => setExpandedCountry(isExpC ? null : country)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#2D6A2D]/10 flex items-center justify-center">
                  <Layers className="w-4 h-4 text-[#2D6A2D]" />
                </div>
                <span className="font-semibold text-sm text-gray-800">{country}</span>
                <span className="text-xs text-gray-400">{sortedDemands.length} period{sortedDemands.length !== 1 ? "s" : ""}</span>
              </div>
              {isExpC ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
            </button>

            {isExpC && (
              <div className="border-t border-gray-100 divide-y divide-gray-100">
                {products.map(product => {
                  const pKey = product.key;
                  const allPKeys = [pKey, ...(product.keyHistory || [])];
                  const shelfLife = product.shelfLifeMonths ?? null;
                  const productOrderBatches = countryBatches.filter(b => allPKeys.includes(b.productKey));
                  const hasAnyOrders = productOrderBatches.length > 0;
                  const initBatch = initialBatches.find(b => allPKeys.includes(b.productKey) && b.entity === country);
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
                    const openingStock = allPKeys.reduce((val, k) => val ?? demandM.currentInventory?.[k] ?? null, null);
                    if (openingStock == null) { prevRow = null; continue; }
                    const ordersIn = productOrderBatches.filter(b => batchBelongsToPeriodIM(b, demandM.month, MONTHS_LIST)).reduce((s, b) => s + origQtySF(b), 0);
                    const demDateSF = parseMonth(demandM.month);
                    const nextDateSF = demandNext ? parseMonth(demandNext.month) : null;
                    const wasteQty = countryWaste.filter(w => {
                      if (!allPKeys.includes(w.productKey)) return false;
                      const wDate = parseMonth(w.month);
                      return wDate >= demDateSF && (nextDateSF === null || wDate < nextDateSF);
                    }).reduce((s, w) => s + (w.wastedQty || 0), 0);
                    let manualDelta = 0;
                    if (!prevRow && !hasAnyOrders) {
                      manualDelta = openingStock;
                    } else if (prevRow) {
                      const fifoMax = prevRow.openingStock + prevRow.ordersIn - prevRow.wasteQty;
                      if (openingStock > fifoMax + 0.001) manualDelta = openingStock - fifoMax;
                    }
                    const postDelivery = openingStock + ordersIn;
                    const closingStock = demandNext ? allPKeys.reduce((val, k) => val ?? demandNext.currentInventory?.[k] ?? null, null) : null;
                    const consumption = closingStock !== null ? Math.max(0, postDelivery - closingStock - wasteQty) : null;
                    const resolvedMsg = countryMessages.find(m => allPKeys.includes(m.productKey) && m.period === demandM.month && (m.status === "resolved" || m.status === "admin_resolved"));
                    const submittedDemand = allPKeys.reduce((val, k) => val ?? (demandM[k] !== undefined ? demandM[k] : null), null);
                    const effectiveDemand = resolvedMsg?.resolvedQty ?? submittedDemand;
                    const row = { month: demandM.month, openingStock, ordersIn, manualDelta, postDelivery, wasteQty, closingStock, consumption, submittedDemand, effectiveDemand, resolvedMsg };
                    rows.push(row);
                    prevRow = row;
                  }
                  if (rows.length === 0) return null;

                  const prodKey = `${country}-${pKey}`;
                  const isExpP = expandedProduct === prodKey;

                  return (
                    <div key={pKey} className="bg-gray-50/40">
                      <button onClick={() => setExpandedProduct(isExpP ? null : prodKey)}
                        className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-gray-100/60 transition-colors">
                        <div className="flex items-center gap-3">
                          <Package className="w-3.5 h-3.5 text-[#2D6A2D]" />
                          <span className="font-medium text-sm text-gray-700">{product.name}</span>
                          <span className="text-xs text-gray-400">{rows.length} period{rows.length !== 1 ? "s" : ""}</span>
                        </div>
                        {isExpP ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                      </button>

                      {isExpP && (
                        <div className="border-t border-gray-100 bg-white overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="text-left px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Period</th>
                                <th className="text-right px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Opening (t)</th>
                                <th className="text-right px-3 py-2.5 font-semibold text-green-600 uppercase tracking-wider whitespace-nowrap">Orders In (t)</th>
                                <th className="text-right px-3 py-2.5 font-semibold text-blue-600 uppercase tracking-wider whitespace-nowrap">Post-Delivery (t)</th>
                                <th className="text-right px-3 py-2.5 font-semibold text-red-500 uppercase tracking-wider whitespace-nowrap">Waste (t)</th>
                                <th className="text-right px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Closing (t)</th>
                                <th className="text-right px-3 py-2.5 font-semibold text-[#2D6A2D] uppercase tracking-wider whitespace-nowrap">Actual (t)</th>
                                <th className="text-right px-3 py-2.5 font-semibold text-amber-600 uppercase tracking-wider whitespace-nowrap">Submitted (t)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {rows.map(row => {
                                const variance = row.consumption !== null && row.effectiveDemand != null ? row.consumption - row.effectiveDemand : null;
                                return (
                                  <tr key={row.month} className="hover:bg-gray-50">
                                    <td className="px-3 py-2.5 font-medium text-gray-700 whitespace-nowrap">{shortLabel(row.month)}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">
                                      {row.openingStock.toFixed(2)}
                                      {row.manualDelta > 0 && <div className="text-[9px] text-amber-600 mt-0.5 font-medium">+{row.manualDelta.toFixed(2)} adj{manualExpiry ? ` · exp ${manualExpiry.toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : ""}</div>}
                                    </td>
                                    <td className="px-3 py-2.5 text-right tabular-nums text-green-700">{row.ordersIn > 0 ? `+${row.ordersIn.toFixed(2)}` : "—"}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-blue-700">{row.postDelivery.toFixed(2)}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums text-red-600">{row.wasteQty > 0 ? `−${row.wasteQty.toFixed(2)}` : "—"}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">
                                      {row.closingStock != null ? row.closingStock.toFixed(2) : <span className="text-gray-300 italic text-[10px]">pending</span>}
                                    </td>
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
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Inventory Management ─────────────────────────────────────────────────────
export default function InventoryManagement() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [hiddenProductKeys, setHiddenProductKeys] = useState(new Set());
  const [demands, setDemands] = useState([]);
  const [messages, setMessages] = useState([]);
  const [waste, setWaste] = useState([]);
  const [activeTab, setActiveTab] = useState("stock");

  useEffect(() => {
    const q = query(collection(db, "inventory"), orderBy("updatedAt", "desc"));
    return onSnapshot(q, (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("order"));
    return onSnapshot(q, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setProducts(all.filter(p => !p.archived && !p.hidden));
      const hiddenKeys = new Set();
      all.filter(p => p.hidden && !p.archived).forEach(p => {
        hiddenKeys.add(p.key);
        (p.keyHistory || []).forEach(k => hiddenKeys.add(k));
      });
      setHiddenProductKeys(hiddenKeys);
    }, () => {});
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "demands"), snap => {
      setDemands(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "messages"), snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "waste"), snap => {
      setWaste(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const tabs = [
    { id: "stock", label: "Stock Levels" },
    { id: "safety", label: "Estimated Safety Stock" },
    { id: "flow", label: "Stock Flow" },
  ];

  return (
    <>
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-5 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${activeTab === t.id ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "stock" && (
        <StockLevelsTab items={items} products={products} loading={loading} demands={demands} hiddenProductKeys={hiddenProductKeys} />
      )}
      {activeTab === "safety" && (
        <EstimatedSafetyStockTab items={items} products={products} demands={demands} messages={messages} hiddenProductKeys={hiddenProductKeys} />
      )}
      {activeTab === "flow" && (
        <StockFlowTab items={items} products={products} demands={demands} waste={waste} messages={messages} />
      )}
    </>
  );
}
