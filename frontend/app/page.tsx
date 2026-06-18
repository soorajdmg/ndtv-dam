"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  SlidersHorizontal,
  LayoutGrid,
  List,
  GalleryThumbnails,
  ArrowUpDown,
  Upload,
  X,
  ChevronLeft,
  ChevronRight,
  FileImage,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
  Filter,
  CheckCircle2,
  Clock,
  User,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import toast from "react-hot-toast";
import {
  listImages,
  listPersons,
  semanticSearch,
  uploadBatch,
} from "@/lib/api";
import { cn, formatBytes } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import type { ImageListItem } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;
const ACCEPTED_TYPES = { "image/jpeg": [], "image/png": [], "image/webp": [] };
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "All Sources" },
  { value: "ndtv", label: "NDTV" },
  { value: "ndtv_profit", label: "NDTV Profit" },
  { value: "ani", label: "ANI" },
  { value: "ap", label: "AP" },
];


type ViewMode = "grid" | "list" | "gallery";

// ─── Utility hooks ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function QualityBadge({ score }: { score?: number }) {
  if (score === undefined) return null;
  const pct = Math.round(score * 100);
  const cls =
    score >= 0.75
      ? "bg-green-500 text-white"
      : score >= 0.5
      ? "bg-yellow-500 text-black"
      : "bg-red-500 text-white";
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-xs font-bold", cls)}>
      {pct}%
    </span>
  );
}

function PersonTags({ names }: { names: string[] }) {
  if (!names.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {names.slice(0, 2).map((n) => (
        <span
          key={n}
          className="px-1.5 py-0.5 rounded text-[10px] bg-brand-gold/20 text-brand-gold truncate max-w-[100px]"
        >
          {n}
        </span>
      ))}
      {names.length > 2 && (
        <span className="text-[10px] text-gray-400">+{names.length - 2}</span>
      )}
    </div>
  );
}

// ─── Image display modes ──────────────────────────────────────────────────────

function GridCard({
  image,
  apiBase,
}: {
  image: ImageListItem;
  apiBase: string;
}) {
  return (
    <Link
      href={`/images/${image.id}`}
      className="group rounded-xl border border-surface-border bg-surface-card overflow-hidden hover:border-brand-gold/50 transition-all"
    >
      <div className="relative aspect-square bg-surface overflow-hidden">
        <img
          src={`${apiBase}/api/images/${image.id}/thumbnail?w=300`}
          alt={image.original_filename}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          onError={(e) => {
            const t = e.target as HTMLImageElement;
            t.style.display = "none";
          }}
        />
        <div className="absolute top-1.5 right-1.5">
          <QualityBadge score={image.overall_quality_score} />
        </div>
        {image.is_duplicate && (
          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] bg-orange-500/80 text-white">
            Dup
          </div>
        )}
      </div>
      <div className="p-2 space-y-1.5">
        <p className="text-xs font-medium text-white truncate leading-tight">
          {image.original_filename}
        </p>
        <div className="flex items-center justify-between">
          <StatusBadge status={image.upload_status} />
          {image.width && image.height && (
            <span className="text-[10px] text-gray-500">
              {image.width}×{image.height}
            </span>
          )}
        </div>
        <PersonTags names={image.matched_persons} />
      </div>
    </Link>
  );
}

