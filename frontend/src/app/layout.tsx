import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/hooks/useAuth";
import { ConfirmDialogMount } from "@/components/ui/ConfirmDialog";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zentara Shikshya",
  description: "Zentara Shikshya — A complete digital solution for modern schools",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
          <ConfirmDialogMount />
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