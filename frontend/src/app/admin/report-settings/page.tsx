"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Save, Settings, Upload, Trash2 } from "lucide-react";

interface SettingsData {
  showPassMarks: boolean;
  showTheoryPrac: boolean;
  showPercentage: boolean;
  showGrade: boolean;
  showGpa: boolean;
  showRank: boolean;
  showAttendance: boolean;
  showRemarks: boolean;
  showPromotion: boolean;
  showNepaliName: boolean;
  logoPosition: string;
  logoSize: string;
}

const settingsConfig = [
  {
    group: "School Header",
    description: "Configure how your school appears on the report card",
    items: [
      { key: "showNepaliName", label: "Show Nepali Name", desc: "Display the school's Nepali name below the English name on the report card" },
    ],
  },
  {
    group: "Table Columns",
    description: "Choose which columns appear in the marks table",
    items: [
      { key: "showPassMarks", label: "Pass Marks", desc: "Show the pass marks column for each subject" },
      { key: "showTheoryPrac", label: "Theory / Practical Split", desc: "Show separate Theory and Practical columns (hidden if no subjects have practicals)" },
      { key: "showPercentage", label: "Percentage (%)", desc: "Show percentage column per subject (hidden by default since it equals Total when full marks = 100)" },
      { key: "showGrade", label: "Grade", desc: "Show letter grade column (A+, A, B+, etc.)" },
      { key: "showGpa", label: "GPA", desc: "Show GPA column (4.0, 3.6, 3.2, etc.)" },
    ],
  },
  {
    group: "Bottom Section",
    description: "Choose which sections appear below the marks table",
    items: [
      { key: "showRank", label: "Rank", desc: "Show student rank within the section (also controlled per exam type)" },
      { key: "showAttendance", label: "Attendance", desc: "Show total days, present days, absent days" },
      { key: "showRemarks", label: "Comments / Remarks", desc: "Show class teacher comments (Final report only)" },
      { key: "showPromotion", label: "Promotion Status", desc: "Show 'Promoted to Class X' banner (Final report only)" },
    ],
  },
];

