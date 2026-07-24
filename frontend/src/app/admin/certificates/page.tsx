"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import toast from "react-hot-toast";
import { Printer, Plus, X, Award } from "lucide-react";
import BSDatePicker from "@/components/ui/BSDatePicker";
import {
  getSchoolInfo,
  buildCertificateHtml,
  printCertificate,
  CERTIFICATE_DESIGNS,
  type CertificateData,
} from "@/lib/printUtils";

type SchoolInfo = { name: string; nameNp: string; address: string; phone: string; logo?: string | null };

// A4 landscape at 96dpi ≈ 1123 × 794 px — the preview scales this to fit.
const CERT_W = 1123;
const CERT_H = 794;

export default function CertificatesPage() {
  const [form, setForm] = useState({
    title: "Certificate of Participation",
    recipient: "",
    functionName: "",
    award: "",
    body: "",
    date: "",
  });
  const [signatures, setSignatures] = useState<string[]>(["Class Teacher", "Principal"]);
  const [design, setDesign] = useState("classic");
  const [school, setSchool] = useState<SchoolInfo | null>(null);

  useEffect(() => {
    getSchoolInfo().then(setSchool).catch(() => setSchool({ name: "School", nameNp: "", address: "", phone: "", logo: null }));
  }, []);

  const certData: CertificateData = {
    title: form.title,
    recipient: form.recipient,
    functionName: form.functionName,
    award: form.award || undefined,
    body: form.body || undefined,
    date: form.date || undefined,
    signatures,
    design,
  };

  const previewHtml = useMemo(
    () => (school ? buildCertificateHtml(certData, school) : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form, signatures, design, school],
  );

  // Scale the true-size certificate iframe down to fit the preview column.
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / CERT_W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [school]);

  const updateSig = (i: number, value: string) =>
    setSignatures((s) => s.map((v, idx) => (idx === i ? value : v)));
  const addSig = () => setSignatures((s) => (s.length >= 5 ? s : [...s, ""]));
  const removeSig = (i: number) => setSignatures((s) => s.filter((_, idx) => idx !== i));

  const handlePrint = async () => {
    if (!form.title.trim() || !form.recipient.trim()) {
      toast.error("Certificate title and recipient name are required");
      return;
    }
    try {
      await printCertificate(certData);
    } catch (err: any) {
      toast.error(err?.message || "Could not open print window");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary flex items-center gap-2">
            <Award size={22} /> Certificates
          </h1>
          <p className="text-sm text-gray-500 mt-1">Create a certificate and print or save it as PDF. Your school header is added automatically.</p>
        </div>
        <button onClick={handlePrint} className="btn-primary text-sm">
          <Printer size={15} /> Print / Save PDF
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="card p-5 space-y-3">
          <div>
            <label className="label">Design</label>
            <div className="flex flex-wrap gap-2">
              {CERTIFICATE_DESIGNS.map((dz) => (
                <button
                  key={dz.id}
                  type="button"
                  onClick={() => setDesign(dz.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all ${
                    design === dz.id ? "border-primary bg-primary/5 text-primary font-medium" : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: dz.accent }} />
                  {dz.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Certificate Title *</label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Certificate of Participation" />
          </div>
          <div>
            <label className="label">Recipient Name *</label>
            <input className="input" value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} placeholder="e.g. Aarav Sharma" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Function / Event</label>
              <input className="input" value={form.functionName} onChange={(e) => setForm({ ...form, functionName: e.target.value })} placeholder="e.g. Annual Sports Day 2082" />
            </div>
            <div>
              <label className="label">Award / Position</label>
              <input className="input" value={form.award} onChange={(e) => setForm({ ...form, award: e.target.value })} placeholder="e.g. First Position (optional)" />
            </div>
          </div>
          <div>
            <label className="label">Citation / Body</label>
            <textarea
              className="input min-h-[80px]"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Leave blank to auto-generate from the function and award, or write your own wording."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date (BS)</label>
              <BSDatePicker value={form.date} onChange={(date) => setForm({ ...form, date })} placeholder="2082/01/15" />
            </div>
          </div>

          {/* Configurable signatures */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Signatures</label>
              <button type="button" onClick={addSig} disabled={signatures.length >= 5} className="text-xs text-primary hover:underline inline-flex items-center gap-1 disabled:opacity-40">
                <Plus size={12} /> Add
              </button>
            </div>
            <div className="space-y-2">
              {signatures.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="input flex-1" value={s} onChange={(e) => updateSig(i, e.target.value)} placeholder={`Signature ${i + 1} label`} />
                  <button type="button" onClick={() => removeSig(i)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600" title="Remove">
                    <X size={14} />
                  </button>
                </div>
              ))}
              {signatures.length === 0 && (
                <p className="text-xs text-gray-400">No signature lines. Click Add to include one.</p>
              )}
            </div>
          </div>
        </div>

        {/* Live preview */}
        <div className="card p-5">
          <div className="text-xs font-medium text-gray-500 mb-2">Preview</div>
          <div ref={previewBoxRef} className="w-full rounded-lg border border-gray-200 overflow-hidden bg-gray-50" style={{ aspectRatio: `${CERT_W} / ${CERT_H}` }}>
            {school && (
              <iframe
                title="Certificate preview"
                srcDoc={previewHtml}
                scrolling="no"
                style={{
                  width: `${CERT_W}px`,
                  height: `${CERT_H}px`,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                  border: 0,
                  pointerEvents: "none",
                }}
              />
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">A4 landscape. Prints on one page — use your browser&apos;s &quot;Save as PDF&quot; to download.</p>
        </div>
      </div>
    </div>
  );
}
