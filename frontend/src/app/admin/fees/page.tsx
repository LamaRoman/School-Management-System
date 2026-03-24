"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Save, Trash2, Printer, X, Receipt, Edit2, ArrowLeft, ChevronRight, FileText } from "lucide-react";
import { printReceipt, printInvoice, printBulkInvoices } from "@/lib/feePrintUtils";

interface FeeCategory { id: string; name: string; description?: string }
interface Grade { id: string; name: string; sections?: { id: string; name: string }[] }
interface ExamType { id: string; name: string }
interface FeeStructure { id: string; feeCategoryId: string; amount: number; frequency: string; examTypeId?: string; feeCategory: { name: string }; examType?: { name: string } }
interface StudentOverview { id: string; name: string; rollNo?: number; totalDueUpToNow: number; totalPaid: number; balance: number; paidUpTo: string; pendingMonths: number }
interface MonthEntry { month: string; monthIndex: number; totalDue: number; totalPaid: number; status: string; categories: { categoryId: string; categoryName: string; amount: number; paid: number }[] }
interface LedgerData {
  student: { id: string; name: string; rollNo?: number; className: string; section: string };
  monthGrid: MonthEntry[]; fixedFees: any[]; recentPayments: any[];
}

const frequencies = [
  { value: "MONTHLY", label: "Monthly (×12)" }, { value: "ANNUAL", label: "Annual (×1)" },
  { value: "ONE_TIME", label: "One-Time" }, { value: "PER_EXAM", label: "Per Exam" },
];
const nepaliMonths = ["Baisakh","Jestha","Ashadh","Shrawan","Bhadra","Ashwin","Kartik","Mangsir","Poush","Magh","Falgun","Chaitra"];

type Tab = "categories" | "structure" | "collection" | "discounts";

export default function FeeManagementPage() {
  const [tab, setTab] = useState<Tab>("categories");
  const [activeYear, setActiveYear] = useState<any>(null);
  const [categories, setCategories] = useState<FeeCategory[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const year = await api.get<any>("/academic-years/active");
        setActiveYear(year);
        const [cats, g, et] = await Promise.all([
          api.get<FeeCategory[]>("/fees/categories"),
          year ? api.get<Grade[]>(`/grades?academicYearId=${year.id}`) : Promise.resolve([]),
          year ? api.get<ExamType[]>(`/exam-types?academicYearId=${year.id}`) : Promise.resolve([]),
        ]);
        setCategories(cats); setGrades(g); setExamTypes(et);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-primary">Fee Management</h1>
        <p className="text-sm text-gray-500 mt-1">Categories, structure, scholarships, and collection</p>
      </div>
      <div className="flex gap-1 mb-6 border-b">
        {([{ key: "categories", label: "Fee Categories" }, { key: "structure", label: "Fee Structure" }, { key: "discounts", label: "Scholarships" }, { key: "collection", label: "Fee Collection" }] as { key: Tab; label: string }[]).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${tab === t.key ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-primary"}`}>{t.label}</button>
        ))}
      </div>
      {tab === "categories" && <CategoriesTab categories={categories} setCategories={setCategories} />}
      {tab === "structure" && activeYear && <StructureTab activeYear={activeYear} categories={categories} grades={grades} examTypes={examTypes} />}
      {tab === "discounts" && activeYear && <DiscountsTab activeYear={activeYear} categories={categories} grades={grades} />}
      {tab === "collection" && activeYear && <CollectionTab activeYear={activeYear} grades={grades} />}
    </div>
  );
}

// ─── CATEGORIES TAB ─────────────────────────────────────

