"use client";
import Link from "next/link";
import { Download, Eye, Star } from "lucide-react";
import { cn, formatBytes, scoreToColor, truncateId } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import type { Image } from "@/lib/types";

interface ImageCardProps {
  image: Image & {
    overall_quality_score?: number;
    matched_persons?: string[];
    variant_ids?: string[];
  };
  className?: string;
  showVariants?: boolean;
}

export function ImageCard({ image, className, showVariants }: ImageCardProps) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  return (
    <div
      className={cn(
        "rounded-xl border border-surface-border bg-surface-card overflow-hidden group hover:border-brand-gold/50 transition-all",
        className
      )}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-surface overflow-hidden">
        <img
          src={`${apiBase}/api/images/${image.id}/thumbnail`}
          alt={image.original_filename}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        {/* Quality badge */}
        {image.overall_quality_score !== undefined && (
          <div
            className={cn(
              "absolute top-2 right-2 px-1.5 py-0.5 rounded text-xs font-bold",
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
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-xs bg-orange-500/80 text-white">
            Duplicate
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{image.original_filename}</p>
            <p className="text-xs text-gray-500">{truncateId(image.id)}</p>
          </div>
          <StatusBadge status={image.upload_status} />
        </div>

        {/* Metadata */}
        <div className="flex gap-3 text-xs text-gray-400">
          {image.width && image.height && (
            <span>{image.width}×{image.height}</span>
          )}
          {image.file_size_bytes && <span>{formatBytes(image.file_size_bytes)}</span>}
        </div>

        {/* Persons */}
        {image.matched_persons && image.matched_persons.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {image.matched_persons.slice(0, 3).map((name) => (
              <span
                key={name}
                className="px-1.5 py-0.5 rounded text-xs bg-brand-gold/20 text-brand-gold"
              >
                {name}
              </span>
            ))}
            {image.matched_persons.length > 3 && (
              <span className="px-1.5 py-0.5 rounded text-xs text-gray-400">
                +{image.matched_persons.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Link
            href={`/images/${image.id}`}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-surface hover:bg-surface-hover border border-surface-border text-gray-300 transition-colors"
          >
            <Eye className="w-3 h-3" />
            View
          </Link>
          {showVariants && image.variant_ids && image.variant_ids.length > 0 && (
            <a
              href={`${apiBase}/api/assets/${image.variant_ids[0]}/download`}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-surface hover:bg-surface-hover border border-surface-border text-gray-300 transition-colors"
            >
              <Download className="w-3 h-3" />
              Download
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
