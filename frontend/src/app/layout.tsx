import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/hooks/useAuth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Report Card System",
  description: "Nepali School Report Card Management System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: { background: "#1a3a5c", color: "#fff", fontSize: "14px" },
              success: { style: { background: "#2e7d32" } },
              error: { style: { background: "#c8102e" } },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}