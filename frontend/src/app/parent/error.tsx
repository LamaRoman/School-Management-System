"use client";
import RouteError from "@/components/ui/RouteError";

export default function ParentError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} homeHref="/parent" homeLabel="Back to Home" />;
}