function ListRow({
  image,
  apiBase,
}: {
  image: ImageListItem;
  apiBase: string;
}) {
  return (
    <Link
      href={`/images/${image.id}`}
      className="flex items-center gap-4 px-4 py-3 rounded-xl border border-surface-border bg-surface-card hover:border-brand-gold/50 transition-all group"
    >
      <div className="w-14 h-14 rounded-lg bg-surface overflow-hidden shrink-0">
        <img
          src={`${apiBase}/api/images/${image.id}/thumbnail?w=120`}
          alt={image.original_filename}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">
          {image.original_filename}
        </p>
        <div className="flex items-center gap-3 mt-1">
          <StatusBadge status={image.upload_status} />
          {image.width && image.height && (
            <span className="text-xs text-gray-500">
              {image.width}×{image.height}
            </span>
          )}
          {image.file_size_bytes && (
            <span className="text-xs text-gray-500">
              {formatBytes(image.file_size_bytes)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <PersonTags names={image.matched_persons} />
        <QualityBadge score={image.overall_quality_score} />
      </div>
    </Link>
  );
}

function GalleryCard({
  image,
  apiBase,
}: {
  image: ImageListItem;
  apiBase: string;
}) {
  return (
    <Link
      href={`/images/${image.id}`}
      className="group relative overflow-hidden rounded-xl border border-surface-border bg-surface hover:border-brand-gold/50 transition-all aspect-video"
    >
      <img
        src={`${apiBase}/api/images/${image.id}/thumbnail?w=600`}
        alt={image.original_filename}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-2 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-200">
        <p className="text-sm font-medium text-white truncate">
          {image.original_filename}
        </p>
        <div className="flex items-center justify-between mt-1">
          <PersonTags names={image.matched_persons} />
          <QualityBadge score={image.overall_quality_score} />
        </div>
      </div>
      {image.is_duplicate && (
        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] bg-orange-500/80 text-white">
          Dup
        </div>
      )}
    </Link>
  );
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (batchId: string) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  const onDrop = useCallback((accepted: File[], rejected: any[]) => {
    const newErrors: string[] = [];
    rejected.forEach((r) => {
      newErrors.push(`${r.file.name}: ${r.errors[0]?.message ?? "Invalid file"}`);
    });
    setErrors(newErrors);
    setFiles((prev) => [...prev, ...accepted]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_FILE_SIZE,
    multiple: true,
  });

  const handleUpload = async () => {
    if (!files.length) return;
    setUploading(true);
    setProgress(0);
    try {
      const response = await uploadBatch(files, undefined, setProgress);
      toast.success(`Batch uploaded! ${response.queued_images} images queued.`);
      if (response.rejected_files.length) {
        toast.error(`${response.rejected_files.length} files rejected.`);
      }
      setFiles([]);
      setErrors([]);
      onSuccess(response.batch_id);
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (uploading) return;
    setFiles([]);
    setErrors([]);
    setProgress(0);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />
      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg mx-4 rounded-2xl border border-surface-border bg-surface-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <div>
            <h2 className="text-base font-semibold text-white">Upload Images</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              JPEG, PNG, WebP — max 20MB each, up to 500 per batch
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={uploading}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-surface-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Drop Zone */}
          <div
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
              isDragActive
                ? "border-brand-gold bg-brand-gold/10"
                : "border-surface-border hover:border-brand-gold/50 hover:bg-surface-hover"
            )}
          >
            <input {...getInputProps()} />
            <Upload className="w-9 h-9 text-gray-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-white">
              {isDragActive ? "Drop images here" : "Drag & drop or click to browse"}
            </p>
            <p className="text-xs text-gray-500 mt-1">Supports JPEG, PNG, WebP</p>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 space-y-1">
              {errors.map((err, i) => (
                <p key={i} className="text-xs text-red-400 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {err}
                </p>
              ))}
            </div>
          )}

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-white">
                  {files.length} file{files.length !== 1 ? "s" : ""} selected
                </span>
                <button
                  onClick={() => setFiles([])}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Clear all
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {files.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-surface border border-surface-border"
                  >
                    <FileImage className="w-3.5 h-3.5 text-brand-gold shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white truncate">{file.name}</p>
                      <p className="text-[10px] text-gray-500">
                        {formatBytes(file.size)}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setFiles((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      className="text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress */}
          {uploading && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Uploading…</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-surface-border rounded-full h-1.5">
                <div
                  className="bg-brand-gold h-1.5 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleUpload}
            disabled={!files.length || uploading}
            className="w-full py-2.5 rounded-xl bg-brand-gold hover:bg-brand-gold-light text-brand-navy text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading
              ? "Uploading…"
              : files.length
              ? `Upload ${files.length} ${files.length === 1 ? "Image" : "Images"}`
              : "Select images to upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Person search dropdown ───────────────────────────────────────────────────

interface PersonSuggestion {
  id: string;
  full_name: string;
  designation?: string;
}

function PersonDropdown({
  suggestions,
  onSelect,
  visible,
}: {
  suggestions: PersonSuggestion[];
  onSelect: (p: PersonSuggestion) => void;
  visible: boolean;
}) {
  if (!visible || !suggestions.length) return null;
  return (
    <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl border border-surface-border bg-surface-card shadow-xl overflow-hidden">
      <div className="px-3 py-1.5 border-b border-surface-border">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
          Linked Persons
        </p>
      </div>
      {suggestions.map((p) => (
        <button
          key={p.id}
          onClick={() => onSelect(p)}
          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-hover transition-colors text-left"
        >
          <div className="w-6 h-6 rounded-full bg-brand-gold/20 flex items-center justify-center shrink-0">
            <User className="w-3 h-3 text-brand-gold" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-white truncate">{p.full_name}</p>
            {p.designation && (
              <p className="text-xs text-gray-400 truncate">{p.designation}</p>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Active batch banner ──────────────────────────────────────────────────────

function ActiveBatchBanner({
  batchId,
  onDismiss,
}: {
  batchId: string;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-brand-gold/30 bg-brand-gold/10">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Clock className="w-4 h-4 text-brand-gold shrink-0 animate-pulse" />
        <p className="text-sm text-white">
          Batch processing started.{" "}
          <Link
            href={`/batches/${batchId}`}
            className="text-brand-gold underline underline-offset-2 hover:text-brand-gold-light"
          >
            Track progress →
          </Link>
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="p-1 text-gray-400 hover:text-white transition-colors shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  const getPages = () => {
    const pages: (number | "ellipsis")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("ellipsis");
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push("ellipsis");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="flex items-center justify-center gap-1.5">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="p-1.5 rounded-lg border border-surface-border text-gray-400 hover:text-white hover:border-brand-gold/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {getPages().map((p, i) =>
        p === "ellipsis" ? (
          <span key={`e-${i}`} className="px-1 text-gray-500 text-sm">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={cn(
              "min-w-[32px] h-8 rounded-lg text-sm font-medium transition-colors",
              page === p
                ? "bg-brand-gold text-brand-navy"
                : "border border-surface-border text-gray-400 hover:text-white hover:border-brand-gold/50"
            )}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="p-1.5 rounded-lg border border-surface-border text-gray-400 hover:text-white hover:border-brand-gold/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [showPersonDropdown, setShowPersonDropdown] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<PersonSuggestion | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(searchQuery, 350);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  // View
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const [page, setPage] = useState(1);

  // Upload modal
  const [uploadOpen, setUploadOpen] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);

  // ── Close person dropdown when clicking outside ──
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowPersonDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Person suggestions ──
  const { data: personsData } = useQuery({
    queryKey: ["persons-suggest", debouncedQuery],
    queryFn: () => listPersons({ search: debouncedQuery, page_size: 6 }),
    enabled: debouncedQuery.trim().length >= 2 && !selectedPerson,
    staleTime: 10_000,
  });
  const personSuggestions: PersonSuggestion[] = personsData?.items ?? [];

  // ── Determine if we're doing person-scoped or semantic search ──
  const isSearchMode = debouncedQuery.trim().length >= 2 || !!selectedPerson;

  // ── Semantic search (free-text, no person selected) ──
  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ["dashboard-search", debouncedQuery],
    queryFn: () => semanticSearch(debouncedQuery, {}, 50),
    enabled: isSearchMode && !selectedPerson,
    staleTime: 5_000,
  });

  // ── Normal image list (default view or person-filtered) ──
  const { data: imagesData, isLoading: imagesLoading } = useQuery({
    queryKey: ["images-list", page, sortOrder],
    queryFn: () =>
      listImages({
        page,
        page_size: PAGE_SIZE,
      }),
    enabled: !isSearchMode || !!selectedPerson,
    staleTime: 15_000,
  });

  // ── Build the displayed image list ──
  let displayImages: ImageListItem[] = [];
  let totalItems = 0;

  if (isSearchMode && !selectedPerson && searchData) {
    // Convert SearchResultItem → ImageListItem shape for unified rendering
    displayImages = searchData.results.map((r) => ({
      id: r.image_id,
      batch_id: r.batch_id,
      original_filename: r.original_filename,
      width: undefined,
      height: undefined,
      file_size_bytes: undefined,
      format: undefined,
      upload_status: "completed" as const,
      is_duplicate: false,
      created_at: r.upload_date,
      overall_quality_score: r.overall_quality_score,
      matched_persons: r.matched_persons,
    }));
    totalItems = searchData.total;
  } else if (imagesData) {
    displayImages = imagesData.items;
    totalItems = imagesData.total;
  }

  // Apply client-side sort when in normal list mode
  if (!isSearchMode || !!selectedPerson) {
    displayImages = [...displayImages].sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sortOrder === "newest" ? tb - ta : ta - tb;
    });
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const isLoading = isSearchMode && !selectedPerson ? searchLoading : imagesLoading;

  const activeFilterCount = [sourceFilter].filter(Boolean).length;

  // ── Handlers ──
  function handlePersonSelect(p: PersonSuggestion) {
    setSelectedPerson(p);
    setSearchQuery(p.full_name);
    setShowPersonDropdown(false);
    setPage(1);
  }

  function handleSearchChange(v: string) {
    setSearchQuery(v);
    setSelectedPerson(null);
    setShowPersonDropdown(true);
    setPage(1);
  }

  function handleSearchClear() {
    setSearchQuery("");
    setSelectedPerson(null);
    setShowPersonDropdown(false);
    setPage(1);
  }

  function handleUploadSuccess(batchId: string) {
    setUploadOpen(false);
    setActiveBatchId(batchId);
  }

  return (
    <div className="p-6 space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Asset Library</h1>
          {!isLoading && totalItems > 0 && (
            <p className="text-sm text-gray-400 mt-0.5">
              {totalItems.toLocaleString()} asset{totalItems !== 1 ? "s" : ""}
              {isSearchMode && !selectedPerson && " found"}
            </p>
          )}
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-gold hover:bg-brand-gold-light text-brand-navy text-sm font-semibold transition-colors"
        >
          <Upload className="w-4 h-4" />
          Upload
        </button>
      </div>

      {/* ── Active batch banner ── */}
      {activeBatchId && (
        <ActiveBatchBanner
          batchId={activeBatchId}
          onDismiss={() => setActiveBatchId(null)}
        />
      )}

      {/* ── Toolbar ── */}
      <div className="space-y-3">
        {/* Row 1: Search + Filter toggle + View modes + Sort */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[220px]" ref={searchRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() =>
                searchQuery.length >= 2 && setShowPersonDropdown(true)
              }
              placeholder="Search by person, metadata, description…"
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-surface-card border border-surface-border text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-gold/50 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={handleSearchClear}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <PersonDropdown
              suggestions={personSuggestions}
              onSelect={handlePersonSelect}
              visible={showPersonDropdown && !selectedPerson}
            />
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm transition-colors",
              showFilters || activeFilterCount > 0
                ? "border-brand-gold text-brand-gold bg-brand-gold/10"
                : "border-surface-border text-gray-400 hover:text-white"
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filter
            {activeFilterCount > 0 && (
              <span className="ml-0.5 w-4 h-4 rounded-full bg-brand-gold text-brand-navy text-[10px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-surface-border" />

          {/* View mode */}
          <div className="flex items-center gap-1 rounded-xl border border-surface-border p-1">
            {(
              [
                { mode: "gallery" as ViewMode, icon: LayoutGrid, label: "Gallery" },
                { mode: "grid" as ViewMode, icon: GalleryThumbnails, label: "Grid" },
                { mode: "list" as ViewMode, icon: List, label: "List" },
              ] as const
            ).map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={label}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  viewMode === mode
                    ? "bg-brand-gold/20 text-brand-gold"
                    : "text-gray-400 hover:text-white"
                )}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="relative">
            <select
              value={sortOrder}
              onChange={(e) => {
                setSortOrder(e.target.value as "newest" | "oldest");
                setPage(1);
              }}
              className="appearance-none pl-3 pr-7 py-2 rounded-xl border border-surface-border bg-surface-card text-sm text-gray-300 focus:outline-none focus:border-brand-gold/50 transition-colors cursor-pointer"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Row 2: Expanded filter panel */}
        {showFilters && (
          <div className="rounded-xl border border-surface-border bg-surface-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                Filters
              </h3>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => {
                    setSourceFilter("");
                    setPage(1);
                  }}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-2">Source</label>
              <div className="flex flex-wrap gap-1.5">
                {SOURCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setSourceFilter(opt.value);
                      setPage(1);
                    }}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-medium transition-all",
                      sourceFilter === opt.value
                        ? "bg-brand-gold text-brand-navy"
                        : "bg-surface border border-surface-border text-gray-400 hover:text-white"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Selected person chip ── */}
      {selectedPerson && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Showing images for:</span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-gold/20 border border-brand-gold/30 text-brand-gold text-xs font-medium">
            <User className="w-3 h-3" />
            {selectedPerson.full_name}
            <button
              onClick={handleSearchClear}
              className="ml-1 hover:text-white transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        </div>
      )}

      {/* ── Content ── */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-7 h-7 text-brand-gold animate-spin" />
        </div>
      ) : displayImages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
          <div className="w-14 h-14 rounded-full bg-surface-card border border-surface-border flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-gray-500" />
          </div>
          <p className="text-gray-400 text-sm">
            {isSearchMode ? "No results found" : "No images yet"}
          </p>
          {!isSearchMode && (
            <button
              onClick={() => setUploadOpen(true)}
              className="px-4 py-2 rounded-lg bg-brand-gold text-brand-navy text-sm font-medium hover:bg-brand-gold-light transition-colors"
            >
              Upload Images
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Grid view */}
          {viewMode === "grid" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {displayImages.map((img) => (
                <GridCard key={img.id} image={img} apiBase={apiBase} />
              ))}
            </div>
          )}

          {/* List view */}
          {viewMode === "list" && (
            <div className="space-y-2">
              {displayImages.map((img) => (
                <ListRow key={img.id} image={img} apiBase={apiBase} />
              ))}
            </div>
          )}

          {/* Gallery view */}
          {viewMode === "gallery" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayImages.map((img) => (
                <GalleryCard key={img.id} image={img} apiBase={apiBase} />
              ))}
            </div>
          )}

          {/* Pagination — only in non-search mode */}
          {(!isSearchMode || !!selectedPerson) && (
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={(p) => {
                setPage(p);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          )}

          {/* Search result count footer */}
          {isSearchMode && !selectedPerson && (
            <p className="text-center text-xs text-gray-500">
              {totalItems} semantic result{totalItems !== 1 ? "s" : ""}
              {searchData?.fallback_used && (
                <span className="ml-2 text-yellow-400">(fallback metadata search)</span>
              )}
            </p>
          )}
        </>
      )}

      {/* ── Upload Modal ── */}
      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={handleUploadSuccess}
      />
    </div>
  );
}