export default function ReportCardSettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalSettings, setOriginalSettings] = useState<SettingsData | null>(null);
  const [school, setSchool] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [data, schoolData] = await Promise.all([
          api.get<SettingsData>("/report-card-settings"),
          api.get<any>("/school"),
        ]);
        setSettings(data);
        setOriginalSettings(data);
        setSchool(schoolData);
      } catch {
        toast.error("Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleToggle = (key: string) => {
    if (!settings) return;
    const updated = { ...settings, [key]: !settings[key as keyof SettingsData] };
    setSettings(updated);
    setHasChanges(JSON.stringify(updated) !== JSON.stringify(originalSettings));
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const saved = await api.put<SettingsData>("/report-card-settings", settings);
      setSettings(saved);
      setOriginalSettings(saved);
      setHasChanges(false);
      toast.success("Report card settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (originalSettings) {
      setSettings({ ...originalSettings });
      setHasChanges(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Logo must be under 2MB"); return; }
    if (!file.type.startsWith("image/")) { toast.error("Only image files allowed"); return; }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const token = api.getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/school/logo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const json = await res.json();
      setSchool((prev: any) => ({ ...prev, logo: json.data.logo }));
      toast.success("Logo uploaded");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleRemoveLogo = async () => {
    if (!confirm("Remove the school logo?")) return;
    setRemoving(true);
    try {
      const token = api.getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/school/logo`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to remove logo");
      setSchool((prev: any) => ({ ...prev, logo: null }));
      toast.success("Logo removed");
    } catch (err: any) {
      toast.error(err.message || "Failed to remove logo");
    } finally {
      setRemoving(false);
    }
  };

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading settings...</div>;
  if (!settings) return <div className="card p-8 text-center text-gray-400">Failed to load settings</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary">Report Card Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Configure which columns and sections appear on printed report cards and PDFs</p>
        </div>
        <div className="flex gap-2">
          {hasChanges && (
            <button onClick={handleReset} className="btn-ghost text-xs">
              Reset
            </button>
          )}
          <button onClick={handleSave} disabled={saving || !hasChanges} className="btn-primary text-sm">
            <Save size={16} /> {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>

      {hasChanges && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          You have unsaved changes. Click &quot;Save Settings&quot; to apply them to all report cards.
        </div>
      )}

      <div className="space-y-6">
        {/* Logo Upload */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-1">
            <Upload size={16} className="text-primary" />
            <h2 className="font-display font-bold text-primary">School Logo</h2>
          </div>
          <p className="text-xs text-gray-500 mb-4">Upload your school logo to display on report cards. Recommended: square image, PNG or JPG, under 2MB.</p>
          <div className="flex items-center gap-4">
            {school?.logo ? (
              <img src={school.logo} alt="School logo" className="w-16 h-16 object-contain rounded-lg border border-gray-200 bg-white p-1" />
            ) : (
              <div className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs">No logo</div>
            )}
            <div>
              <label className="btn-outline text-xs cursor-pointer inline-flex items-center gap-1">
                <Upload size={14} /> {uploading ? "Uploading..." : school?.logo ? "Change Logo" : "Upload Logo"}
                <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploading} className="hidden" />
              </label>
              {school?.logo && (
                <>
                  <button onClick={handleRemoveLogo} disabled={removing} className="btn-outline text-xs text-red-500 border-red-200 hover:bg-red-50 ml-2 inline-flex items-center gap-1">
                    <Trash2 size={14} /> {removing ? "Removing..." : "Remove Logo"}
                  </button>
                  <p className="text-xs text-gray-400 mt-1">Logo will appear on all report cards</p>
                </>
              )}
            </div>
          </div>
        </div>

        {settingsConfig.map((group) => (
          <div key={group.group} className="card p-5">
            <div className="flex items-center gap-2 mb-1">
              <Settings size={16} className="text-primary" />
              <h2 className="font-display font-bold text-primary">{group.group}</h2>
            </div>
            <p className="text-xs text-gray-500 mb-4">{group.description}</p>

            <div className="space-y-3">
              {group.items.map((item) => {
                const isOn = settings[item.key as keyof SettingsData];
                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-surface transition-colors cursor-pointer"
                    onClick={() => handleToggle(item.key)}
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{item.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                    </div>
                    <div
                      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                        isOn ? "bg-primary" : "bg-gray-300"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                          isOn ? "translate-x-[22px]" : "translate-x-0.5"
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
              {group.group === "School Header" && (
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
                  <div>
                    <label className="text-sm font-medium text-gray-800 block mb-1">Logo Position</label>
                    <p className="text-xs text-gray-500 mb-2">Where the logo appears relative to the school name</p>
                    <select
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={settings.logoPosition || "center"}
                      onChange={(e) => { const updated = { ...settings, logoPosition: e.target.value }; setSettings(updated); setHasChanges(JSON.stringify(updated) !== JSON.stringify(originalSettings)); }}
                    >
                      <option value="left">Left</option>
                      <option value="center">Center (above name)</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-800 block mb-1">Logo Size</label>
                    <p className="text-xs text-gray-500 mb-2">Size of the school logo on the report card</p>
                    <select
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={settings.logoSize || "medium"}
                      onChange={(e) => { const updated = { ...settings, logoSize: e.target.value }; setSettings(updated); setHasChanges(JSON.stringify(updated) !== JSON.stringify(originalSettings)); }}
                    >
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Preview hint */}
      <div className="mt-6 card p-4 text-center">
        <p className="text-xs text-gray-500">
          Changes apply to all report cards — browser view, PDF downloads, and batch prints.
          Log in as a student to preview how the report card looks with these settings.
        </p>
      </div>
    </div>
  );
}