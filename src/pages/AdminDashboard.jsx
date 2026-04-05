import { useState, useEffect, useRef } from "react";
import {
  collection, query, where, doc, updateDoc,
  deleteDoc, onSnapshot, orderBy, getDocs, serverTimestamp,
  addDoc
} from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../firebase";
import Layout from "../components/Layout";
import {
  Users, CheckCircle, BarChart3, Package,
  Loader2, UserCheck, UserX,
  AlertCircle, Shield, Activity, Download,
  Trash2, X, Archive, History, BarChart2, Table,
  ChevronRight, Info, Plus, Pencil, Save, MessageSquare
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await updateDoc(doc(db, "products", product.id), {
      productId: productId.trim(),
      notes: notes.trim(),
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
              Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Additional notes about this product..."
              rows={4}
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

// ─── Product Management ────────────────────────────────────────────────────────
function ProductManagement() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [infoTarget, setInfoTarget] = useState(null);
  const [editTargetId, setEditTargetId] = useState(null);
  const [editName, setEditName] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const seedingRef = useRef(false);

  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("order"));
    const unsubscribe = onSnapshot(q, async (snap) => {
      if (snap.empty && !seedingRef.current) {
        seedingRef.current = true;
        const defaults = [
          { name: "Product 1", productId: "", notes: "", key: "product1Tons", order: 0 },
          { name: "Product 2", productId: "", notes: "", key: "product2Tons", order: 1 },
          { name: "Product 3", productId: "", notes: "", key: "product3Tons", order: 2 },
        ];
        for (const p of defaults) {
          await addDoc(collection(db, "products"), { ...p, createdAt: serverTimestamp() });
        }
      } else if (!snap.empty) {
        setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    });
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
      key: `product${nextNum}Tons`,
      order: maxOrder + 1,
      createdAt: serverTimestamp(),
    });
    setSaving(false);
    setAddingNew(false);
    setNewName("");
  };

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-[#4A9E4A]" />
    </div>
  );

  return (
    <>
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
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium text-gray-800">{product.name}</span>
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
              onKeyDown={e => { if (e.key === "Enter") handleAddProduct(); if (e.key === "Escape") { setAddingNew(false); setNewName(""); } }}
              placeholder="New product name..."
              autoFocus
              className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-[#4A9E4A] focus:outline-none focus:ring-2 focus:ring-[#4A9E4A]"
            />
            <button
              onClick={handleAddProduct}
              disabled={saving || !newName.trim()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#2D6A2D] text-white text-xs font-medium disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add
            </button>
            <button
              onClick={() => { setAddingNew(false); setNewName(""); }}
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

      {infoTarget && (
        <ProductInfoModal
          product={infoTarget}
          onClose={() => setInfoTarget(null)}
        />
      )}
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
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

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
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-4 py-3" />
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

  const [countryHistoryTarget, setCountryHistoryTarget] = useState(null);
  const [productHistoryTarget, setProductHistoryTarget] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("order"));
    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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

  const activeDemands = demands.filter(d => !d.archived);
  const filtered = activeDemands.filter(d => d.month === selectedMonth);

  const aggregated = {};
  products.forEach(p => {
    aggregated[p.key] = filtered.reduce((s, d) => s + (Number(d[p.key]) || 0), 0);
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
                        const total = products.reduce((s, p) => s + (Number(d[p.key]) || 0), 0);
                        const submittedAt = d.submittedAt?.toDate?.();
                        return (
                          <tr
                            key={d.id}
                            onClick={() => setCountryHistoryTarget({ userId: d.userId, username: d.username })}
                            className="hover:bg-green-50 transition-colors cursor-pointer group"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-[#2D6A2D] flex items-center justify-center shrink-0">
                                  <span className="text-white font-bold text-xs">
                                    {d.username?.charAt(0)?.toUpperCase()}
                                  </span>
                                </div>
                                <span className="font-medium text-gray-800 group-hover:text-[#2D6A2D]">{d.username}</span>
                                <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#2D6A2D] transition-colors" />
                              </div>
                            </td>
                            {products.map(p => (
                              <td key={p.key} className="px-4 py-3 text-right text-gray-700 tabular-nums">{Number(d[p.key] || 0).toFixed(2)}</td>
                            ))}
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
    { id: "products", label: "Products", icon: Package },
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
          {activeSection === "products" && <ProductManagement />}
        </div>
      </div>
    </Layout>
  );
}
