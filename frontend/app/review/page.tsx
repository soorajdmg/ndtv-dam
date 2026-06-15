"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import toast from "react-hot-toast";
import { ClipboardCheck, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { getReviewQueue, bulkResolveReview } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { BulkReviewControls } from "@/components/BulkReviewControls";
import { formatRelative, cn } from "@/lib/utils";

const REASON_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  low_confidence: { label: "Low Confidence", color: "text-yellow-400", icon: AlertTriangle },
  unknown_face: { label: "Unknown Face", color: "text-red-400", icon: XCircle },
  pose_issue: { label: "Pose Issue", color: "text-orange-400", icon: AlertTriangle },
  manual_flag: { label: "Manual Flag", color: "text-blue-400", icon: ClipboardCheck },
};

export default function ReviewQueuePage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterReason, setFilterReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["review-queue", filterReason],
    queryFn: () => getReviewQueue(1, 50, filterReason || undefined),
    refetchInterval: 15_000,
  });

  const bulkMutation = useMutation({
    mutationFn: (action: "confirm" | "reject") =>
      bulkResolveReview(Array.from(selected), action),
    onSuccess: (res, action) => {
      toast.success(`${res.resolved} items ${action}ed`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["review-queue"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const items = data?.items ?? [];
  const pendingCount = data?.pending_count ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Review Queue</h1>
          <p className="text-gray-400 text-sm mt-1">
            {pendingCount} items pending review
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(REASON_LABELS).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setFilterReason(filterReason === key ? "" : key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs border transition-colors",
                filterReason === key
                  ? "border-brand-gold text-brand-gold bg-brand-gold/10"
                  : "border-surface-border text-gray-400 hover:text-white"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Progress indicator */}
      <div className="rounded-lg bg-surface-card border border-surface-border p-3 flex items-center gap-4">
        <div className="flex-1">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{data?.in_review_count ?? 0} in review</span>
            <span>{pendingCount} pending</span>
          </div>
          <div className="w-full bg-surface-border rounded-full h-1.5">
            {data && data.total > 0 && (
              <div
                className="bg-brand-gold h-1.5 rounded-full"
                style={{ width: `${((data.total - pendingCount) / data.total) * 100}%` }}
              />
            )}
          </div>
        </div>
        <span className="text-xs text-gray-400 shrink-0">{data?.total ?? 0} total</span>
      </div>

      {/* Bulk Controls */}
      <BulkReviewControls
        selectedCount={selected.size}
        onBulkConfirm={() => bulkMutation.mutate("confirm")}
        onBulkReject={() => bulkMutation.mutate("reject")}
        loading={bulkMutation.isPending}
      />

      {/* Queue Items */}
      {isLoading ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Review queue is empty!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const reasonMeta = REASON_LABELS[item.reason] ?? { label: item.reason, color: "text-gray-400", icon: AlertTriangle };
            const ReasonIcon = reasonMeta.icon;
            return (
              <div
                key={item.id}
                className={cn(
                  "rounded-xl border bg-surface-card p-4 flex items-center gap-4 transition-colors",
                  selected.has(item.id) ? "border-brand-gold/50" : "border-surface-border hover:border-surface-hover"
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggleSelect(item.id)}
                  className="accent-brand-gold w-4 h-4 shrink-0"
                />
                {/* Face crop placeholder */}
                <div className="w-16 h-16 rounded-lg bg-surface border border-surface-border overflow-hidden shrink-0 flex items-center justify-center">
                  <img
                    src={`${process.env.NEXT_PUBLIC_API_URL}/api/face-detections/${item.face_detection_id}/crop`}
                    alt="Face crop"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ReasonIcon className={cn("w-3.5 h-3.5 shrink-0", reasonMeta.color)} />
                    <span className={cn("text-xs font-medium", reasonMeta.color)}>{reasonMeta.label}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  {item.ai_guess_person_name && (
                    <p className="text-sm text-white mt-1">
                      AI guess: <span className="font-medium">{item.ai_guess_person_name}</span>
                      {item.ai_similarity_score !== undefined && (
                        <span className="text-gray-400 text-xs ml-2">
                          ({Math.round(item.ai_similarity_score * 100)}% confidence)
                        </span>
                      )}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-0.5">{formatRelative(item.created_at)}</p>
                </div>

                <Link
                  href={`/review/${item.id}`}
                  className="px-3 py-1.5 rounded-lg border border-brand-gold/50 text-brand-gold text-xs hover:bg-brand-gold/10 transition-colors shrink-0"
                >
                  Review
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
