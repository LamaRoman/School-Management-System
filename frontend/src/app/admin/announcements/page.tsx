"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Upload, Bell } from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmDialog";

interface Announcement {
  id: string;
  imageUrl: string;
  isActive: boolean;
  createdAt: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export default function AnnouncementsPage() {
  const confirm = useConfirm();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const fetchAnnouncements = async () => {
    try {
      const data = await api.get<Announcement[]>("/announcements");
      setAnnouncements(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const active = announcements.find((a) => a.isActive);

  const handlePublish = async () => {
    if (!file) {
      toast.error("Choose an image first");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`${file.name} is over 5MB`);
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/announcements`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Upload failed");
      }
      toast.success("Announcement published — it'll appear on the homepage popup");
      setFile(null);
      const input = document.getElementById("announcement-input") as HTMLInputElement | null;
      if (input) input.value = "";
      fetchAnnouncements();
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleTakeDown = async () => {
    if (!active) return;
    if (
      !(await confirm({
        title: "Take down announcement",
        message: "The homepage popup will stop showing this announcement.",
        confirmLabel: "Take down",
        variant: "danger",
      }))
    )
      return;
    try {
      await api.patch(`/announcements/${active.id}`, { isActive: false });
      toast.success("Announcement taken down");
      fetchAnnouncements();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <Bell className="h-6 w-6 text-gray-500" />
        <h1 className="text-xl font-semibold text-gray-900">Announcements</h1>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-gray-500">
        A dismissible popup image shown once on the school website&apos;s homepage. Publishing a
        new image replaces the current one and shows it again to every visitor, even those who
        already dismissed the old one.
      </p>

      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          {active ? "Replace announcement" : "Publish announcement"}
        </h2>
        <div className="flex flex-col gap-3">
          <div>
            <input
              id="announcement-input"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-gray-200"
            />
          </div>
          <div>
            <button
              onClick={handlePublish}
              disabled={uploading || !file}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {uploading ? "Publishing…" : "Publish"}
            </button>
          </div>
        </div>
      </div>

      {active ? (
        <div className="max-w-md overflow-hidden rounded-lg border border-gray-200 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={active.imageUrl} alt="Current announcement" className="w-full object-contain" />
          <div className="flex items-center justify-between p-3">
            <span className="text-xs text-gray-500">
              Live since {new Date(active.createdAt).toLocaleDateString()}
            </span>
            <button
              onClick={handleTakeDown}
              className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Take down
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">No announcement is live right now.</p>
      )}
    </div>
  );
}
