"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { getBatchStatus, getBatchImages } from "@/lib/api";
import type { BatchStatusResponse, BatchImage } from "@/lib/types";
import { cn, scoreToColor, truncateId } from "@/lib/utils";

const TERMINAL = new Set(["completed", "failed", "partial_failure"]);
const POLL_MS = 2500;
const PREVIEW_COUNT = 8;

interface BatchProcessingPanelProps {
  batchId: string;
  totalQueued: number;
  onDismiss?: () => void;
  /** If provided, redirect to this URL when the batch reaches a terminal state */
  redirectOnComplete?: string;
}

export function BatchProcessingPanel({
  batchId,
  totalQueued,
  onDismiss,
  redirectOnComplete,
}: BatchProcessingPanelProps) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const router = useRouter();

  const [status, setStatus] = useState<BatchStatusResponse | null>(null);
  const [recentImages, setRecentImages] = useState<BatchImage[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const redirectedRef = useRef(false);

  const fetchStatus = async () => {
    try {
      const s = await getBatchStatus(batchId);
      setStatus(s);

      // fetch a page of images to show live thumbnails of completed ones
      if (s.processed > 0) {
        const res = await getBatchImages(batchId, 1, PREVIEW_COUNT);
        const done = res.items.filter((img) => img.upload_status === "completed");
        setRecentImages(done.slice(0, PREVIEW_COUNT));

        // Redirect once when batch is done and we have a target URL
        if (TERMINAL.has(s.status) && redirectOnComplete && !redirectedRef.current) {
          redirectedRef.current = true;
          router.push(redirectOnComplete);
        }
      }

      if (TERMINAL.has(s.status)) {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    } catch {
      // silently fail — user can still navigate to batch page
    }
  };

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, POLL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const pct = status?.percent_complete ?? 0;
  const processed = status?.processed ?? 0;
  const failed = status?.failed ?? 0;
  const total = status?.total ?? totalQueued;
  const batchStatus = status?.status ?? "queued";
  const isDone = TERMINAL.has(batchStatus);
  const isError = batchStatus === "failed";

  const statusLabel = {
    queued: "Queued",
    processing: "Processing",
    completed: "Completed",
    failed: "Failed",
    partial_failure: "Partial Failure",
  }[batchStatus] ?? batchStatus;

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden transition-all duration-300",
        isDone && !isError
          ? "border-green-500/40 bg-green-500/5"
          : isError
          ? "border-red-500/40 bg-red-500/5"
          : "border-brand-gold/30 bg-brand-gold/5"
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Status icon */}
        <div className="shrink-0">
          {isDone && !isError ? (
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          ) : isError ? (
            <XCircle className="w-5 h-5 text-red-400" />
          ) : (
            <Loader2 className="w-5 h-5 text-brand-gold animate-spin" />
          )}
        </div>

        {/* Title + batch id */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-tight">
            {isDone && !isError
              ? "Batch processed"
              : isError
              ? "Batch failed"
              : "Processing batch…"}
          </p>
          <p className="text-xs text-gray-500 font-mono mt-0.5">#{truncateId(batchId)}</p>
        </div>

        {/* Status chip */}
        <span
          className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full border",
            isDone && !isError
              ? "bg-green-500/20 text-green-400 border-green-500/30"
              : isError
              ? "bg-red-500/20 text-red-400 border-red-500/30"
              : "bg-brand-gold/20 text-brand-gold border-brand-gold/30"
          )}
        >
          {statusLabel}
        </span>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-gray-500 hover:text-white transition-colors ml-1"
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {/* Body — hidden when collapsed */}
      {!collapsed && (
        <div className="px-4 pb-4 space-y-4">
          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="w-full bg-surface-border rounded-full h-2 overflow-hidden">
              <div
                className={cn(
                  "h-2 rounded-full transition-all duration-700",
                  isDone && !isError
                    ? "bg-green-500"
                    : isError
                    ? "bg-red-500"
                    : "bg-brand-gold"
                )}
                style={{ width: `${Math.max(pct, isDone ? 100 : 2)}%` }}
              />
            </div>

            {/* Counts row */}
            <div className="flex items-center justify-between text-xs text-gray-400">
              <div className="flex gap-4">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-white font-medium">{processed}</span>
                  <span>done</span>
                </span>
                {failed > 0 && (
                  <span className="flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-red-400 font-medium">{failed}</span>
                    <span>failed</span>
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-white font-medium">{Math.max(0, total - processed - failed)}</span>
                  <span>queued</span>
                </span>
              </div>
              <span className="font-semibold text-white">{Math.round(pct)}%</span>
            </div>
          </div>

          {/* Live image thumbnails */}
          {recentImages.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                Recently processed
              </p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                {recentImages.map((img) => (
                  <Link
                    key={img.id}
                    href={`/images/${img.id}`}
                    className="group relative aspect-square rounded-lg overflow-hidden bg-surface-card border border-surface-border hover:border-brand-gold/50 transition-all"
                    title={img.original_filename}
                  >
                    <img
                      src={`${apiBase}/api/images/${img.id}/thumbnail`}
                      alt={img.original_filename}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    {/* Quality badge */}
                    {img.overall_quality_score !== undefined && (
                      <div
                        className={cn(
                          "absolute bottom-0 inset-x-0 text-center text-[10px] font-bold py-0.5",
                          img.overall_quality_score >= 0.75
                            ? "bg-green-600/90 text-white"
                            : img.overall_quality_score >= 0.5
                            ? "bg-yellow-500/90 text-black"
                            : "bg-red-600/90 text-white"
                        )}
                      >
                        {Math.round(img.overall_quality_score * 100)}%
                      </div>
                    )}
                    {/* Duplicate badge */}
                    {img.is_duplicate && (
                      <div className="absolute top-1 left-1 w-2 h-2 rounded-full bg-orange-500" title="Duplicate" />
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-1">
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-xs text-gray-500 hover:text-white transition-colors"
              >
                Dismiss
              </button>
            )}
            <Link
              href={`/batches/${batchId}`}
              className="ml-auto flex items-center gap-1.5 text-xs font-medium text-brand-gold hover:text-brand-gold-light transition-colors"
            >
              View full batch
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
