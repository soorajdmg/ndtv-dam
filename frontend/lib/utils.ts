import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), "MMM d, yyyy HH:mm");
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function truncateId(id: string, chars = 8): string {
  return id.replace(/-/g, "").slice(0, chars).toUpperCase();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function scoreToColor(score?: number): string {
  if (score === undefined || score === null) return "text-gray-400";
  if (score >= 0.75) return "text-green-400";
  if (score >= 0.5) return "text-yellow-400";
  return "text-red-400";
}

export function scoreToBarColor(score?: number): string {
  if (score === undefined || score === null) return "bg-gray-600";
  if (score >= 0.75) return "bg-green-500";
  if (score >= 0.5) return "bg-yellow-500";
  return "bg-red-500";
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    completed: "bg-green-500/20 text-green-400 border-green-500/30",
    processing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    failed: "bg-red-500/20 text-red-400 border-red-500/30",
    partial_failure: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    queued: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    in_review: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    resolved: "bg-green-500/20 text-green-400 border-green-500/30",
  };
  return map[status] ?? "bg-gray-500/20 text-gray-400 border-gray-500/30";
}

export const VARIANT_LABELS: Record<string, string> = {
  transparent_cutout: "Transparent Cutout",
  square_gray_bg: "Square Gray BG",
  branded_16_9: "Branded 16:9",
};

export const CATEGORY_OPTIONS = [
  "Government",
  "Analyst",
  "Businessperson",
  "NDTV Staff",
  "Politician",
  "Sports",
  "Entertainment",
  "Other",
];
