"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

/**
 * The on-screen report card: the exact HTML the PDF is printed from (`/pdf/...?format=html`),
 * so it follows the school's grading style (marks-based or credit-hour/grade-point), column
 * settings and colour/B&W mode — and can never disagree with the printed card.
 *
 * Shown in a sandboxed iframe: no scripts run in it. `allow-same-origin` is only there so the
 * frame can be sized to its content; without `allow-scripts` the document cannot act on it.
 */
export default function ReportCardPreview({ path, mode }: { path: string; mode: "color" | "bw" }) {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${path}${sep}mode=${mode}&format=html`;
  // Keyed by the URL it was fetched for, so switching student / exam / B&W shows "Loading"
  // instead of the previous card, without resetting state inside the effect.
  const [loaded, setLoaded] = useState<{ url: string; html?: string; error?: string } | null>(null);
  const [height, setHeight] = useState(900);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let ignore = false;
    api.get<{ html: string }>(url)
      .then((d) => { if (!ignore) setLoaded({ url, html: d.html }); })
      .catch((e: unknown) => {
        if (!ignore) setLoaded({ url, error: e instanceof Error ? e.message : "Could not load the report card" });
      });
    return () => { ignore = true; };
  }, [url]);

  const current = loaded?.url === url ? loaded : null;
  const html = current?.html ?? null;
  const error = current?.error ?? null;

  const fit = () => {
    const doc = frame.current?.contentDocument;
    if (doc?.documentElement) setHeight(doc.documentElement.scrollHeight + 8);
  };

  if (error) return <div className="card p-8 text-center text-gray-400">{error}</div>;
  if (html === null) return <div className="card p-8 text-center text-gray-400">Loading report card...</div>;

  return (
    <div className="overflow-x-auto">
      <iframe
        ref={frame}
        title="Report card"
        srcDoc={html}
        sandbox="allow-same-origin"
        onLoad={fit}
        className="block mx-auto bg-white border border-gray-200 rounded"
        style={{ width: "100%", minWidth: 560, maxWidth: 900, height }}
      />
    </div>
  );
}
