import { api } from "./api";

// Fetches a report card PDF from /pdf/* and either prints it via a hidden iframe
// or saves it, honouring the filename the server put in Content-Disposition.
// Shared by the student, parent and teacher report screens.
export async function openReportCardPdf(path: string, action: "print" | "download"): Promise<void> {
  // Phone/tablet browsers can't print a PDF held in a hidden iframe (iOS Safari
  // prints the host page, Android Chrome prints nothing). There, "print" opens
  // the PDF in its own tab so the viewer's own share/print menu is used. The tab
  // must be opened now, synchronously in the click, or the popup blocker eats it
  // once we're past the await below.
  const viewInTab = action === "print" && window.matchMedia?.("(pointer: coarse)").matches;
  const tab = viewInTab ? window.open("", "_blank") : null;

  let res: Response;
  try {
    res = await api.fetchRaw(path);
  } catch (err) {
    tab?.close();
    throw err;
  }
  if (!res.ok) {
    tab?.close();
    throw new Error("PDF generation failed");
  }

  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);

  if (viewInTab && tab) {
    tab.location.href = blobUrl;
    // The tab reads the blob lazily; keep it alive long enough to be viewed.
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 5 * 60 * 1000);
    return;
  }

  if (action === "print" && !viewInTab) {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = blobUrl;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.print();
      // The print dialog reads from the blob while it is open, so neither the
      // iframe nor the URL can be released until the user is plausibly done.
      setTimeout(() => {
        document.body.removeChild(iframe);
        window.URL.revokeObjectURL(blobUrl);
      }, 60000);
    };
    return;
  }

  const a = document.createElement("a");
  a.href = blobUrl;
  const disposition = res.headers.get("Content-Disposition");
  const filenameMatch = disposition?.match(/filename="(.+)"/);
  a.download = filenameMatch ? filenameMatch[1] : "report-card.pdf";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => window.URL.revokeObjectURL(blobUrl), 5000);
}
