import { useState, useEffect, useRef } from "react";
import {
  collection, query, onSnapshot, addDoc, updateDoc,
  doc, serverTimestamp, orderBy, getDocs, writeBatch
} from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import {
  Upload, X, Loader2, AlertCircle, HelpCircle,
  CheckCircle, Radio, FileSpreadsheet, Plus, ChevronDown, ChevronRight
} from "lucide-react";

// ─── Format Info Modal ────────────────────────────────────────────────────────
function MRPFormatModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-[#2D6A2D]" />
            <h3 className="font-bold text-gray-900">Expected MRP Excel Format</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Row 1 must be the header row. Each row represents one MRP suggestion for a specific product and period.
        </p>

        <div className="space-y-3 mb-5">
          {[
            { col: "Column A", name: "Product Key", required: true, desc: 'The product key (e.g. "product1Tons"). Also accepted: "Key", "ProductKey".' },
            { col: "Column B", name: "Period", required: true, desc: 'Month as "Month YYYY" (e.g. "May 2026"). Also accepted: "Month".' },
            { col: "Column C", name: "Suggested Qty", required: true, desc: 'MRP-suggested quantity in tons (numeric). Also accepted: "Qty", "Quantity", "MRP Qty".' },
            { col: "Column D", name: "Source Entity", required: false, desc: 'The supplying Ricola entity (e.g. "CH", "Malaysia"). Also accepted: "Entity", "Source".' },
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

        <div className="rounded-xl border border-gray-200 overflow-hidden mb-5">
          <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Example</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-yellow-50">
                  {["Product Key", "Period", "Suggested Qty", "Source Entity"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold text-gray-700">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["product1Tons", "May 2026", "45.00", "CH"],
                  ["product2Tons", "May 2026", "30.00", "Malaysia"],
                  ["product1Tons", "June 2026", "50.00", "CH"],
                ].map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    {row.map((cell, j) => <td key={j} className="px-3 py-2 text-gray-700">{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <button onClick={onClose} className="w-full px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">Close</button>
      </div>
    </div>
  );
}

// ─── Upload MRP Modal ─────────────────────────────────────────────────────────
function UploadMRPModal({ onClose, onImported }) {
  const { userProfile } = useAuth();
  const [step, setStep] = useState("upload");
  const [parseError, setParseError] = useState("");
  const [parsedRows, setParsedRows] = useState([]);
  const [label, setLabel] = useState("");
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
        if (rows.length < 2) { setParseError("File appears empty."); return; }

        const header = rows[0].map(h => String(h).toLowerCase().trim());
        const keyIdx    = header.findIndex(h => ["product key", "key", "productkey"].includes(h));
        const periodIdx = header.findIndex(h => ["period", "month"].includes(h));
        const qtyIdx    = header.findIndex(h => ["suggested qty", "qty", "quantity", "mrp qty"].includes(h));
        const entityIdx = header.findIndex(h => ["source entity", "entity", "source"].includes(h));

        if (keyIdx === -1) { setParseError('Could not find a "Product Key" column.'); return; }
        if (periodIdx === -1) { setParseError('Could not find a "Period" column.'); return; }
        if (qtyIdx === -1) { setParseError('Could not find a "Suggested Qty" column.'); return; }

        const parsed = rows.slice(1)
          .filter(r => String(r[keyIdx] ?? "").trim() && String(r[periodIdx] ?? "").trim())
          .map((r, i) => ({
            _id: `r_${i}`,
            productKey: String(r[keyIdx] ?? "").trim(),
            period: String(r[periodIdx] ?? "").trim(),
            suggestedQty: String(r[qtyIdx] ?? "").trim(),
            sourceEntity: entityIdx >= 0 ? String(r[entityIdx] ?? "").trim() : "",
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

  const selectedCount = parsedRows.filter(r => r.included && r.productKey && r.period).length;

  const handleImport = async () => {
    if (selectedCount === 0 || !label.trim()) return;
    setImporting(true);
    setImportError("");
    try {
      const rows = parsedRows
        .filter(r => r.included && r.productKey && r.period)
        .map(r => ({
          productKey: r.productKey,
          period: r.period,
          suggestedQty: parseFloat(r.suggestedQty) || 0,
          sourceEntity: r.sourceEntity || "",
        }));

      await addDoc(collection(db, "mrpImports"), {
        label: label.trim(),
        importedAt: serverTimestamp(),
        importedBy: userProfile?.username || "Unknown",
        rows,
        isActive: false,
      });
      onImported?.();
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
                {step === "upload" ? "Import MRP Run from Excel" : "Import MRP Run — Preview"}
              </h3>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>

          <div className="overflow-y-auto flex-1 p-5">
            {step === "upload" ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Import Label <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    placeholder="e.g. MRP Run Week 18 2026"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] text-sm"
                  />
                </div>
                <p className="text-sm text-gray-500">Upload an Excel file (.xlsx or .xls) with the MRP output.</p>
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
                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <FileSpreadsheet className="w-4 h-4 text-blue-500 shrink-0" />
                  <p className="text-sm text-blue-700">
                    <span className="font-semibold">{selectedCount}</span> row{selectedCount !== 1 ? "s" : ""} will be imported under label <span className="font-semibold">"{label}"</span>.
                  </p>
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-3 py-2.5 w-10" />
                        {["Product Key *", "Period *", "Suggested Qty *", "Source Entity"].map(h => (
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
                            { field: "period", placeholder: "May 2026" },
                            { field: "suggestedQty", placeholder: "0.00" },
                            { field: "sourceEntity", placeholder: "CH" },
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
                <button onClick={() => { setStep("upload"); setParseError(""); }} disabled={importing} className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-60">← Back</button>
                <button
                  onClick={handleImport}
                  disabled={importing || selectedCount === 0 || !label.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                  {importing ? "Importing…" : `Import ${selectedCount} Row${selectedCount !== 1 ? "s" : ""}`}
                </button>
              </>
            ) : (
              <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">Cancel</button>
            )}
          </div>
        </div>
      </div>
      {showFormat && <MRPFormatModal onClose={() => setShowFormat(false)} />}
    </>
  );
}

// ─── MRP Import Management ─────────────────────────────────────────────────────
export default function MRPImportManagement() {
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [activating, setActivating] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "mrpImports"), orderBy("importedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setImports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  const handleActivate = async (imp) => {
    setActivating(imp.id);
    try {
      const batch = writeBatch(db);
      // Deactivate all
      imports.forEach(i => {
        batch.update(doc(db, "mrpImports", i.id), { isActive: false });
      });
      // Activate the selected one
      batch.update(doc(db, "mrpImports", imp.id), { isActive: true });
      await batch.commit();
    } finally {
      setActivating(null);
    }
  };

  const fmtDateTime = (ts) => {
    if (!ts) return "—";
    const d = ts.toDate?.();
    if (!d) return "—";
    return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-400">Manage MRP run imports. Activate one to use it in the HF Planner cockpit.</p>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#2D6A2D] border border-[#2D6A2D] hover:bg-green-50 transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />Import MRP Run
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#4A9E4A]" /></div>
      ) : imports.length === 0 ? (
        <div className="text-center py-12">
          <FileSpreadsheet className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          <p className="text-gray-400 text-sm">No MRP imports yet. Upload your first MRP run to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {imports.map(imp => (
            <div key={imp.id} className={`rounded-xl border ${imp.isActive ? "border-[#2D6A2D] bg-green-50" : "border-gray-200 bg-white"} overflow-hidden`}>
              <div className="flex items-center gap-4 px-4 py-3">
                {/* Active indicator */}
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${imp.isActive ? "bg-[#2D6A2D]" : "bg-gray-300"}`} title={imp.isActive ? "Active" : "Inactive"} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-800">{imp.label}</span>
                    {imp.isActive && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#2D6A2D] text-white">Active</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {imp.rows?.length ?? 0} row{imp.rows?.length !== 1 ? "s" : ""} · Imported {fmtDateTime(imp.importedAt)} by {imp.importedBy}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!imp.isActive && (
                    <button
                      onClick={() => handleActivate(imp)}
                      disabled={!!activating}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#2D6A2D] border border-[#2D6A2D] hover:bg-green-50 disabled:opacity-60 transition-colors"
                    >
                      {activating === imp.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      Set Active
                    </button>
                  )}
                  <button
                    onClick={() => setExpandedId(expandedId === imp.id ? null : imp.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                    title="Show rows"
                  >
                    {expandedId === imp.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {expandedId === imp.id && imp.rows?.length > 0 && (
                <div className="border-t border-gray-100 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {["Product Key", "Period", "Suggested Qty (t)", "Source Entity"].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {imp.rows.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-700 font-mono">{row.productKey}</td>
                          <td className="px-4 py-2 text-gray-700">{row.period}</td>
                          <td className="px-4 py-2 tabular-nums font-semibold text-[#2D6A2D]">{(row.suggestedQty ?? 0).toFixed(2)}</td>
                          <td className="px-4 py-2 text-gray-500">{row.sourceEntity || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showUpload && <UploadMRPModal onClose={() => setShowUpload(false)} onImported={() => {}} />}
    </>
  );
}
