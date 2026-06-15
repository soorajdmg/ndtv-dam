"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Filter, Image as ImageIcon, Loader2 } from "lucide-react";
import Link from "next/link";
import { listImages } from "@/lib/api";
import { cn, formatBytes, scoreToColor, truncateId } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";

const PAGE_SIZE = 30;

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "processing", label: "Processing" },
  { value: "queued", label: "Queued" },
  { value: "failed", label: "Failed" },
];

export default function ImagesPage() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["images-list", page, statusFilter],
    queryFn: () =>
      listImages({ page, page_size: PAGE_SIZE, status: statusFilter || undefined }),
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Images</h1>
          {data && (
            <p className="text-sm text-gray-400 mt-0.5">
              {data.total.toLocaleString()} image{data.total !== 1 ? "s" : ""} in the library
            </p>
          )}
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <div className="flex gap-1">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setStatusFilter(opt.value);
                  setPage(1);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  statusFilter === opt.value
                    ? "bg-brand-gold text-brand-navy"
                    : "bg-surface-card border border-surface-border text-gray-400 hover:text-white"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-brand-gold animate-spin" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center h-64 gap-2 text-center">
          <p className="text-red-400 font-medium">Failed to load images</p>
          <p className="text-sm text-gray-500">Make sure the backend is running.</p>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
          <div className="w-14 h-14 rounded-full bg-surface-card border border-surface-border flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-gray-500" />
          </div>
          <p className="text-gray-400">No images found</p>
          <Link
            href="/upload"
            className="px-4 py-2 rounded-lg bg-brand-gold text-brand-navy text-sm font-medium hover:bg-brand-gold/90 transition-colors"
          >
            Upload Images
          </Link>
        </div>
      ) : (
        <>
          {/* Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {data.items.map((image) => (
              <Link
                key={image.id}
                href={`/images/${image.id}`}
                className="group rounded-xl border border-surface-border bg-surface-card overflow-hidden hover:border-brand-gold/50 transition-all"
              >
                {/* Thumbnail */}
                <div className="relative aspect-square bg-surface overflow-hidden">
                  <img
                    src={`${apiBase}/api/images/${image.id}/thumbnail?w=300`}
                    alt={image.original_filename}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = "none";
                      target.parentElement!.classList.add("flex", "items-center", "justify-center");
                    }}
                  />
                  {/* Quality badge */}
                  {image.overall_quality_score !== undefined && (
                    <div
                      className={cn(
                        "absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-xs font-bold",
                        image.overall_quality_score >= 0.75
                          ? "bg-green-500 text-white"
                          : image.overall_quality_score >= 0.5
                          ? "bg-yellow-500 text-black"
                          : "bg-red-500 text-white"
                      )}
                    >
                      {Math.round(image.overall_quality_score * 100)}%
                    </div>
                  )}
                  {image.is_duplicate && (
                    <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-xs bg-orange-500/80 text-white">
                      Dup
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-2 space-y-1.5">
                  <p className="text-xs font-medium text-white truncate leading-tight">
                    {image.original_filename}
                  </p>

                  <div className="flex items-center justify-between">
                    <StatusBadge status={image.upload_status} />
                    {image.width && image.height && (
                      <span className="text-xs text-gray-500">
                        {image.width}×{image.height}
                      </span>
                    )}
                  </div>

                  {image.matched_persons.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {image.matched_persons.slice(0, 2).map((name) => (
                        <span
                          key={name}
                          className="px-1 py-0.5 rounded text-xs bg-brand-gold/20 text-brand-gold truncate max-w-full"
                        >
                          {name}
                        </span>
                      ))}
                      {image.matched_persons.length > 2 && (
                        <span className="text-xs text-gray-400">
                          +{image.matched_persons.length - 2}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-surface-border text-gray-400 hover:text-white hover:border-brand-gold/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-400">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-surface-border text-gray-400 hover:text-white hover:border-brand-gold/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
