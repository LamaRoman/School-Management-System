"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Save, Settings } from "lucide-react";

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
}

const settingsConfig = [
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

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<SettingsData>("/report-card-settings");
        setSettings(data);
        setOriginalSettings(data);
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