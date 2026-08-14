"use client";
import RouteError from "@/components/ui/RouteError";

export default function AccountantError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} homeHref="/accountant" homeLabel="Back to Dashboard" />;
}
