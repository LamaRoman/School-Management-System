"use client";
import RouteError from "@/components/ui/RouteError";

export default function SuperAdminError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} homeHref="/super-admin" homeLabel="Back to Dashboard" />;
}
