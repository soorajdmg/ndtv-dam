"use client";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Download, Tag, User, Wand2 } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import { getImageVariants, getVariantDownloadUrl, generateImageVariants, getImageQuality, getImageMetadata } from "@/lib/api";
import { ScoreBreakdownBar } from "@/components/ScoreBreakdownBar";
import { StatusBadge } from "@/components/StatusBadge";
import { VARIANT_LABELS } from "@/lib/utils";

export default function ImageDetailPage() {
  const { imageId } = useParams<{ imageId: string }>();
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);

  const { data: variants = [] } = useQuery({
    queryKey: ["image-variants", imageId],
    queryFn: () => getImageVariants(imageId),
    refetchInterval: (query) => {
      const data = query.state.data ?? [];
      const isActive = data.some(
        (v) => v.generation_status === "pending" || v.generation_status === "processing"
      );
      return isActive ? 2000 : false;
    },
  });

  const { data: quality } = useQuery({
    queryKey: ["image-quality", imageId],
    queryFn: () => getImageQuality(imageId),
  });

  const { data: metadata } = useQuery({
    queryKey: ["image-metadata", imageId],
    queryFn: () => getImageMetadata(imageId),
  });

  async function handleGenerateVariants() {
    setGenerating(true);
    try {
      await generateImageVariants(imageId);
      toast.success("Variant generation started.");
      queryClient.invalidateQueries({ queryKey: ["image-variants", imageId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start variant generation");
    } finally {
      setGenerating(false);
    }
  }

  const hasVariants = variants.length > 0;
  const allFailed = hasVariants && variants.every((v) => v.generation_status === "failed");
  const anyPending = variants.some(
    (v) => v.generation_status === "pending" || v.generation_status === "processing"
  );

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <button onClick={() => history.back()} className="text-gray-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-white">Image Detail</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-surface-border bg-surface overflow-hidden relative">
            <img
              src={`${apiBase}/api/images/${imageId}/thumbnail`}
              alt="Image"
              className="w-full object-contain max-h-96"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Asset Variants</h2>
              <button
                onClick={handleGenerateVariants}
                disabled={generating || anyPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-navy border border-surface-border text-xs text-gray-300 hover:text-white hover:border-brand-gold/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Wand2 className="w-3.5 h-3.5" />
                {generating || anyPending
                  ? "Generating..."
                  : allFailed
                  ? "Retry Generation"
                  : hasVariants
                  ? "Regenerate"
                  : "Generate Variants"}
              </button>
            </div>

            {hasVariants ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {variants.map((variant) => (
                  <div
                    key={variant.id}
                    className="rounded-lg border border-surface-border bg-surface-card p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-white">
                        {VARIANT_LABELS[variant.variant_type] ?? variant.variant_type}
                      </p>
                      <StatusBadge status={variant.generation_status} />
                    </div>
                    {variant.width && variant.height && (
                      <p className="text-xs text-gray-400">{variant.width}x{variant.height}</p>
                    )}
                    {variant.generation_status === "completed" && (
                      <a
                        href={getVariantDownloadUrl(variant.id)}
                        download
                        className="flex items-center gap-1 text-xs text-brand-gold hover:underline"
                      >
                        <Download className="w-3 h-3" />
                        Download
                      </a>
                    )}
                    {variant.error_message && (
                      <p className="text-xs text-red-400">{variant.error_message}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-surface-border bg-surface-card p-4 text-center">
                <p className="text-xs text-gray-400">
                  No variants generated yet. Click "Generate Variants" to create a transparent cutout, square gray background, and branded 16:9 version.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {/* Persons */}
          <div className="rounded-xl border border-surface-border bg-surface-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-4 h-4 text-brand-gold" />
              <h2 className="text-sm font-semibold text-white">People</h2>
            </div>
            {metadata && metadata.persons.length > 0 ? (
              <div className="space-y-2">
                {metadata.persons.map((person) => (
                  <Link
                    key={person.id}
                    href={`/persons/${person.id}`}
                    className="flex items-start gap-2 p-2 rounded-lg hover:bg-surface transition-colors group"
                  >
                    <div className="w-7 h-7 rounded-full bg-brand-gold/20 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5 text-brand-gold" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white group-hover:text-brand-gold transition-colors truncate">
                        {person.full_name}
                      </p>
                      {(person.designation || person.organization) && (
                        <p className="text-xs text-gray-500 truncate">
                          {[person.designation, person.organization].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {person.category && (
                        <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-xs bg-brand-gold/10 text-brand-gold/80">
                          {person.category}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500">No people identified in this image.</p>
            )}
          </div>

          {/* Semantic Tags */}
          <div className="rounded-xl border border-surface-border bg-surface-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Tag className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-white">Semantic Tags</h2>
            </div>
            {metadata && metadata.semantic_tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {metadata.semantic_tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-full text-xs bg-blue-500/15 text-blue-400 border border-blue-500/20"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500">Semantic tags load after CLIP processing completes.</p>
            )}
          </div>

          {/* Quality Scores */}
          <div className="rounded-xl border border-surface-border bg-surface-card p-4">
            <h2 className="text-sm font-semibold text-white mb-3">Quality Scores</h2>
            {quality && quality.overall !== undefined ? (
              <ScoreBreakdownBar quality={quality} />
            ) : (
              <p className="text-xs text-gray-500">
                Quality data loads after processing completes. Check batch status for progress.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
