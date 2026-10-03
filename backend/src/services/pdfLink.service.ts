import jwt from "jsonwebtoken";
import { createHmac, randomUUID } from "crypto";
import { AppError } from "../middleware/errorHandler";

// Short-lived download links for report card PDFs.
//
// Why: a phone app cannot hand an Authorization header to the phone's browser, but opening
// the PDF *in the browser* is what makes Android put it straight into Downloads. So the app
// asks for a link, opens it, and the browser downloads it.
//
// The link carries only WHO asked and WHICH PDF — never a login. It is signed with a key
// derived from JWT_SECRET but different from it, so a link token can never be accepted as
// an access token (authenticate() would reject its signature), and it expires in 90 s.
// When opened, the request is run through the normal PDF route as that same user, so every
// existing check (school scope, teacher ownership, results-published gate) still applies.

export const PDF_LINK_TTL_SECONDS = 90;
const PURPOSE = "pdf-link";

// Only the four report-card PDF routes, with opaque ids and an optional mode. Nothing else
// can be reached through a link, whatever the client sends.
const PATH_RE = /^\/pdf(\/(?:term|final|class\/term|class\/final)\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64})(?:\?mode=(color|bw))?$/;

function linkSecret(): string {
  return createHmac("sha256", process.env.JWT_SECRET!).update("pdf-link-v1").digest("hex");
}

/** "/pdf/term/a/b?mode=bw" -> { route: "/term/a/b", mode: "bw" }. Throws 400 for anything else. */
export function parsePdfPath(input: unknown): { route: string; mode: "color" | "bw" } {
  const m = typeof input === "string" ? PATH_RE.exec(input) : null;
  if (!m) throw new AppError("Not a report card PDF path", 400);
  return { route: m[1], mode: m[2] === "bw" ? "bw" : "color" };
}

export function signPdfLink(userId: string, route: string, mode: "color" | "bw"): string {
  return jwt.sign({ purpose: PURPOSE, uid: userId, route, mode }, linkSecret(), {
    algorithm: "HS256",
    expiresIn: PDF_LINK_TTL_SECONDS,
  });
}

export function verifyPdfLink(token: string): { userId: string; route: string; mode: "color" | "bw" } {
  try {
    const p = jwt.verify(token, linkSecret(), { algorithms: ["HS256"] }) as any;
    if (p.purpose !== PURPOSE || !p.uid || typeof p.route !== "string") throw new Error("bad claims");
    const parsed = parsePdfPath(`/pdf${p.route}?mode=${p.mode}`);
    return { userId: p.uid, route: parsed.route, mode: parsed.mode };
  } catch {
    throw new AppError("This download link has expired. Go back to the app and try again.", 401);
  }
}

/** A normal, very short access token for the user, used only to run the PDF route as them. */
export function mintShortAccessToken(user: { id: string; email: string; role: string; schoolId: string | null }): string {
  return jwt.sign(
    { jti: randomUUID(), userId: user.id, email: user.email, role: user.role, schoolId: user.schoolId || null },
    process.env.JWT_SECRET!,
    { algorithm: "HS256", expiresIn: 120 },
  );
}