function CategoriesTab({ categories, setCategories }: { categories: FeeCategory[]; setCategories: (c: FeeCategory[]) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState(""); const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState(""); const [editDesc, setEditDesc] = useState("");

  const fetchCategories = async () => { setCategories(await api.get<FeeCategory[]>("/fees/categories")); };
  const handleAdd = async () => { if (!name.trim()) return; try { await api.post("/fees/categories", { name: name.trim(), description: description.trim() || undefined }); toast.success("Added"); setName(""); setDescription(""); setShowForm(false); await fetchCategories(); } catch (e: any) { toast.error(e.message); } };
  const handleStartEdit = (cat: FeeCategory) => { setEditingId(cat.id); setEditName(cat.name); setEditDesc(cat.description || ""); };
  const handleSaveEdit = async () => { if (!editingId || !editName.trim()) return; try { await api.put(`/fees/categories/${editingId}`, { name: editName.trim(), description: editDesc.trim() || undefined }); toast.success("Updated"); setEditingId(null); await fetchCategories(); } catch (e: any) { toast.error(e.message); } };
  const handleDelete = async (id: string) => { if (!confirm("Remove?")) return; try { await api.delete(`/fees/categories/${id}`); toast.success("Removed"); await fetchCategories(); } catch (e: any) { toast.error(e.message); } };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-primary">{categories.length} Categories</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs"><Plus size={14} /> Add</button>
      </div>
      {showForm && (<div className="card p-4 mb-4"><div className="flex gap-3 items-end"><div className="flex-1"><label className="label">Name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Tuition Fee" /></div><div className="flex-1"><label className="label">Description</label><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></div><button onClick={handleAdd} className="btn-primary text-xs">Add</button><button onClick={() => setShowForm(false)} className="btn-ghost text-xs"><X size={14} /></button></div></div>)}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="table-header"><th className="text-left px-5 py-3">#</th><th className="text-left px-5 py-3">Name</th><th className="text-left px-5 py-3">Description</th><th className="text-right px-5 py-3">Actions</th></tr></thead>
          <tbody>{categories.map((cat, i) => (
            <tr key={cat.id} className="border-t border-gray-100 hover:bg-surface">
              <td className="px-5 py-3 text-gray-400">{i + 1}</td>
              <td className="px-5 py-3">{editingId === cat.id ? <input className="text-sm px-2 py-1 border border-primary rounded w-full" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus /> : <span className="font-medium text-primary">{cat.name}</span>}</td>
              <td className="px-5 py-3">{editingId === cat.id ? <input className="text-sm px-2 py-1 border border-gray-200 rounded w-full" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} /> : <span className="text-gray-500">{cat.description || "—"}</span>}</td>
              <td className="px-5 py-3 text-right">{editingId === cat.id ? (<><button onClick={handleSaveEdit} className="text-xs text-primary hover:underline">Save</button><button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:underline ml-2">Cancel</button></>) : (<><button onClick={() => handleStartEdit(cat)} className="p-1.5 hover:bg-surface rounded text-gray-400 hover:text-primary"><Edit2 size={14} /></button><button onClick={() => handleDelete(cat.id)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600"><Trash2 size={14} /></button></>)}</td>
            </tr>))}</tbody>
        </table>
        {categories.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">No categories.</div>}
      </div>
    </div>
  );
}

// ─── STRUCTURE TAB ──────────────────────────────────────

function StructureTab({ activeYear, categories, grades, examTypes }: { activeYear: any; categories: FeeCategory[]; grades: Grade[]; examTypes: ExamType[] }) {
  const [selectedGrade, setSelectedGrade] = useState("");
  const [entries, setEntries] = useState<{ feeCategoryId: string; amount: number; frequency: string; examTypeId?: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const handleGradeChange = async (gradeId: string) => {
    setSelectedGrade(gradeId);
    try { const data = await api.get<FeeStructure[]>(`/fees/structure?academicYearId=${activeYear.id}&gradeId=${gradeId}`); setEntries(data.length > 0 ? data.map((s) => ({ feeCategoryId: s.feeCategoryId, amount: s.amount, frequency: s.frequency, examTypeId: s.examTypeId || undefined })) : categories.map((c) => ({ feeCategoryId: c.id, amount: 0, frequency: "MONTHLY" }))); } catch { setEntries([]); }
  };
  const handleEntryChange = (i: number, f: string, v: any) => { setEntries((p) => { const u = [...p]; u[i] = { ...u[i], [f]: v }; if (f === "frequency" && v !== "PER_EXAM") u[i].examTypeId = undefined; return u; }); };
  const handleAddRow = () => { setEntries((p) => [...p, { feeCategoryId: "", amount: 0, frequency: "PER_EXAM", examTypeId: "" }]); };
  const handleRemoveRow = (i: number) => { setEntries((p) => p.filter((_, idx) => idx !== i)); };
  const handleSave = async () => { if (!selectedGrade) return; const valid = entries.filter((e) => e.feeCategoryId && e.amount > 0); setSaving(true); try { await api.post("/fees/structure/bulk", { academicYearId: activeYear.id, gradeId: selectedGrade, entries: valid }); toast.success(valid.length > 0 ? "Saved" : "Cleared"); } catch (e: any) { toast.error(e.message); } finally { setSaving(false); } };
  const handleCopyToAll = async () => { if (!selectedGrade || !confirm("Copy to ALL grades?")) return; setSaving(true); try { const valid = entries.filter((e) => e.feeCategoryId && e.amount > 0); for (const g of grades) { if (g.id !== selectedGrade) await api.post("/fees/structure/bulk", { academicYearId: activeYear.id, gradeId: g.id, entries: valid }); } toast.success(`Copied to ${grades.length - 1} grades`); } catch (e: any) { toast.error(e.message); } finally { setSaving(false); } };
  const calcAnnual = (e: { amount: number; frequency: string }) => e.frequency === "MONTHLY" ? e.amount * 12 : e.amount;

  return (
    <div>
      <div className="mb-4"><label className="label">Grade</label><select className="input max-w-xs" value={selectedGrade} onChange={(e) => handleGradeChange(e.target.value)}><option value="">Select</option>{grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
      {selectedGrade && entries.length > 0 && (
        <div className="card overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead><tr className="table-header"><th className="text-left px-4 py-2">Category</th><th className="w-28 px-4 py-2">Amount</th><th className="w-36 px-4 py-2">Frequency</th><th className="w-36 px-4 py-2">Exam</th><th className="w-28 text-right px-4 py-2">Annual</th><th className="w-12"></th></tr></thead>
            <tbody>{entries.map((entry, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-4 py-2"><select value={entry.feeCategoryId} onChange={(e) => handleEntryChange(i, "feeCategoryId", e.target.value)} className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded"><option value="">Select</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
                <td className="px-4 py-2"><input type="number" min={0} value={entry.amount || ""} onChange={(e) => handleEntryChange(i, "amount", parseFloat(e.target.value) || 0)} className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded" /></td>
                <td className="px-4 py-2"><select value={entry.frequency} onChange={(e) => handleEntryChange(i, "frequency", e.target.value)} className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded">{frequencies.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select></td>
                <td className="px-4 py-2">{entry.frequency === "PER_EXAM" ? <select value={entry.examTypeId || ""} onChange={(e) => handleEntryChange(i, "examTypeId", e.target.value)} className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded"><option value="">Select</option>{examTypes.map((et) => <option key={et.id} value={et.id}>{et.name}</option>)}</select> : <span className="text-xs text-gray-400">—</span>}</td>
                <td className="px-4 py-2 text-right font-semibold text-primary">Rs {calcAnnual(entry).toLocaleString()}</td>
                <td className="px-4 py-2"><button onClick={() => handleRemoveRow(i)} className="p-1 hover:bg-red-50 rounded text-gray-300 hover:text-red-600"><Trash2 size={12} /></button></td>
              </tr>))}</tbody>
            <tfoot><tr className="border-t-2 border-primary"><td colSpan={4} className="px-4 py-2 text-right font-bold text-primary">Total Annual</td><td className="px-4 py-2 text-right font-bold text-primary">Rs {entries.reduce((s, e) => s + calcAnnual(e), 0).toLocaleString()}</td><td></td></tr></tfoot>
          </table>
        </div>
      )}
      {selectedGrade && entries.length === 0 && <div className="card p-6 mb-4 text-center text-gray-400 text-sm">No entries. Add below.</div>}
      {selectedGrade && (<div className="flex gap-2"><button onClick={handleAddRow} className="btn-ghost text-xs"><Plus size={14} /> Add Per-Exam Row</button><button onClick={handleSave} disabled={saving} className="btn-primary text-sm"><Save size={16} /> {saving ? "Saving..." : "Save"}</button><button onClick={handleCopyToAll} disabled={saving} className="btn-outline text-xs">Copy to All</button></div>)}
      {!selectedGrade && <div className="card p-8 text-center text-gray-400">Select a grade.</div>}
    </div>
  );
}

// ─── DISCOUNTS TAB ──────────────────────────────────────

function DiscountsTab({ activeYear, categories, grades }: { activeYear: any; categories: FeeCategory[]; grades: Grade[] }) {
  const [selectedGrade, setSelectedGrade] = useState(""); const [sections, setSections] = useState<any[]>([]);
  const [selectedSection, setSelectedSection] = useState(""); const [students, setStudents] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState(""); const [overrides, setOverrides] = useState<any[]>([]);
  const [form, setForm] = useState({ feeCategoryId: "", discountType: "PERCENTAGE", discountPercent: "", overrideAmount: "", reason: "" });

  const handleGradeChange = async (id: string) => { setSelectedGrade(id); setSelectedSection(""); setStudents([]); setSelectedStudent(""); setOverrides([]); try { const all = await api.get<Grade[]>(`/grades?academicYearId=${activeYear.id}`); setSections(all.find((g) => g.id === id)?.sections || []); } catch { setSections([]); } };
  const handleSectionChange = async (id: string) => { setSelectedSection(id); setSelectedStudent(""); setOverrides([]); try { setStudents(await api.get<any[]>(`/students?sectionId=${id}`)); } catch { setStudents([]); } };
  const handleStudentChange = async (id: string) => { setSelectedStudent(id); try { setOverrides(await api.get<any[]>(`/fees/overrides?studentId=${id}&academicYearId=${activeYear.id}`)); } catch { setOverrides([]); } };
  const handleAdd = async () => { if (!selectedStudent || !form.feeCategoryId) return; try { await api.post("/fees/overrides", { studentId: selectedStudent, feeCategoryId: form.feeCategoryId, academicYearId: activeYear.id, discountType: form.discountType, overrideAmount: form.discountType === "FLAT" ? parseFloat(form.overrideAmount) || 0 : 0, discountPercent: form.discountType === "PERCENTAGE" ? parseFloat(form.discountPercent) || 0 : undefined, reason: form.reason || undefined }); toast.success("Applied"); setForm({ feeCategoryId: "", discountType: "PERCENTAGE", discountPercent: "", overrideAmount: "", reason: "" }); handleStudentChange(selectedStudent); } catch (e: any) { toast.error(e.message); } };
  const handleRemove = async (id: string) => { try { await api.delete(`/fees/overrides/${id}`); toast.success("Removed"); handleStudentChange(selectedStudent); } catch (e: any) { toast.error(e.message); } };

  return (
    <div>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div><label className="label">Grade</label><select className="input" value={selectedGrade} onChange={(e) => handleGradeChange(e.target.value)}><option value="">Select</option>{grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
        <div><label className="label">Section</label><select className="input" value={selectedSection} onChange={(e) => handleSectionChange(e.target.value)}><option value="">Select</option>{sections.map((s: any) => <option key={s.id} value={s.id}>Section {s.name}</option>)}</select></div>
        <div><label className="label">Student</label><select className="input" value={selectedStudent} onChange={(e) => handleStudentChange(e.target.value)}><option value="">Select</option>{students.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      </div>
      {selectedStudent && (<>
        <div className="card p-4 mb-4"><h3 className="text-sm font-semibold text-primary mb-3">Add Discount</h3>
          <div className="grid grid-cols-5 gap-3 items-end">
            <div><label className="label">Category</label><select className="input" value={form.feeCategoryId} onChange={(e) => setForm({ ...form, feeCategoryId: e.target.value })}><option value="">Select</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className="label">Type</label><select className="input" value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}><option value="PERCENTAGE">Percentage</option><option value="FLAT">Flat Amount</option></select></div>
            <div>{form.discountType === "PERCENTAGE" ? <><label className="label">%</label><input className="input" type="number" min={0} max={100} value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} /></> : <><label className="label">Rs</label><input className="input" type="number" min={0} value={form.overrideAmount} onChange={(e) => setForm({ ...form, overrideAmount: e.target.value })} /></>}</div>
            <div><label className="label">Reason</label><input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Merit" /></div>
            <button onClick={handleAdd} className="btn-primary text-xs">Apply</button>
          </div>
        </div>
        {overrides.length > 0 && (<div className="card overflow-hidden"><table className="w-full text-sm"><thead><tr className="table-header"><th className="text-left px-4 py-2">Category</th><th className="text-center px-4 py-2">Type</th><th className="text-center px-4 py-2">Discount</th><th className="text-left px-4 py-2">Reason</th><th className="w-12"></th></tr></thead><tbody>{overrides.map((o: any) => (<tr key={o.id} className="border-t border-gray-100"><td className="px-4 py-2 font-medium text-primary">{o.feeCategory.name}</td><td className="px-4 py-2 text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${o.discountType === "PERCENTAGE" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>{o.discountType}</span></td><td className="px-4 py-2 text-center font-semibold">{o.discountType === "PERCENTAGE" ? `${o.discountPercent}%` : `Rs ${o.overrideAmount}`}</td><td className="px-4 py-2 text-gray-500">{o.reason || "—"}</td><td className="px-4 py-2"><button onClick={() => handleRemove(o.id)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600"><Trash2 size={14} /></button></td></tr>))}</tbody></table></div>)}
        {overrides.length === 0 && <div className="card p-6 text-center text-gray-400 text-sm">No discounts.</div>}
      </>)}
      {!selectedStudent && <div className="card p-8 text-center text-gray-400">Select grade, section, and student.</div>}
    </div>
  );
}

// ─── COLLECTION TAB (Redesigned) ────────────────────────

function CollectionTab({ activeYear, grades }: { activeYear: any; grades: Grade[] }) {
  const [sections, setSections] = useState<any[]>([]);
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [currentMonth, setCurrentMonth] = useState(nepaliMonths[9]); // Magh default
  const [overview, setOverview] = useState<StudentOverview[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(false);

  // Student ledger view
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Payment
  const [payMonths, setPayMonths] = useState<string[]>([]);
  const [payFixed, setPayFixed] = useState<{ categoryId: string; amount: number }[]>([]);
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<any>(null);

  const handleGradeChange = async (id: string) => {
    setSelectedGrade(id); setSelectedSection(""); setOverview([]); setLedger(null); setReceipt(null);
    try { const all = await api.get<Grade[]>(`/grades?academicYearId=${activeYear.id}`); setSections(all.find((g) => g.id === id)?.sections || []); } catch { setSections([]); }
  };

  const handleSectionChange = async (sectionId: string) => {
    setSelectedSection(sectionId); setLedger(null); setReceipt(null); setLoadingOverview(true);
    try { const data = await api.get<any>(`/fees/section-overview?sectionId=${sectionId}&academicYearId=${activeYear.id}&currentMonth=${currentMonth}`); setOverview(data.students || []); }
    catch { setOverview([]); } finally { setLoadingOverview(false); }
  };

  const handleMonthChange = (month: string) => {
    setCurrentMonth(month);
    if (selectedSection) {
      setLoadingOverview(true);
      api.get<any>(`/fees/section-overview?sectionId=${selectedSection}&academicYearId=${activeYear.id}&currentMonth=${month}`)
        .then((data) => setOverview(data.students || []))
        .catch(() => setOverview([]))
        .finally(() => setLoadingOverview(false));
    }
  };

  const handleOpenLedger = async (studentId: string) => {
    setReceipt(null); setLoadingLedger(true);
    try { const data = await api.get<LedgerData>(`/fees/student-ledger/${studentId}?academicYearId=${activeYear.id}`); setLedger(data); setPayMonths([]); setPayFixed([]); setPaymentDate(`${activeYear.yearBS}/${String(nepaliMonths.indexOf(currentMonth) + 1).padStart(2, "0")}/15`); }
    catch { setLedger(null); } finally { setLoadingLedger(false); }
  };

  const handleCloseLedger = () => { setLedger(null); setReceipt(null); };

  const togglePayMonth = (month: string) => {
    setPayMonths((prev) => prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month]);
  };

  const togglePayFixed = (categoryId: string, amount: number) => {
    setPayFixed((prev) => prev.some((f) => f.categoryId === categoryId) ? prev.filter((f) => f.categoryId !== categoryId) : [...prev, { categoryId, amount }]);
  };

  const calculateTotal = (): number => {
    if (!ledger) return 0;
    let total = 0;
    for (const month of payMonths) {
      const entry = ledger.monthGrid.find((m) => m.month === month);
      if (entry) total += entry.totalDue - entry.totalPaid;
    }
    for (const f of payFixed) total += f.amount;
    return total;
  };

  const handleCollect = async () => {
    if (!ledger || !paymentDate) return;
    const items: { feeCategoryId: string; amount: number; paidMonth?: string }[] = [];

    for (const month of payMonths) {
      const entry = ledger.monthGrid.find((m) => m.month === month);
      if (entry) {
        for (const cat of entry.categories) {
          const remaining = cat.amount - cat.paid;
          if (remaining > 0) items.push({ feeCategoryId: cat.categoryId, amount: remaining, paidMonth: month });
        }
      }
    }
    for (const f of payFixed) { items.push({ feeCategoryId: f.categoryId, amount: f.amount }); }

    if (items.length === 0) { toast.error("Select months or fees to collect"); return; }

    setSaving(true);
    try {
      const result = await api.post<any>("/fees/payments/bulk", { studentId: ledger.student.id, academicYearId: activeYear.id, paymentDate, paymentMethod, items });
      toast.success(`Receipt: ${result.receiptNumber}`);
      const receiptData = await api.get<any>(`/fees/receipt/${result.receiptNumber}`);
      setReceipt(receiptData);
      // Refresh ledger
      const newLedger = await api.get<LedgerData>(`/fees/student-ledger/${ledger.student.id}?academicYearId=${activeYear.id}`);
      setLedger(newLedger); setPayMonths([]); setPayFixed([]);
      // Refresh overview
      if (selectedSection) { const data = await api.get<any>(`/fees/section-overview?sectionId=${selectedSection}&academicYearId=${activeYear.id}&currentMonth=${currentMonth}`); setOverview(data.students || []); }
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const currentMonthIdx = nepaliMonths.indexOf(currentMonth);
  const totalCollected = overview.reduce((s, o) => s + o.totalPaid, 0);
  const totalPending = overview.reduce((s, o) => s + Math.max(0, o.balance), 0);

  return (
    <div>
      {/* Receipt notification */}
      {receipt && (
        <div className="card p-4 mb-4 border-2 border-emerald-300 bg-emerald-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Receipt size={20} className="text-emerald-600" />
              <div>
                <p className="font-semibold text-emerald-800">Payment Recorded — {receipt.receiptNumber}</p>
                <p className="text-xs text-emerald-600">{receipt.student.name} • Rs {receipt.totalAmount.toLocaleString()} • {receipt.paymentDate}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => printReceipt(receipt)} className="btn-primary text-xs"><Printer size={14} /> Print Receipt</button>
              <button onClick={() => setReceipt(null)} className="btn-ghost text-xs"><X size={14} /></button>
            </div>
          </div>
        </div>
      )}

      {/* Student Ledger View */}
      {ledger && !receipt && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <button onClick={handleCloseLedger} className="flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft size={16} /> Back to class list</button>
            <button onClick={async () => { try { const inv = await api.get<any>(`/fees/invoice/${ledger.student.id}?academicYearId=${activeYear.id}&month=${currentMonth}`); printInvoice(inv); } catch (e: any) { toast.error(e.message); } }} className="btn-outline text-xs"><FileText size={14} /> Print Invoice ({currentMonth})</button>
          </div>

          <div className="card p-4 mb-4">
            <div className="flex items-center justify-between">
              <div><h2 className="font-display font-bold text-primary text-lg">{ledger.student.name}</h2><p className="text-sm text-gray-500">{ledger.student.className} — Section {ledger.student.section} {ledger.student.rollNo ? `• Roll ${ledger.student.rollNo}` : ""}</p></div>
              <div className="text-right"><p className="text-xs text-gray-500">Payment Total</p><p className="text-lg font-bold text-primary">Rs {calculateTotal().toLocaleString()}</p></div>
            </div>
          </div>

          {/* Monthly Fee Grid */}
          <div className="card overflow-hidden mb-4">
            <div className="px-4 py-2 bg-gray-50 border-b"><h3 className="text-sm font-semibold text-primary">Monthly Fees</h3></div>
            <div className="grid grid-cols-4 gap-0">
              {ledger.monthGrid.map((entry) => {
                const isPast = entry.monthIndex <= currentMonthIdx + 1;
                const isSelected = payMonths.includes(entry.month);
                const remaining = entry.totalDue - entry.totalPaid;
                return (
                  <div key={entry.month} onClick={() => entry.status !== "PAID" && isPast && togglePayMonth(entry.month)}
                    className={`p-3 border-b border-r cursor-pointer transition-all ${entry.status === "PAID" ? "bg-emerald-50 cursor-default" : entry.status === "PARTIAL" ? "bg-amber-50" : isPast ? "bg-red-50 hover:bg-red-100" : "bg-gray-50 cursor-default opacity-50"} ${isSelected ? "ring-2 ring-primary ring-inset" : ""}`}>
                    <p className="text-xs font-semibold">{entry.month}</p>
                    <p className="text-sm font-bold mt-1">{entry.status === "PAID" ? <span className="text-emerald-600">Paid</span> : <span className="text-red-600">Rs {remaining.toLocaleString()}</span>}</p>
                    {entry.categories.map((c) => (<p key={c.categoryId} className="text-[10px] text-gray-500">{c.categoryName}: Rs {c.amount}</p>))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* One-time / Annual Fees */}
          {ledger.fixedFees.length > 0 && (
            <div className="card overflow-hidden mb-4">
              <div className="px-4 py-2 bg-gray-50 border-b"><h3 className="text-sm font-semibold text-primary">Annual / One-time Fees</h3></div>
              <table className="w-full text-sm"><tbody>{ledger.fixedFees.map((f: any) => {
                const remaining = f.amount - f.paid;
                const isSelected = payFixed.some((pf) => pf.categoryId === f.categoryId);
                return (
                  <tr key={f.categoryId} onClick={() => f.status !== "PAID" && togglePayFixed(f.categoryId, remaining)} className={`border-b cursor-pointer transition-all ${f.status === "PAID" ? "bg-emerald-50 cursor-default" : "hover:bg-gray-50"} ${isSelected ? "ring-2 ring-primary ring-inset" : ""}`}>
                    <td className="px-4 py-2 font-medium">{f.categoryName}</td>
                    <td className="px-4 py-2 text-right">{f.status === "PAID" ? <span className="text-emerald-600 text-xs font-semibold">Paid</span> : <span className="text-red-600 font-semibold">Rs {remaining.toLocaleString()}</span>}</td>
                  </tr>);
              })}</tbody></table>
            </div>
          )}

          {/* Collect Button */}
          {(payMonths.length > 0 || payFixed.length > 0) && (
            <div className="card p-4 mb-4">
              <div className="flex items-center gap-4">
                <div className="flex-1"><label className="label">Date</label><input className="input" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></div>
                <div className="flex-1"><label className="label">Method</label><select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option value="CASH">Cash</option><option value="BANK">Bank</option><option value="ONLINE">Online</option></select></div>
                <div className="flex-1 text-right"><p className="text-xs text-gray-500">Total</p><p className="text-xl font-bold text-primary">Rs {calculateTotal().toLocaleString()}</p></div>
                <button onClick={handleCollect} disabled={saving} className="btn-primary text-sm"><Receipt size={16} /> {saving ? "Processing..." : "Collect & Print"}</button>
              </div>
            </div>
          )}

          {/* Recent Payments */}
          {ledger.recentPayments.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b"><h3 className="text-sm font-semibold text-primary">Recent Payments</h3></div>
              <table className="w-full text-xs"><thead><tr className="table-header"><th className="text-left px-4 py-2">Date</th><th className="text-left px-4 py-2">Category</th><th className="text-left px-4 py-2">Month</th><th className="text-right px-4 py-2">Amount</th><th className="text-left px-4 py-2">Receipt</th></tr></thead>
              <tbody>{ledger.recentPayments.map((p: any, i: number) => (<tr key={i} className="border-t border-gray-100"><td className="px-4 py-2">{p.paymentDate}</td><td className="px-4 py-2">{p.category}</td><td className="px-4 py-2 text-gray-500">{p.paidMonth || "—"}</td><td className="px-4 py-2 text-right">Rs {p.amount.toLocaleString()}</td><td className="px-4 py-2 text-gray-400">{p.receiptNumber}</td></tr>))}</tbody></table>
            </div>
          )}
        </div>
      )}

      {/* Section Overview */}
      {!ledger && !receipt && (
        <div>
          <div className="flex gap-4 mb-4">
            <div className="flex-1"><label className="label">Grade</label><select className="input" value={selectedGrade} onChange={(e) => handleGradeChange(e.target.value)}><option value="">Select</option>{grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
            <div className="flex-1"><label className="label">Section</label><select className="input" value={selectedSection} onChange={(e) => handleSectionChange(e.target.value)}><option value="">Select</option>{sections.map((s: any) => <option key={s.id} value={s.id}>Section {s.name}</option>)}</select></div>
            <div className="flex-1"><label className="label">Billing Month</label><select className="input" value={currentMonth} onChange={(e) => handleMonthChange(e.target.value)}>{nepaliMonths.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
          </div>

          {overview.length > 0 && (
            <div className="flex gap-4 mb-4">
              <div className="card p-3 flex-1 text-center"><p className="text-xs text-gray-500">Collected</p><p className="text-lg font-bold text-emerald-600">Rs {totalCollected.toLocaleString()}</p></div>
              <div className="card p-3 flex-1 text-center"><p className="text-xs text-gray-500">Pending (up to {currentMonth})</p><p className="text-lg font-bold text-red-600">Rs {totalPending.toLocaleString()}</p></div>
              <div className="card p-3 flex-none flex items-center gap-2">
                <button onClick={async () => { try { toast.loading("Generating..."); const data = await api.get<any[]>(`/fees/invoices-bulk?sectionId=${selectedSection}&academicYearId=${activeYear.id}&month=${currentMonth}`); toast.dismiss(); if (data.length > 0) { printBulkInvoices(data, "compact"); } else { toast.error("No invoices"); } } catch (e: any) { toast.dismiss(); toast.error(e.message); } }} className="btn-outline text-xs whitespace-nowrap"><Printer size={14} /> 4 per Page</button>
                <button onClick={async () => { try { toast.loading("Generating..."); const data = await api.get<any[]>(`/fees/invoices-bulk?sectionId=${selectedSection}&academicYearId=${activeYear.id}&month=${currentMonth}`); toast.dismiss(); if (data.length > 0) { printBulkInvoices(data, "individual"); } else { toast.error("No invoices"); } } catch (e: any) { toast.dismiss(); toast.error(e.message); } }} className="btn-ghost text-xs whitespace-nowrap"><Printer size={14} /> Individual</button>
              </div>
            </div>
          )}

          {loadingOverview && <div className="card p-8 text-center text-gray-400 animate-pulse">Loading...</div>}

          {!loadingOverview && overview.length > 0 && (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="table-header"><th className="text-left px-4 py-2">Roll</th><th className="text-left px-4 py-2">Student</th><th className="text-left px-4 py-2">Paid Up To</th><th className="text-right px-4 py-2">Due</th><th className="text-right px-4 py-2">Paid</th><th className="text-right px-4 py-2">Balance</th><th className="w-12"></th></tr></thead>
                <tbody>{overview.map((s) => (
                  <tr key={s.id} onClick={() => handleOpenLedger(s.id)} className="border-t border-gray-100 hover:bg-surface cursor-pointer transition-colors">
                    <td className="px-4 py-2 text-gray-400">{s.rollNo || "—"}</td>
                    <td className="px-4 py-2 font-medium text-primary">{s.name}</td>
                    <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${s.paidUpTo !== "—" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{s.paidUpTo}</span></td>
                    <td className="px-4 py-2 text-right text-gray-500">Rs {s.totalDueUpToNow.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-emerald-600">Rs {s.totalPaid.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right font-semibold text-red-600">{s.balance > 0 ? `Rs ${s.balance.toLocaleString()}` : <span className="text-emerald-600">Clear</span>}</td>
                    <td className="px-4 py-2"><ChevronRight size={14} className="text-gray-300" /></td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
          {selectedSection && !loadingOverview && overview.length === 0 && <div className="card p-8 text-center text-gray-400">No students or fee structure not set.</div>}
          {!selectedSection && <div className="card p-8 text-center text-gray-400">Select grade, section, and billing month.</div>}
        </div>
      )}
    </div>
  );
}