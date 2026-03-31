"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Trash2, X, Eye, EyeOff } from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmDialog";

interface Grade { id: string; name: string; displayOrder: number }
interface Category { id: string; name: string; nameNp?: string; displayOrder: number; isActive: boolean }

const defaultCategories = [
  "English Dictation", "Nepali Dictation", "Creativity", "Discipline",
  "Games", "Neatness", "Rhymes", "Coloring", "Handwriting",
];

export default function ObservationsPage() {
  const confirm = useConfirm();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [selectedGrade, setSelectedGrade] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNameNp, setNewNameNp] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const year = await api.get<any>("/academic-years/active");
        if (year) {
          const g = await api.get<Grade[]>(`/grades?academicYearId=${year.id}`);
          setGrades(g);
        }
      } catch (err) { console.error(err); } finally { setLoading(false); }
    })();
  }, []);

  const fetchCategories = async (gradeId: string) => {
    try {
      const data = await api.get<Category[]>(`/observations/categories?gradeId=${gradeId}`);
      setCategories(data);
    } catch {
      setCategories([]);
    }
  };

  const handleGradeSelect = (gradeId: string) => {
    setSelectedGrade(gradeId);
    fetchCategories(gradeId);
    setShowForm(false);
    setShowBulk(false);
  };

  const handleAdd = async () => {
    if (!newName.trim() || !selectedGrade) return;
    try {
      await api.post("/observations/categories", {
        name: newName.trim(),
        nameNp: newNameNp.trim() || undefined,
        gradeId: selectedGrade,
        displayOrder: categories.length,
      });
      toast.success("Category added");
      setNewName("");
      setNewNameNp("");
      setShowForm(false);
      fetchCategories(selectedGrade);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleBulkAdd = async () => {
    if (bulkSelected.length === 0 || !selectedGrade) return;
    try {
      await api.post("/observations/categories/bulk", {
        gradeId: selectedGrade,
        categories: bulkSelected.map((name, i) => ({ name, displayOrder: categories.length + i })),
      });
      toast.success(`${bulkSelected.length} categories added`);
      setBulkSelected([]);
      setShowBulk(false);
      fetchCategories(selectedGrade);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await api.put(`/observations/categories/${id}`, { isActive: !isActive });
      toast.success(isActive ? "Deactivated" : "Activated");
      fetchCategories(selectedGrade);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!await confirm({ title: "Remove category", message: "This observation category and all its results will be removed.", confirmLabel: "Remove", variant: "danger" })) return;
    try {
      await api.delete(`/observations/categories/${id}`);
      toast.success("Removed");
      fetchCategories(selectedGrade);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const toggleBulkItem = (name: string) => {
    setBulkSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  // Filter out already-added categories from bulk options
  const existingNames = categories.map((c) => c.name.toLowerCase());
  const availableBulk = defaultCategories.filter(
    (name) => !existingNames.includes(name.toLowerCase())
  );

  const selectedGradeName = grades.find((g) => g.id === selectedGrade)?.name || "";

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary">General Observations</h1>
          <p className="text-sm text-gray-500 mt-1">Define observation categories per grade (typically for pre-primary classes)</p>
        </div>
      </div>

      {/* Grade selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {grades.map((g) => (
          <button key={g.id} onClick={() => handleGradeSelect(g.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedGrade === g.id ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-primary"}`}>
            {g.name}
          </button>
        ))}
      </div>

      {!selectedGrade && (
        <div className="card p-8 text-center text-gray-400">Select a grade to manage observation categories</div>
      )}

      {selectedGrade && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary">
              {selectedGradeName} — {categories.length} {categories.length === 1 ? "category" : "categories"}
            </h2>
            <div className="flex gap-2">
              {availableBulk.length > 0 && (
                <button onClick={() => { setShowBulk(!showBulk); setShowForm(false); }} className="btn-outline text-xs">
                  Quick Add
                </button>
              )}
              <button onClick={() => { setShowForm(!showForm); setShowBulk(false); }} className="btn-primary text-xs">
                <Plus size={14} /> Add Category
              </button>
            </div>
          </div>

          {/* Quick Add (bulk) */}
          {showBulk && availableBulk.length > 0 && (
            <div className="card p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-primary">Quick Add Common Categories</h3>
                <button onClick={() => setShowBulk(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {availableBulk.map((name) => (
                  <button key={name} onClick={() => toggleBulkItem(name)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${bulkSelected.includes(name) ? "bg-primary text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    {name}
                  </button>
                ))}
              </div>
              {bulkSelected.length > 0 && (
                <button onClick={handleBulkAdd} className="btn-primary text-xs">
                  Add {bulkSelected.length} Selected
                </button>
              )}
            </div>
          )}

          {/* Add single */}
          {showForm && (
            <div className="card p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-primary">Add Category</h3>
                <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="label">Name (English)</label>
                  <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g., Creativity" />
                </div>
                <div className="flex-1">
                  <label className="label">Name (Nepali) — optional</label>
                  <input className="input" value={newNameNp} onChange={(e) => setNewNameNp(e.target.value)} placeholder="e.g., सिर्जनशीलता" />
                </div>
                <div className="flex items-end">
                  <button onClick={handleAdd} className="btn-primary text-xs">Add</button>
                </div>
              </div>
            </div>
          )}

          {/* Categories list */}
          {categories.length === 0 ? (
            <div className="card p-8 text-center text-gray-400">
              <p>No observation categories for {selectedGradeName}</p>
              <p className="text-xs mt-1">This grade won&apos;t show the General Observation section on report cards.</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="table-header">
                    <th className="text-left px-5 py-3">#</th>
                    <th className="text-left px-5 py-3">Category Name</th>
                    <th className="text-left px-5 py-3">Nepali</th>
                    <th className="text-center px-5 py-3">Status</th>
                    <th className="text-right px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat, i) => (
                    <tr key={cat.id} className="border-t border-gray-100 hover:bg-surface transition-colors">
                      <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                      <td className="px-5 py-3 font-medium text-primary">{cat.name}</td>
                      <td className="px-5 py-3 text-gray-500">{cat.nameNp || "—"}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${cat.isActive ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>
                          {cat.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleToggle(cat.id, cat.isActive)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-primary transition-all" title={cat.isActive ? "Deactivate" : "Activate"}>
                            {cat.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <button onClick={() => handleDelete(cat.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-all">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}