"use client";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { RefreshCw, Star, Tag } from "lucide-react";
import { getBatchStatus, getBatchShortlist, getBatchImages } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { ScoreBreakdownBar } from "@/components/ScoreBreakdownBar";
import { ImageCard } from "@/components/ImageCard";
import { cn, formatDate, truncateId } from "@/lib/utils";

export default function BatchDetailPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ["batch-status", batchId],
    queryFn: () => getBatchStatus(batchId),
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && ["completed", "failed", "partial_failure"].includes(d.status) ? false : 3000;
    },
  });

  const isTerminal = status && ["completed", "failed", "partial_failure"].includes(status.status);

  const { data: shortlist } = useQuery({
    queryKey: ["batch-shortlist", batchId],
    queryFn: () => getBatchShortlist(batchId),
    enabled: isTerminal,
  });

  const { data: allImages } = useQuery({
    queryKey: ["batch-images", batchId],
    queryFn: () => getBatchImages(batchId),
    enabled: !!status,
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/batches" className="text-gray-400 hover:text-white text-sm">Batches</Link>
            <span className="text-gray-600">/</span>
            <span className="text-white text-sm font-mono">{batchId ? truncateId(batchId) : "..."}</span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-1">Batch Detail</h1>
        </div>
        {!isTerminal && (
          <button
            onClick={() => refetchStatus()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-border text-gray-400 text-sm hover:text-white"
          >
            <RefreshCw className="w-4 h-4 animate-spin" />
            Auto-refreshing
          </button>
        )}
      </div>

      {/* Status Card */}
      {status && (
        <div className="rounded-xl border border-surface-border bg-surface-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <StatusBadge status={status.status} />
            <span className="text-xs text-gray-400">{formatDate(status.created_at)}</span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-400">
              <span>{status.processed} / {status.total} processed</span>
              <span>{status.percent_complete}%</span>
            </div>
            <div className="w-full bg-surface-border rounded-full h-2">
              <div
                className="bg-brand-gold h-2 rounded-full transition-all"
                style={{ width: `${status.percent_complete}%` }}
              />
            </div>
          </div>

          <div className="flex gap-6 text-sm">
            <div><span className="text-gray-400">Total: </span><span className="text-white font-medium">{status.total}</span></div>
            <div><span className="text-gray-400">Processed: </span><span className="text-green-400 font-medium">{status.processed}</span></div>
            <div><span className="text-gray-400">Failed: </span><span className="text-red-400 font-medium">{status.failed}</span></div>
          </div>
        </div>
      )}

      {/* Shortlisted Images */}
      {shortlist && shortlist.items.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-brand-gold" />
            <h2 className="text-lg font-semibold text-white">Shortlisted Images</h2>
            <span className="text-xs text-gray-500">({shortlist.items.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {shortlist.items.map((item) => (
              <div key={item.image_id} className="rounded-xl border border-brand-gold/40 bg-surface-card overflow-hidden">
                <div className="relative bg-surface h-44 overflow-hidden">
                  <span className="absolute top-2 left-2 z-10 w-6 h-6 rounded-full bg-brand-gold text-brand-navy text-xs font-bold flex items-center justify-center">
                    {item.rank}
                  </span>
                  {item.quality.overall !== undefined && (
                    <span
                      className={cn(
                        "absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded text-xs font-bold",
                        item.quality.overall >= 0.75
                          ? "bg-green-500 text-white"
                          : item.quality.overall >= 0.5
                          ? "bg-yellow-500 text-black"
                          : "bg-red-500 text-white"
                      )}
                    >
                      {Math.round(item.quality.overall * 100)}%
                    </span>
                  )}
                  <img
                    src={`${apiBase}/api/images/${item.image_id}/thumbnail`}
                    alt={item.original_filename}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
                <div className="p-3 space-y-2">
                  <p className="text-xs font-medium text-white truncate">{item.original_filename}</p>
                  {item.selection_reason && (
                    <p className="text-xs text-gray-400 truncate">{item.selection_reason}</p>
                  )}
                  {item.matched_persons.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.matched_persons.map((p) => (
                        <span key={p} className="px-1.5 py-0.5 rounded text-xs bg-brand-gold/20 text-brand-gold">{p}</span>
                      ))}
                    </div>
                  )}
                  {item.semantic_tags && item.semantic_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      <Tag className="w-3 h-3 text-gray-500 mt-0.5 shrink-0" />
                      {item.semantic_tags.map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 rounded text-xs bg-blue-500/15 text-blue-400 border border-blue-500/20">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <ScoreBreakdownBar quality={item.quality} />
                  <Link
                    href={`/images/${item.image_id}`}
                    className="block text-center py-1.5 rounded-lg border border-brand-gold/50 text-brand-gold text-xs hover:bg-brand-gold/10 transition-colors"
                  >
                    View Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Images */}
      {allImages && allImages.items.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-white">All Images</h2>
            <span className="text-xs text-gray-500">({allImages.total})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {allImages.items.map((img) => (
              <ImageCard
                key={img.id}
                image={{ ...img, batch_id: batchId, storage_path: img.storage_path ?? "" }}
                showVariants={false}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
