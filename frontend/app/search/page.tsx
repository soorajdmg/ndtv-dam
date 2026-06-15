"use client";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal } from "lucide-react";
import { semanticSearch } from "@/lib/api";
import { ImageCard } from "@/components/ImageCard";
import { cn } from "@/lib/utils";

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [minScore, setMinScore] = useState<number>(0);
  const [showFilters, setShowFilters] = useState(false);

  const debouncedQuery = useDebounce(query, 400);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["search", debouncedQuery, minScore],
    queryFn: () =>
      semanticSearch(debouncedQuery, { min_quality_score: minScore || undefined }, 30),
    enabled: debouncedQuery.trim().length >= 2,
    staleTime: 5_000,
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Semantic Search</h1>
        <p className="text-gray-400 text-sm mt-1">
          Search images by description, person name, or concept
        </p>
      </div>

      {/* Search Bar */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. finance minister press conference, budget 2024..."
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-surface-card border border-surface-border text-white placeholder-gray-500 focus:outline-none focus:border-brand-gold/50 transition-colors"
          />
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={cn(
            "flex items-center gap-2 px-4 py-3 rounded-xl border transition-colors text-sm",
            showFilters
              ? "border-brand-gold text-brand-gold bg-brand-gold/10"
              : "border-surface-border text-gray-400 hover:text-white"
          )}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
        </button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="rounded-xl border border-surface-border bg-surface-card p-4 space-y-4">
          <h3 className="text-sm font-medium text-white">Filters</h3>
          <div>
            <label className="text-xs text-gray-400 block mb-1">
              Min Quality Score: {Math.round(minScore * 100)}%
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={minScore}
              onChange={(e) => setMinScore(parseFloat(e.target.value))}
              className="w-full accent-brand-gold"
            />
          </div>
        </div>
      )}

      {/* Results */}
      {debouncedQuery.trim().length < 2 ? (
        <div className="text-center py-20 text-gray-500">
          <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Enter at least 2 characters to search</p>
        </div>
      ) : isLoading || isFetching ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-surface-border bg-surface-card aspect-video animate-pulse"
            />
          ))}
        </div>
      ) : !data || data.results.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p>No results for &quot;{debouncedQuery}&quot;</p>
          {data?.fallback_used && (
            <p className="text-xs mt-2 text-yellow-400">Fallback metadata search was used</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            {data.total} results
            {data.fallback_used && (
              <span className="ml-2 text-xs text-yellow-400">(fallback search)</span>
            )}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {data.results.map((item) => (
              <ImageCard
                key={item.image_id}
                image={{
                  id: item.image_id,
                  batch_id: item.batch_id,
                  original_filename: item.original_filename,
                  storage_path: item.storage_path,
                  upload_status: "completed",
                  is_duplicate: false,
                  created_at: item.upload_date,
                  overall_quality_score: item.overall_quality_score,
                  matched_persons: item.matched_persons,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
