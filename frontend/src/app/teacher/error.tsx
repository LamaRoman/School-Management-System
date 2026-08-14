"use client";
import RouteError from "@/components/ui/RouteError";

export default function TeacherError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} homeHref="/teacher/dashboard" homeLabel="Back to Dashboard" />;
}
