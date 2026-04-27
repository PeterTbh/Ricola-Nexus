import { useState, useEffect, useRef, Fragment } from "react";
import {
  collection, query, where, doc, updateDoc,
  deleteDoc, onSnapshot, orderBy, getDocs, serverTimestamp,
  addDoc, writeBatch
} from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import * as XLSX from "xlsx";
import { db } from "../firebase";
import Layout from "../components/Layout";
import InventoryManagement from "./InventoryManagement";
import MRPImportManagement from "./MRPImportManagement";
import {
  Users, CheckCircle, BarChart3, Package,
  Loader2, UserCheck, UserX,
  AlertCircle, Shield, Activity, Download,
  Trash2, X, Archive, History, BarChart2, Table,
  ChevronRight, Info, Plus, Pencil, Save, MessageSquare,
  Upload, HelpCircle, Layers, FileSpreadsheet, AlertTriangle, Send, CheckCircle2,
  ShoppingCart, Truck, ChevronDown, Bell
} from "lucide-react";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function currentMonthStr() {
  const d = new Date();
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function parseMonthToDate(monthStr) {
  try {
    const [name, year] = monthStr.split(" ");
    return new Date(Number(year), MONTHS.indexOf(name), 1);
  } catch {
    return new Date(0);
  }
}

function shortMonthLabel(monthStr) {
  const [name, year] = monthStr.split(" ");
  return `${name.slice(0, 3)} '${year.slice(2)}`;
}

const ALL_COLORS = ["#F5C500", "#2D6A2D", "#4A9E4A", "#1e6091", "#a8440c", "#6b21a8"];

const CARD_STYLES = [
  { cardColor: "bg-yellow-50 border-yellow-200", text: "text-yellow-700", accent: "bg-yellow-100" },
  { cardColor: "bg-green-50 border-green-200", text: "text-green-700", accent: "bg-green-100" },
  { cardColor: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", accent: "bg-emerald-100" },
  { cardColor: "bg-blue-50 border-blue-200", text: "text-blue-700", accent: "bg-blue-100" },
  { cardColor: "bg-orange-50 border-orange-200", text: "text-orange-700", accent: "bg-orange-100" },
  { cardColor: "bg-purple-50 border-purple-200", text: "text-purple-700", accent: "bg-purple-100" },
];

// ─── Bar Chart ─────────────────────────────────────────────────────────────────
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
                    className="flex-1 rounded-t-sm"
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

// ─── Delete Account Modal ──────────────────────────────────────────────────────
function DeleteAccountModal({ account, onClose, onDeleted }) {
  const [action, setAction] = useState("archive");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    setLoading(true);
    setError("");
    try {
      const q = query(collection(db, "demands"), where("userId", "==", account.id));
      const snap = await getDocs(q);

      if (action === "archive") {
        for (const d of snap.docs) {
          await updateDoc(doc(db, "demands", d.id), {
            archived: true,
            archivedAt: serverTimestamp(),
            archivedUsername: account.username,
          });
        }
      } else {
        for (const d of snap.docs) {
          await deleteDoc(doc(db, "demands", d.id));
        }
      }

      await deleteDoc(doc(db, "users", account.id));
      onDeleted?.();
      onClose();
    } catch (err) {
      setError("Something went wrong. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Delete Account</h3>
              <p className="text-sm text-gray-500">{account.username} · {account.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-5">
          This removes <span className="font-semibold">{account.username}</span>&apos;s account.
          What should happen to their order history?
        </p>

        <div className="space-y-3 mb-5">
          <label
            className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
              action === "archive"
                ? "border-[#2D6A2D] bg-green-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <input
              type="radio"
              name="historyAction"
              value="archive"
              checked={action === "archive"}
              onChange={() => setAction("archive")}
              className="mt-0.5 accent-[#2D6A2D]"
            />
            <div>
              <p className="font-semibold text-sm text-gray-800 flex items-center gap-1.5">
                <Archive className="w-3.5 h-3.5 text-[#2D6A2D]" />
                Keep in archive
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Order history is preserved in a hidden archive, accessible only to administrators.
              </p>
            </div>
          </label>

          <label
            className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
              action === "delete"
                ? "border-red-400 bg-red-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <input
              type="radio"
              name="historyAction"
              value="delete"
              checked={action === "delete"}
              onChange={() => setAction("delete")}
              className="mt-0.5 accent-red-600"
            />
            <div>
              <p className="font-semibold text-sm text-gray-800 flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                Delete permanently
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                All order history is erased. This cannot be undone.
              </p>
            </div>
          </label>
        </div>

        {error && (
          <p className="text-xs text-red-500 mb-4 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 ${
              action === "delete"
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white"
            }`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {action === "delete" ? "Delete Everything" : "Archive & Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Archived Records Modal ────────────────────────────────────────────────────
function ArchivedRecordsModal({ onClose }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "demands"), where("archived", "==", true));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => {
          try {
            return parseMonthToDate(a.month) - parseMonthToDate(b.month);
          } catch { return 0; }
        });
        setRecords(data);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsubscribe;
  }, []);

  const grouped = records.reduce((acc, r) => {
    const key = r.archivedUsername || r.username || "Unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Archive className="w-4 h-4 text-gray-400" />
            <h3 className="font-bold text-gray-800 text-sm">Archived Records</h3>
            <span className="text-xs text-gray-400 font-normal">— deleted account history</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="text-center py-10">
              <Archive className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No archived records.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([username, entries]) => (
                <div key={username}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                      <span className="text-gray-500 font-bold text-xs">{username.charAt(0).toUpperCase()}</span>
                    </div>
                    <span className="font-semibold text-sm text-gray-700">{username}</span>
                    <span className="text-xs text-gray-400">({entries.length} record{entries.length !== 1 ? "s" : ""})</span>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wider">Month</th>
                          <th className="text-right px-3 py-2 text-gray-500 font-semibold uppercase tracking-wider">P1 (t)</th>
                          <th className="text-right px-3 py-2 text-gray-500 font-semibold uppercase tracking-wider">P2 (t)</th>
                          <th className="text-right px-3 py-2 text-gray-500 font-semibold uppercase tracking-wider">P3 (t)</th>
                          <th className="text-right px-3 py-2 text-gray-500 font-semibold uppercase tracking-wider">Total (t)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {entries.map(d => {
                          const total = (Number(d.product1Tons) || 0) + (Number(d.product2Tons) || 0) + (Number(d.product3Tons) || 0);
                          return (
                            <tr key={d.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-700">{d.month}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-600">{Number(d.product1Tons).toFixed(2)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-600">{Number(d.product2Tons).toFixed(2)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-600">{Number(d.product3Tons).toFixed(2)}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-700">{total.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Product Info Modal ────────────────────────────────────────────────────────
function ProductInfoModal({ product, onClose }) {
  const [productId, setProductId] = useState(product.productId || "");
  const [notes, setNotes] = useState(product.notes || "");
  const [type, setType] = useState(product.type || "HF");
  const [shelfLifeMonths, setShelfLifeMonths] = useState(product.shelfLifeMonths != null ? String(product.shelfLifeMonths) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shelfError, setShelfError] = useState("");

  const handleSave = async () => {
    const slm = shelfLifeMonths !== "" ? parseFloat(shelfLifeMonths) : null;
    if (slm === null || isNaN(slm) || slm <= 0) {
      setShelfError("Shelf life is required and must be a positive number.");
      return;
    }
    setShelfError("");
    setSaving(true);
    await updateDoc(doc(db, "products", product.id), {
      productId: productId.trim(),
      notes: notes.trim(),
      type,
      shelfLifeMonths: slm,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

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
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Delivery Type
            </label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] focus:border-transparent transition text-sm bg-white"
            >
              <option value="HF">HF — Halbfabrikat (internal)</option>
              <option value="FG">FG — Finished Good (external)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Product-ID
            </label>
            <input
              type="text"
              value={productId}
              onChange={e => setProductId(e.target.value)}
              placeholder="e.g. SKU-001"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] focus:border-transparent transition text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Shelf Life (months) <span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={shelfLifeMonths}
              onChange={e => { setShelfLifeMonths(e.target.value); setShelfError(""); }}
              placeholder="e.g. 24"
              className={`w-full px-3 py-2.5 rounded-xl border text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] focus:border-transparent transition text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${shelfError ? "border-red-400 bg-red-50" : "border-gray-200"}`}
            />
            {shelfError && <p className="text-xs text-red-600 mt-1">{shelfError}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Additional notes about this product..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] focus:border-transparent transition text-sm resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Product Modal ─────────────────────────────────────────────────────
function DeleteProductModal({ product, onClose }) {
  const [action, setAction] = useState("archive");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    setLoading(true);
    setError("");
    try {
      if (action === "archive") {
        await updateDoc(doc(db, "products", product.id), {
          archived: true,
          archivedAt: serverTimestamp(),
        });
      } else {
        await deleteDoc(doc(db, "products", product.id));
      }
      onClose();
    } catch (err) {
      setError("Something went wrong. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Delete Product</h3>
              <p className="text-sm text-gray-500">{product.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-5">
          This removes <span className="font-semibold">{product.name}</span> from the product list.
          Existing demand submissions that reference this product are not affected.
        </p>

        <div className="space-y-3 mb-5">
          <label
            className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
              action === "archive"
                ? "border-[#2D6A2D] bg-green-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <input
              type="radio"
              name="productAction"
              value="archive"
              checked={action === "archive"}
              onChange={() => setAction("archive")}
              className="mt-0.5 accent-[#2D6A2D]"
            />
            <div>
              <p className="font-semibold text-sm text-gray-800 flex items-center gap-1.5">
                <Archive className="w-3.5 h-3.5 text-[#2D6A2D]" />
                Archive
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                The product is hidden from the UI but its data remains in the database and can be restored manually.
              </p>
            </div>
          </label>

          <label
            className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
              action === "delete"
                ? "border-red-400 bg-red-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <input
              type="radio"
              name="productAction"
              value="delete"
              checked={action === "delete"}
              onChange={() => setAction("delete")}
              className="mt-0.5 accent-red-600"
            />
            <div>
              <p className="font-semibold text-sm text-gray-800 flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                Delete permanently
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                The product record is removed from the database entirely. This cannot be undone.
              </p>
            </div>
          </label>
        </div>

        {error && (
          <p className="text-xs text-red-500 mb-4 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 ${
              action === "delete"
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white"
            }`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {action === "delete" ? "Delete Permanently" : "Archive"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Format Info Modal ────────────────────────────────────────────────────────
function FormatInfoModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-[#2D6A2D]" />
            <h3 className="font-bold text-gray-900">Expected Excel Format</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Row 1 must be the header row. Each subsequent row is one product.
          Only the <span className="font-semibold">Name</span> column is required; the others can be left blank.
        </p>

        <div className="space-y-3 mb-5">
          {[
            { col: "Column A", name: "Name", required: true, desc: 'The product display name. Also accepted: "Product Name".' },
            { col: "Column B", name: "Product ID", required: false, desc: 'A short identifier such as a SKU. Also accepted: "ID", "Product-ID".' },
            { col: "Column C", name: "Notes", required: false, desc: 'Free-text notes about the product. Also accepted: "Note".' },
            { col: "Column D", name: "Type", required: false, desc: '"HF" (Halbfabrikat / semi-finished) or "FG" (Finished Good). Defaults to "HF" if omitted.' },
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

        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Example</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-yellow-50">
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Name</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Product ID</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Notes</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Type</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Classic Herb Drops", "SKU-001", "Flagship product", "HF"],
                  ["Honey & Herb Drops", "SKU-002", "", "HF"],
                  ["Sugar Free Drops", "", "", "FG"],
                ].map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-2 text-gray-700">{row[0]}</td>
                    <td className="px-3 py-2 text-gray-600">{row[1] || <span className="text-gray-300 italic">empty</span>}</td>
                    <td className="px-3 py-2 text-gray-600">{row[2] || <span className="text-gray-300 italic">empty</span>}</td>
                    <td className="px-3 py-2 text-gray-600">{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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

// ─── Upload Products Modal ─────────────────────────────────────────────────────
function UploadProductsModal({ onClose }) {
  const [step, setStep] = useState("upload"); // "upload" | "preview"
  const [parseError, setParseError] = useState("");
  const [parsedProducts, setParsedProducts] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [showFormatInfo, setShowFormatInfo] = useState(false);
  const fileInputRef = useRef(null);

  // Prevent browser from navigating when a file is dropped outside the drop zone
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

        if (rows.length < 2) {
          setParseError("The file appears to be empty or has no data rows.");
          return;
        }

        const header = rows[0].map(h => String(h).toLowerCase().trim());
        const nameIdx  = header.findIndex(h => ["name", "product name"].includes(h));
        const idIdx    = header.findIndex(h => ["product id", "id", "product-id"].includes(h));
        const notesIdx = header.findIndex(h => ["notes", "note"].includes(h));
        const typeIdx  = header.findIndex(h => ["type"].includes(h));

        if (nameIdx === -1) {
          setParseError('Could not find a "Name" column. Please check the format and try again.');
          return;
        }

        const products = rows.slice(1)
          .filter(row => String(row[nameIdx] ?? "").trim())
          .map((row, i) => {
            const rawType = typeIdx >= 0 ? String(row[typeIdx] ?? "").trim().toUpperCase() : "";
            return {
              _id: `p_${i}`,
              name: String(row[nameIdx] ?? "").trim(),
              productId: idIdx >= 0 ? String(row[idIdx] ?? "").trim() : "",
              notes: notesIdx >= 0 ? String(row[notesIdx] ?? "").trim() : "",
              type: rawType === "FG" ? "FG" : "HF",
              included: true,
            };
          });

        if (products.length === 0) {
          setParseError("No valid product rows found. Make sure each row has a non-empty Name.");
          return;
        }

        setParsedProducts(products);
        setStep("preview");
      } catch (err) {
        setParseError("Failed to read the file. Please make sure it is a valid .xlsx or .xls file.");
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) parseFile(file);
    e.target.value = "";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  };

  const updateProduct = (id, field, value) => {
    setParsedProducts(prev => prev.map(p => p._id === id ? { ...p, [field]: value } : p));
  };

  const selectedCount = parsedProducts.filter(p => p.included && p.name.trim()).length;

  const handleImport = async () => {
    if (selectedCount === 0) return;
    setImporting(true);
    setImportError("");
    try {
      // Query all products (including archived) to avoid key/order collisions
      const allSnap = await getDocs(collection(db, "products"));
      const allDocs = allSnap.docs.map(d => d.data());

      let maxNum = 0;
      let maxOrder = -1;
      allDocs.forEach(p => {
        const match = p.key?.match(/^product(\d+)Tons$/);
        if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
        if (typeof p.order === "number") maxOrder = Math.max(maxOrder, p.order);
      });

      const toImport = parsedProducts.filter(p => p.included && p.name.trim());
      for (const p of toImport) {
        maxNum   += 1;
        maxOrder += 1;
        await addDoc(collection(db, "products"), {
          name:      p.name.trim(),
          productId: p.productId.trim(),
          notes:     p.notes.trim(),
          type:      p.type || "HF",
          key:       `product${maxNum}Tons`,
          order:     maxOrder,
          createdAt: serverTimestamp(),
        });
      }
      onClose();
    } catch (err) {
      setImportError("Something went wrong during import. Please try again.");
      console.error(err);
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-[#2D6A2D]" />
              <h3 className="font-bold text-gray-800 text-sm">
                {step === "upload" ? "Import Products from Excel" : "Import Products — Preview"}
              </h3>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 p-5">
            {step === "upload" ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">
                  Upload an Excel file (.xlsx or .xls). Each row becomes one product.
                </p>

                {/* Drop zone */}
                <div
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(e); }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 hover:border-[#4A9E4A] rounded-xl p-10 text-center cursor-pointer transition-colors group"
                >
                  <Upload className="w-8 h-8 text-gray-300 group-hover:text-[#4A9E4A] mx-auto mb-3 transition-colors" />
                  <p className="text-sm font-medium text-gray-500 group-hover:text-[#2D6A2D] transition-colors">
                    Drop a file here, or click to choose
                  </p>
                  <p className="text-xs text-gray-400 mt-1">.xlsx · .xls</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>

                {parseError && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600">{parseError}</p>
                  </div>
                )}

                <button
                  onClick={() => setShowFormatInfo(true)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#2D6A2D] transition-colors"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  Expected file format
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">
                  <span className="font-semibold text-gray-700">{parsedProducts.length}</span> product{parsedProducts.length !== 1 ? "s" : ""} detected.
                  Uncheck rows to exclude them, or edit any field before importing.
                </p>

                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-3 py-2.5 w-10" />
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Name <span className="text-red-400">*</span>
                        </th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Product ID</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {parsedProducts.map(p => (
                        <tr key={p._id} className={p.included ? "" : "opacity-40"}>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={p.included}
                              onChange={e => updateProduct(p._id, "included", e.target.checked)}
                              className="accent-[#2D6A2D] w-4 h-4 cursor-pointer"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={p.name}
                              onChange={e => updateProduct(p._id, "name", e.target.value)}
                              placeholder="Product name…"
                              className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#4A9E4A] focus:border-transparent"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={p.productId}
                              onChange={e => updateProduct(p._id, "productId", e.target.value)}
                              placeholder="e.g. SKU-001"
                              className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#4A9E4A] focus:border-transparent"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={p.notes}
                              onChange={e => updateProduct(p._id, "notes", e.target.value)}
                              placeholder="Notes…"
                              className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#4A9E4A] focus:border-transparent"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={p.type || "HF"}
                              onChange={e => updateProduct(p._id, "type", e.target.value)}
                              className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#4A9E4A] bg-white"
                            >
                              <option value="HF">HF</option>
                              <option value="FG">FG</option>
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

          {/* Footer */}
          <div className="p-5 border-t border-gray-100 shrink-0 flex gap-3">
            {step === "preview" ? (
              <>
                <button
                  onClick={() => { setStep("upload"); setParseError(""); }}
                  disabled={importing}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-60"
                >
                  ← Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing || selectedCount === 0}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                  {importing ? "Importing…" : `Import ${selectedCount} Product${selectedCount !== 1 ? "s" : ""}`}
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {showFormatInfo && <FormatInfoModal onClose={() => setShowFormatInfo(false)} />}
    </>
  );
}

// ─── Product Management ────────────────────────────────────────────────────────
function ProductManagement() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [infoTarget, setInfoTarget] = useState(null);
  const [editTargetId, setEditTargetId] = useState(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("HF");
  const [saving, setSaving] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showFormatInfo, setShowFormatInfo] = useState(false);
  const seedingRef = useRef(false);
  const migratingRef = useRef(false);

  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("order"));
    const unsubscribe = onSnapshot(q, async (snap) => {
      if (snap.empty && !seedingRef.current) {
        seedingRef.current = true;
        const defaults = [
          { name: "Product 1", productId: "", notes: "", key: "product1Tons", order: 0, type: "HF" },
          { name: "Product 2", productId: "", notes: "", key: "product2Tons", order: 1, type: "HF" },
          { name: "Product 3", productId: "", notes: "", key: "product3Tons", order: 2, type: "HF" },
        ];
        for (const p of defaults) {
          await addDoc(collection(db, "products"), { ...p, createdAt: serverTimestamp() });
        }
      } else if (!snap.empty) {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // One-time migration: set type="HF" on any product missing the field
        if (!migratingRef.current) {
          const needsMigration = all.filter(p => !p.type);
          if (needsMigration.length > 0) {
            migratingRef.current = true;
            for (const p of needsMigration) {
              await updateDoc(doc(db, "products", p.id), { type: "HF" });
            }
          }
        }
        setProducts(all.filter(p => !p.archived));
        setLoading(false);
      }
    }, () => setLoading(false));
    return unsubscribe;
  }, []);

  const handleSaveName = async (product) => {
    if (!editName.trim()) return;
    setSaving(true);
    await updateDoc(doc(db, "products", product.id), { name: editName.trim() });
    setSaving(false);
    setEditTargetId(null);
    setEditName("");
  };

  const handleAddProduct = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const maxOrder = products.reduce((m, p) => Math.max(m, p.order), -1);
    const nextNum = products.length + 1;
    await addDoc(collection(db, "products"), {
      name: newName.trim(),
      productId: "",
      notes: "",
      type: newType,
      key: `product${nextNum}Tons`,
      order: maxOrder + 1,
      createdAt: serverTimestamp(),
    });
    setSaving(false);
    setAddingNew(false);
    setNewName("");
    setNewType("HF");
  };

  return (
    <>
      {/* Toolbar — always visible */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-400">Manage the products country heads forecast for.</p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowFormatInfo(true)}
            title="Expected Excel format"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-[#2D6A2D] hover:bg-gray-100 border border-transparent hover:border-gray-200 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Format
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#2D6A2D] border border-[#2D6A2D] hover:bg-green-50 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload from Excel
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#4A9E4A]" />
        </div>
      ) : (
      <div className="space-y-2">
        {products.map((product) => (
          <div
            key={product.id}
            className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 bg-gray-50 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-[#2D6A2D]/10 flex items-center justify-center shrink-0">
              <Package className="w-4 h-4 text-[#2D6A2D]" />
            </div>

            {editTargetId === product.id ? (
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSaveName(product); if (e.key === "Escape") { setEditTargetId(null); setEditName(""); } }}
                  autoFocus
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-[#4A9E4A] focus:outline-none focus:ring-2 focus:ring-[#4A9E4A]"
                />
                <button
                  onClick={() => handleSaveName(product)}
                  disabled={saving || !editName.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#2D6A2D] text-white text-xs font-medium disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save
                </button>
                <button
                  onClick={() => { setEditTargetId(null); setEditName(""); }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <div className="w-px h-5 bg-gray-200 mx-0.5" />
                <button
                  onClick={() => { setDeleteTarget(product); setEditTargetId(null); setEditName(""); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-medium transition-colors"
                  title="Delete product"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium text-gray-800">{product.name}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${
                  product.type === "FG" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                }`}>{product.type || "HF"}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setInfoTarget(product)}
                    title="View / edit product info"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-[#2D6A2D] hover:bg-white border border-transparent hover:border-gray-200 transition-colors"
                  >
                    <Info className="w-3.5 h-3.5" />
                    Info
                  </button>
                  <button
                    onClick={() => { setEditTargetId(product.id); setEditName(product.name); }}
                    title="Edit product name"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-[#2D6A2D] hover:bg-white border border-transparent hover:border-gray-200 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {addingNew ? (
          <div className="flex items-center gap-2 p-3 rounded-xl border-2 border-dashed border-[#4A9E4A] bg-green-50">
            <div className="w-8 h-8 rounded-lg bg-[#2D6A2D]/10 flex items-center justify-center shrink-0">
              <Package className="w-4 h-4 text-[#4A9E4A]" />
            </div>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAddProduct(); if (e.key === "Escape") { setAddingNew(false); setNewName(""); setNewType("HF"); } }}
              placeholder="New product name..."
              autoFocus
              className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-[#4A9E4A] focus:outline-none focus:ring-2 focus:ring-[#4A9E4A]"
            />
            <select
              value={newType}
              onChange={e => setNewType(e.target.value)}
              className="px-2 py-1.5 text-xs rounded-lg border border-[#4A9E4A] focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] bg-white text-gray-700"
            >
              <option value="HF">HF</option>
              <option value="FG">FG</option>
            </select>
            <button
              onClick={handleAddProduct}
              disabled={saving || !newName.trim()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#2D6A2D] text-white text-xs font-medium disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add
            </button>
            <button
              onClick={() => { setAddingNew(false); setNewName(""); setNewType("HF"); }}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingNew(true)}
            className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-[#4A9E4A] hover:text-[#2D6A2D] text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Product
          </button>
        )}
      </div>
      )}

      {infoTarget && (
        <ProductInfoModal
          product={infoTarget}
          onClose={() => setInfoTarget(null)}
        />
      )}

      {deleteTarget && (
        <DeleteProductModal
          product={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {showUpload && <UploadProductsModal onClose={() => setShowUpload(false)} />}
      {showFormatInfo && <FormatInfoModal onClose={() => setShowFormatInfo(false)} />}
    </>
  );
}

// ─── Country History Modal (individual view row click) ─────────────────────────
function CountryHistoryModal({ userId, username, demands, products, onClose }) {
  const [view, setView] = useState("graph");

  const userDemands = demands
    .filter(d => d.userId === userId && !d.archived)
    .sort((a, b) => parseMonthToDate(a.month) - parseMonthToDate(b.month));

  const tableRows = [...userDemands].reverse();

  const productColors = products.map((_, i) => ALL_COLORS[i % ALL_COLORS.length]);
  const productLabels = products.map(p => p.name);

  const chartGroups = userDemands.map(d => ({
    label: shortMonthLabel(d.month),
    values: products.map(p => Number(d[p.key]) || 0),
  }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#2D6A2D] flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-xs">{username?.charAt(0)?.toUpperCase()}</span>
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-sm">{username}</h3>
              <p className="text-xs text-gray-400">Submission history · all months</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
              <button
                onClick={() => setView("graph")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  view === "graph" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500"
                }`}
              >
                <BarChart2 className="w-3 h-3" /> Graph
              </button>
              <button
                onClick={() => setView("table")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  view === "table" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500"
                }`}
              >
                <Table className="w-3 h-3" /> Table
              </button>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {userDemands.length === 0 ? (
            <div className="text-center py-10">
              <History className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No submission history found.</p>
            </div>
          ) : view === "graph" ? (
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
                    <th className="text-left pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Comment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tableRows.map(d => {
                    const total = products.reduce((s, p) => s + (Number(d[p.key]) || 0), 0);
                    const submittedAt = d.submittedAt?.toDate?.();
                    return (
                      <tr key={d.id} className="hover:bg-gray-50">
                        <td className="py-3 font-medium text-gray-800">{d.month}</td>
                        {products.map(p => (
                          <td key={p.key} className="py-3 text-right tabular-nums text-gray-700">{Number(d[p.key] || 0).toFixed(2)}</td>
                        ))}
                        <td className="py-3 text-right tabular-nums font-semibold text-[#2D6A2D]">{total.toFixed(2)}</td>
                        <td className="py-3 text-xs text-gray-400">
                          {submittedAt
                            ? submittedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                            : "—"}
                        </td>
                        <td className="py-3 text-xs text-gray-500 max-w-[160px]">
                          {d.comment ? (
                            <span title={d.comment} className="truncate block">{d.comment}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
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
    </div>
  );
}

// ─── Product History Modal (aggregated view card click) ────────────────────────
function ProductHistoryModal({ productKey, productLabel, productColor, demands, onClose }) {
  const monthMap = {};
  demands
    .filter(d => !d.archived)
    .forEach(d => {
      if (!monthMap[d.month]) monthMap[d.month] = 0;
      monthMap[d.month] += Number(d[productKey]) || 0;
    });

  const monthlyData = Object.entries(monthMap)
    .map(([month, value]) => ({ month, value }))
    .sort((a, b) => parseMonthToDate(a.month) - parseMonthToDate(b.month));

  const maxVal = Math.max(...monthlyData.map(d => d.value), 0.01);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: productColor + "33" }}
            >
              <Package className="w-4 h-4" style={{ color: productColor === "#F5C500" ? "#92620c" : productColor }} />
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-sm">{productLabel}</h3>
              <p className="text-xs text-gray-400">Monthly trend · all recorded history</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {monthlyData.length === 0 ? (
            <div className="text-center py-10">
              <BarChart3 className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No data recorded yet.</p>
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center gap-1.5 mb-4">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: productColor }} />
                  <span className="text-xs text-gray-500">{productLabel} — total tons per month</span>
                </div>
                <div className="overflow-x-auto pb-1">
                  <div
                    className="flex items-end gap-3"
                    style={{ minWidth: `${Math.max(monthlyData.length * 64, 200)}px`, height: "172px" }}
                  >
                    {monthlyData.map((d, i) => (
                      <div key={i} className="flex-1 min-w-[48px] flex flex-col">
                        <div className="flex items-end" style={{ height: "140px" }}>
                          <div
                            className="w-full rounded-t-sm"
                            style={{
                              height: d.value > 0 ? `${Math.max((d.value / maxVal) * 140, 3)}px` : "0px",
                              backgroundColor: productColor,
                            }}
                            title={`${d.value.toFixed(2)}t`}
                          />
                        </div>
                        <span className="text-[10px] text-gray-400 text-center mt-2 leading-tight">
                          {shortMonthLabel(d.month)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Month</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total (t)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {[...monthlyData].reverse().map((d, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-800">{d.month}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: productColor === "#F5C500" ? "#92620c" : productColor }}>
                          {d.value.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Section: Pending Approvals ───────────────────────────────────────────────
function PendingApprovals({ onApprove }) {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [functionInputs, setFunctionInputs] = useState({});
  const [roleInputs, setRoleInputs] = useState({});
  const [countryInputs, setCountryInputs] = useState({});  // free-text for "new" mode
  const [countryModes, setCountryModes] = useState({});    // "existing" | "new" per user
  const [countrySelects, setCountrySelects] = useState({}); // selected known country per user
  const [knownCountries, setKnownCountries] = useState([]);
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

  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, "users"), where("isApproved", "==", true))),
      getDocs(collection(db, "mrpImports")),
    ]).then(([usersSnap, mrpSnap]) => {
      const fromUsers = usersSnap.docs.map(d => d.data().country).filter(Boolean);
      const fromMrp = mrpSnap.docs.flatMap(d => (d.data().rows || []).map(r => r.country).filter(Boolean));
      setKnownCountries([...new Set([...fromUsers, ...fromMrp])].sort());
    });
  }, []);

  const handleApprove = async (user) => {
    const fn = (functionInputs[user.id] || "").trim();
    if (!fn) {
      setErrors(prev => ({ ...prev, [user.id]: "Please assign a function before approving." }));
      return;
    }
    setErrors(prev => ({ ...prev, [user.id]: "" }));
    setActionLoading(prev => ({ ...prev, [user.id]: "approving" }));
    const mode = countryModes[user.id] || (knownCountries.length > 0 ? "existing" : "new");
    const country = mode === "existing"
      ? (countrySelects[user.id] || knownCountries[0] || "")
      : (countryInputs[user.id] || "").trim();
    try {
      const assignedRole = roleInputs[user.id] || "country_head";
      await updateDoc(doc(db, "users", user.id), {
        role: assignedRole,
        isApproved: true,
        customFunction: fn,
        country,
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
            <div className="flex-1 flex flex-col sm:flex-row gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Assign Role
                </label>
                <select
                  value={roleInputs[user.id] || "country_head"}
                  onChange={e => setRoleInputs(prev => ({ ...prev, [user.id]: e.target.value }))}
                  className="px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] focus:border-transparent bg-white text-gray-700"
                >
                  <option value="country_head">Country Head</option>
                  <option value="hf_planner">HF Planner</option>
                </select>
              </div>
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
              <div className="min-w-[180px]">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Country
                </label>
                {(() => {
                  const mode = countryModes[user.id] || (knownCountries.length > 0 ? "existing" : "new");
                  return (
                    <div className="space-y-1.5">
                      <div className="flex gap-0.5 p-0.5 bg-gray-100 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setCountryModes(prev => ({ ...prev, [user.id]: "existing" }))}
                          disabled={knownCountries.length === 0}
                          className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40 ${mode === "existing" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                        >
                          Existing
                        </button>
                        <button
                          type="button"
                          onClick={() => setCountryModes(prev => ({ ...prev, [user.id]: "new" }))}
                          className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${mode === "new" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                        >
                          New
                        </button>
                      </div>
                      {mode === "existing" ? (
                        <select
                          value={countrySelects[user.id] || knownCountries[0] || ""}
                          onChange={e => setCountrySelects(prev => ({ ...prev, [user.id]: e.target.value }))}
                          className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] bg-white"
                        >
                          {knownCountries.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <input
                          type="text"
                          placeholder="e.g. Germany"
                          value={countryInputs[user.id] || ""}
                          onChange={e => setCountryInputs(prev => ({ ...prev, [user.id]: e.target.value }))}
                          className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A]"
                        />
                      )}
                    </div>
                  );
                })()}
              </div>
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

// ─── Change Country Modal (shared by admin and country heads) ─────────────────
function ChangeCountryModal({ userId, currentCountry, displayName, onClose, onSaved }) {
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
          <div>
            <h3 className="font-bold text-gray-900 text-sm">Set Country</h3>
            {displayName && <p className="text-xs text-gray-400 mt-0.5">{displayName}</p>}
          </div>
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

// ─── Section: Active Accounts ──────────────────────────────────────────────────
function ActiveAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [countryEditTarget, setCountryEditTarget] = useState(null);

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
    <>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Function</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Country</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {accounts.map(acc => (
              <tr key={acc.id} className="group hover:bg-gray-50 transition-colors">
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
                <td className="px-4 py-3 text-gray-600">
                  <div className="flex items-center gap-1.5">
                    <span>{acc.country || <span className="text-gray-300 italic">—</span>}</span>
                    {acc.role !== "admin" && (
                      <button
                        onClick={() => setCountryEditTarget(acc)}
                        title="Edit country"
                        className="p-0.5 rounded text-gray-300 hover:text-[#2D6A2D] opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    acc.role === "admin" ? "bg-yellow-100 text-yellow-800" :
                    acc.role === "hf_planner" ? "bg-blue-100 text-blue-800" :
                    "bg-green-100 text-green-800"
                  }`}>
                    {acc.role === "admin" ? "Administrator" :
                     acc.role === "hf_planner" ? "HF Planner" :
                     "Country Head"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {acc.role !== "admin" && (
                    <button
                      onClick={() => setDeleteTarget(acc)}
                      title="Delete account"
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={() => setShowArchived(true)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <Archive className="w-3 h-3" />
          Archived Records
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {deleteTarget && (
        <DeleteAccountModal
          account={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => setDeleteTarget(null)}
        />
      )}

      {countryEditTarget && (
        <ChangeCountryModal
          userId={countryEditTarget.id}
          currentCountry={countryEditTarget.country}
          displayName={countryEditTarget.username}
          onClose={() => setCountryEditTarget(null)}
          onSaved={() => setCountryEditTarget(null)}
        />
      )}

      {showArchived && (
        <ArchivedRecordsModal onClose={() => setShowArchived(false)} />
      )}
    </>
  );
}

// ─── Excel download helpers ────────────────────────────────────────────────────
function downloadIndividualExcel(filtered, selectedMonth, products) {
  // Transposed layout: rows = products, columns = country heads
  const header = ["Product Name", "Product ID", ...filtered.map(d => d.username)];

  const productRows = products.map(p => [
    p.name,
    p.productId || "",
    ...filtered.map(d => Number(d[p.key]) || 0),
  ]);

  const totalsRow = [
    "Total (tons)",
    "",
    ...filtered.map(d => products.reduce((s, p) => s + (Number(d[p.key]) || 0), 0)),
  ];

  const submittedAtRow = [
    "Submitted At",
    "",
    ...filtered.map(d => {
      const t = d.submittedAt?.toDate?.();
      return t ? t.toLocaleString("en-US") : "";
    }),
  ];

  const commentsRow = [
    "Comments",
    "",
    ...filtered.map(d => d.comment || ""),
  ];

  const data = [
    header,
    ...productRows,
    totalsRow,
    ["", "", ...filtered.map(() => "")],
    submittedAtRow,
    commentsRow,
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 22 }, { wch: 18 }, ...filtered.map(() => ({ wch: 20 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, selectedMonth);
  XLSX.writeFile(wb, `Ricola_Nexus_Individual_${selectedMonth.replace(" ", "_")}.xlsx`);
}

function downloadAggregatedExcel(aggregated, filtered, selectedMonth, products) {
  const total = products.reduce((s, p) => s + (aggregated[p.key] || 0), 0);

  const data = [
    ["Month", selectedMonth, ""],
    ["Submissions", filtered.length, ""],
    ["", "", ""],
    ["Product", "Product ID", "Total Expected Demand (tons)"],
    ...products.map(p => [p.name, p.productId || "", aggregated[p.key] || 0]),
    ["Grand Total", "", total],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 22 }, { wch: 18 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${selectedMonth} Aggregated`);
  XLSX.writeFile(wb, `Ricola_Nexus_Aggregated_${selectedMonth.replace(" ", "_")}.xlsx`);
}

// ─── Section: Demand Overview ──────────────────────────────────────────────────
function DemandOverview() {
  const [demands, setDemands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr());
  const [availableMonths, setAvailableMonths] = useState([currentMonthStr()]);
  const [view, setView] = useState("individual");

  const [products, setProducts] = useState([]);
  const [productsLoaded, setProductsLoaded] = useState(false);

  const [activeMrp, setActiveMrp] = useState(null);
  const [usersMap, setUsersMap] = useState({});

  const [countryHistoryTarget, setCountryHistoryTarget] = useState(null);
  const [productHistoryTarget, setProductHistoryTarget] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    return onSnapshot(collection(db, "messages"), snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    getDocs(query(collection(db, "users"), where("isApproved", "==", true))).then(snap => {
      const map = {};
      snap.docs.forEach(d => { map[d.id] = d.data(); });
      setUsersMap(map);
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("order"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.archived);
      if (all.length > 0) {
        setProducts(all);
      } else {
        setProducts([
          { key: "product1Tons", name: "Product 1", productId: "", notes: "", order: 0 },
          { key: "product2Tons", name: "Product 2", productId: "", notes: "", order: 1 },
          { key: "product3Tons", name: "Product 3", productId: "", notes: "", order: 2 },
        ]);
      }
      setProductsLoaded(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "demands"), orderBy("submittedAt", "desc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDemands(data);
      const months = [...new Set(data.filter(d => !d.archived).map(d => d.month))];
      if (!months.includes(currentMonthStr())) months.unshift(currentMonthStr());
      setAvailableMonths(months);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "mrpImports"), where("isActive", "==", true));
    const unsub = onSnapshot(q, (snap) => {
      setActiveMrp(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
    });
    return unsub;
  }, []);

  // Returns array of { productKey, mrpQty, demandQty } discrepancies for a given demand doc
  const getDemandDiscrepancies = (demand) => {
    if (!activeMrp?.rows) return [];
    // Fall back to current user profile country when demand was submitted before country field existed
    const effectiveCountry = (demand.country?.trim() || usersMap[demand.userId]?.country?.trim() || "").toLowerCase();
    if (!effectiveCountry) return [];
    const dMonth = (demand.month || "").trim().toLowerCase();
    const out = [];
    for (const row of activeMrp.rows) {
      if (!row.country) continue;
      if (row.period.trim().toLowerCase() !== dMonth) continue;
      if (row.country.trim().toLowerCase() !== effectiveCountry) continue;
      const demandQty = Number(demand[row.productKey]);
      const mrpQty = typeof row.suggestedQty === "number" ? row.suggestedQty : parseFloat(row.suggestedQty) || 0;
      if (!isNaN(demandQty) && Math.abs(demandQty - mrpQty) > 0.001) {
        out.push({ productKey: row.productKey, mrpQty, demandQty });
      }
    }
    return out;
  };

  const getResolution = (userId, productKey, period) => {
    return messages.find(m =>
      m.toUserId === userId &&
      m.productKey === productKey &&
      (m.period || "").trim().toLowerCase() === (period || "").trim().toLowerCase() &&
      (m.status === "resolved" || m.status === "admin_resolved")
    );
  };

  const activeDemands = demands.filter(d => !d.archived);
  const filtered = activeDemands.filter(d => d.month === selectedMonth);

  // Use resolvedQty when a discrepancy was resolved (either party chose MRP or demand value)
  const getEffectiveQty = (demand, productKey) => {
    const res = getResolution(demand.userId, productKey, demand.month);
    if (res?.resolvedQty != null) return res.resolvedQty;
    return Number(demand[productKey]) || 0;
  };

  const aggregated = {};
  products.forEach(p => {
    aggregated[p.key] = filtered.reduce((s, d) => s + getEffectiveQty(d, p.key), 0);
  });

  if (loading || !productsLoaded) return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-[#4A9E4A]" />
    </div>
  );

  const productCards = products.map((p, i) => {
    const style = CARD_STYLES[i % CARD_STYLES.length];
    return {
      key: p.key,
      label: p.name,
      value: aggregated[p.key] || 0,
      color: ALL_COLORS[i % ALL_COLORS.length],
      ...style,
    };
  });

  return (
    <>
      <div className="space-y-5">
        {/* Controls row */}
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

          <div className="flex items-center gap-2">
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] bg-white text-gray-700"
            >
              {availableMonths.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            <button
              onClick={() =>
                view === "individual"
                  ? downloadIndividualExcel(filtered, selectedMonth, products)
                  : downloadAggregatedExcel(aggregated, filtered, selectedMonth, products)
              }
              disabled={filtered.length === 0}
              title={`Download ${view === "individual" ? "Individual" : "Aggregated"} View as Excel`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2D6A2D] text-[#2D6A2D] hover:bg-green-50 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export Excel</span>
            </button>
          </div>
        </div>

        {view === "aggregated" ? (
          <>
            <p className="text-xs text-gray-400">Click a product card to see its monthly trend.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {productCards.map(({ key, label, value, color, cardColor, text, accent }) => (
                <button
                  key={label}
                  onClick={() => setProductHistoryTarget({ key, label, color })}
                  className={`border rounded-xl p-5 ${cardColor} text-left hover:shadow-md transition-shadow cursor-pointer group`}
                >
                  <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${accent} mb-3`}>
                    <Package className={`w-5 h-5 ${text}`} />
                  </div>
                  <p className={`text-xs font-semibold uppercase tracking-wider ${text} mb-1 flex items-center gap-1`}>
                    {label}
                    <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                  </p>
                  <p className={`text-3xl font-bold ${text}`}>{value.toFixed(2)}</p>
                  <p className={`text-xs ${text} opacity-70 mt-1`}>Total tons · {selectedMonth}</p>
                  <p className={`text-xs ${text} opacity-60 mt-0.5`}>From {filtered.length} submission{filtered.length !== 1 ? "s" : ""}</p>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {filtered.length === 0 ? (
              <div className="text-center py-10">
                <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">No submissions for {selectedMonth}.</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-400">Click a row to see that country head&apos;s full submission history.</p>
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Country Head</th>
                        {products.map(p => (
                          <th key={p.key} className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{p.name} (t)</th>
                        ))}
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total (t)</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Submitted</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Comment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtered.map(d => {
                        const total = products.reduce((s, p) => s + getEffectiveQty(d, p.key), 0);
                        const submittedAt = d.submittedAt?.toDate?.();
                        const discrepancies = getDemandDiscrepancies(d);
                        const hasDiscrepancy = discrepancies.length > 0;
                        return (
                          <tr
                            key={d.id}
                            onClick={() => setCountryHistoryTarget({ userId: d.userId, username: d.username })}
                            className={`hover:bg-green-50 transition-colors cursor-pointer group ${hasDiscrepancy ? "bg-yellow-50/60" : ""}`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-[#2D6A2D] flex items-center justify-center shrink-0">
                                  <span className="text-white font-bold text-xs">
                                    {d.username?.charAt(0)?.toUpperCase()}
                                  </span>
                                </div>
                                <span className="font-medium text-gray-800 group-hover:text-[#2D6A2D]">{d.username}</span>
                                {d.country && <span className="text-xs text-gray-400">({d.country})</span>}
                                {hasDiscrepancy && (
                                  <span title={`${discrepancies.length} MRP discrepanc${discrepancies.length === 1 ? "y" : "ies"}`}>
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  </span>
                                )}
                                <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#2D6A2D] transition-colors" />
                              </div>
                            </td>
                            {products.map(p => {
                              const disc = discrepancies.find(x => x.productKey === p.key);
                              const resolution = getResolution(d.userId, p.key, d.month);
                              return (
                                <td key={p.key} className="px-4 py-3 text-right text-gray-700 tabular-nums">
                                  {resolution?.resolvedQty != null ? (
                                    <span className="text-green-600 font-semibold">{resolution.resolvedQty.toFixed(2)}</span>
                                  ) : (
                                    <span>{Number(d[p.key] || 0).toFixed(2)}</span>
                                  )}
                                  {disc && !resolution && (
                                    <span className="ml-1 text-xs text-amber-600" title={`MRP: ${disc.mrpQty.toFixed(2)}t`}>
                                      / {disc.mrpQty.toFixed(2)}
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-4 py-3 text-right font-semibold text-[#2D6A2D] tabular-nums">{total.toFixed(2)}</td>
                            <td className="px-4 py-3 text-xs text-gray-400">
                              {submittedAt ? submittedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                            </td>
                            <td className="px-4 py-3 max-w-[160px]">
                              {d.comment ? (
                                <div className="flex items-start gap-1.5" title={d.comment}>
                                  <MessageSquare className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />
                                  <span className="text-xs text-gray-500 truncate">{d.comment}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-300">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-green-50 border-t-2 border-green-200">
                        <td className="px-4 py-3 font-semibold text-[#2D6A2D] text-sm">Total</td>
                        {products.map(p => (
                          <td key={p.key} className="px-4 py-3 text-right font-bold text-[#2D6A2D] tabular-nums">{(aggregated[p.key] || 0).toFixed(2)}</td>
                        ))}
                        <td className="px-4 py-3 text-right font-bold text-[#2D6A2D] tabular-nums">
                          {products.reduce((s, p) => s + (aggregated[p.key] || 0), 0).toFixed(2)}
                        </td>
                        <td />
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {countryHistoryTarget && (
        <CountryHistoryModal
          userId={countryHistoryTarget.userId}
          username={countryHistoryTarget.username}
          demands={activeDemands}
          products={products}
          onClose={() => setCountryHistoryTarget(null)}
        />
      )}

      {productHistoryTarget && (
        <ProductHistoryModal
          productKey={productHistoryTarget.key}
          productLabel={productHistoryTarget.label}
          productColor={productHistoryTarget.color}
          demands={activeDemands}
          onClose={() => setProductHistoryTarget(null)}
        />
      )}
    </>
  );
}

// ─── Message Country Head Modal ────────────────────────────────────────────────
function MessageCountryHeadModal({ discrepancy, onClose }) {
  const { currentUser, userProfile } = useAuth();
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!note.trim()) return;
    setSending(true);
    try {
      await addDoc(collection(db, "messages"), {
        fromUserId: currentUser.uid,
        fromUsername: userProfile?.username || "Admin",
        toUserId: discrepancy.demandUserId,
        toUserCountry: discrepancy.country,
        productKey: discrepancy.productKey,
        period: discrepancy.period,
        adminNote: note.trim(),
        mrpQty: discrepancy.mrpQty,
        demandQty: discrepancy.demandQty,
        status: "pending",
        countryHeadResponse: "",
        resolvedAt: null,
        createdAt: serverTimestamp(),
      });
      setSent(true);
      setTimeout(() => { setSent(false); onClose(); }, 1200);
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-bold text-gray-900">Message Country Head</h3>
            <p className="text-xs text-gray-400 mt-0.5">{discrepancy.country} · {discrepancy.productKey} · {discrepancy.period}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-100 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Demand submitted:</span>
            <span className="font-semibold text-gray-800">{discrepancy.demandQty?.toFixed(2)} t</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">MRP suggested:</span>
            <span className="font-semibold text-amber-700">{discrepancy.mrpQty?.toFixed(2)} t</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Difference:</span>
            <span className="font-semibold text-red-600">{(discrepancy.demandQty - discrepancy.mrpQty).toFixed(2)} t</span>
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Your note</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Explain the discrepancy or ask the country head to review..."
            rows={4}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] text-sm resize-none"
          />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">Cancel</button>
          <button
            onClick={handleSend}
            disabled={sending || !note.trim() || sent}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : sent ? <CheckCircle2 className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            {sent ? "Sent!" : "Send Message"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Admin Resolve Modal ──────────────────────────────────────────────────────
function AdminResolveModal({ discrepancy, onClose }) {
  const { currentUser, userProfile } = useAuth();
  const [choice, setChoice] = useState("demand"); // "demand" | "mrp"
  const [saving, setSaving] = useState(false);

  const resolvedQty = choice === "demand" ? discrepancy.demandQty : discrepancy.mrpQty;

  const handleResolve = async () => {
    setSaving(true);
    try {
      const baseData = {
        adminChoice: choice,
        resolvedQty,
        status: "admin_resolved",
        resolvedAt: serverTimestamp(),
      };
      if (discrepancy.message) {
        await updateDoc(doc(db, "messages", discrepancy.message.id), baseData);
      } else {
        await addDoc(collection(db, "messages"), {
          fromUserId: currentUser.uid,
          fromUsername: userProfile?.username || "Admin",
          toUserId: discrepancy.demandUserId,
          toUserCountry: discrepancy.country,
          productKey: discrepancy.productKey,
          period: discrepancy.period,
          adminNote: `Admin resolved directly. Chosen value: ${resolvedQty.toFixed(2)} t.`,
          mrpQty: discrepancy.mrpQty,
          demandQty: discrepancy.demandQty,
          countryHeadResponse: "",
          createdAt: serverTimestamp(),
          ...baseData,
        });
      }
      // Update the demand document with the resolved value and attach a note
      if (discrepancy.demandUserId && discrepancy.period) {
        const demandsSnap = await getDocs(query(
          collection(db, "demands"),
          where("userId", "==", discrepancy.demandUserId),
          where("month", "==", discrepancy.period)
        ));
        if (!demandsSnap.empty) {
          const demandDoc = demandsSnap.docs[0];
          const originalQty = demandDoc.data()[discrepancy.productKey];
          await updateDoc(doc(db, "demands", demandDoc.id), {
            [discrepancy.productKey]: resolvedQty,
            [`adminNote_${discrepancy.productKey}`]: `Admin resolved (${discrepancy.period}): original ${(originalQty ?? 0).toFixed(2)} t → ${resolvedQty.toFixed(2)} t`,
          });
        }
      }
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-bold text-gray-900">Resolve Discrepancy</h3>
            <p className="text-xs text-gray-400 mt-0.5">{discrepancy.country} · {discrepancy.productKey} · {discrepancy.period}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-100 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Demand submitted:</span>
            <span className="font-semibold text-gray-800">{discrepancy.demandQty?.toFixed(2)} t</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">MRP suggested:</span>
            <span className="font-semibold text-amber-700">{discrepancy.mrpQty?.toFixed(2)} t</span>
          </div>
        </div>
        <p className="text-sm font-semibold text-gray-700 mb-3">Which value should be used?</p>
        <div className="space-y-2 mb-5">
          <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${choice === "demand" ? "border-[#2D6A2D] bg-green-50" : "border-gray-200 hover:border-gray-300"}`}>
            <input type="radio" name="resolveChoice" value="demand" checked={choice === "demand"} onChange={() => setChoice("demand")} className="mt-0.5 accent-[#2D6A2D]" />
            <div>
              <p className="font-semibold text-sm text-gray-800">Use manual demand value</p>
              <p className="text-xs text-gray-500 mt-0.5">{discrepancy.demandQty?.toFixed(2)} t (submitted by {discrepancy.demandUsername})</p>
            </div>
          </label>
          <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${choice === "mrp" ? "border-amber-400 bg-amber-50" : "border-gray-200 hover:border-gray-300"}`}>
            <input type="radio" name="resolveChoice" value="mrp" checked={choice === "mrp"} onChange={() => setChoice("mrp")} className="mt-0.5 accent-amber-600" />
            <div>
              <p className="font-semibold text-sm text-gray-800">Use MRP expected value</p>
              <p className="text-xs text-gray-500 mt-0.5">{discrepancy.mrpQty?.toFixed(2)} t (from active MRP import)</p>
            </div>
          </label>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-60">Cancel</button>
          <button
            onClick={handleResolve}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Resolving…" : `Use ${resolvedQty.toFixed(2)} t`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Inventory Discrepancy Modals ─────────────────────────────────────────────
function InventoryMessageModal({ discrepancy, onClose }) {
  const { currentUser, userProfile } = useAuth();
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!note.trim()) return;
    setSending(true);
    try {
      await addDoc(collection(db, "messages"), {
        type: "inventory_discrepancy",
        fromUserId: currentUser.uid,
        fromUsername: userProfile?.username || "Admin",
        toUserId: discrepancy.demandUserId,
        toUserCountry: discrepancy.country,
        productKey: discrepancy.productKey,
        period: discrepancy.period,
        adminNote: note.trim(),
        mrpInventoryQty: discrepancy.mrpInventoryQty,
        demandInventoryQty: discrepancy.demandInventoryQty,
        status: "pending",
        countryHeadResponse: "",
        resolvedAt: null,
        createdAt: serverTimestamp(),
      });
      setSent(true);
      setTimeout(() => { setSent(false); onClose(); }, 1200);
    } catch (e) { console.error(e); } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-bold text-gray-900">Message Country Head — Inventory</h3>
            <p className="text-xs text-gray-400 mt-0.5">{discrepancy.country} · {discrepancy.productKey} · {discrepancy.period}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-100 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Reported by country head:</span>
            <span className="font-semibold text-gray-800">{discrepancy.demandInventoryQty?.toFixed(2)} t</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">MRP expected level:</span>
            <span className="font-semibold text-blue-700">{discrepancy.mrpInventoryQty?.toFixed(2)} t</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Difference:</span>
            <span className="font-semibold text-red-600">{(discrepancy.demandInventoryQty - discrepancy.mrpInventoryQty).toFixed(2)} t</span>
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Your note</label>
          <textarea
            value={note} onChange={e => setNote(e.target.value)}
            placeholder="Ask the country head to clarify their inventory level..."
            rows={4}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#4A9E4A] text-sm resize-none"
          />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">Cancel</button>
          <button
            onClick={handleSend} disabled={sending || !note.trim() || sent}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : sent ? <CheckCircle2 className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            {sent ? "Sent!" : "Send Message"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InventoryResolveModal({ discrepancy, onClose }) {
  const { currentUser, userProfile } = useAuth();
  const [choice, setChoice] = useState("demand");
  const [saving, setSaving] = useState(false);

  const resolvedQty = choice === "demand" ? discrepancy.demandInventoryQty : discrepancy.mrpInventoryQty;

  const handleResolve = async () => {
    setSaving(true);
    try {
      const baseData = { adminChoice: choice, resolvedQty, status: "admin_resolved", resolvedAt: serverTimestamp() };
      if (discrepancy.message) {
        await updateDoc(doc(db, "messages", discrepancy.message.id), baseData);
      } else {
        await addDoc(collection(db, "messages"), {
          type: "inventory_discrepancy",
          fromUserId: currentUser.uid,
          fromUsername: userProfile?.username || "Admin",
          toUserId: discrepancy.demandUserId,
          toUserCountry: discrepancy.country,
          productKey: discrepancy.productKey,
          period: discrepancy.period,
          adminNote: `Admin resolved directly. Accepted inventory level: ${resolvedQty.toFixed(2)} t.`,
          mrpInventoryQty: discrepancy.mrpInventoryQty,
          demandInventoryQty: discrepancy.demandInventoryQty,
          countryHeadResponse: "",
          createdAt: serverTimestamp(),
          ...baseData,
        });
      }
      onClose();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-bold text-gray-900">Resolve Inventory Discrepancy</h3>
            <p className="text-xs text-gray-400 mt-0.5">{discrepancy.country} · {discrepancy.productKey} · {discrepancy.period}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-100 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Country head reported:</span>
            <span className="font-semibold text-gray-800">{discrepancy.demandInventoryQty?.toFixed(2)} t</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">MRP expected level:</span>
            <span className="font-semibold text-blue-700">{discrepancy.mrpInventoryQty?.toFixed(2)} t</span>
          </div>
        </div>
        <p className="text-sm font-semibold text-gray-700 mb-3">Which inventory level should be accepted?</p>
        <div className="space-y-2 mb-5">
          <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${choice === "demand" ? "border-[#2D6A2D] bg-green-50" : "border-gray-200 hover:border-gray-300"}`}>
            <input type="radio" name="invResolveChoice" value="demand" checked={choice === "demand"} onChange={() => setChoice("demand")} className="mt-0.5 accent-[#2D6A2D]" />
            <div>
              <p className="font-semibold text-sm text-gray-800">Use country head's reported level</p>
              <p className="text-xs text-gray-500 mt-0.5">{discrepancy.demandInventoryQty?.toFixed(2)} t (submitted by {discrepancy.demandUsername})</p>
            </div>
          </label>
          <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${choice === "mrp" ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
            <input type="radio" name="invResolveChoice" value="mrp" checked={choice === "mrp"} onChange={() => setChoice("mrp")} className="mt-0.5 accent-blue-600" />
            <div>
              <p className="font-semibold text-sm text-gray-800">Use MRP expected level</p>
              <p className="text-xs text-gray-500 mt-0.5">{discrepancy.mrpInventoryQty?.toFixed(2)} t (from active MRP import)</p>
            </div>
          </label>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-60">Cancel</button>
          <button
            onClick={handleResolve} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Resolving…" : `Accept ${resolvedQty.toFixed(2)} t`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Section: Discrepancies ────────────────────────────────────────────────────
function DiscrepanciesSection() {
  const [demands, setDemands] = useState([]);
  const [activeMrp, setActiveMrp] = useState(null);
  const [messages, setMessages] = useState([]);
  const [products, setProducts] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [messageTarget, setMessageTarget] = useState(null);
  const [resolveTarget, setResolveTarget] = useState(null);
  const [discTab, setDiscTab] = useState("demand");
  const [invMessageTarget, setInvMessageTarget] = useState(null);
  const [invResolveTarget, setInvResolveTarget] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "mrpImports"), where("isActive", "==", true));
    return onSnapshot(q, snap => {
      setActiveMrp(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, "demands"), orderBy("submittedAt", "desc"));
    return onSnapshot(q, snap => {
      setDemands(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => !d.archived));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("order"));
    return onSnapshot(q, snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.archived));
    });
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "messages"), snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    getDocs(query(collection(db, "users"), where("isApproved", "==", true))).then(snap => {
      const map = {};
      snap.docs.forEach(d => { map[d.id] = d.data(); });
      setUsersMap(map);
    });
  }, []);

  const productName = (key) => {
    const p = products.find(p => p.key === key);
    return p ? p.name : key;
  };

  const getDiscrepancyKey = (row, demand) =>
    `${row.productKey}|${row.period?.trim().toLowerCase()}|${row.country?.trim().toLowerCase()}|${demand.userId}`;

  const discrepancies = [];
  if (activeMrp?.rows) {
    for (const row of activeMrp.rows) {
      if (!row.country) continue;
      const rowCountry = row.country.trim().toLowerCase();
      const rowPeriod = row.period.trim().toLowerCase();
      const mrpQty = typeof row.suggestedQty === "number" ? row.suggestedQty : parseFloat(row.suggestedQty) || 0;
      const matchingDemands = demands.filter(d => {
        const effectiveCountry = (d.country?.trim() || usersMap[d.userId]?.country?.trim() || "").toLowerCase();
        return d.month?.trim().toLowerCase() === rowPeriod && effectiveCountry === rowCountry;
      });
      for (const demand of matchingDemands) {
        const demandQty = demand[row.productKey];
        if (demandQty === undefined || demandQty === null) continue;
        const dq = Number(demandQty);
        if (!isNaN(dq) && Math.abs(dq - mrpQty) > 0.001) {
          const existingMsg = messages.find(m =>
            !m.type &&
            m.productKey === row.productKey &&
            m.period?.trim().toLowerCase() === rowPeriod &&
            m.toUserCountry?.trim().toLowerCase() === rowCountry &&
            m.toUserId === demand.userId
          );
          discrepancies.push({
            productKey: row.productKey,
            period: row.period,
            country: row.country,
            demandQty: dq,
            mrpQty,
            difference: dq - mrpQty,
            demandUserId: demand.userId,
            demandUsername: demand.username,
            message: existingMsg || null,
          });
        }
      }
    }
  }

  const inventoryDiscrepancies = [];
  if (activeMrp?.rows) {
    for (const row of activeMrp.rows) {
      if (row.currentInventoryQty == null) continue;
      if (!row.country) continue;
      const rowCountry = row.country.trim().toLowerCase();
      const rowPeriod = row.period.trim().toLowerCase();
      const mrpInvQty = Number(row.currentInventoryQty) || 0;
      const matchingDemands = demands.filter(d => {
        const effectiveCountry = (d.country?.trim() || usersMap[d.userId]?.country?.trim() || "").toLowerCase();
        return d.month?.trim().toLowerCase() === rowPeriod && effectiveCountry === rowCountry;
      });
      for (const demand of matchingDemands) {
        if (!demand.currentInventory) continue;
        const demandInvQty = demand.currentInventory[row.productKey];
        if (demandInvQty === undefined || demandInvQty === null) continue;
        const diq = Number(demandInvQty);
        if (!isNaN(diq) && Math.abs(diq - mrpInvQty) > 0.001) {
          const existingMsg = messages.find(m =>
            m.type === "inventory_discrepancy" &&
            m.productKey === row.productKey &&
            m.period?.trim().toLowerCase() === rowPeriod &&
            m.toUserCountry?.trim().toLowerCase() === rowCountry &&
            m.toUserId === demand.userId
          );
          inventoryDiscrepancies.push({
            productKey: row.productKey,
            period: row.period,
            country: row.country,
            demandInventoryQty: diq,
            mrpInventoryQty: mrpInvQty,
            difference: diq - mrpInvQty,
            demandUserId: demand.userId,
            demandUsername: demand.username,
            message: existingMsg || null,
          });
        }
      }
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#4A9E4A]" /></div>;

  if (!activeMrp) {
    return (
      <div className="text-center py-10">
        <AlertTriangle className="w-8 h-8 text-gray-200 mx-auto mb-2" />
        <p className="text-gray-400 text-sm">No active MRP import. Set one active in the MRP Imports tab to detect discrepancies.</p>
      </div>
    );
  }

  const orphanedRows = (activeMrp.rows || []).filter(row => {
    if (!row.country) return false;
    const rowCountry = row.country.trim().toLowerCase();
    const rowPeriod = (row.period || "").trim().toLowerCase();
    return !demands.some(d => {
      const effectiveCountry = (d.country?.trim() || usersMap[d.userId]?.country?.trim() || "").toLowerCase();
      return d.month?.trim().toLowerCase() === rowPeriod && effectiveCountry === rowCountry;
    });
  });

  const renderDemandTab = () => {
    if (discrepancies.length === 0) {
      return (
        <div className="space-y-4">
          {orphanedRows.length > 0 ? (
            <>
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    {orphanedRows.length} MRP row{orphanedRows.length !== 1 ? "s" : ""} could not be matched to any demand submission
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    No approved user has their country set to the value below, or no submission exists for that period. Set the user&apos;s country in Active Accounts to match exactly.
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-amber-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-amber-50 border-b border-amber-200">
                      {["MRP Country (exact)", "Period", "Product Key", "MRP Qty (t)", "Issue"].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-amber-700 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {orphanedRows.map((row, i) => {
                      const anyUserHasCountry = Object.values(usersMap).some(
                        u => (u.country || "").trim().toLowerCase() === row.country.trim().toLowerCase()
                      );
                      return (
                        <tr key={i} className="bg-white">
                          <td className="px-4 py-3 font-mono text-sm font-semibold text-amber-800">{row.country}</td>
                          <td className="px-4 py-3 text-gray-700">{row.period}</td>
                          <td className="px-4 py-3 font-mono text-gray-700">{row.productKey}</td>
                          <td className="px-4 py-3 tabular-nums text-gray-700">{(row.suggestedQty ?? 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-xs text-amber-700">
                            {anyUserHasCountry
                              ? "User exists but has not submitted for this period yet"
                              : `No user has country "${row.country}" — update a user's country in Active Accounts`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="text-center py-10">
              <CheckCircle2 className="w-8 h-8 text-green-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm font-medium">No demand discrepancies found.</p>
              <p className="text-gray-400 text-xs mt-1">All matched submissions agree with the active MRP.</p>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["Country", "Product", "Period", "Demand Submitted (t)", "MRP Suggested (t)", "Difference (t)", "Status", ""].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {discrepancies.map((disc, i) => (
              <tr key={i} className={`${(disc.message?.status === "resolved" || disc.message?.status === "admin_resolved") ? "bg-green-50/40" : "hover:bg-amber-50/40"} transition-colors`}>
                <td className="px-4 py-3 font-medium text-gray-800">{disc.country}</td>
                <td className="px-4 py-3 text-gray-700">{productName(disc.productKey)}</td>
                <td className="px-4 py-3 text-gray-600">{disc.period}</td>
                <td className="px-4 py-3 tabular-nums font-semibold text-gray-800">{disc.demandQty.toFixed(2)}</td>
                <td className="px-4 py-3 tabular-nums text-amber-700 font-semibold">{disc.mrpQty.toFixed(2)}</td>
                <td className={`px-4 py-3 tabular-nums font-semibold ${disc.difference > 0 ? "text-blue-600" : "text-red-600"}`}>
                  {disc.difference > 0 ? "+" : ""}{disc.difference.toFixed(2)}
                </td>
                <td className="px-4 py-3">
                  {disc.message ? (
                    disc.message.status === "resolved" ? (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                        <span className="text-xs text-green-700 font-medium">Resolved</span>
                      </div>
                    ) : disc.message.status === "admin_resolved" ? (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                        <span className="text-xs text-blue-700 font-medium">Admin resolved</span>
                      </div>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">Pending reply</span>
                    )
                  ) : (
                    <span className="text-xs text-gray-400">No message</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {disc.message?.status === "resolved" ? (
                    <div className="max-w-[200px]">
                      <p className="text-xs text-green-700 font-medium">Chose: {disc.message.resolvedQty?.toFixed(2) ?? "—"} t</p>
                      {disc.message.countryHeadResponse && (
                        <p className="text-xs text-gray-400 italic truncate mt-0.5" title={disc.message.countryHeadResponse}>{disc.message.countryHeadResponse}</p>
                      )}
                    </div>
                  ) : disc.message?.status === "admin_resolved" ? (
                    <div className="max-w-[200px]">
                      <p className="text-xs text-blue-700 font-medium">Chose: {disc.message.resolvedQty?.toFixed(2) ?? "—"} t</p>
                      <p className="text-xs text-gray-400 mt-0.5">({disc.message.adminChoice === "demand" ? "manual demand" : "MRP"})</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); setResolveTarget(disc); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 border border-blue-300 hover:bg-blue-50 transition-colors whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Resolve
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setMessageTarget(disc); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#2D6A2D] border border-[#2D6A2D] hover:bg-green-50 transition-colors whitespace-nowrap"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        {disc.message ? "Re-message" : "Message"}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderInventoryTab = () => {
    if (inventoryDiscrepancies.length === 0) {
      return (
        <div className="text-center py-10">
          <CheckCircle2 className="w-8 h-8 text-green-300 mx-auto mb-2" />
          <p className="text-gray-500 text-sm font-medium">No inventory discrepancies found.</p>
          <p className="text-gray-400 text-xs mt-1">Country head inventory levels match the active MRP, or MRP has no inventory data.</p>
        </div>
      );
    }
    return (
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["Country", "Product", "Period", "Reported by CH (t)", "MRP Expected (t)", "Difference (t)", "Status", ""].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {inventoryDiscrepancies.map((disc, i) => (
              <tr key={i} className={`${disc.message?.status === "admin_resolved" ? "bg-blue-50/40" : "hover:bg-blue-50/30"} transition-colors`}>
                <td className="px-4 py-3 font-medium text-gray-800">{disc.country}</td>
                <td className="px-4 py-3 text-gray-700">{productName(disc.productKey)}</td>
                <td className="px-4 py-3 text-gray-600">{disc.period}</td>
                <td className="px-4 py-3 tabular-nums font-semibold text-gray-800">{disc.demandInventoryQty.toFixed(2)}</td>
                <td className="px-4 py-3 tabular-nums text-blue-700 font-semibold">{disc.mrpInventoryQty.toFixed(2)}</td>
                <td className={`px-4 py-3 tabular-nums font-semibold ${disc.difference > 0 ? "text-blue-600" : "text-red-600"}`}>
                  {disc.difference > 0 ? "+" : ""}{disc.difference.toFixed(2)}
                </td>
                <td className="px-4 py-3">
                  {disc.message?.status === "admin_resolved" ? (
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="text-xs text-blue-700 font-medium">Resolved</span>
                    </div>
                  ) : disc.message ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">Pending reply</span>
                  ) : (
                    <span className="text-xs text-gray-400">No message</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {disc.message?.status === "admin_resolved" ? (
                    <div className="max-w-[200px]">
                      <p className="text-xs text-blue-700 font-medium">Accepted: {disc.message.resolvedQty?.toFixed(2) ?? "—"} t</p>
                      <p className="text-xs text-gray-400 mt-0.5">({disc.message.adminChoice === "demand" ? "country head" : "MRP"})</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); setInvResolveTarget(disc); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 border border-blue-300 hover:bg-blue-50 transition-colors whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Resolve
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setInvMessageTarget(disc); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#2D6A2D] border border-[#2D6A2D] hover:bg-green-50 transition-colors whitespace-nowrap"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        {disc.message ? "Re-message" : "Message"}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-400">
          Comparing active MRP &quot;{activeMrp.label}&quot; against submitted data. Only combinations where both sides exist are shown.
        </p>
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          <button
            onClick={() => setDiscTab("demand")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${discTab === "demand" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            Demand Quantities
            {discrepancies.length > 0 && <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold text-xs">{discrepancies.length}</span>}
          </button>
          <button
            onClick={() => setDiscTab("inventory")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${discTab === "inventory" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            Inventory Levels
            {inventoryDiscrepancies.length > 0 && <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold text-xs">{inventoryDiscrepancies.length}</span>}
          </button>
        </div>
      </div>

      {discTab === "demand" ? renderDemandTab() : renderInventoryTab()}

      {messageTarget && <MessageCountryHeadModal discrepancy={messageTarget} onClose={() => setMessageTarget(null)} />}
      {resolveTarget && <AdminResolveModal discrepancy={resolveTarget} onClose={() => setResolveTarget(null)} />}
      {invMessageTarget && <InventoryMessageModal discrepancy={invMessageTarget} onClose={() => setInvMessageTarget(null)} />}
      {invResolveTarget && <InventoryResolveModal discrepancy={invResolveTarget} onClose={() => setInvResolveTarget(null)} />}
    </div>
  );
}

// ─── Orders Section ───────────────────────────────────────────────────────────
function CreateOrderModal({ country, countryUserId, products, activeMrp, currentUser, userProfile, onClose, onCreated }) {
  const MONTHS_LIST = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const CURRENT_MONTH_STR = (() => { const d = new Date(); return `${MONTHS_LIST[d.getMonth()]} ${d.getFullYear()}`; })();

  // Fetch inventory and demands exactly like CalculatedOrderTab does
  const [countryInventory, setCountryInventory] = useState([]);
  const [countryDemands, setCountryDemands] = useState([]);
  const [countryMessages, setCountryMessages] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "inventory"), where("entity", "==", country));
    return onSnapshot(q, snap => {
      setCountryInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setDataLoading(false);
    }, () => setDataLoading(false));
  }, [country]);

  useEffect(() => {
    // Use userId-based query (same as country head) so no demand is missed
    const q = countryUserId
      ? query(collection(db, "demands"), where("userId", "==", countryUserId))
      : query(collection(db, "demands"), where("country", "==", country));
    return onSnapshot(q, snap => {
      setCountryDemands(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [countryUserId, country]);

  useEffect(() => {
    if (!countryUserId) return;
    const q = query(collection(db, "messages"), where("toUserId", "==", countryUserId));
    return onSnapshot(q, snap => {
      setCountryMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [countryUserId]);

  const getCalcQty = (productKey) => {
    const thisMonthDemand = countryDemands.find(d => d.month === CURRENT_MONTH_STR);
    const baseCurrent = thisMonthDemand?.currentInventory?.[productKey] ?? 0;
    const receivedOrderQty = countryInventory.filter(i => (!i.levelType || i.levelType === "current") && i.source === "order" && i.deliveredAt && i.productKey === productKey).reduce((s, b) => s + (b.qty || 0), 0);
    const currentQty = baseCurrent + receivedOrderQty;
    const desiredQty = thisMonthDemand?.desiredInventory?.[productKey] ?? 0;
    // Use resolved demand if discrepancy was resolved
    const resolvedMsg = countryMessages.find(m =>
      !m.type && m.productKey === productKey && m.period === CURRENT_MONTH_STR &&
      (m.status === "resolved" || m.status === "admin_resolved")
    );
    let expectedDemand;
    if (resolvedMsg) {
      expectedDemand = resolvedMsg.resolvedQty ?? 0;
    } else {
      expectedDemand = thisMonthDemand ? (Number(thisMonthDemand[productKey]) || 0) : 0;
      if (!expectedDemand && activeMrp?.rows) {
        const mrpRow = activeMrp.rows.find(r => r.productKey === productKey && r.country?.trim().toLowerCase() === country.trim().toLowerCase());
        if (mrpRow) expectedDemand = typeof mrpRow.suggestedQty === "number" ? mrpRow.suggestedQty : parseFloat(mrpRow.suggestedQty) || 0;
      }
    }
    return Math.max(0, desiredQty + expectedDemand - currentQty);
  };

  const [mode, setMode] = useState("all"); // "all" | "single"
  const [selectedProduct, setSelectedProduct] = useState(products[0]?.key || "");
  const [period, setPeriod] = useState(CURRENT_MONTH_STR);
  const [qtys, setQtys] = useState({});
  const [notes, setNotes] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Populate default qtys once country data has loaded
  useEffect(() => {
    if (dataLoading) return;
    setQtys(prev => {
      const next = { ...prev };
      products.forEach(p => {
        if (next[p.key] === undefined) next[p.key] = getCalcQty(p.key).toFixed(2);
      });
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataLoading, countryInventory, countryDemands]);

  const handleCreate = async () => {
    setSaving(true); setError("");
    try {
      const keys = mode === "all" ? products.map(p => p.key) : [selectedProduct];
      const items = keys.map(k => ({
        productKey: k,
        orderedQty: parseFloat(qtys[k]) || 0,
        adminNote: (notes[k] || "").trim(),
      }));
      await addDoc(collection(db, "orders"), {
        country,
        status: "open",
        period,
        items,
        createdAt: serverTimestamp(),
        createdBy: userProfile?.username || currentUser?.uid || "Admin",
        countryHeadComment: null,
        inventoryBatchIds: [],
        adminSeenReceipt: null,
      });
      onCreated();
      onClose();
    } catch (e) { console.error(e); setError("Failed to create order."); }
    finally { setSaving(false); }
  };

  const displayProducts = mode === "all" ? products : products.filter(p => p.key === selectedProduct);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {dataLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-2xl z-10">
            <Loader2 className="w-6 h-6 animate-spin text-[#4A9E4A]" />
          </div>
        )}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-[#2D6A2D]" />
            <h3 className="font-bold text-gray-800 text-sm">Create Order — {country}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
            <button onClick={() => setMode("all")} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${mode === "all" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>All Products</button>
            <button onClick={() => setMode("single")} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${mode === "single" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Single Product</button>
          </div>

          {mode === "single" && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Product</label>
              <select value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-[#4A9E4A] bg-white">
                {products.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Period</label>
            <input type="text" value={period} onChange={e => setPeriod(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-[#4A9E4A]" placeholder="e.g. May 2026" />
          </div>

          <div className="space-y-3">
            {displayProducts.map(p => (
              <div key={p.key} className="rounded-xl border border-gray-200 p-4 space-y-2">
                <p className="text-sm font-semibold text-gray-800">{p.name}</p>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Order Qty (t)</label>
                    <div className="relative">
                      <input type="number" min="0" step="0.01" value={qtys[p.key] ?? ""} onChange={e => setQtys(prev => ({ ...prev, [p.key]: e.target.value }))} className="w-full px-3 py-2 pr-8 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-[#4A9E4A] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">t</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Calculated: {getCalcQty(p.key).toFixed(2)} t</p>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Admin Note</label>
                    <input type="text" value={notes[p.key] || ""} onChange={e => setNotes(prev => ({ ...prev, [p.key]: e.target.value }))} placeholder="Optional note…" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-[#4A9E4A]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="p-5 border-t border-gray-100 shrink-0 flex gap-3">
          <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-60">Cancel</button>
          <button onClick={handleCreate} disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white text-sm font-semibold disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
            {saving ? "Creating…" : "Create Order"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteOrderModal({ order, onClose }) {
  const [deleting, setDeleting] = useState(false);
  const batchIds = order.inventoryBatchIds || [];
  const isReceived = order.status === "received";

  const handleDelete = async () => {
    setDeleting(true);
    try {
      if (isReceived && batchIds.length > 0) {
        for (const batchId of batchIds) {
          await deleteDoc(doc(db, "inventory", batchId));
        }
      }
      await deleteDoc(doc(db, "orders", order.id));
      onClose();
    } catch (e) { console.error(e); setDeleting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Delete Order</h3>
            <p className="text-sm text-gray-500">{order.country} · {order.period}</p>
          </div>
        </div>
        {isReceived && batchIds.length > 0 && (
          <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-200">
            <p className="text-xs text-amber-800 font-medium">
              This order was received. Deleting it will also remove the {batchIds.length} inventory batch{batchIds.length !== 1 ? "es" : ""} created upon receipt.
            </p>
          </div>
        )}
        <p className="text-sm text-gray-600 mb-5">This cannot be undone.</p>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={deleting} className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-60">Cancel</button>
          <button onClick={handleDelete} disabled={deleting} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-60">
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OrdersSection() {
  const { currentUser, userProfile } = useAuth();
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [demands, setDemands] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeMrp, setActiveMrp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("open"); // "open" | "all"
  const [summaryMode, setSummaryMode] = useState("month"); // "month" | "year"
  const [summaryMonth, setSummaryMonth] = useState(null); // null = current month
  const [expandedProduct, setExpandedProduct] = useState(null); // productKey | null
  const [createTarget, setCreateTarget] = useState(null); // country string
  const [editingOrder, setEditingOrder] = useState(null); // order id
  const [editQtys, setEditQtys] = useState({});
  const [editNotes, setEditNotes] = useState({});
  const [saving, setSaving] = useState(null);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    return onSnapshot(collection(db, "orders"), snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    getDocs(query(collection(db, "users"), where("isApproved", "==", true))).then(snap => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    return onSnapshot(query(collection(db, "products"), orderBy("order")), snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.archived));
    });
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "inventory"), snap => {
      setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    return onSnapshot(query(collection(db, "demands"), orderBy("submittedAt", "desc")), snap => {
      setDemands(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => !d.archived));
    });
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "messages"), snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    return onSnapshot(query(collection(db, "mrpImports"), where("isActive", "==", true)), snap => {
      setActiveMrp(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
    });
  }, []);

  const MONTHS_LIST_ORD = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const CURRENT_MONTH_ORD = `${MONTHS_LIST_ORD[new Date().getMonth()]} ${new Date().getFullYear()}`;

  const countries = [...new Set(users.map(u => u.country).filter(Boolean))].sort();

  // Helper: compute calculated order qty for a country+product (mirrors CalculatedOrderTab)
  const computeCalcQty = (country, productKey) => {
    const countryUserIds = users.filter(u => u.country === country).map(u => u.id);
    const thisMonthDemand = demands.find(d =>
      d.month === CURRENT_MONTH_ORD && (
        countryUserIds.includes(d.userId) ||
        (d.country || "").trim().toLowerCase() === country.trim().toLowerCase()
      )
    );
    const baseCurrent = thisMonthDemand?.currentInventory?.[productKey] ?? 0;
    const receivedOrderQty = inventory.filter(i =>
      (!i.levelType || i.levelType === "current") && i.source === "order" && i.deliveredAt &&
      i.productKey === productKey && i.entity?.trim().toLowerCase() === country.trim().toLowerCase()
    ).reduce((s, b) => s + (b.qty || 0), 0);
    const currentQty = baseCurrent + receivedOrderQty;
    const desiredQty = thisMonthDemand?.desiredInventory?.[productKey] ?? 0;
    const countryUserId = countryUserIds[0] || null;
    const resolvedMsg = countryUserId ? messages.find(m =>
      !m.type && m.productKey === productKey && m.period === CURRENT_MONTH_ORD &&
      m.toUserId === countryUserId &&
      (m.status === "resolved" || m.status === "admin_resolved")
    ) : null;
    let expectedDemand;
    if (resolvedMsg) {
      expectedDemand = resolvedMsg.resolvedQty ?? 0;
    } else {
      expectedDemand = thisMonthDemand ? (Number(thisMonthDemand[productKey]) || 0) : 0;
      if (!expectedDemand && activeMrp?.rows) {
        const mrpRow = activeMrp.rows.find(r =>
          r.productKey === productKey && r.country?.trim().toLowerCase() === country.trim().toLowerCase()
        );
        if (mrpRow) expectedDemand = typeof mrpRow.suggestedQty === "number" ? mrpRow.suggestedQty : parseFloat(mrpRow.suggestedQty) || 0;
      }
    }
    return Math.max(0, desiredQty + expectedDemand - currentQty);
  };

  const countryHasOpenOrder = (country) =>
    orders.some(o => o.country === country && o.status === "open");

  const fmtDate = (ts) => {
    if (!ts) return "—";
    const d = ts.toDate?.();
    return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
  };

  const startEdit = (order) => {
    const qMap = {};
    const nMap = {};
    (order.items || []).forEach(item => { qMap[item.productKey] = String(item.orderedQty ?? ""); nMap[item.productKey] = item.adminNote || ""; });
    setEditQtys(qMap); setEditNotes(nMap); setEditingOrder(order.id);
  };

  const handleSaveEdit = async (order) => {
    setSaving(order.id);
    try {
      const items = (order.items || []).map(item => ({
        ...item,
        orderedQty: parseFloat(editQtys[item.productKey]) || 0,
        adminNote: (editNotes[item.productKey] || "").trim(),
      }));
      await updateDoc(doc(db, "orders", order.id), { items });
      setEditingOrder(null);
    } catch (e) { console.error(e); }
    finally { setSaving(null); }
  };

  const handleMarkSeen = async (order) => {
    await updateDoc(doc(db, "orders", order.id), { adminSeenReceipt: true });
  };

  const ordersToShow = view === "open"
    ? orders.filter(o => o.status === "open")
    : orders;

  const newReceiptCount = orders.filter(o => o.status === "received" && o.adminSeenReceipt === false).length;

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#4A9E4A]" /></div>;

  return (
    <div className="space-y-5">
      {/* View toggle + notification */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          <button onClick={() => setView("open")} className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${view === "open" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Open Orders</button>
          <button onClick={() => setView("all")} className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${view === "all" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            Orders Placed
            {newReceiptCount > 0 && <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-bold text-xs">{newReceiptCount}</span>}
          </button>
        </div>
      </div>

      {/* Open Orders: aggregated calculated quantities */}
      {view === "open" && products.length > 0 && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Aggregated Requested Quantities — {CURRENT_MONTH_ORD}</p>
            <p className="text-xs text-gray-400 mt-0.5">Sum of calculated orders across all countries (Desired + Demand − Current)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Product","Type","Countries w/ Demand","Total Requested (t)"].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {products.map(p => {
                  const totalCalc = countries.reduce((s, c) => s + computeCalcQty(c, p.key), 0);
                  const countriesWithDemand = countries.filter(c => {
                    const cIds = users.filter(u => u.country === c).map(u => u.id);
                    return demands.some(d => d.month === CURRENT_MONTH_ORD && (cIds.includes(d.userId) || (d.country || "").trim().toLowerCase() === c.trim().toLowerCase()));
                  }).length;
                  const isExpanded = expandedProduct === p.key;
                  return (
                    <Fragment key={p.key}>
                      <tr
                        className="bg-white hover:bg-gray-50 cursor-pointer select-none"
                        onClick={() => setExpandedProduct(isExpanded ? null : p.key)}
                      >
                        <td className="px-4 py-2.5 font-medium text-gray-800">
                          <div className="flex items-center gap-1.5">
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                            {p.name}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.type === "FG" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>{p.type || "HF"}</span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{countriesWithDemand} / {countries.length}</td>
                        <td className="px-4 py-2.5 tabular-nums font-bold text-[#2D6A2D]">{totalCalc.toFixed(2)} t</td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={4} className="bg-gray-50 px-4 pb-3 pt-0">
                            <div className="rounded-xl border border-gray-100 overflow-hidden mt-2">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-white border-b border-gray-100">
                                    {["Country", "Demand Submitted", "Calc. Qty (t)", "Order Status"].map(h => (
                                      <th key={h} className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                  {countries.map(country => {
                                    const cIds = users.filter(u => u.country === country).map(u => u.id);
                                    const hasDemand = demands.some(d =>
                                      d.month === CURRENT_MONTH_ORD && (cIds.includes(d.userId) || (d.country || "").trim().toLowerCase() === country.trim().toLowerCase())
                                    );
                                    const calcQty = computeCalcQty(country, p.key);
                                    const hasOpen = orders.some(o => o.country === country && o.status === "open");
                                    return (
                                      <tr key={country} className="hover:bg-white">
                                        <td className="px-3 py-2 font-medium text-gray-700">{country}</td>
                                        <td className="px-3 py-2">
                                          {hasDemand
                                            ? <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">Yes</span>
                                            : <span className="text-gray-400">—</span>}
                                        </td>
                                        <td className="px-3 py-2 tabular-nums font-semibold text-[#2D6A2D]">{calcQty.toFixed(2)}</td>
                                        <td className="px-3 py-2">
                                          {hasOpen
                                            ? <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">Open order</span>
                                            : <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold">Not placed</span>}
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
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Country list for creating orders */}
      {view === "open" && (
        <div>
          <p className="text-xs text-gray-400 mb-3">Click a country to create an order based on calculated quantities.</p>
          {countries.length === 0 ? (
            <p className="text-sm text-gray-400">No approved country accounts found.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {countries.map(country => {
                const hasOpen = countryHasOpenOrder(country);
                const openCount = orders.filter(o => o.country === country && o.status === "open").length;
                return (
                  <button
                    key={country}
                    onClick={() => setCreateTarget(country)}
                    className={`rounded-xl border p-4 text-left transition-all hover:shadow-md ${hasOpen ? "border-amber-200 bg-amber-50/50" : "border-gray-200 bg-white hover:border-[#4A9E4A]"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[#2D6A2D]/10 flex items-center justify-center">
                          <Package className="w-4 h-4 text-[#2D6A2D]" />
                        </div>
                        <span className="font-semibold text-sm text-gray-800">{country}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                    {hasOpen && (
                      <p className="text-xs text-amber-600 mt-2">{openCount} open order{openCount !== 1 ? "s" : ""}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">Click to create order</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* All Orders: aggregated ordered summary by month or full year */}
      {view === "all" && products.length > 0 && orders.length > 0 && (() => {
        const currentYear = new Date().getFullYear();
        const allPeriods = [...new Set(orders.map(o => o.period).filter(Boolean))].sort((a, b) => {
          const parseP = s => { const [m, y] = s.split(" "); return new Date(`${m} 1, ${y}`); };
          return parseP(a) - parseP(b);
        });
        const activeSummaryMonth = summaryMonth ?? CURRENT_MONTH_ORD;
        const filteredOrders = summaryMode === "year"
          ? orders.filter(o => o.period?.endsWith(String(currentYear)))
          : orders.filter(o => o.period === activeSummaryMonth);
        const summaryLabel = summaryMode === "year"
          ? `Full Year ${currentYear}`
          : activeSummaryMonth;
        return (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex flex-wrap items-center gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Order Summary — {summaryLabel}</p>
                <p className="text-xs text-gray-400 mt-0.5">Total quantities across all countries per product</p>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <div className="flex gap-1 p-0.5 bg-gray-200 rounded-lg">
                  <button
                    onClick={() => setSummaryMode("month")}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${summaryMode === "month" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                  >By Month</button>
                  <button
                    onClick={() => setSummaryMode("year")}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${summaryMode === "year" ? "bg-white text-[#2D6A2D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                  >Full Year</button>
                </div>
                {summaryMode === "month" && (
                  <select
                    value={activeSummaryMonth}
                    onChange={e => setSummaryMonth(e.target.value)}
                    className="px-2 py-1 text-xs rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#4A9E4A]"
                  >
                    {allPeriods.length > 0 ? allPeriods.map(p => (
                      <option key={p} value={p}>{p}</option>
                    )) : (
                      <option value={CURRENT_MONTH_ORD}>{CURRENT_MONTH_ORD}</option>
                    )}
                  </select>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {["Product","Type","Total Ordered (t)","Open (t)","Received (t)"].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {products.map(p => {
                    const sumAll = filteredOrders.reduce((s, o) => s + ((o.items || []).find(it => it.productKey === p.key)?.orderedQty ?? 0), 0);
                    const sumOpen = filteredOrders.filter(o => o.status === "open").reduce((s, o) => s + ((o.items || []).find(it => it.productKey === p.key)?.orderedQty ?? 0), 0);
                    const sumReceived = filteredOrders.filter(o => o.status === "received").reduce((s, o) => s + ((o.items || []).find(it => it.productKey === p.key)?.orderedQty ?? 0), 0);
                    return (
                      <tr key={p.key} className="bg-white">
                        <td className="px-4 py-2.5 font-medium text-gray-800">{p.name}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.type === "FG" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>{p.type || "HF"}</span>
                        </td>
                        <td className="px-4 py-2.5 tabular-nums font-bold text-gray-800">{sumAll.toFixed(2)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-amber-700 font-semibold">{sumOpen.toFixed(2)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-green-700 font-semibold">{sumReceived.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Orders list */}
      {ordersToShow.length === 0 ? (
        <div className="text-center py-10">
          <ShoppingCart className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          <p className="text-gray-400 text-sm">{view === "open" ? "No open orders." : "No orders yet."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ordersToShow.map(order => {
            const isReceived = order.status === "received";
            const newReceipt = isReceived && order.adminSeenReceipt === false;
            const isExpanded = expandedOrder === order.id;
            const isEditing = editingOrder === order.id;
            return (
              <div key={order.id} className={`rounded-xl border overflow-hidden ${newReceipt ? "border-green-400 bg-green-50/30" : isReceived ? "border-green-200 bg-green-50/20" : "border-gray-200 bg-white"}`}>
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => { setExpandedOrder(isExpanded ? null : order.id); if (newReceipt) handleMarkSeen(order); }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-gray-800">{order.country}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-500">{order.period}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${isReceived ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                        {isReceived ? "Received" : "Open"}
                      </span>
                      {newReceipt && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-semibold">
                          <Bell className="w-3 h-3" />New receipt
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Created {fmtDate(order.createdAt)} by {order.createdBy}
                      {isReceived && order.receivedAt && ` · Received ${fmtDate(order.receivedAt)} by ${order.receivedBy}`}
                    </p>
                  </div>
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
                    {/* Country head comment */}
                    {order.countryHeadComment && (
                      <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Country head comment</p>
                        <p className="text-sm text-blue-800">{order.countryHeadComment}</p>
                      </div>
                    )}

                    {/* Items table */}
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            {["Product", "Ordered Qty (t)", "Admin Note"].map(h => (
                              <th key={h} className="text-left px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {(order.items || []).map(item => {
                            const prod = products.find(p => p.key === item.productKey);
                            return (
                              <tr key={item.productKey}>
                                <td className="px-3 py-2.5 font-medium text-gray-800">{prod?.name ?? item.productKey}</td>
                                <td className="px-3 py-2.5">
                                  {isEditing ? (
                                    <div className="relative">
                                      <input type="number" min="0" step="0.01" value={editQtys[item.productKey] ?? ""} onChange={e => setEditQtys(prev => ({ ...prev, [item.productKey]: e.target.value }))} className="w-24 px-2 py-1 rounded-lg border border-[#4A9E4A] text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                    </div>
                                  ) : (
                                    <span className="tabular-nums font-semibold text-[#2D6A2D]">{(item.orderedQty ?? 0).toFixed(2)}</span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5">
                                  {isEditing ? (
                                    <input type="text" value={editNotes[item.productKey] || ""} onChange={e => setEditNotes(prev => ({ ...prev, [item.productKey]: e.target.value }))} placeholder="Note…" className="w-full px-2 py-1 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-[#4A9E4A]" />
                                  ) : (
                                    <span className="text-gray-500">{item.adminNote || <span className="text-gray-300 italic">—</span>}</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      {isEditing ? (
                        <>
                          <button onClick={() => handleSaveEdit(order)} disabled={saving === order.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#2D6A2D] hover:bg-[#1A4A1A] text-white disabled:opacity-60">
                            {saving === order.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Save
                          </button>
                          <button onClick={() => setEditingOrder(null)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 border border-gray-200 hover:bg-gray-50">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(order)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:border-[#4A9E4A] hover:text-[#2D6A2D] transition-colors">
                            <Pencil className="w-3.5 h-3.5" />Edit Order
                          </button>
                          <button onClick={() => setDeleteTarget(order)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 border border-red-200 hover:bg-red-50 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {createTarget && (
        <CreateOrderModal
          country={createTarget}
          countryUserId={users.find(u => u.country === createTarget)?.id || null}
          products={products}
          activeMrp={activeMrp}
          currentUser={currentUser}
          userProfile={userProfile}
          onClose={() => setCreateTarget(null)}
          onCreated={() => setView("all")}
        />
      )}
      {deleteTarget && (
        <DeleteOrderModal order={deleteTarget} onClose={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}

// ─── Main Admin Dashboard ──────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [activeSection, setActiveSection] = useState("pending");
  const [pendingCount, setPendingCount] = useState(0);
  const [newReceiptCount, setNewReceiptCount] = useState(0);

  useEffect(() => {
    const q = query(collection(db, "users"), where("isApproved", "==", false), where("role", "==", "pending"));
    return onSnapshot(q, (snap) => setPendingCount(snap.size));
  }, []);

  useEffect(() => {
    const q = query(collection(db, "orders"), where("status", "==", "received"), where("adminSeenReceipt", "==", false));
    return onSnapshot(q, (snap) => setNewReceiptCount(snap.size));
  }, []);

  const sections = [
    { id: "pending", label: "Pending Approvals", icon: Users, badge: pendingCount > 0 ? pendingCount : null },
    { id: "active", label: "Active Accounts", icon: Shield },
    { id: "demand", label: "Demand Overview", icon: BarChart3 },
    { id: "products", label: "Products", icon: Package },
    { id: "inventory", label: "Inventory", icon: Layers },
    { id: "mrp", label: "MRP Imports", icon: FileSpreadsheet },
    { id: "orders", label: "Orders", icon: ShoppingCart, badge: newReceiptCount > 0 ? newReceiptCount : null },
    { id: "discrepancies", label: "Discrepancies", icon: AlertTriangle, subtle: true },
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
          {sections.map(({ id, label, icon: Icon, badge, subtle }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={subtle
                ? `flex items-center justify-center sm:justify-start gap-2 px-4 py-3 rounded-xl border transition-all text-xs font-medium ${
                    activeSection === id
                      ? "bg-amber-50 text-amber-700 border-amber-300"
                      : "bg-white text-gray-400 border-gray-200 hover:border-amber-200 hover:text-amber-600"
                  }`
                : `flex-1 flex items-center justify-center sm:justify-start gap-3 px-5 py-3.5 rounded-xl text-sm font-semibold border transition-all ${
                    activeSection === id
                      ? "bg-[#2D6A2D] text-white border-[#2D6A2D] shadow-md"
                      : "bg-white text-gray-600 border-gray-200 hover:border-[#4A9E4A] hover:text-[#2D6A2D]"
                  }`
              }
            >
              <Icon className={`shrink-0 ${subtle ? "w-3.5 h-3.5" : "w-4 h-4"}`} />
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
          {activeSection === "products" && <ProductManagement />}
          {activeSection === "inventory" && <InventoryManagement />}
          {activeSection === "mrp" && <MRPImportManagement />}
          {activeSection === "orders" && <OrdersSection />}
          {activeSection === "discrepancies" && <DiscrepanciesSection />}
        </div>
      </div>
    </Layout>
  );
}
