"use client";
import RouteError from "@/components/ui/RouteError";

export default function StudentError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} homeHref="/student/report" homeLabel="Back to Report Card" />;
}
