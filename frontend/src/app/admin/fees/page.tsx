"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Save, Trash2, Printer, X, Receipt } from "lucide-react";

interface FeeCategory { id: string; name: string; description?: string }
interface Grade { id: string; name: string; displayOrder: number }
interface Section { id: string; name: string; gradeId: string }
interface FeeStructure { id: string; feeCategoryId: string; gradeId: string; amount: number; frequency: string; feeCategory: { name: string } }
interface StudentDue {
  id: string; name: string; rollNo?: number;
  totalDue: number; totalPaid: number; totalRemaining: number;
  categories: { categoryId: string; categoryName: string; frequency: string; feeAmount: number; annualDue: number; paid: number; remaining: number; hasOverride: boolean }[];
}

const frequencies = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "YEARLY", label: "Yearly" },
  { value: "ONE_TIME", label: "One-Time" },
];

const nepaliMonths = ["Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin", "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"];

type Tab = "categories" | "structure" | "collection";

export default function FeeManagementPage() {
  const [tab, setTab] = useState<Tab>("categories");
  const [activeYear, setActiveYear] = useState<any>(null);
  const [categories, setCategories] = useState<FeeCategory[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const year = await api.get<any>("/academic-years/active");
        setActiveYear(year);
        const [cats, g] = await Promise.all([
          api.get<FeeCategory[]>("/fees/categories"),
          year ? api.get<Grade[]>(`/grades?academicYearId=${year.id}`) : Promise.resolve([]),
        ]);
        setCategories(cats);
        setGrades(g);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary">Fee Management</h1>
          <p className="text-sm text-gray-500 mt-1">Manage fee categories, structure, and collect payments</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b">
        {([
          { key: "categories", label: "Fee Categories" },
          { key: "structure", label: "Fee Structure" },
          { key: "collection", label: "Fee Collection" },
        ] as { key: Tab; label: string }[]).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-all border-b-2 ${tab === t.key ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-primary"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "categories" && <CategoriesTab categories={categories} setCategories={setCategories} />}
      {tab === "structure" && activeYear && <StructureTab activeYear={activeYear} categories={categories} grades={grades} />}
      {tab === "collection" && activeYear && <CollectionTab activeYear={activeYear} grades={grades} categories={categories} />}
    </div>
  );
}

// ─── CATEGORIES TAB ─────────────────────────────────────

function CategoriesTab({ categories, setCategories }: { categories: FeeCategory[]; setCategories: (c: FeeCategory[]) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const fetchCategories = async () => {
    const data = await api.get<FeeCategory[]>("/fees/categories");
    setCategories(data);
  };

  const handleAdd = async () => {
    if (!name.trim()) return;
    try {
      await api.post("/fees/categories", { name: name.trim(), description: description.trim() || undefined });
      toast.success("Category added");
      setName("");
      setDescription("");
      setShowForm(false);
      await fetchCategories();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this category?")) return;
    try {
      await api.delete(`/fees/categories/${id}`);
      toast.success("Removed");
      await fetchCategories();
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-primary">{categories.length} Categories</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs">
          <Plus size={14} /> Add Category
        </button>
      </div>

      {showForm && (
        <div className="card p-4 mb-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="label">Category Name *</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Tuition Fee" />
            </div>
            <div className="flex-1">
              <label className="label">Description</label>
              <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
            </div>
            <button onClick={handleAdd} className="btn-primary text-xs">Add</button>
            <button onClick={() => setShowForm(false)} className="btn-ghost text-xs"><X size={14} /></button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="table-header">
              <th className="text-left px-5 py-3">#</th>
              <th className="text-left px-5 py-3">Name</th>
              <th className="text-left px-5 py-3">Description</th>
              <th className="text-right px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat, i) => (
              <tr key={cat.id} className="border-t border-gray-100 hover:bg-surface transition-colors">
                <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                <td className="px-5 py-3 font-medium text-primary">{cat.name}</td>
                <td className="px-5 py-3 text-gray-500">{cat.description || "—"}</td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => handleDelete(cat.id)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {categories.length === 0 && (
          <div className="p-8 text-center text-gray-400 text-sm">No fee categories. Add one to get started.</div>
        )}
      </div>
    </div>
  );
}

// ─── STRUCTURE TAB ──────────────────────────────────────

function StructureTab({ activeYear, categories, grades }: { activeYear: any; categories: FeeCategory[]; grades: Grade[] }) {
  const [selectedGrade, setSelectedGrade] = useState("");
  const [entries, setEntries] = useState<{ feeCategoryId: string; amount: number; frequency: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const handleGradeChange = async (gradeId: string) => {
    setSelectedGrade(gradeId);
    try {
      const data = await api.get<FeeStructure[]>(`/fees/structure?academicYearId=${activeYear.id}&gradeId=${gradeId}`);
      if (data.length > 0) {
        setEntries(data.map((s) => ({ feeCategoryId: s.feeCategoryId, amount: s.amount, frequency: s.frequency })));
      } else {
        setEntries(categories.map((c) => ({ feeCategoryId: c.id, amount: 0, frequency: "MONTHLY" })));
      }
    } catch { setEntries([]); }
  };

  const handleEntryChange = (index: number, field: string, value: any) => {
    setEntries((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSave = async () => {
    if (!selectedGrade) return;
    const validEntries = entries.filter((e) => e.amount > 0);
    if (validEntries.length === 0) { toast.error("Set at least one fee amount"); return; }
    setSaving(true);
    try {
      await api.post("/fees/structure/bulk", {
        academicYearId: activeYear.id,
        gradeId: selectedGrade,
        entries: validEntries,
      });
      toast.success("Fee structure saved");
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleCopyToAll = async () => {
    if (!selectedGrade || entries.length === 0) return;
    if (!confirm("Copy this fee structure to ALL grades?")) return;
    setSaving(true);
    try {
      const validEntries = entries.filter((e) => e.amount > 0);
      for (const grade of grades) {
        if (grade.id === selectedGrade) continue;
        await api.post("/fees/structure/bulk", {
          academicYearId: activeYear.id,
          gradeId: grade.id,
          entries: validEntries,
        });
      }
      toast.success(`Fee structure copied to ${grades.length - 1} grades`);
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="flex gap-4 mb-4">
        <div className="flex-1">
          <label className="label">Select Grade</label>
          <select className="input" value={selectedGrade} onChange={(e) => handleGradeChange(e.target.value)}>
            <option value="">Select Grade</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedGrade && entries.length > 0 && (
        <>
          <div className="card overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="text-left px-4 py-2">Fee Category</th>
                  <th className="text-left px-4 py-2 w-32">Amount (Rs)</th>
                  <th className="text-left px-4 py-2 w-40">Frequency</th>
                  <th className="text-right px-4 py-2 w-28">Annual Total</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => {
                  const cat = categories.find((c) => c.id === entry.feeCategoryId);
                  const annual = entry.frequency === "MONTHLY" ? entry.amount * 12
                    : entry.frequency === "QUARTERLY" ? entry.amount * 4
                    : entry.amount;
                  return (
                    <tr key={entry.feeCategoryId} className="border-t border-gray-100">
                      <td className="px-4 py-2 font-medium text-primary">{cat?.name || "—"}</td>
                      <td className="px-4 py-2">
                        <input type="number" min={0} value={entry.amount || ""} onChange={(e) => handleEntryChange(i, "amount", parseFloat(e.target.value) || 0)}
                          className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30" />
                      </td>
                      <td className="px-4 py-2">
                        <select value={entry.frequency} onChange={(e) => handleEntryChange(i, "frequency", e.target.value)}
                          className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30">
                          {frequencies.map((f) => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-primary">Rs {annual.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-primary">
                  <td colSpan={3} className="px-4 py-2 text-right font-bold text-primary">Total Annual Fee</td>
                  <td className="px-4 py-2 text-right font-bold text-primary">
                    Rs {entries.reduce((sum, e) => {
                      const annual = e.frequency === "MONTHLY" ? e.amount * 12
                        : e.frequency === "QUARTERLY" ? e.amount * 4
                        : e.amount;
                      return sum + annual;
                    }, 0).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
              <Save size={16} /> {saving ? "Saving..." : "Save Structure"}
            </button>
            <button onClick={handleCopyToAll} disabled={saving} className="btn-outline text-xs">
              Copy to All Grades
            </button>
          </div>
        </>
      )}

      {!selectedGrade && (
        <div className="card p-8 text-center text-gray-400">Select a grade to set fee structure.</div>
      )}
    </div>
  );
}

// ─── COLLECTION TAB ─────────────────────────────────────

function CollectionTab({ activeYear, grades, categories }: { activeYear: any; grades: Grade[]; categories: FeeCategory[] }) {
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [dues, setDues] = useState<StudentDue[]>([]);
  const [loadingDues, setLoadingDues] = useState(false);

  // Payment form
  const [payingStudent, setPayingStudent] = useState<StudentDue | null>(null);
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentItems, setPaymentItems] = useState<{ feeCategoryId: string; amount: number; paidMonth: string }[]>([]);
  const [saving, setSaving] = useState(false);

  // Receipt
  const [receipt, setReceipt] = useState<any>(null);

  const handleGradeChange = async (gradeId: string) => {
    setSelectedGrade(gradeId);
    setSelectedSection("");
    setDues([]);
    try {
      const g = grades.find((gr) => gr.id === gradeId);
      if (g) {
        const allGrades = await api.get<any[]>(`/grades?academicYearId=${activeYear.id}`);
        const gradeData = allGrades.find((gr: any) => gr.id === gradeId);
        setSections(gradeData?.sections || []);
      }
    } catch { setSections([]); }
  };

  const handleSectionChange = async (sectionId: string) => {
    setSelectedSection(sectionId);
    setLoadingDues(true);
    try {
      const data = await api.get<any>(`/fees/dues?sectionId=${sectionId}&academicYearId=${activeYear.id}`);
      setDues(data.students || []);
    } catch { setDues([]); }
    finally { setLoadingDues(false); }
  };

  const handleStartPayment = (student: StudentDue) => {
    setPayingStudent(student);
    setReceipt(null);
    setPaymentItems(
      student.categories
        .filter((c) => c.remaining > 0)
        .map((c) => ({ feeCategoryId: c.categoryId, amount: c.feeAmount, paidMonth: "" }))
    );
  };

  const handlePaymentItemChange = (index: number, field: string, value: any) => {
    setPaymentItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSubmitPayment = async () => {
    if (!payingStudent || !paymentDate) return;
    const validItems = paymentItems.filter((i) => i.amount > 0);
    if (validItems.length === 0) { toast.error("Enter at least one payment amount"); return; }
    setSaving(true);
    try {
      const result = await api.post<any>("/fees/payments/bulk", {
        studentId: payingStudent.id,
        academicYearId: activeYear.id,
        paymentDate,
        paymentMethod,
        items: validItems.map((i) => ({
          feeCategoryId: i.feeCategoryId,
          amount: i.amount,
          paidMonth: i.paidMonth || undefined,
        })),
      });
      toast.success(`Payment recorded — Receipt: ${result.receiptNumber}`);

      // Fetch receipt
      const receiptData = await api.get<any>(`/fees/receipt/${result.receiptNumber}`);
      setReceipt(receiptData);

      // Refresh dues
      await handleSectionChange(selectedSection);
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const totalCollected = dues.reduce((sum, d) => sum + d.totalPaid, 0);
  const totalDue = dues.reduce((sum, d) => sum + d.totalRemaining, 0);

  return (
    <div>
      {/* Selectors */}
      <div className="flex gap-4 mb-4">
        <div className="flex-1">
          <label className="label">Grade</label>
          <select className="input" value={selectedGrade} onChange={(e) => handleGradeChange(e.target.value)}>
            <option value="">Select Grade</option>
            {grades.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
          </select>
        </div>
        <div className="flex-1">
          <label className="label">Section</label>
          <select className="input" value={selectedSection} onChange={(e) => handleSectionChange(e.target.value)}>
            <option value="">Select Section</option>
            {sections.map((s) => (<option key={s.id} value={s.id}>Section {s.name}</option>))}
          </select>
        </div>
      </div>

      {/* Receipt modal */}
      {receipt && (
        <div className="card p-5 mb-4 border-2 border-primary">
          <div className="flex items-center justify-between mb-3 no-print">
            <h3 className="font-semibold text-primary flex items-center gap-2"><Receipt size={16} /> Payment Receipt</h3>
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="btn-outline text-xs"><Printer size={14} /> Print</button>
              <button onClick={() => { setReceipt(null); setPayingStudent(null); }} className="btn-ghost text-xs"><X size={14} /></button>
            </div>
          </div>
          <div className="text-center mb-3">
            <h2 className="text-lg font-bold text-primary">{receipt.school?.nameNp || receipt.school?.name}</h2>
            <p className="text-xs text-gray-500">{receipt.school?.address}</p>
            <p className="text-sm font-semibold mt-1">Fee Receipt — {receipt.receiptNumber}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
            <div><span className="text-gray-500">Student:</span> <b>{receipt.student.name}</b></div>
            <div><span className="text-gray-500">Class:</span> <b>{receipt.student.className} — {receipt.student.section}</b></div>
            <div><span className="text-gray-500">Date:</span> <b>{receipt.paymentDate}</b></div>
            <div><span className="text-gray-500">Method:</span> <b>{receipt.paymentMethod || "Cash"}</b></div>
          </div>
          <table className="w-full text-xs mb-3">
            <thead><tr className="border-b"><th className="text-left py-1">Description</th><th className="text-left py-1">Month</th><th className="text-right py-1">Amount</th></tr></thead>
            <tbody>
              {receipt.items.map((item: any, i: number) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1">{item.category}</td>
                  <td className="py-1 text-gray-500">{item.paidMonth || "—"}</td>
                  <td className="py-1 text-right">Rs {item.amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2"><td colSpan={2} className="py-1 font-bold text-right">Total</td><td className="py-1 text-right font-bold">Rs {receipt.totalAmount.toLocaleString()}</td></tr>
            </tfoot>
          </table>
          <div className="flex justify-between mt-8 text-xs">
            <div className="text-center"><div className="border-b border-gray-400 w-28 mb-1 h-4" /><span>Received By</span></div>
            <div className="text-center"><div className="border-b border-gray-400 w-28 mb-1 h-4" /><span>Accountant</span></div>
          </div>
        </div>
      )}

      {/* Payment form */}
      {payingStudent && !receipt && (
        <div className="card p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-primary">Collect Fee — {payingStudent.name} (Roll {payingStudent.rollNo})</h3>
            <button onClick={() => setPayingStudent(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label className="label">Payment Date (BS) *</label>
              <input className="input" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} placeholder="2082/01/15" />
            </div>
            <div>
              <label className="label">Payment Method</label>
              <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="CASH">Cash</option>
                <option value="BANK">Bank Transfer</option>
                <option value="ONLINE">Online</option>
              </select>
            </div>
          </div>

          <table className="w-full text-sm mb-3">
            <thead>
              <tr className="table-header">
                <th className="text-left px-3 py-2">Category</th>
                <th className="text-center px-3 py-2">Due</th>
                <th className="text-center px-3 py-2 w-28">Amount</th>
                <th className="text-center px-3 py-2 w-32">Month</th>
              </tr>
            </thead>
            <tbody>
              {paymentItems.map((item, i) => {
                const cat = payingStudent.categories.find((c) => c.categoryId === item.feeCategoryId);
                return (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium">{cat?.categoryName}</td>
                    <td className="px-3 py-2 text-center text-gray-500">Rs {cat?.remaining.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <input type="number" min={0} value={item.amount || ""} onChange={(e) => handlePaymentItemChange(i, "amount", parseFloat(e.target.value) || 0)}
                        className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded text-center" />
                    </td>
                    <td className="px-3 py-2">
                      {cat?.frequency === "MONTHLY" && (
                        <select value={item.paidMonth} onChange={(e) => handlePaymentItemChange(i, "paidMonth", e.target.value)}
                          className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded">
                          <option value="">Select</option>
                          {nepaliMonths.map((m) => (<option key={m} value={m}>{m}</option>))}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2">
                <td colSpan={2} className="px-3 py-2 text-right font-bold">Total Payment</td>
                <td className="px-3 py-2 text-center font-bold text-primary">Rs {paymentItems.reduce((s, i) => s + i.amount, 0).toLocaleString()}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>

          <div className="flex justify-end">
            <button onClick={handleSubmitPayment} disabled={saving || !paymentDate} className="btn-primary text-sm">
              <Save size={16} /> {saving ? "Processing..." : "Record Payment"}
            </button>
          </div>
        </div>
      )}

      {/* Summary */}
      {dues.length > 0 && !payingStudent && (
        <div className="flex gap-4 mb-4">
          <div className="card p-3 flex-1 text-center">
            <p className="text-xs text-gray-500">Total Collected</p>
            <p className="text-lg font-bold text-emerald-600">Rs {totalCollected.toLocaleString()}</p>
          </div>
          <div className="card p-3 flex-1 text-center">
            <p className="text-xs text-gray-500">Total Due</p>
            <p className="text-lg font-bold text-red-600">Rs {totalDue.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Dues table */}
      {loadingDues && <div className="card p-8 text-center text-gray-400 animate-pulse">Loading dues...</div>}

      {!loadingDues && dues.length > 0 && !payingStudent && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="text-left px-4 py-2">Roll</th>
                <th className="text-left px-4 py-2">Student</th>
                <th className="text-right px-4 py-2">Total Due</th>
                <th className="text-right px-4 py-2">Paid</th>
                <th className="text-right px-4 py-2">Remaining</th>
                <th className="text-center px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {dues.map((stu) => (
                <tr key={stu.id} className="border-t border-gray-100 hover:bg-surface transition-colors">
                  <td className="px-4 py-2 text-gray-400">{stu.rollNo || "—"}</td>
                  <td className="px-4 py-2 font-medium text-primary">{stu.name}</td>
                  <td className="px-4 py-2 text-right">Rs {stu.totalDue.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-emerald-600">Rs {stu.totalPaid.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right font-semibold text-red-600">Rs {stu.totalRemaining.toLocaleString()}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${stu.totalRemaining <= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                      {stu.totalRemaining <= 0 ? "Paid" : "Due"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {stu.totalRemaining > 0 && (
                      <button onClick={() => handleStartPayment(stu)} className="text-xs text-primary hover:underline">
                        Collect
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedSection && !loadingDues && dues.length === 0 && (
        <div className="card p-8 text-center text-gray-400">No students found or fee structure not set for this grade.</div>
      )}

      {!selectedSection && (
        <div className="card p-8 text-center text-gray-400">Select a grade and section to view fee collection.</div>
      )}
    </div>
  );
}