// Certificate design metadata — split out of printUtils.ts so the design
// picker can render immediately. The HTML builders that use this data
// (buildCertificateHtml, printCertificate) are code-split behind a dynamic
// import in printUtils.ts, since they only run once the school info and a
// design are picked; this file has to load eagerly alongside them.

export interface CertificateData {
  title: string;        // heading, e.g. "Certificate of Participation"
  recipient: string;    // name (free text)
  functionName: string; // the event/function
  award?: string;       // optional position/award
  body?: string;        // optional citation; auto-composed if blank
  date?: string;        // BS date
  signatures: string[]; // configurable signature labels
  design?: string;      // visual theme id (see CERTIFICATE_DESIGNS)
}

// Selectable certificate designs. Each has a genuinely different layout —
// border treatment, decoration, and composition — not just a recolored
// version of the same template. `accent` drives the picker chip.
export const CERTIFICATE_DESIGNS: { id: string; label: string; accent: string }[] = [
  { id: "classic", label: "Traditional", accent: "#1a3a5c" },
  { id: "minimal", label: "Modern Minimal", accent: "#0d9488" },
  { id: "seal", label: "Elegant Seal", accent: "#b8860b" },
  { id: "banner", label: "Bold Banner", accent: "#9d174d" },
];
