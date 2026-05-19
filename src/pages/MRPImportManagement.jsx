import { useState, useEffect, useRef } from "react";
import {
  collection, query, where, onSnapshot, addDoc,
  doc, serverTimestamp, orderBy, getDocs, writeBatch, deleteDoc
} from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import {
  Upload, X, Loader2, AlertCircle, HelpCircle,
  CheckCircle, FileSpreadsheet, ChevronDown, ChevronRight,
  AlertTriangle, Trash2
} from "lucide-react";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function parsePeriod(val) {
  if (val instanceof Date && !isNaN(val)) {
    return `${MONTHS[val.getMonth()]} ${val.getFullYear()}`;
  }
  if (typeof val === "number" && val > 400 && val < 200000) {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  const s = String(val ?? "").trim();
  const parts = s.split(" ");
  if (parts.length === 2 && MONTHS.includes(parts[0]) && /^\d{4}$/.test(parts[1])) return s;
  const slashM = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (slashM) { const m = +slashM[1] - 1; if (m >= 0 && m < 12) return `${MONTHS[m]} ${slashM[2]}`; }
  const isoM = s.match(/^(\d{4})-(\d{2})$/);
  if (isoM) { const m = +isoM[2] - 1; if (m >= 0 && m < 12) return `${MONTHS[m]} ${isoM[1]}`; }
  const dotM = s.match(/^(\d{1,2})\.(\d{4})$/);
  if (dotM) { const m = +dotM[1] - 1; if (m >= 0 && m < 12) return `${MONTHS[m]} ${dotM[2]}`; }
  return s;
}

function isValidPeriod(s) {
  const p = String(s || "").trim().split(" ");
  return p.length === 2 && MONTHS.includes(p[0]) && /^\d{4}$/.test(p[1]);
}

// ─── Format Info Modal ────────────────────────────────────────────────────────
function MRPFormatModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between p-6 pb-4 shrink-0">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-[#2D6A2D]" />
            <h3 className="font-bold text-gray-900">Expected MRP Excel Format</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6">
        <p className="text-sm text-gray-600 mb-4">
          Row 1 must be the header row. Country and Product Key are required for discrepancy matching against demand planner submissions.
        </p>
        <div className="space-y-3 mb-5">
          {[
            { col: "A", name: "Product Key", required: true, desc: 'Must match a product key in the system (e.g. "product1Tons"). Also accepted: "Key", "ProductKey".' },
            { col: "B", name: "Period", required: true, desc: 'Month as "Month YYYY" (e.g. "May 2026"). Excel date cells are auto-recognized. Also accepted: "Month".' },
            { col: "C", name: "Expected Demand", required: true, desc: 'MRP-expected demand quantity in tons (numeric). Also accepted: "Demand", "Suggested Qty", "Qty", "Quantity", "MRP Qty".' },
            { col: "D", name: "Source Entity", required: false, desc: 'The supplying Ricola entity (e.g. "CH", "Malaysia"). Also accepted: "Entity", "Source".' },
            { col: "E", name: "Country", required: true, desc: 'Destination country — must match the country assigned to the demand planner. Also accepted: "Land".' },
            { col: "F", name: "Desired Inventory Level", required: false, desc: 'Desired inventory level in tons. A desired inventory entry is created when provided. Also accepted: "Inventory Level", "Inventory", "Desired Qty", "Desired Quantity", "Desired".' },
            { col: "G", name: "Current Inventory Level", required: false, desc: 'Current inventory on hand in tons. Used for cross-validation against demand planner submissions. Also accepted: "Current Stock", "Stock", "Current Qty", "Current".' },
          ].map(({ col, name, required, desc }) => (
            <div key={col} className="flex gap-3">
              <div className="w-16 text-xs font-semibold text-gray-400 shrink-0 pt-0.5">Col {col}</div>
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
                  {["Product Key","Period","Expected Demand","Source Entity","Country","Desired Inv. Level","Current Inv. Level"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold text-gray-700">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["product1Tons","May 2026","45.00","CH","Germany","50.00","12.00"],
                  ["product2Tons","May 2026","30.00","Malaysia","USA","","8.50"],
                  ["product1Tons","June 2026","50.00","CH","Germany","55.00",""],
                ].map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    {row.map((cell, j) => (
                      <td key={j} className="px-3 py-2 text-gray-700">
                        {cell || <span className="text-gray-300 italic">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </div>
        <div className="p-6 pt-4 shrink-0 border-t border-gray-100">
          <button onClick={onClose} className="w-full px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Upload MRP Modal ─────────────────────────────────────────────────────────
// Steps: "upload" → "resolve" (unknown countries) → "resolve_products" (unknown product keys) → "preview"
function UploadMRPModal({ onClose, onImported }) {
  const { userProfile } = useAuth();
  const [step, setStep] = useState("upload");
  const [parseError, setParseError] = useState("");
  const [parsedRows, setParsedRows] = useState([]);
  const [label, setLabel] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [showFormat, setShowFormat] = useState(false);

  // Known values for resolution steps
  const [knownCountries, setKnownCountries] = useState([]);
  const [knownProducts, setKnownProducts] = useState([]); // { id, key, name }
  const [countryMappings, setCountryMappings] = useState({}); // { rawCountry → resolvedCountry }
  const [productMappings, setProductMappings] = useState({}); // { rawKey → { action: "new"|"existing", existingKey } }

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

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, "users")),
      getDocs(collection(db, "mrpImports")),
    ]).then(([usersSnap, mrpSnap]) => {
      const fromUsers = usersSnap.docs.map(d => d.data().country).filter(Boolean);
      const fromMrp = mrpSnap.docs.flatMap(d => (d.data().rows || []).map(r => r.country).filter(Boolean));
      setKnownCountries([...new Set([...fromUsers, ...fromMrp])].sort());
    });
    getDocs(collection(db, "products")).then(snap => {
      setKnownProducts(
        snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.archived && !p.hidden)
      );
    });
  }, []);

  const findUnknownProductKeys = (rows) => {
    const unique = [...new Set(rows.map(r => r.productKey).filter(Boolean))];
    return unique.filter(k => !knownProducts.some(p => p.key === k || (p.keyHistory || []).includes(k)));
  };

  const parseFile = (file) => {
    setParseError("");
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (rows.length < 2) { setParseError("File appears empty."); return; }

        const header = rows[0].map(h => String(h).toLowerCase().trim());
        const keyIdx        = header.findIndex(h => ["product key","key","productkey"].includes(h));
        const periodIdx     = header.findIndex(h => ["period","month"].includes(h));
        const qtyIdx        = header.findIndex(h => ["expected demand","demand","suggested qty","qty","quantity","mrp qty"].includes(h));
        const entityIdx     = header.findIndex(h => ["source entity","entity","source"].includes(h));
        const countryIdx      = header.findIndex(h => ["country","land"].includes(h));
        const desiredQtyIdx   = header.findIndex(h => ["desired inventory level","inventory level","inventory","desired qty","desired quantity","desired"].includes(h));
        const currentQtyIdx   = header.findIndex(h => ["current inventory level","current stock","stock","current qty","current"].includes(h));

        if (keyIdx === -1) { setParseError('Could not find a "Product Key" column.'); return; }
        if (periodIdx === -1) { setParseError('Could not find a "Period" column.'); return; }
        if (qtyIdx === -1) { setParseError('Could not find an "Expected Demand" column (also accepted: "Demand", "Suggested Qty").'); return; }

        const parsed = rows.slice(1)
          .filter(r => String(r[keyIdx] ?? "").trim())
          .map((r, i) => ({
            _id: `r_${i}`,
            productKey: String(r[keyIdx] ?? "").trim(),
            period: parsePeriod(periodIdx >= 0 ? r[periodIdx] : ""),
            suggestedQty: String(r[qtyIdx] ?? "").trim(),
            sourceEntity: entityIdx >= 0 ? String(r[entityIdx] ?? "").trim() : "",
            country: countryIdx >= 0 ? String(r[countryIdx] ?? "").trim() : "",
            desiredQty: desiredQtyIdx >= 0 ? String(r[desiredQtyIdx] ?? "").trim() : "",
            currentInventoryQty: currentQtyIdx >= 0 ? String(r[currentQtyIdx] ?? "").trim() : "",
            included: true,
          }))
          .filter(r => r.period);

        if (parsed.length === 0) { setParseError("No valid rows found."); return; }

        // Step 1: resolve unknown countries (case-insensitive check)
        const uniqueCountries = [...new Set(parsed.map(r => r.country).filter(Boolean))];
        const unknownCountries = uniqueCountries.filter(c =>
          !knownCountries.some(k => k.trim().toLowerCase() === c.trim().toLowerCase())
        );
        if (unknownCountries.length > 0) {
          const mappings = {};
          unknownCountries.forEach(c => { mappings[c] = { action: "keep", existingCountry: knownCountries[0] || "" }; });
          setCountryMappings(mappings);
          setParsedRows(parsed);
          setStep("resolve");
          return;
        }

        // Step 2: resolve unknown product keys
        const unknownKeys = findUnknownProductKeys(parsed);
        if (unknownKeys.length > 0) {
          const mappings = {};
          unknownKeys.forEach(k => { mappings[k] = { action: "new", existingKey: knownProducts[0]?.key || "" }; });
          setProductMappings(mappings);
          setParsedRows(parsed);
          setStep("resolve_products");
          return;
        }

        setParsedRows(parsed);
        setStep("preview");
      } catch {
        setParseError("Failed to read file. Please ensure it is a valid .xlsx or .xls file.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Apply country mappings → then check products
  const applyCountryMappings = () => {
    const mapped = parsedRows.map(r => ({
      ...r,
      country: r.country ? (
        countryMappings[r.country]?.action === "existing" && countryMappings[r.country].existingCountry
          ? countryMappings[r.country].existingCountry
          : r.country
      ) : r.country,
    }));
    const unknownKeys = findUnknownProductKeys(mapped);
    if (unknownKeys.length > 0) {
      const mappings = {};
      unknownKeys.forEach(k => { mappings[k] = { action: "new", existingKey: knownProducts[0]?.key || "" }; });
      setProductMappings(mappings);
      setParsedRows(mapped);
      setStep("resolve_products");
    } else {
      setParsedRows(mapped);
      setStep("preview");
    }
  };

  // Apply product mappings ("existing" remaps key, "new" are created on import)
  const applyProductMappings = () => {
    const mapped = parsedRows.map(r => {
      const pm = productMappings[r.productKey];
      if (pm?.action === "existing" && pm.existingKey) {
        return { ...r, productKey: pm.existingKey };
      }
      return r;
    });
    setParsedRows(mapped);
    setStep("preview");
  };

  const updateRow = (id, field, value) =>
    setParsedRows(prev => prev.map(r => r._id === id ? { ...r, [field]: value } : r));

  const includedRows = parsedRows.filter(r => r.included && r.productKey && r.period);
  const missingCountry = includedRows.filter(r => !r.country);
  const invalidPeriods = includedRows.filter(r => !isValidPeriod(r.period));
  const canImport = includedRows.length > 0 && missingCountry.length === 0 && invalidPeriods.length === 0 && label.trim();

  const handleImport = async () => {
    if (!canImport) return;
    setImporting(true);
    setImportError("");
    try {
      // Create new products for keys mapped as "new"
      const newProductKeys = Object.entries(productMappings)
        .filter(([, v]) => v.action === "new")
        .map(([k]) => k);
      if (newProductKeys.length > 0) {
        const allProdSnap = await getDocs(collection(db, "products"));
        const maxOrder = Math.max(0, ...allProdSnap.docs.map(d => d.data().order ?? 0));
        for (let i = 0; i < newProductKeys.length; i++) {
          await addDoc(collection(db, "products"), {
            key: newProductKeys[i],
            name: newProductKeys[i],
            type: "HF",
            order: maxOrder + 1 + i,

            notes: "",
            createdAt: serverTimestamp(),
          });
        }
      }

      const rows = includedRows.map(r => {
        const dq = r.desiredQty !== "" ? parseFloat(r.desiredQty) : null;
        const cq = r.currentInventoryQty !== "" ? parseFloat(r.currentInventoryQty) : null;
        return {
          productKey: r.productKey,
          period: r.period,
          suggestedQty: parseFloat(r.suggestedQty) || 0,
          sourceEntity: r.sourceEntity || "",
          country: r.country || "",
          desiredQty: (dq !== null && !isNaN(dq)) ? dq : null,
          currentInventoryQty: (cq !== null && !isNaN(cq)) ? cq : null,
        };
      });

      const mrpRef = await addDoc(collection(db, "mrpImports"), {
        label: label.trim(),
        importedAt: serverTimestamp(),
        importedBy: userProfile?.username || "Unknown",
        rows,
        isActive: false,
      });

      for (const r of rows) {
        const entity = r.country || r.sourceEntity || "";
        if (r.desiredQty !== null && r.desiredQty > 0) {
          await addDoc(collection(db, "inventory"), {
            productKey: r.productKey, entity,
            batchId: "", qty: r.desiredQty, expiryDate: null,
            source: "mrp", levelType: "desired",
            period: r.period, mrpImportId: mrpRef.id,
            updatedAt: serverTimestamp(),
          });
        }
        // currentInventoryQty is stored in mrpImports.rows for cross-validation only;
        // writing it to inventory would double-count against demand planner submissions.
      }

      onImported?.();
      onClose();
    } catch {
      setImportError("Something went wrong during import. Please try again.");
    } finally {
      setImporting(false);
    }
  };

  const stepTitle = {
    upload: "Import MRP Run from Excel",
    resolve: "Import MRP Run — Resolve Countries",
    resolve_products: "Import MRP Run — Resolve Product Keys",
    preview: "Import MRP Run — Preview",
  }[step] || "Import MRP Run";

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-[#2D6A2D]" />
              <h3 className="font-bold text-gray-800 text-sm">{stepTitle}</h3>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 p-5">

            {/* ── Upload ── */}
            {step === "upload" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Import Label <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    placeholder="e.g. MRP Run Week 18 2026"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] text-sm"
                  />
                </div>
                <p className="text-sm text-gray-500">
                  Upload an Excel file. Country and Product Key are required on every row for discrepancy matching.
                </p>
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
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls"
                    onChange={(e) => { const f = e.target.files[0]; if (f) parseFile(f); e.target.value = ""; }}
                    className="hidden" />
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
            )}

            {/* ── Resolve Countries ── */}
            {step === "resolve" && (
              <div className="space-y-4">
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Unrecognized countries</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Add as a new country (import as-is, demand planners should set their account to match) or assign to an existing country for immediate discrepancy matching.
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  {Object.entries(countryMappings).map(([rawCountry, mapping]) => {
                    const count = parsedRows.filter(r => r.country === rawCountry).length;
                    return (
                      <div key={rawCountry} className="rounded-xl border border-gray-200 p-4 space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-gray-800">{rawCountry}</span>
                          <span className="text-xs text-gray-400">{count} row{count !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                          <button
                            onClick={() => setCountryMappings(prev => ({ ...prev, [rawCountry]: { ...prev[rawCountry], action: "keep" } }))}
                            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mapping.action === "keep" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                          >
                            Add as new country
                          </button>
                          <button
                            onClick={() => setCountryMappings(prev => ({ ...prev, [rawCountry]: { action: "existing", existingCountry: knownCountries[0] || "" } }))}
                            disabled={knownCountries.length === 0}
                            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-40 ${mapping.action === "existing" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                          >
                            Assign to existing
                          </button>
                        </div>
                        {mapping.action === "keep" && (
                          <p className="text-xs text-gray-400">Rows will import with country <span className="font-medium">&quot;{rawCountry}&quot;</span>. Demand planners must set their account country to this exact value for discrepancy detection to work.</p>
                        )}
                        {mapping.action === "existing" && (
                          <select
                            value={mapping.existingCountry}
                            onChange={e => setCountryMappings(prev => ({ ...prev, [rawCountry]: { ...prev[rawCountry], existingCountry: e.target.value } }))}
                            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-[#4A9E4A]"
                          >
                            {knownCountries.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Resolve Product Keys ── */}
            {step === "resolve_products" && (
              <div className="space-y-4">
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Unrecognized product keys</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      These product keys don&apos;t exist in the system. Add them as new products (a minimal entry will be created) or assign each to an existing product for matching.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {Object.entries(productMappings).map(([rawKey, mapping]) => {
                    const count = parsedRows.filter(r => r.productKey === rawKey).length;
                    return (
                      <div key={rawKey} className="rounded-xl border border-gray-200 p-4 space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm font-semibold text-gray-800">{rawKey}</span>
                          <span className="text-xs text-gray-400">{count} row{count !== 1 ? "s" : ""}</span>
                        </div>

                        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                          <button
                            onClick={() => setProductMappings(prev => ({ ...prev, [rawKey]: { ...prev[rawKey], action: "new" } }))}
                            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mapping.action === "new" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                          >
                            Add as new product
                          </button>
                          <button
                            onClick={() => setProductMappings(prev => ({ ...prev, [rawKey]: { action: "existing", existingKey: knownProducts[0]?.key || "" } }))}
                            disabled={knownProducts.length === 0}
                            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-40 ${mapping.action === "existing" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                          >
                            Assign to existing
                          </button>
                        </div>

                        {mapping.action === "new" && (
                          <p className="text-xs text-gray-400">A new product with key <span className="font-mono">{rawKey}</span> will be created automatically on import. You can edit its name and details in the Products tab afterwards.</p>
                        )}

                        {mapping.action === "existing" && (
                          <select
                            value={mapping.existingKey}
                            onChange={e => setProductMappings(prev => ({ ...prev, [rawKey]: { ...prev[rawKey], existingKey: e.target.value } }))}
                            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-[#4A9E4A]"
                          >
                            {knownProducts.map(p => (
                              <option key={p.key} value={p.key}>{p.name} ({p.key})</option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Preview ── */}
            {step === "preview" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <FileSpreadsheet className="w-4 h-4 text-blue-500 shrink-0" />
                  <p className="text-sm text-blue-700">
                    <span className="font-semibold">{includedRows.length}</span> row{includedRows.length !== 1 ? "s" : ""} will be imported under label <span className="font-semibold">&quot;{label}&quot;</span>.
                  </p>
                </div>

                {missingCountry.length > 0 && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">
                      <span className="font-semibold">{missingCountry.length}</span> row{missingCountry.length !== 1 ? "s are" : " is"} missing a Country (highlighted). Fill in or uncheck to continue.
                    </p>
                  </div>
                )}
                {invalidPeriods.length > 0 && (
                  <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-orange-700">
                      <span className="font-semibold">{invalidPeriods.length}</span> row{invalidPeriods.length !== 1 ? "s have" : " has"} an unrecognized period. Expected &quot;Month YYYY&quot; e.g. &quot;May 2026&quot;.
                    </p>
                  </div>
                )}

                <datalist id="mrp-country-list">
                  {knownCountries.map(c => <option key={c} value={c} />)}
                </datalist>

                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-3 py-2.5 w-10" />
                        {["Product Key *","Period *","Expected Demand *","Source Entity","Country *","Desired Inv. Level","Current Inv. Level"].map(h => (
                          <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {parsedRows.map(r => {
                        const missingC = r.included && !r.country;
                        const badPeriod = r.included && !isValidPeriod(r.period);
                        return (
                          <tr key={r._id} className={r.included ? "" : "opacity-40"}>
                            <td className="px-3 py-2 text-center">
                              <input type="checkbox" checked={r.included} onChange={e => updateRow(r._id, "included", e.target.checked)} className="accent-[#2D6A2D] w-4 h-4 cursor-pointer" />
                            </td>
                            <td className="px-3 py-2">
                              <input type="text" value={r.productKey} onChange={e => updateRow(r._id, "productKey", e.target.value)} className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#4A9E4A] min-w-[100px]" />
                            </td>
                            <td className="px-3 py-2">
                              <input type="text" value={r.period} onChange={e => updateRow(r._id, "period", e.target.value)}
                                className={`w-full px-2 py-1.5 text-sm rounded-lg border focus:outline-none focus:ring-1 focus:ring-[#4A9E4A] min-w-[100px] ${badPeriod ? "border-orange-400 bg-orange-50" : "border-gray-200"}`} />
                            </td>
                            <td className="px-3 py-2">
                              <input type="text" value={r.suggestedQty} onChange={e => updateRow(r._id, "suggestedQty", e.target.value)} className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#4A9E4A] min-w-[70px]" />
                            </td>
                            <td className="px-3 py-2">
                              <input type="text" value={r.sourceEntity} onChange={e => updateRow(r._id, "sourceEntity", e.target.value)} className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#4A9E4A] min-w-[60px]" />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                list="mrp-country-list"
                                value={r.country}
                                onChange={e => updateRow(r._id, "country", e.target.value)}
                                className={`w-full px-2 py-1.5 text-sm rounded-lg border focus:outline-none focus:ring-1 focus:ring-[#4A9E4A] min-w-[90px] ${missingC ? "border-red-400 bg-red-50" : "border-gray-200"}`}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input type="text" value={r.desiredQty} onChange={e => updateRow(r._id, "desiredQty", e.target.value)} className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#4A9E4A] min-w-[70px]" />
                            </td>
                            <td className="px-3 py-2">
                              <input type="text" value={r.currentInventoryQty ?? ""} onChange={e => updateRow(r._id, "currentInventoryQty", e.target.value)} className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#4A9E4A] min-w-[70px]" />
                            </td>
                          </tr>
                        );
                      })}
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

          {/* Footer */}
          <div className="p-5 border-t border-gray-100 shrink-0 flex gap-3">
            {step === "upload" && (
              <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">Cancel</button>
            )}
            {step === "resolve" && (
              <>
                <button onClick={() => setStep("upload")} className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">← Back</button>
                <button onClick={applyCountryMappings} className="flex-1 px-4 py-2 rounded-xl bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white text-sm font-semibold transition-colors">
                  Continue →
                </button>
              </>
            )}
            {step === "resolve_products" && (
              <>
                <button onClick={() => setStep("upload")} className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">← Back</button>
                <button
                  onClick={applyProductMappings}
                  disabled={Object.entries(productMappings).some(([, v]) => v.action === "existing" && !v.existingKey)}
                  className="flex-1 px-4 py-2 rounded-xl bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  Continue to Preview →
                </button>
              </>
            )}
            {step === "preview" && (
              <>
                <button onClick={() => setStep("upload")} disabled={importing} className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-60">← Back</button>
                <button
                  onClick={handleImport}
                  disabled={importing || !canImport}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                  {importing ? "Importing…" : `Import ${includedRows.length} Row${includedRows.length !== 1 ? "s" : ""}`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      {showFormat && <MRPFormatModal onClose={() => setShowFormat(false)} />}
    </>
  );
}

// ─── Activation Validation Modal ──────────────────────────────────────────────
function ActivationValidationModal({ imp, imports, onClose, onActivated }) {
  const [loading, setLoading] = useState(true);
  const [knownProducts, setKnownProducts] = useState([]);
  const [knownCountries, setKnownCountries] = useState([]);
  const [unknownKeys, setUnknownKeys] = useState([]);
  const [unmatchedCountries, setUnmatchedCountries] = useState([]);
  const [productMappings, setProductMappings] = useState({});
  const [countryMappings, setCountryMappings] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const [prodSnap, usersSnap, mrpSnap] = await Promise.all([
        getDocs(collection(db, "products")),
        getDocs(query(collection(db, "users"), where("isApproved", "==", true))),
        getDocs(collection(db, "mrpImports")),
      ]);
      const products = prodSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.archived && !p.hidden);
      const fromUsers = usersSnap.docs.map(d => d.data().country).filter(Boolean);
      // countries from other imports (not this one) form the "existing" pool
      const fromMrp = mrpSnap.docs
        .filter(d => d.id !== imp.id)
        .flatMap(d => (d.data().rows || []).map(r => r.country).filter(Boolean));
      const availableCountries = [...new Set([...fromUsers, ...fromMrp])].sort();
      setKnownProducts(products);
      setKnownCountries(availableCountries);

      const rows = imp.rows || [];
      const uniqueKeys = [...new Set(rows.map(r => r.productKey).filter(Boolean))];
      const ukKeys = uniqueKeys.filter(k => !products.some(p => p.key === k || (p.keyHistory || []).includes(k)));

      // A country is "recognized" if an approved user has it (case-insensitive) — only user countries matter for discrepancy matching
      const userCountriesLower = fromUsers.map(c => c.trim().toLowerCase());
      const uniqueCountries = [...new Set(rows.map(r => r.country).filter(Boolean))];
      const ukCountries = uniqueCountries.filter(c =>
        !userCountriesLower.includes(c.trim().toLowerCase())
      );

      setUnknownKeys(ukKeys);
      setUnmatchedCountries(ukCountries);

      const pMap = {};
      ukKeys.forEach(k => { pMap[k] = { action: "new", existingKey: products[0]?.key || "" }; });
      setProductMappings(pMap);

      const cMap = {};
      ukCountries.forEach(c => { cMap[c] = { action: "keep", existingCountry: availableCountries[0] || "" }; });
      setCountryMappings(cMap);

      setLoading(false);
    };
    load().catch(e => { console.error(e); setLoading(false); });
  }, [imp]);

  const allGood = !loading && unknownKeys.length === 0 && unmatchedCountries.length === 0;

  const canConfirm = !saving && !loading && (
    allGood ||
    Object.entries(productMappings).every(([, v]) => v.action === "new" || (v.action === "existing" && v.existingKey))
  );

  const handleConfirm = async () => {
    setSaving(true);
    setError("");
    try {
      const newKeys = Object.entries(productMappings)
        .filter(([, v]) => v.action === "new")
        .map(([k]) => k);

      if (newKeys.length > 0) {
        const allProdSnap = await getDocs(collection(db, "products"));
        const maxOrder = Math.max(0, ...allProdSnap.docs.map(d => d.data().order ?? 0));
        for (let i = 0; i < newKeys.length; i++) {
          await addDoc(collection(db, "products"), {
            key: newKeys[i],
            name: newKeys[i],
            type: "HF",
            order: maxOrder + 1 + i,

            notes: "",
            createdAt: serverTimestamp(),
          });
        }
      }

      const remappedRows = (imp.rows || []).map(r => {
        let productKey = r.productKey;
        const pm = productMappings[productKey];
        if (pm?.action === "existing" && pm.existingKey) productKey = pm.existingKey;

        let country = r.country;
        const cm = countryMappings[country];
        if (cm?.action === "existing" && cm.existingCountry) country = cm.existingCountry;

        return { ...r, productKey, country };
      });

      const batch = writeBatch(db);
      imports.forEach(i => batch.update(doc(db, "mrpImports", i.id), { isActive: false }));
      batch.update(doc(db, "mrpImports", imp.id), { isActive: true, rows: remappedRows });
      await batch.commit();

      onActivated();
    } catch (e) {
      console.error(e);
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-[#2D6A2D]" />
            <h3 className="font-bold text-gray-800 text-sm">Activate &quot;{imp.label}&quot;</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {loading && (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#4A9E4A]" /></div>
          )}

          {!loading && allGood && (
            <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
              <CheckCircle className="w-5 h-5 text-[#2D6A2D] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-[#2D6A2D]">All product keys and countries match</p>
                <p className="text-xs text-green-700 mt-0.5">Every row maps to an existing product and a registered country. Ready to activate.</p>
              </div>
            </div>
          )}

          {!loading && unmatchedCountries.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Unrecognized countries</p>
                  <p className="text-xs text-amber-700 mt-0.5">No approved user has this country set. Add as new (demand planners should update their account to match) or assign to an existing country.</p>
                </div>
              </div>
              <div className="space-y-3">
                {unmatchedCountries.map(rawCountry => {
                  const mapping = countryMappings[rawCountry] || { action: "keep", existingCountry: knownCountries[0] || "" };
                  const count = (imp.rows || []).filter(r => r.country === rawCountry).length;
                  return (
                    <div key={rawCountry} className="rounded-xl border border-gray-200 p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-gray-800">{rawCountry}</span>
                        <span className="text-xs text-gray-400">{count} row{count !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                        <button
                          onClick={() => setCountryMappings(prev => ({ ...prev, [rawCountry]: { ...prev[rawCountry], action: "keep" } }))}
                          className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mapping.action === "keep" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                        >
                          Add as new country
                        </button>
                        <button
                          onClick={() => setCountryMappings(prev => ({ ...prev, [rawCountry]: { action: "existing", existingCountry: knownCountries[0] || "" } }))}
                          disabled={knownCountries.length === 0}
                          className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-40 ${mapping.action === "existing" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                        >
                          Assign to existing
                        </button>
                      </div>
                      {mapping.action === "keep" && (
                        <p className="text-xs text-gray-400">Rows keep country <span className="font-medium">&quot;{rawCountry}&quot;</span>. Demand planners must set their account country to this exact value for discrepancy detection to work.</p>
                      )}
                      {mapping.action === "existing" && (
                        <select
                          value={mapping.existingCountry}
                          onChange={e => setCountryMappings(prev => ({ ...prev, [rawCountry]: { ...prev[rawCountry], existingCountry: e.target.value } }))}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-[#4A9E4A]"
                        >
                          {knownCountries.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!loading && unknownKeys.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Unrecognized product keys</p>
                  <p className="text-xs text-amber-700 mt-0.5">Add as new products or assign each to an existing product for matching.</p>
                </div>
              </div>
              <div className="space-y-3">
                {unknownKeys.map(rawKey => {
                  const mapping = productMappings[rawKey] || { action: "new", existingKey: knownProducts[0]?.key || "" };
                  const count = (imp.rows || []).filter(r => r.productKey === rawKey).length;
                  return (
                    <div key={rawKey} className="rounded-xl border border-gray-200 p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-semibold text-gray-800">{rawKey}</span>
                        <span className="text-xs text-gray-400">{count} row{count !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                        <button
                          onClick={() => setProductMappings(prev => ({ ...prev, [rawKey]: { ...prev[rawKey], action: "new" } }))}
                          className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mapping.action === "new" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                        >
                          Add as new product
                        </button>
                        <button
                          onClick={() => setProductMappings(prev => ({ ...prev, [rawKey]: { action: "existing", existingKey: knownProducts[0]?.key || "" } }))}
                          disabled={knownProducts.length === 0}
                          className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-40 ${mapping.action === "existing" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                        >
                          Assign to existing
                        </button>
                      </div>
                      {mapping.action === "new" && (
                        <p className="text-xs text-gray-400">A new product with key <span className="font-mono">{rawKey}</span> will be created. Edit its details in the Products tab afterwards.</p>
                      )}
                      {mapping.action === "existing" && (
                        <select
                          value={mapping.existingKey}
                          onChange={e => setProductMappings(prev => ({ ...prev, [rawKey]: { ...prev[rawKey], existingKey: e.target.value } }))}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-[#4A9E4A]"
                        >
                          {knownProducts.map(p => (
                            <option key={p.key} value={p.key}>{p.name} ({p.key})</option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-gray-100 shrink-0 flex gap-3">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-60">Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Activating…" : "Confirm & Activate"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────
function DeleteImportModal({ imp, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "mrpImports", imp.id));
      onDeleted();
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <Trash2 className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-sm">Delete MRP Import?</h3>
            <p className="text-xs text-gray-500 mt-0.5">&quot;{imp.label}&quot;</p>
          </div>
        </div>
        {imp.isActive && (
          <div className="flex items-start gap-2 p-3 mb-4 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">This is the currently active import. Deleting it will disable discrepancy detection until another import is activated.</p>
          </div>
        )}
        <p className="text-sm text-gray-600 mb-5">
          Permanently removes this import and its {imp.rows?.length ?? 0} row{imp.rows?.length !== 1 ? "s" : ""}. Inventory records created by this import are not affected.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={deleting} className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-60">Cancel</button>
          <button onClick={handleDelete} disabled={deleting} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-60">
            {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MRP Import Management ─────────────────────────────────────────────────────
export default function MRPImportManagement() {
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [validationTarget, setValidationTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "mrpImports"), orderBy("importedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setImports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  const handleActivate = (imp) => setValidationTarget(imp);

  const fmtDateTime = (ts) => {
    if (!ts) return "—";
    const d = ts.toDate?.();
    if (!d) return "—";
    return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-400">
          Manage MRP run imports. Activate one to compare expected demand against demand planner submissions and detect discrepancies.
        </p>
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
          <p className="text-gray-400 text-sm">No MRP imports yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {imports.map(imp => (
            <div key={imp.id} className={`rounded-xl border ${imp.isActive ? "border-[#2D6A2D] bg-green-50" : "border-gray-200 bg-white"} overflow-hidden`}>
              <div className="flex items-center gap-4 px-4 py-3">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${imp.isActive ? "bg-[#2D6A2D]" : "bg-gray-300"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-800">{imp.label}</span>
                    {imp.isActive && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#2D6A2D] text-white">Active</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {imp.rows?.length ?? 0} rows · {fmtDateTime(imp.importedAt)} · {imp.importedBy}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!imp.isActive && (
                    <button onClick={() => handleActivate(imp)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#2D6A2D] border border-[#2D6A2D] hover:bg-green-50 transition-colors">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Set Active
                    </button>
                  )}
                  <button onClick={() => setDeleteTarget(imp)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 transition-colors" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setExpandedId(expandedId === imp.id ? null : imp.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 transition-colors" title="Show rows">
                    {expandedId === imp.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {expandedId === imp.id && imp.rows?.length > 0 && (
                <div className="border-t border-gray-100 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {["Product Key","Period","Expected Demand (t)","Source Entity","Country","Desired Inv. Level (t)"].map(h => (
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
                          <td className="px-4 py-2 text-gray-500">{row.country || <span className="text-red-400 italic">missing</span>}</td>
                          <td className="px-4 py-2 tabular-nums text-gray-500">{row.desiredQty != null ? Number(row.desiredQty).toFixed(2) : "—"}</td>
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
      {validationTarget && (
        <ActivationValidationModal
          imp={validationTarget}
          imports={imports}
          onClose={() => setValidationTarget(null)}
          onActivated={() => setValidationTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteImportModal imp={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={() => setDeleteTarget(null)} />
      )}
    </>
  );
}
