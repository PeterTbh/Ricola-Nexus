import { useState, useEffect, useRef } from "react";
import {
  collection, query, onSnapshot, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, orderBy, Timestamp
} from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../firebase";
import {
  Plus, Pencil, Trash2, Save, X, Upload, Loader2,
  AlertCircle, HelpCircle, Layers, ChevronDown
} from "lucide-react";

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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Row 1 must be the header row. Each subsequent row is one inventory batch.
          <span className="font-semibold"> Product Key</span>, <span className="font-semibold">Entity</span>, and <span className="font-semibold">Qty</span> are required.
        </p>

        <div className="space-y-3 mb-5">
          {[
            { col: "Column A", name: "Product Key", required: true, desc: 'The product key field (e.g. "product1Tons"). Also accepted: "Key", "ProductKey".' },
            { col: "Column B", name: "Entity", required: true, desc: 'Ricola entity name (e.g. "USA", "Malaysia", "CH"). Also accepted: "Location".' },
            { col: "Column C", name: "Batch ID", required: false, desc: 'Batch or lot identifier. Also accepted: "Lot", "Batch".' },
            { col: "Column D", name: "Qty", required: true, desc: 'Quantity in tons (numeric). Also accepted: "Quantity", "Amount".' },
            { col: "Column E", name: "Expiry Date", required: false, desc: 'Date in YYYY-MM-DD format. Also accepted: "Expiry", "Best Before".' },
            { col: "Column F", name: "Source", required: false, desc: 'Data source (e.g. "SAP", "Manual"). Also accepted: "Origin".' },
          ].map(({ col, name, required, desc }) => (
            <div key={col} className="flex gap-3">
              <div className="w-20 text-xs font-semibold text-gray-500 shrink-0 pt-0.5">{col}</div>
              <div>
                <p className="text-xs font-semibold text-gray-800">
                  {name}
                  {required
                    ? <span className="text-red-500 ml-1">*</span>
                    : <span className="text-gray-400 font-normal ml-1">(optional)</span>}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full mt-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Close
        </button>
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
    return () => {
      document.removeEventListener("dragover", prevent);
      document.removeEventListener("drop", prevent);
    };
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
        const keyIdx     = header.findIndex(h => ["product key", "key", "productkey"].includes(h));
        const entityIdx  = header.findIndex(h => ["entity", "location"].includes(h));
        const batchIdx   = header.findIndex(h => ["batch id", "lot", "batch"].includes(h));
        const qtyIdx     = header.findIndex(h => ["qty", "quantity", "amount"].includes(h));
        const expiryIdx  = header.findIndex(h => ["expiry date", "expiry", "best before"].includes(h));
        const sourceIdx  = header.findIndex(h => ["source", "origin"].includes(h));

        if (keyIdx === -1) { setParseError('Could not find a "Product Key" column.'); return; }
        if (entityIdx === -1) { setParseError('Could not find an "Entity" column.'); return; }
        if (qtyIdx === -1) { setParseError('Could not find a "Qty" column.'); return; }

        const parsed = rows.slice(1)
          .filter(r => String(r[keyIdx] ?? "").trim() && String(r[entityIdx] ?? "").trim())
          .map((r, i) => ({
            _id: `r_${i}`,
            productKey: String(r[keyIdx] ?? "").trim(),
            entity: String(r[entityIdx] ?? "").trim(),
            batchId: batchIdx >= 0 ? String(r[batchIdx] ?? "").trim() : "",
            qty: qtyIdx >= 0 ? String(r[qtyIdx] ?? "").trim() : "",
            expiryDate: expiryIdx >= 0 ? String(r[expiryIdx] ?? "").trim() : "",
            source: sourceIdx >= 0 ? String(r[sourceIdx] ?? "").trim() : "",
            included: true,
          }));

        if (parsed.length === 0) { setParseError("No valid rows found."); return; }
        setParsedRows(parsed);
        setStep("preview");
      } catch {
        setParseError("Failed to read file. Please ensure it is a valid .xlsx or .xls file.");
      }
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
          updatedAt: serverTimestamp(),
        });
      }
      onClose();
    } catch {
      setImportError("Something went wrong during import. Please try again.");
    } finally {
      setImporting(false);
    }
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
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
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
                  <span className="font-semibold text-gray-700">{parsedRows.length}</span> row{parsedRows.length !== 1 ? "s" : ""} detected.
                  Uncheck rows to exclude, or edit any field before importing.
                </p>
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-3 py-2.5 w-10" />
                        {["Product Key *", "Entity *", "Batch ID", "Qty *", "Expiry Date", "Source"].map(h => (
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
                            { field: "entity", placeholder: "USA" },
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

// ─── Inventory Management ─────────────────────────────────────────────────────
export default function InventoryManagement() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [filterEntity, setFilterEntity] = useState("");
  const [filterProduct, setFilterProduct] = useState("");
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newData, setNewData] = useState({ productKey: "", entity: "", batchId: "", qty: "", expiryDate: "", source: "" });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showFormat, setShowFormat] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "inventory"), orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("order"));
    const unsub = onSnapshot(q, (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.archived));
    }, () => {});
    return unsub;
  }, []);

  const entities = [...new Set(items.map(i => i.entity).filter(Boolean))].sort();
  const productKeys = [...new Set(items.map(i => i.productKey).filter(Boolean))].sort();

  const filtered = items.filter(i =>
    (!filterEntity || i.entity === filterEntity) &&
    (!filterProduct || i.productKey === filterProduct)
  );

  const fmtDate = (ts) => {
    if (!ts) return "—";
    const d = ts.toDate?.();
    if (!d) return "—";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };

  const productName = (key) => {
    const p = products.find(p => p.key === key);
    return p ? p.name : key;
  };

  const toTimestamp = (str) => {
    if (!str) return null;
    const d = new Date(str + "T00:00:00");
    return isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
  };

  const toDateInput = (ts) => {
    if (!ts) return "";
    const d = ts.toDate?.();
    if (!d) return "";
    return d.toISOString().split("T")[0];
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    await updateDoc(doc(db, "inventory", editId), {
      productKey: editData.productKey || "",
      entity: editData.entity || "",
      batchId: editData.batchId || "",
      qty: parseFloat(editData.qty) || 0,
      expiryDate: toTimestamp(editData.expiryDate),
      source: editData.source || "",
      updatedAt: serverTimestamp(),
    });
    setSaving(false);
    setEditId(null);
  };

  const handleAddNew = async () => {
    if (!newData.productKey || !newData.entity) return;
    setSaving(true);
    await addDoc(collection(db, "inventory"), {
      productKey: newData.productKey,
      entity: newData.entity,
      batchId: newData.batchId || "",
      qty: parseFloat(newData.qty) || 0,
      expiryDate: toTimestamp(newData.expiryDate),
      source: newData.source || "",
      updatedAt: serverTimestamp(),
    });
    setSaving(false);
    setAddingNew(false);
    setNewData({ productKey: "", entity: "", batchId: "", qty: "", expiryDate: "", source: "" });
  };

  const startEdit = (item) => {
    setEditId(item.id);
    setEditData({
      productKey: item.productKey || "",
      entity: item.entity || "",
      batchId: item.batchId || "",
      qty: String(item.qty ?? ""),
      expiryDate: toDateInput(item.expiryDate),
      source: item.source || "",
    });
  };

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between mb-4">
        <div className="flex gap-2 flex-wrap">
          <select
            value={filterProduct}
            onChange={e => setFilterProduct(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] bg-white text-gray-700"
          >
            <option value="">All Products</option>
            {productKeys.map(k => <option key={k} value={k}>{productName(k)} ({k})</option>)}
          </select>
          <select
            value={filterEntity}
            onChange={e => setFilterEntity(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] bg-white text-gray-700"
          >
            <option value="">All Entities</option>
            {entities.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowFormat(true)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-[#2D6A2D] hover:bg-gray-100 border border-transparent hover:border-gray-200 transition-colors">
            <HelpCircle className="w-3.5 h-3.5" />Format
          </button>
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#2D6A2D] border border-[#2D6A2D] hover:bg-green-50 transition-colors">
            <Upload className="w-3.5 h-3.5" />Upload from Excel
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#4A9E4A]" /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Product", "Entity", "Batch ID", "Qty (t)", "Expiry Date", "Source", ""].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {/* Add new row */}
              {addingNew && (
                <tr className="bg-green-50">
                  {[
                    <select key="productKey" value={newData.productKey} onChange={e => setNewData(p => ({ ...p, productKey: e.target.value }))} className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#4A9E4A] min-w-[120px]">
                      <option value="">Select product…</option>
                      {products.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
                    </select>,
                    ...["entity", "batchId", "qty", "expiryDate", "source"].map((field) => (
                      <input key={field} type={field === "qty" ? "number" : field === "expiryDate" ? "date" : "text"} value={newData[field]} onChange={e => setNewData(p => ({ ...p, [field]: e.target.value }))} placeholder={field === "entity" ? "USA" : field === "batchId" ? "LOT-001" : field === "qty" ? "0.00" : field === "source" ? "SAP" : ""} className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#4A9E4A] min-w-[80px]" />
                    ))
                  ].map((el, i) => <td key={i} className="px-3 py-2">{el}</td>)}
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button onClick={handleAddNew} disabled={saving || !newData.productKey || !newData.entity} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#2D6A2D] text-white text-xs font-medium disabled:opacity-60">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Save
                      </button>
                      <button onClick={() => setAddingNew(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              )}

              {filtered.length === 0 && !addingNew && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">
                    <Layers className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    No inventory records{filterEntity || filterProduct ? " for this filter" : " yet"}.
                  </td>
                </tr>
              )}

              {filtered.map(item => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  {editId === item.id ? (
                    <>
                      <td className="px-3 py-2">
                        <select value={editData.productKey} onChange={e => setEditData(p => ({ ...p, productKey: e.target.value }))} className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#4A9E4A] min-w-[120px]">
                          {products.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
                        </select>
                      </td>
                      {["entity", "batchId", "qty", "expiryDate", "source"].map(field => (
                        <td key={field} className="px-3 py-2">
                          <input type={field === "qty" ? "number" : field === "expiryDate" ? "date" : "text"} value={editData[field]} onChange={e => setEditData(p => ({ ...p, [field]: e.target.value }))} className="w-full px-2 py-1.5 text-sm rounded-lg border border-[#4A9E4A] focus:outline-none focus:ring-1 focus:ring-[#4A9E4A] min-w-[80px]" />
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button onClick={handleSaveEdit} disabled={saving} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#2D6A2D] text-white text-xs font-medium disabled:opacity-60">
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Save
                          </button>
                          <button onClick={() => setEditId(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-medium text-gray-800">{productName(item.productKey)}<span className="text-xs text-gray-400 ml-1">({item.productKey})</span></td>
                      <td className="px-4 py-3 text-gray-700">{item.entity || "—"}</td>
                      <td className="px-4 py-3 text-gray-500">{item.batchId || "—"}</td>
                      <td className="px-4 py-3 tabular-nums font-semibold text-[#2D6A2D]">{(item.qty ?? 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-gray-500">{fmtDate(item.expiryDate)}</td>
                      <td className="px-4 py-3 text-gray-500">{item.source || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => startEdit(item)} className="p-1.5 rounded-lg text-gray-400 hover:text-[#2D6A2D] hover:bg-green-50 transition-colors" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setDeleteTarget(item)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add button below table */}
      {!addingNew && !loading && (
        <button onClick={() => setAddingNew(true)} className="mt-3 w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-[#4A9E4A] hover:text-[#2D6A2D] text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" />Add Inventory Record
        </button>
      )}

      {deleteTarget && <DeleteInventoryModal item={deleteTarget} onClose={() => setDeleteTarget(null)} />}
      {showUpload && <UploadInventoryModal onClose={() => setShowUpload(false)} />}
      {showFormat && <InventoryFormatModal onClose={() => setShowFormat(false)} />}
    </>
  );
}
