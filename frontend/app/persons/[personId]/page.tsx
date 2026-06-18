"use client";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeft, Image as ImageIcon, Upload, CheckCircle, AlertCircle, UserCheck, Pencil, Trash2, X, Plus, ChevronLeft, ChevronRight, ScanFace, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { getPerson, searchByPerson, updatePerson, deletePerson } from "@/lib/api";
import { ImageCard } from "@/components/ImageCard";
import { CATEGORY_OPTIONS, cn } from "@/lib/utils";

export default function PersonDetailPage() {
  const { personId } = useParams<{ personId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ queued: boolean } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: "", designation: "", organization: "", category: "" });
  const [editAliases, setEditAliases] = useState<string[]>([]);
  const [aliasInput, setAliasInput] = useState("");
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const { data: person, isLoading: personLoading, error: personError } = useQuery({
    queryKey: ["person", personId],
    queryFn: () => getPerson(personId),
  });

  const { data: images } = useQuery({
    queryKey: ["person-images", personId, page],
    queryFn: () => searchByPerson(personId, page, PAGE_SIZE),
    enabled: !!person,
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const res = await fetch(`${apiBase}/api/persons/${personId}/reference-photo`, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail ?? "Upload failed");
      // API now returns task_id (async processing) instead of immediate results
      setUploadResult({ queued: true });
      queryClient.invalidateQueries({ queryKey: ["person", personId] });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function openEdit() {
    if (!person) return;
    setEditForm({
      full_name: person.full_name,
      designation: person.designation ?? "",
      organization: person.organization ?? "",
      category: person.category ?? "",
    });
    setEditAliases([...person.aliases]);
    setAliasInput("");
    setEditing(true);
  }

  function addAlias() {
    const trimmed = aliasInput.trim();
    if (trimmed && !editAliases.includes(trimmed)) {
      setEditAliases([...editAliases, trimmed]);
      setAliasInput("");
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm.full_name.trim()) return toast.error("Full name is required");
    setSaving(true);
    try {
      await updatePerson(personId, {
        full_name: editForm.full_name,
        designation: editForm.designation || undefined,
        organization: editForm.organization || undefined,
        category: editForm.category || undefined,
        aliases: editAliases,
      });
      toast.success("Person updated");
      queryClient.invalidateQueries({ queryKey: ["person", personId] });
      queryClient.invalidateQueries({ queryKey: ["persons"] });
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deletePerson(personId);
      toast.success("Person deleted");
      queryClient.invalidateQueries({ queryKey: ["persons"] });
      router.push("/persons");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (personLoading) return <div className="p-6 text-gray-400">Loading...</div>;
  if (personError) return <div className="p-6 text-red-400">Failed to load person: {personError instanceof Error ? personError.message : "Unknown error"}</div>;
  if (!person) return <div className="p-6 text-gray-400">Person not found.</div>;

  const hasEmbedding = person.has_face_embedding === true;

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb + actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/persons" className="text-gray-400 hover:text-white transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-white truncate">{person.full_name}</h1>
          {hasEmbedding && (
            <span title="A face embedding has been saved. This person will be automatically recognised in future batch uploads." className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-900/40 border border-green-700/50 text-green-400 shrink-0">
              <UserCheck className="w-3 h-3" />
              Face recognition active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={openEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-border bg-surface-card text-sm text-gray-300 hover:text-white hover:border-brand-gold/50 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-800/50 bg-surface-card text-sm text-red-400 hover:text-red-300 hover:border-red-600 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-400">Are you sure?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-medium disabled:opacity-50 transition-colors"
              >
                {deleting ? "Deleting..." : "Yes, delete"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 rounded-lg border border-surface-border text-xs text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="rounded-xl border border-brand-gold/30 bg-surface-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Edit Person</h2>
            <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Full Name *</label>
                <input type="text" value={editForm.full_name} required
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-border text-white text-sm focus:outline-none focus:border-brand-gold/50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Designation</label>
                <input type="text" value={editForm.designation} placeholder="e.g. Finance Minister"
                  onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-border text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand-gold/50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Organization</label>
                <input type="text" value={editForm.organization} placeholder="e.g. Ministry of Finance"
                  onChange={(e) => setEditForm({ ...editForm, organization: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-border text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand-gold/50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Category</label>
                <select value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-border text-white text-sm focus:outline-none focus:border-brand-gold/50">
                  <option value="">None</option>
                  {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Aliases</label>
              <div className="flex gap-2 mb-2">
                <input type="text" value={aliasInput} placeholder="Add alias and press Enter"
                  onChange={(e) => setAliasInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAlias())}
                  className="flex-1 px-3 py-2 rounded-lg bg-surface border border-surface-border text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand-gold/50" />
                <button type="button" onClick={addAlias}
                  className="px-2.5 py-2 rounded-lg border border-surface-border text-gray-400 hover:text-white transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {editAliases.map((alias) => (
                  <span key={alias} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface border border-surface-border text-xs text-gray-300">
                    {alias}
                    <button type="button" onClick={() => setEditAliases(editAliases.filter((a) => a !== alias))}
                      className="text-gray-500 hover:text-red-400">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={saving}
                className="px-5 py-2 rounded-lg bg-brand-gold hover:bg-brand-gold-light text-brand-navy font-semibold text-sm disabled:opacity-50 transition-colors">
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button type="button" onClick={() => setEditing(false)}
                className="px-5 py-2 rounded-lg border border-surface-border text-sm text-gray-400 hover:text-white transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Images */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-brand-gold" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-white">
            Images ({images ? images.total : person.image_count})
          </h2>
        </div>
        {images && images.results.length > 0 ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {images.results.map((item) => (
                <ImageCard key={item.image_id} image={{
                  id: item.image_id,
                  batch_id: item.batch_id,
                  original_filename: item.original_filename,
                  storage_path: item.storage_path,
                  upload_status: "completed",
                  is_duplicate: false,
                  created_at: item.upload_date,
                  overall_quality_score: item.overall_quality_score,
                }} />
              ))}
            </div>
            {(() => {
              const totalPages = Math.max(1, Math.ceil(images.total / PAGE_SIZE));
              return totalPages > 1 ? (
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onChange={(p) => {
                    setPage(p);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
              ) : null;
            })()}
          </>
        ) : (
          <div className="rounded-xl border border-surface-border bg-surface-card p-8 flex flex-col items-center justify-center gap-2 text-center">
            <ImageIcon className="w-8 h-8 text-gray-600" aria-hidden="true" />
            <p className="text-sm text-gray-400">No images found for this person.</p>
            <p className="text-xs text-gray-500">Images will appear here once uploaded batches are processed and faces are matched.</p>
          </div>
        )}
      </div>

      {/* Person Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-surface-border bg-surface-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Details</h2>
          <div className="space-y-2 text-sm">
            {person.designation && (
              <div className="flex gap-2">
                <span className="text-gray-400 w-28 shrink-0">Designation</span>
                <span className="text-white">{person.designation}</span>
              </div>
            )}
            {person.organization && (
              <div className="flex gap-2">
                <span className="text-gray-400 w-28 shrink-0">Organization</span>
                <Link
                  href={`/organizations?search=${encodeURIComponent(person.organization)}`}
                  className="text-brand-gold hover:text-brand-gold-light hover:underline transition-colors"
                >
                  {person.organization}
                </Link>
              </div>
            )}
            {person.category && (
              <div className="flex gap-2">
                <span className="text-gray-400 w-28 shrink-0">Category</span>
                <span className="px-2 py-0.5 rounded-full text-xs bg-brand-navy border border-surface-border text-gray-300">
                  {person.category}
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <span className="text-gray-400 w-28 shrink-0">Images</span>
              <span className="text-white">{person.image_count}</span>
            </div>
          </div>
        </div>
        {person.aliases.length > 0 && (
          <div className="rounded-xl border border-surface-border bg-surface-card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Aliases</h2>
            <div className="flex flex-wrap gap-2">
              {person.aliases.map((alias) => (
                <span key={alias} className="px-2.5 py-1 rounded-full bg-surface border border-surface-border text-sm text-gray-300">
                  {alias}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Face Recognition */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {hasEmbedding ? (
        /* ── Trained state ── */
        <div className="rounded-xl border border-green-700/40 bg-green-900/10 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-900/40 border border-green-700/50">
                <ShieldCheck className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-green-400">Face Recognition Active</h2>
                <p className="text-xs text-green-300/70 mt-0.5">
                  This person&apos;s face has been trained. They will be automatically tagged in all future batch uploads.
                </p>
              </div>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-700/50 bg-green-900/30 text-xs text-green-400 hover:text-green-300 hover:border-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload className="w-3.5 h-3.5" />
              {uploading ? "Processing..." : "Replace Photo"}
            </button>
          </div>
          {uploading && (
            <p className="mt-3 text-xs text-green-400/70 animate-pulse pl-12">Detecting face and extracting embedding…</p>
          )}
          {uploadResult && !uploading && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-green-700/40 bg-green-900/20 p-3">
              <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
              <div className="text-xs text-green-300 space-y-0.5">
                <p className="font-medium">New reference photo queued for processing.</p>
                <p className="text-green-400/80">Face detection is running in the background — the embedding will be updated in a few seconds.</p>
              </div>
            </div>
          )}
          {uploadError && !uploading && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-700/40 bg-red-900/20 p-3">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{uploadError}</p>
            </div>
          )}
        </div>
      ) : (
        /* ── Not trained state ── */
        <div className="rounded-xl border border-surface-border bg-surface-card p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-navy border border-surface-border">
              <ScanFace className="w-5 h-5 text-gray-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Face Recognition Training</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Train the system to automatically recognise and tag <span className="text-white font-medium">{person.full_name}</span> in future batch uploads.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-surface-border bg-surface/60 p-4 space-y-2.5">
            <p className="text-xs font-medium text-gray-300 uppercase tracking-wide">How it works</p>
            <ol className="space-y-2">
              {[
                "Upload a clear, front-facing photo of this person.",
                "The system detects the face and saves a unique fingerprint — the photo itself is never stored.",
                "From that point on, this person is automatically tagged whenever images are processed.",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-xs text-gray-400">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-navy border border-surface-border text-[10px] font-bold text-brand-gold">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-gold hover:bg-brand-gold-light text-brand-navy font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload className="w-4 h-4" />
              {uploading ? "Processing..." : "Upload Reference Photo"}
            </button>
            {uploading && <span className="text-xs text-gray-400 animate-pulse">Detecting face and extracting embedding…</span>}
          </div>

          {uploadResult && !uploading && (
            <div className="flex items-start gap-2 rounded-lg border border-green-700/40 bg-green-900/20 p-3">
              <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
              <div className="text-xs text-green-300 space-y-0.5">
                <p className="font-medium">Reference photo queued for processing.</p>
                <p className="text-green-400/80">Face detection is running in the background — the embedding will be ready in a few seconds.</p>
              </div>
            </div>
          )}
          {uploadError && !uploading && (
            <div className="flex items-start gap-2 rounded-lg border border-red-700/40 bg-red-900/20 p-3">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{uploadError}</p>
            </div>
          )}
        </div>
      )}
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
