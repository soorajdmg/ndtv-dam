"use client";
import { cn, statusColor } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const STATUS_LABELS: Record<string, string> = {
  completed: "Completed",
  processing: "Processing",
  pending: "Pending",
  failed: "Failed",
  partial_failure: "Partial Failure",
  queued: "Queued",
  in_review: "In Review",
  resolved: "Resolved",
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
        statusColor(status),
        className
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
