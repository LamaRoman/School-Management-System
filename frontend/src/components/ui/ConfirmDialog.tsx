"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { AlertTriangle, Trash2, AlertCircle } from "lucide-react";

type Variant = "danger" | "warning" | "info";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: Variant;
}

interface DialogState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

// ─── Singleton event bus ──────────────────────────────────
type Listener = (state: DialogState | null) => void;
let _listener: Listener | null = null;

function emit(state: DialogState | null) {
  _listener?.(state);
}

// ─── Hook — call this in any component ───────────────────
export function useConfirm() {
  return useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      emit({ ...options, resolve });
    });
  }, []);
}

// ─── Dialog mount — add once to root layout ──────────────
export function ConfirmDialogMount() {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    _listener = setDialog;
    return () => { _listener = null; };
  }, []);

  // Focus confirm button when dialog opens
  useEffect(() => {
    if (dialog) setTimeout(() => confirmRef.current?.focus(), 50);
  }, [dialog]);

  // Close on Escape
  useEffect(() => {
    if (!dialog) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { dialog.resolve(false); setDialog(null); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [dialog]);

  if (!dialog) return null;

  const variant = dialog.variant ?? "danger";

  const variantStyles = {
    danger: {
      icon: <Trash2 size={20} className="text-red-600" />,
      iconBg: "bg-red-50",
      confirmBtn: "bg-red-600 hover:bg-red-700 text-white",
    },
    warning: {
      icon: <AlertTriangle size={20} className="text-amber-600" />,
      iconBg: "bg-amber-50",
      confirmBtn: "bg-amber-600 hover:bg-amber-700 text-white",
    },
    info: {
      icon: <AlertCircle size={20} className="text-blue-600" />,
      iconBg: "bg-blue-50",
      confirmBtn: "bg-primary hover:bg-primary-dark text-white",
    },
  }[variant];

  const handleConfirm = () => { dialog.resolve(true); setDialog(null); };
  const handleCancel = () => { dialog.resolve(false); setDialog(null); };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-150">
        {/* Icon + Title */}
        <div className="flex items-start gap-4 mb-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${variantStyles.iconBg}`}>
            {variantStyles.icon}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-base leading-tight">{dialog.title}</h3>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">{dialog.message}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={handleConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${variantStyles.confirmBtn}`}
          >
            {dialog.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
