"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  ArrowLeft, CheckCircle, XCircle, User, Search, UserPlus,
  Building2, Check, X,
} from "lucide-react";
import Link from "next/link";
import {
  getReviewItem,
  resolveReview,
  listPersons,
  createPerson,
  uploadReferencePhoto,
  listOrganizations,
  createOrganization,
} from "@/lib/api";
import { SOURCE_OPTIONS, PERSON_TYPE_OPTIONS } from "@/lib/utils";
import type { Organization } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─── Org picker ───────────────────────────────────────────────────────────────

function OrgPicker({
  value, orgs, onChange, onCreated,
}: {
  value: string;
  orgs: Organization[];
  onChange: (v: string) => void;
  onCreated: (o: Organization) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = orgs.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()));
  const exactMatch = orgs.some((o) => o.name.toLowerCase() === query.toLowerCase());

  async function handleCreate() {
    const name = newName.trim() || query.trim();
    if (!name) return;
    setSaving(true);
    try {
      const org = await createOrganization({ name });
      onCreated(org);
      onChange(org.name);
      setQuery(org.name);
      setOpen(false);
      setCreating(false);
      setNewName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create organisation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <Building2 className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
        <input
          type="text"
          value={query}
          placeholder="Search or select…"
          onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="w-full pl-6 pr-6 py-1.5 rounded bg-brand-navy border border-surface-border text-white text-xs placeholder-gray-600 focus:outline-none focus:border-brand-gold/50"
        />
        {query && (
          <button type="button" onClick={() => { onChange(""); setQuery(""); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-surface-border bg-brand-navy shadow-xl overflow-hidden">
          <div className="max-h-36 overflow-y-auto">
            {filtered.length > 0 ? filtered.map((o) => (
              <button key={o.id} type="button"
                onClick={() => { onChange(o.name); setQuery(o.name); setOpen(false); setCreating(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-200 hover:bg-surface hover:text-white transition-colors">
                <Building2 className="w-3 h-3 text-brand-gold shrink-0" />
                <span className="truncate">{o.name}</span>
              </button>
            )) : (
              <p className="px-3 py-2 text-xs text-gray-500">No organisations match</p>
            )}
          </div>
          {!exactMatch && (
            <div className="border-t border-surface-border">
              {!creating ? (
                <button type="button"
                  onClick={() => { setCreating(true); setNewName(query); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-brand-gold hover:bg-surface transition-colors">
                  <UserPlus className="w-3 h-3" />
                  {query.trim() ? `Create "${query.trim()}"` : "Create new organisation"}
                </button>
              ) : (
                <div className="p-2 space-y-1.5">
                  <input autoFocus type="text" value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    className="w-full px-2 py-1 rounded bg-surface border border-surface-border text-white text-xs focus:outline-none focus:border-brand-gold/50" />
                  <div className="flex gap-1.5">
                    <button type="button" onClick={handleCreate} disabled={saving || !newName.trim()}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-brand-gold text-brand-navy text-xs font-semibold disabled:opacity-50">
                      <Check className="w-3 h-3" />
                      {saving ? "Creating…" : "Create & select"}
                    </button>
                    <button type="button" onClick={() => setCreating(false)}
                      className="px-2.5 py-1 rounded border border-surface-border text-xs text-gray-400 hover:text-white">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ReviewWorkspacePage() {
  const { reviewId } = useParams<{ reviewId: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  // Which panel is open: "search" | "create" | null
  const [panel, setPanel] = useState<"search" | "create" | null>(null);

  // Search panel state
  const [searchQuery, setSearchQuery] = useState("");
  const [linking, setLinking] = useState(false);

  // Create panel state
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [form, setForm] = useState({
    full_name: "", designation: "", organization: "", source: "", person_type: "",
  });
  const [creating, setCreating] = useState(false);

  const { data: item, isLoading, isError } = useQuery({
    queryKey: ["review-item", reviewId],
    queryFn: () => getReviewItem(reviewId),
  });

  const { data: searchResults, isFetching: searchFetching } = useQuery({
    queryKey: ["persons-search", searchQuery],
    queryFn: () => listPersons({ search: searchQuery, page_size: 8 }),
    enabled: searchQuery.trim().length > 1,
  });

  function openCreate() {
    setPanel("create");
    listOrganizations().then(setOrgs).catch(() => {});
  }

  function afterResolve() {
    qc.invalidateQueries({ queryKey: ["review-queue"] });
    router.push("/review");
  }

  const resolveMutation = useMutation({
    mutationFn: ({ action, personId }: { action: "confirm" | "correct" | "reject"; personId?: string }) =>
      resolveReview(reviewId, action, personId),
    onSuccess: (_, vars) => {
      const label =
        vars.action === "confirm" ? "Confirmed" :
        vars.action === "correct" ? "Person assigned" :
        "Rejected";
      toast.success(label);
      afterResolve();
    },
    onError: (err: any) => toast.error(err.message),
  });

  async function handleLinkExisting(personId: string, personName: string) {
    setLinking(true);
    try {
      await resolveReview(reviewId, "correct", personId);
      toast.success(`Assigned to ${personName}`);
      afterResolve();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign person");
    } finally {
      setLinking(false);
    }
  }

  async function handleCreateNew(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) return toast.error("Name is required");
    if (!item) return;
    setCreating(true);
    try {
      // 1. Create person record
      const person = await createPerson({
        full_name: form.full_name.trim(),
        designation: form.designation.trim() || undefined,
        organization: form.organization.trim() || undefined,
        source: form.source || undefined,
        person_type: form.person_type || undefined,
      });

      // 2. Use the face crop as their reference photo (best quality — tight crop, single face)
      const cropRes = await fetch(
        `${apiBase}/api/face-detections/${item.face_detection_id}/crop`
      );
      if (cropRes.ok) {
        const blob = await cropRes.blob();
        const file = new File([blob], "reference.jpg", { type: "image/jpeg" });
        try { await uploadReferencePhoto(person.id, file); } catch { /* non-fatal */ }
      }

      // 3. Resolve the review item pointing to the new person
      await resolveReview(reviewId, "correct", person.id);
      toast.success(`Created ${person.full_name} and resolved`);
      afterResolve();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create person");
    } finally {
      setCreating(false);
    }
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/review" className="text-gray-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></Link>
          <h1 className="text-2xl font-bold text-white">Review Workspace</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-surface-border bg-surface-card aspect-square animate-pulse" />
          <div className="space-y-3">
            <div className="rounded-xl border border-surface-border bg-surface-card h-40 animate-pulse" />
            <div className="rounded-xl border border-surface-border bg-surface-card h-32 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !item) {
    return (
      <div className="p-6 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/review" className="text-gray-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></Link>
          <h1 className="text-2xl font-bold text-white">Review Workspace</h1>
        </div>
        <p className="text-red-400">Review item not found.</p>
      </div>
    );
  }

  const hasAiGuess = !!item.ai_guess_person_name;
  const confidence = item.ai_similarity_score != null ? Math.round(item.ai_similarity_score * 100) : null;

  const reasonDesc: Record<string, string> = {
    low_confidence: "Model detected a face but was not confident enough to identify them.",
    unknown: "Model detected a face with no match in the person database.",
    retrospective_match: "This face may match a recently added person.",
  };

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/review" className="text-gray-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Who is this?</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {reasonDesc[item.reason] ?? item.reason}
          </p>
        </div>
        <Link
          href={`/images/${item.image_id}`}
          className="ml-auto text-xs text-brand-gold hover:underline shrink-0"
        >
          View source image →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: face crop */}
        <div className="rounded-xl border border-surface-border bg-surface-card overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
            <p className="text-sm font-medium text-gray-300">Detected Face</p>
            <span className="text-xs text-gray-500">
              {Math.round(item.detection_confidence * 100)}% detection confidence
            </span>
          </div>
          <div className="aspect-square flex items-center justify-center bg-surface p-6">
            <img
              src={`${apiBase}/api/face-detections/${item.face_detection_id}/crop`}
              alt="Detected face"
              className="max-w-full max-h-full object-contain rounded-lg"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                const placeholder = document.createElement("p");
                placeholder.className = "text-gray-500 text-sm";
                placeholder.textContent = "Face crop not available";
                img.parentElement?.replaceChild(placeholder, img);
              }}
            />
          </div>
        </div>

        {/* Right: actions */}
        <div className="space-y-3">
          {/* AI guess card */}
          {hasAiGuess && (
            <div className="rounded-xl border border-brand-gold/30 bg-brand-gold/5 p-4 space-y-3">
              <p className="text-xs text-gray-400 uppercase tracking-widest">AI Suggestion</p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-brand-gold/20 border border-brand-gold/30 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-brand-gold" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{item.ai_guess_person_name}</p>
                  {confidence !== null && (
                    <p className="text-xs text-gray-400">{confidence}% similarity</p>
                  )}
                </div>
              </div>
              <button
                onClick={() =>
                  resolveMutation.mutate({
                    action: "confirm",
                    personId: item.ai_guess_person_id ?? undefined,
                  })
                }
                disabled={resolveMutation.isPending}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                Yes, this is {item.ai_guess_person_name}
              </button>
            </div>
          )}

          {/* Identify panel */}
          <div className="rounded-xl border border-surface-border bg-surface-card p-4 space-y-3">
            <p className="text-sm font-semibold text-white">
              {hasAiGuess ? "Or assign a different person" : "Identify this person"}
            </p>

            {/* Default: two buttons */}
            {panel === null && (
              <div className="space-y-2">
                <button
                  onClick={() => setPanel("search")}
                  className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg border border-surface-border text-gray-300 hover:text-white hover:border-brand-gold/40 text-sm transition-colors"
                >
                  <Search className="w-4 h-4" />
                  Search existing person
                </button>
                <button
                  onClick={openCreate}
                  className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg border border-surface-border text-gray-300 hover:text-white hover:border-brand-gold/40 text-sm transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  Add as new person
                </button>
              </div>
            )}

            {/* Search existing */}
            {panel === "search" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search by name…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded bg-brand-navy border border-surface-border text-white text-xs placeholder-gray-600 focus:outline-none focus:border-brand-gold/50"
                  />
                  <button
                    onClick={() => { setPanel(null); setSearchQuery(""); }}
                    className="text-gray-500 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {searchQuery.trim().length > 1 && (
                  <div className="rounded-lg border border-surface-border overflow-hidden">
                    {searchFetching ? (
                      <div className="flex items-center gap-2 px-3 py-2">
                        <div className="w-3 h-3 rounded-full border-2 border-brand-gold/40 border-t-brand-gold animate-spin shrink-0" />
                        <span className="text-xs text-gray-500">Searching…</span>
                      </div>
                    ) : searchResults?.items.length ? (
                      searchResults.items.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          disabled={linking}
                          onClick={() => handleLinkExisting(p.id, p.full_name)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-gray-200 hover:bg-surface hover:text-white transition-colors border-b border-surface-border last:border-0 disabled:opacity-50"
                        >
                          <div className="w-5 h-5 rounded-full bg-brand-gold/20 flex items-center justify-center shrink-0">
                            <User className="w-2.5 h-2.5 text-brand-gold" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{p.full_name}</p>
                            {(p.designation || p.organization) && (
                              <p className="text-gray-500 truncate">
                                {[p.designation, p.organization].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </div>
                          {linking && <span className="ml-auto text-gray-500 text-xs">saving…</span>}
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-2 text-xs text-gray-500">No results</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Create new person */}
            {panel === "create" && (
              <form onSubmit={handleCreateNew} className="space-y-2">
                <div className="flex items-start justify-between mb-1">
                  <p className="text-xs text-gray-400">
                    The face crop above will be used as their reference photo.
                  </p>
                  <button type="button" onClick={() => setPanel(null)}
                    className="text-gray-500 hover:text-white transition-colors ml-2 shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-0.5">Name *</label>
                  <input
                    autoFocus type="text" value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    placeholder="Full name"
                    className="w-full px-2 py-1.5 rounded bg-brand-navy border border-surface-border text-white text-xs placeholder-gray-600 focus:outline-none focus:border-brand-gold/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-0.5">Designation</label>
                  <input type="text" value={form.designation}
                    onChange={(e) => setForm({ ...form, designation: e.target.value })}
                    placeholder="e.g. Finance Minister"
                    className="w-full px-2 py-1.5 rounded bg-brand-navy border border-surface-border text-white text-xs placeholder-gray-600 focus:outline-none focus:border-brand-gold/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-0.5">Organisation</label>
                  <OrgPicker
                    value={form.organization}
                    orgs={orgs}
                    onChange={(v) => setForm({ ...form, organization: v })}
                    onCreated={(o) => setOrgs((prev) => [...prev, o])}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-400 mb-0.5">Source</label>
                    <select value={form.source}
                      onChange={(e) => setForm({ ...form, source: e.target.value })}
                      className="w-full px-2 py-1.5 rounded bg-brand-navy border border-surface-border text-white text-xs focus:outline-none focus:border-brand-gold/50">
                      <option value="">—</option>
                      {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-0.5">Type</label>
                    <select value={form.person_type}
                      onChange={(e) => setForm({ ...form, person_type: e.target.value })}
                      className="w-full px-2 py-1.5 rounded bg-brand-navy border border-surface-border text-white text-xs focus:outline-none focus:border-brand-gold/50">
                      <option value="">—</option>
                      {PERSON_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={creating}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-brand-gold text-brand-navy text-xs font-semibold disabled:opacity-50 hover:bg-brand-gold-light transition-colors">
                    <Check className="w-3 h-3" />
                    {creating ? "Creating…" : "Create & resolve"}
                  </button>
                  <button type="button" onClick={() => setPanel(null)}
                    className="px-3 py-1.5 rounded border border-surface-border text-xs text-gray-400 hover:text-white transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Reject */}
          <button
            onClick={() => resolveMutation.mutate({ action: "reject" })}
            disabled={resolveMutation.isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-surface-border text-gray-400 hover:text-red-400 hover:border-red-500/40 text-sm transition-colors disabled:opacity-50"
          >
            <XCircle className="w-4 h-4" />
            Not a person / Reject detection
          </button>
        </div>
      </div>
    </div>
  );
}
