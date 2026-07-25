"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Trash2, Upload, Image as ImageIcon } from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmDialog";

interface GalleryPhoto {
  id: string;
  url: string;
  caption: string | null;
  description: string | null;
  displayOrder: number;
  createdAt: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export default function GalleryPage() {
  const confirm = useConfirm();
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const fetchPhotos = async () => {
    try {
      const data = await api.get<GalleryPhoto[]>("/gallery");
      setPhotos(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPhotos();
  }, []);

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error("Choose at least one photo first");
      return;
    }
    const tooLarge = files.find((f) => f.size > MAX_FILE_SIZE);
    if (tooLarge) {
      toast.error(`${tooLarge.name} is over 5MB`);
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("photos", f));
      formData.append("caption", caption);
      formData.append("description", description);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/gallery`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Upload failed");
      }
      toast.success(files.length > 1 ? `${files.length} photos uploaded` : "Photo uploaded");
      setCaption("");
      setDescription("");
      setFiles([]);
      const input = document.getElementById("photo-input") as HTMLInputElement | null;
      if (input) input.value = "";
      fetchPhotos();
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (photo: GalleryPhoto) => {
    if (
      !(await confirm({
        title: "Delete photo",
        message: "This photo will be removed from the gallery and the public website.",
        confirmLabel: "Delete",
        variant: "danger",
      }))
    )
      return;
    try {
      await api.delete(`/gallery/${photo.id}`);
      toast.success("Photo deleted");
      fetchPhotos();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <ImageIcon className="h-6 w-6 text-gray-500" />
        <h1 className="text-xl font-semibold text-gray-900">Gallery</h1>
      </div>

      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Upload photos</h2>
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Photos {files.length > 0 && `(${files.length} selected)`}
            </label>
            <input
              id="photo-input"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-gray-200"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-500">Caption (optional, applied to all)</label>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="e.g. Annual sports day 2026"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-500">Description (optional, applied to all)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A few more details about these photos…"
                rows={1}
                className="w-full resize-y rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <button
              onClick={handleUpload}
              disabled={uploading || files.length === 0}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </div>
        </div>
      </div>

      {photos.length === 0 ? (
        <p className="text-sm text-gray-500">No photos yet — upload one above to get started.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => (
            <div key={photo.id} className="group relative overflow-hidden rounded-lg border border-gray-200 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={photo.caption || ""} className="aspect-[4/3] w-full object-cover" />
              <button
                onClick={() => handleDelete(photo)}
                className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Delete photo"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              {(photo.caption || photo.description) && (
                <div className="px-2 py-1.5">
                  {photo.caption && <p className="truncate text-xs font-medium text-gray-700">{photo.caption}</p>}
                  {photo.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{photo.description}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
