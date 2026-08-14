"use client";
import { useEffect } from "react";

/**
 * Last-resort boundary: fires when the root layout itself throws, which replaces
 * the whole document. Deliberately uses inline styles and no imports beyond React —
 * at this point the app's CSS and providers may not have loaded at all.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f9fafb",
          color: "#1f2937",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <div>
          <h1 style={{ color: "#1a3a5c", fontSize: "22px", margin: "0 0 8px" }}>
            Zentara Shikshya could not start
          </h1>
          <p style={{ fontSize: "14px", color: "#4b5563", margin: "0 0 4px" }}>
            Please reload the page. If it keeps happening, contact your school administrator.
          </p>
          {error.digest && (
            <p style={{ fontSize: "11px", color: "#9ca3af", fontFamily: "monospace" }}>
              Error code: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: "20px",
              padding: "8px 18px",
              borderRadius: "8px",
              border: "none",
              background: "#1a3a5c",
              color: "#fff",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
