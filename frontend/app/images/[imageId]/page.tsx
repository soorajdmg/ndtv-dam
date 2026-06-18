"use client";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, User, Wand2, Pencil, X, Check, Building2, Plus, UserPlus, Radio, Tag } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  getImageVariants,
  getVariantDownloadUrl,
  generateImageVariants,
  getImageMetadata,
  getImageDetail,
  updateImageMetadata,
  createPerson,
  uploadReferencePhoto,
  listOrganizations,
  createOrganization,
  listPersons,
  linkPersonToImage,
} from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { VARIANT_LABELS, SOURCE_OPTIONS, PERSON_TYPE_OPTIONS } from "@/lib/utils";
import type { ImagePersonSummary, Organization } from "@/lib/types";

// ─── Shimmer skeleton ─────────────────────────────────────────────────────────

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={`rounded bg-surface-border animate-pulse ${className ?? ""}`}
    />
  );
}

function VariantsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-lg border border-surface-border bg-surface-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <Shimmer className="h-3 w-24" />
            <Shimmer className="h-4 w-14 rounded-full" />
          </div>
          <Shimmer className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

function PeopleSkeleton() {
  return (
    <div className="space-y-1">
      {[0, 1].map((i) => (
        <div key={i} className="flex items-start gap-2 p-2">
          <Shimmer className="w-7 h-7 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5 pt-0.5">
            <Shimmer className="h-3 w-28" />
            <Shimmer className="h-2.5 w-20" />
            <Shimmer className="h-2.5 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Org picker ───────────────────────────────────────────────────────────────

interface OrgPickerProps {
  value: string;
  orgs: Organization[];
  onChange: (name: string) => void;
  onCreated: (org: Organization) => void;
}

function OrgPicker({ value, orgs, onChange, onCreated }: OrgPickerProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = orgs.filter((o) =>
    o.name.toLowerCase().includes(query.toLowerCase())
  );
  const exactMatch = orgs.some(
    (o) => o.name.toLowerCase() === query.toLowerCase()
  );

  function select(name: string) {
    onChange(name);
    setQuery(name);
    setOpen(false);
    setCreating(false);
  }

  function clear() {
    onChange("");
    setQuery("");
  }

  async function handleCreate() {
    const name = newOrgName.trim() || query.trim();
    if (!name) return;
    setSaving(true);
    try {
      const created = await createOrganization({ name });
      onCreated(created);
      select(created.name);
      setCreating(false);
      setNewOrgName("");
      toast.success(`Organisation "${created.name}" created`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create organisation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        {saving ? (
          <div className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-brand-gold/40 border-t-brand-gold animate-spin pointer-events-none" />
        ) : (
          <Building2 className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
        )}
        <input
          type="text"
          value={query}
          placeholder="Search or select…"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setCreating(false); }}
          onFocus={() => setOpen(true)}
          className="w-full pl-6 pr-6 py-1 rounded bg-brand-navy border border-surface-border text-white text-xs placeholder-gray-600 focus:outline-none focus:border-brand-gold/50"
        />
        {query && (
          <button type="button" onClick={clear}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-surface-border bg-brand-navy shadow-xl overflow-hidden">
          <div className="max-h-40 overflow-y-auto">
            {filtered.length > 0 ? (
              filtered.map((o) => (
                <button key={o.id} type="button" onClick={() => select(o.name)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-200 hover:bg-surface hover:text-white transition-colors">
                  <Building2 className="w-3 h-3 text-brand-gold shrink-0" />
                  <span className="truncate">{o.name}</span>
                  {o.entity_type && <span className="ml-auto text-gray-500 shrink-0">{o.entity_type}</span>}
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-xs text-gray-500">No organisations match</p>
            )}
          </div>

          {!exactMatch && (
            <div className="border-t border-surface-border">
              {!creating ? (
                <button type="button"
                  onClick={() => { setCreating(true); setNewOrgName(query); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-brand-gold hover:bg-surface transition-colors">
                  <Plus className="w-3 h-3" />
                  {query.trim() ? `Create "${query.trim()}"` : "Create new organisation"}
                </button>
              ) : (
                <div className="p-2 space-y-1.5">
                  <p className="text-xs text-gray-400">New organisation name</p>
                  <input autoFocus type="text" value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    className="w-full px-2 py-1 rounded bg-surface border border-surface-border text-white text-xs focus:outline-none focus:border-brand-gold/50" />
                  <div className="flex gap-1.5">
                    <button type="button" onClick={handleCreate}
                      disabled={saving || !newOrgName.trim()}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-brand-gold text-brand-navy text-xs font-semibold disabled:opacity-50 transition-colors">
                      <Check className="w-3 h-3" />
                      {saving ? "Creating…" : "Create & select"}
                    </button>
                    <button type="button" onClick={() => setCreating(false)}
                      className="px-2.5 py-1 rounded border border-surface-border text-xs text-gray-400 hover:text-white transition-colors">
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

// ─── Add person form ──────────────────────────────────────────────────────────
// Lets users search existing persons and link them, OR create a brand-new one.

interface AddPersonFormProps {
  imageId: string;
  orgs: Organization[];
  onOrgCreated: (org: Organization) => void;
  onDone: () => void;
}

function AddPersonForm({ imageId, orgs, onOrgCreated, onDone }: AddPersonFormProps) {
  // Two modes: "search" (link existing) or "create" (new person)
  const [mode, setMode] = useState<"search" | "create">("search");

  // Search mode
  const [searchQuery, setSearchQuery] = useState("");
  const [linking, setLinking] = useState(false);

  const { data: searchResults, isFetching: searchFetching } = useQuery({
    queryKey: ["persons-search", searchQuery],
    queryFn: () => listPersons({ search: searchQuery, page_size: 8 }),
    enabled: searchQuery.trim().length > 0,
  });

  // Create mode
  const [form, setForm] = useState({
    full_name: "",
    designation: "",
    organization: "",
    source: "",
    person_type: "",
  });
  const [saving, setSaving] = useState(false);

  async function handleLink(personId: string, personName: string) {
    setLinking(true);
    try {
      await linkPersonToImage(imageId, personId);
      toast.success(`${personName} linked to this image`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to link person");
    } finally {
      setLinking(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const person = await createPerson({
        full_name: form.full_name.trim(),
        designation: form.designation.trim() || undefined,
        organization: form.organization.trim() || undefined,
        source: form.source || undefined,
        person_type: form.person_type || undefined,
      });
      await linkPersonToImage(imageId, person.id);
      toast.success(`${person.full_name} linked to this image`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save person");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-brand-gold/30 bg-surface p-3 space-y-3">
      {/* Mode tabs */}
      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-brand-navy border border-surface-border w-fit">
        <button
          type="button"
          onClick={() => setMode("search")}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            mode === "search"
              ? "bg-surface-card text-white"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          Link existing
        </button>
        <button
          type="button"
          onClick={() => setMode("create")}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            mode === "create"
              ? "bg-surface-card text-white"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          Add new
        </button>
      </div>

      {mode === "search" ? (
        <div className="space-y-2">
          <input
            autoFocus
            type="text"
            placeholder="Search by name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-2 py-1.5 rounded bg-brand-navy border border-surface-border text-white text-xs placeholder-gray-600 focus:outline-none focus:border-brand-gold/50"
          />
          {searchQuery.trim() && (
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
                    onClick={() => handleLink(p.id, p.full_name)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-gray-200 hover:bg-surface hover:text-white transition-colors border-b border-surface-border last:border-0"
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
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-xs text-gray-500">No results</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleCreate} className="space-y-2">
          <div>
            <label className="block text-xs text-gray-400 mb-0.5">Name *</label>
            <input
              autoFocus
              type="text"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="Full name"
              className="w-full px-2 py-1 rounded bg-brand-navy border border-surface-border text-white text-xs placeholder-gray-600 focus:outline-none focus:border-brand-gold/50"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-0.5">Designation</label>
            <input
              type="text"
              value={form.designation}
              onChange={(e) => setForm({ ...form, designation: e.target.value })}
              placeholder="e.g. Finance Minister"
              className="w-full px-2 py-1 rounded bg-brand-navy border border-surface-border text-white text-xs placeholder-gray-600 focus:outline-none focus:border-brand-gold/50"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-0.5">Organisation</label>
            <OrgPicker
              value={form.organization}
              orgs={orgs}
              onChange={(name) => setForm({ ...form, organization: name })}
              onCreated={onOrgCreated}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-400 mb-0.5">Source</label>
              <select
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                className="w-full px-2 py-1 rounded bg-brand-navy border border-surface-border text-white text-xs focus:outline-none focus:border-brand-gold/50"
              >
                <option value="">—</option>
                {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-0.5">Type</label>
              <select
                value={form.person_type}
                onChange={(e) => setForm({ ...form, person_type: e.target.value })}
                className="w-full px-2 py-1 rounded bg-brand-navy border border-surface-border text-white text-xs focus:outline-none focus:border-brand-gold/50"
              >
                <option value="">—</option>
                {PERSON_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-0.5">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-brand-gold text-brand-navy text-xs font-semibold disabled:opacity-50 hover:bg-brand-gold-light transition-colors"
            >
              <Check className="w-3 h-3" />
              {saving ? "Saving…" : "Add person"}
            </button>
            <button
              type="button"
              onClick={onDone}
              className="px-2.5 py-1 rounded border border-surface-border text-xs text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Cancel for search mode */}
      {mode === "search" && (
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Cancel
        </button>
      )}
    </div>
  );
}

// ─── Person picker (for edit/reassign) ───────────────────────────────────────
// Like OrgPicker but for persons. Searching picks an existing record to
// reassign to; "Create new" creates a fresh person with this image as reference.

interface PersonPickerProps {
  imageId: string;
  currentPersonId: string;
  orgs: Organization[];
  onOrgCreated: (org: Organization) => void;
  onDone: () => void;
}

function PersonReassignForm({ imageId, currentPersonId, orgs, onOrgCreated, onDone }: PersonPickerProps) {
  const [mode, setMode] = useState<"search" | "create">("search");

  // search mode
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const { data: searchResults, isFetching: searchFetching } = useQuery({
    queryKey: ["persons-search", query],
    queryFn: () => listPersons({ search: query, page_size: 8 }),
    enabled: query.trim().length > 1,
  });

  // create mode
  const [newForm, setNewForm] = useState({
    full_name: "",
    designation: "",
    organization: "",
    source: "",
    person_type: "",
  });

  async function handleSelectExisting(targetId: string, targetName: string) {
    // Nothing to do if same person
    if (targetId === currentPersonId) { onDone(); return; }
    setSaving(true);
    try {
      const { reassignPersonInImage } = await import("@/lib/api");
      await reassignPersonInImage(imageId, currentPersonId, targetId);
      toast.success(`Reassigned to ${targetName}`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reassign failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateNew(e: React.FormEvent) {
    e.preventDefault();
    if (!newForm.full_name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      // 1. Create the person record
      const created = await createPerson({
        full_name: newForm.full_name.trim(),
        designation: newForm.designation.trim() || undefined,
        organization: newForm.organization.trim() || undefined,
        source: newForm.source || undefined,
        person_type: newForm.person_type || undefined,
      });
      // 2. Use current image as their reference photo (best-effort)
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const thumbRes = await fetch(`${apiBase}/api/images/${imageId}/thumbnail`);
      if (thumbRes.ok) {
        const blob = await thumbRes.blob();
        const file = new File([blob], "reference.jpg", { type: blob.type });
        try { await uploadReferencePhoto(created.id, file); } catch { /* non-fatal */ }
      }
      // 3. Reassign only this image to the new person
      const { reassignPersonInImage } = await import("@/lib/api");
      await reassignPersonInImage(imageId, currentPersonId, created.id);
      toast.success(`Created ${created.full_name} and reassigned`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create person");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-3 rounded-lg border border-brand-gold/30 bg-surface space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">Who is this person?</p>
        <button onClick={onDone} className="text-gray-500 hover:text-white transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Mode tabs */}
      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-brand-navy border border-surface-border w-fit">
        <button type="button" onClick={() => setMode("search")}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${mode === "search" ? "bg-surface-card text-white" : "text-gray-500 hover:text-gray-300"}`}>
          Select existing
        </button>
        <button type="button" onClick={() => setMode("create")}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${mode === "create" ? "bg-surface-card text-white" : "text-gray-500 hover:text-gray-300"}`}>
          Create new
        </button>
      </div>

      {mode === "search" ? (
        <div className="space-y-2">
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name…"
            className="w-full px-2 py-1.5 rounded bg-brand-navy border border-surface-border text-white text-xs placeholder-gray-600 focus:outline-none focus:border-brand-gold/50"
          />
          {query.trim().length > 1 && (
            <div className="rounded-lg border border-surface-border overflow-hidden">
              {searchFetching ? (
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className="w-3 h-3 rounded-full border-2 border-brand-gold/40 border-t-brand-gold animate-spin shrink-0" />
                  <span className="text-xs text-gray-500">Searching…</span>
                </div>
              ) : searchResults?.items.length ? (
                searchResults.items
                  .filter((p) => p.id !== currentPersonId)
                  .map((p) => (
                    <button key={p.id} type="button" disabled={saving}
                      onClick={() => handleSelectExisting(p.id, p.full_name)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-gray-200 hover:bg-surface hover:text-white transition-colors border-b border-surface-border last:border-0 disabled:opacity-50">
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
                      {saving && <span className="ml-auto text-gray-500 text-xs">saving…</span>}
                    </button>
                  ))
              ) : (
                <p className="px-3 py-2 text-xs text-gray-500">No results</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleCreateNew} className="space-y-2">
          <div>
            <label className="block text-xs text-gray-400 mb-0.5">Name *</label>
            <input autoFocus type="text" value={newForm.full_name} placeholder="Full name"
              onChange={(e) => setNewForm({ ...newForm, full_name: e.target.value })}
              className="w-full px-2 py-1 rounded bg-brand-navy border border-surface-border text-white text-xs placeholder-gray-600 focus:outline-none focus:border-brand-gold/50" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-0.5">Designation</label>
            <input type="text" value={newForm.designation} placeholder="e.g. Finance Minister"
              onChange={(e) => setNewForm({ ...newForm, designation: e.target.value })}
              className="w-full px-2 py-1 rounded bg-brand-navy border border-surface-border text-white text-xs placeholder-gray-600 focus:outline-none focus:border-brand-gold/50" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-0.5">Organisation</label>
            <OrgPicker value={newForm.organization} orgs={orgs}
              onChange={(name) => setNewForm({ ...newForm, organization: name })}
              onCreated={onOrgCreated} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-400 mb-0.5">Source</label>
              <select value={newForm.source} onChange={(e) => setNewForm({ ...newForm, source: e.target.value })}
                className="w-full px-2 py-1 rounded bg-brand-navy border border-surface-border text-white text-xs focus:outline-none focus:border-brand-gold/50">
                <option value="">—</option>
                {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-0.5">Type</label>
              <select value={newForm.person_type} onChange={(e) => setNewForm({ ...newForm, person_type: e.target.value })}
                className="w-full px-2 py-1 rounded bg-brand-navy border border-surface-border text-white text-xs focus:outline-none focus:border-brand-gold/50">
                <option value="">—</option>
                {PERSON_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500">This image will be used as their reference photo.</p>
          <div className="flex gap-2 pt-0.5">
            <button type="submit" disabled={saving}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-brand-gold text-brand-navy text-xs font-semibold disabled:opacity-50 hover:bg-brand-gold-light transition-colors">
              <Check className="w-3 h-3" />
              {saving ? "Creating…" : "Create & reassign"}
            </button>
            <button type="button" onClick={onDone}
              className="px-2.5 py-1 rounded border border-surface-border text-xs text-gray-400 hover:text-white transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Inline-editable person row ──────────────────────────────────────────────

const PERSON_TYPE_STYLES: Record<string, string> = {
  Govt:     "bg-blue-500/15 text-blue-300 border-blue-500/25",
  Business: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  Market:   "bg-purple-500/15 text-purple-300 border-purple-500/25",
  NDTV:     "bg-brand-gold/15 text-brand-gold border-brand-gold/25",
  Others:   "bg-gray-500/15 text-gray-400 border-gray-500/25",
};

const SOURCE_STYLES: Record<string, string> = {
  NDTV:         "bg-red-500/10 text-red-400 border-red-500/20",
  "NDTV Profit":"bg-orange-500/10 text-orange-400 border-orange-500/20",
  ANI:          "bg-sky-500/10 text-sky-400 border-sky-500/20",
  Reuters:      "bg-teal-500/10 text-teal-400 border-teal-500/20",
  PTI:          "bg-violet-500/10 text-violet-400 border-violet-500/20",
};

interface PersonRowProps {
  person: ImagePersonSummary;
  imageId: string;
  orgs: Organization[];
  onSaved: () => void;
  onOrgCreated: (org: Organization) => void;
}

function PersonRow({ person, imageId, orgs, onSaved, onOrgCreated }: PersonRowProps) {
  const [editing, setEditing] = useState(false);
  const orgObj = orgs.find((o) => o.name === person.organization);

  if (editing) {
    return (
      <PersonReassignForm
        imageId={imageId}
        currentPersonId={person.id}
        orgs={orgs}
        onOrgCreated={onOrgCreated}
        onDone={() => { setEditing(false); onSaved(); }}
      />
    );
  }

  const typeStyle = person.person_type
    ? (PERSON_TYPE_STYLES[person.person_type] ?? "bg-gray-500/15 text-gray-400 border-gray-500/25")
    : null;
  const sourceStyle = person.source
    ? (SOURCE_STYLES[person.source] ?? "bg-gray-500/10 text-gray-400 border-gray-500/20")
    : null;

  return (
    <div className="group relative flex gap-3 p-3 rounded-xl border border-transparent hover:border-surface-border hover:bg-surface transition-all">
      {/* Avatar */}
      <Link href={`/persons/${person.id}`} className="shrink-0">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-gold/30 to-brand-gold/10 border border-brand-gold/20 flex items-center justify-center">
          <User className="w-4 h-4 text-brand-gold" />
        </div>
      </Link>

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-1">
        {/* Name */}
        <Link
          href={`/persons/${person.id}`}
          className="block text-sm font-semibold text-white hover:text-brand-gold transition-colors leading-tight truncate"
        >
          {person.full_name}
        </Link>

        {/* Designation */}
        {person.designation && (
          <p className="text-xs text-gray-400 leading-tight truncate">{person.designation}</p>
        )}

        {/* Organisation */}
        {person.organization && (
          orgObj ? (
            <Link
              href="/organizations"
              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors truncate"
            >
              <Building2 className="w-3 h-3 shrink-0" />
              <span className="truncate">{person.organization}</span>
            </Link>
          ) : (
            <p className="inline-flex items-center gap-1 text-xs text-gray-500 truncate">
              <Building2 className="w-3 h-3 shrink-0" />
              <span className="truncate">{person.organization}</span>
            </p>
          )
        )}

        {/* Source + Type pills */}
        {(person.source || person.person_type) && (
          <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
            {person.source && sourceStyle && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${sourceStyle}`}>
                <Radio className="w-2.5 h-2.5" />
                {person.source}
              </span>
            )}
            {person.person_type && typeStyle && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${typeStyle}`}>
                <Tag className="w-2.5 h-2.5" />
                {person.person_type}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Reassign button */}
      <button
        onClick={() => setEditing(true)}
        title="Wrong person? Reassign"
        className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-surface-border/50 text-gray-500 hover:text-white hover:bg-surface-border transition-all"
      >
        <Pencil className="w-3 h-3" />
      </button>
    </div>
  );
}

// ─── Tag input ────────────────────────────────────────────────────────────────

interface TagInputProps {
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
}

function TagInput({ tags, suggestions, onChange }: TagInputProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag]);
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  const availableSuggestions = suggestions.filter(
    (s) => !tags.includes(s.toLowerCase()) && s.toLowerCase().includes(input.toLowerCase())
  );

  return (
    <div className="space-y-2">
      {/* Existing tags */}
      <div
        className="flex flex-wrap gap-1.5 min-h-[28px] p-1.5 rounded bg-brand-navy border border-surface-border cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-gold/15 text-brand-gold border border-brand-gold/25 text-xs font-medium"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
              className="text-brand-gold/60 hover:text-brand-gold transition-colors"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? "Type a tag, press Enter…" : ""}
          className="flex-1 min-w-[100px] bg-transparent text-xs text-white placeholder-gray-600 focus:outline-none"
        />
      </div>

      {/* Suggestions */}
      {availableSuggestions.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Suggestions</p>
          <div className="flex flex-wrap gap-1">
            {availableSuggestions.slice(0, 8).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addTag(s)}
                className="px-2 py-0.5 rounded-full border border-surface-border text-xs text-gray-400 hover:border-brand-gold/40 hover:text-brand-gold transition-colors"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ImageDetailPage() {
  const { imageId } = useParams<{ imageId: string }>();
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [addingPerson, setAddingPerson] = useState(false);

  // ── Editorial metadata edit state ───────────────────────────────────────────
  const [editingInfo, setEditingInfo] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftCaption, setDraftCaption] = useState("");
  const [draftTags, setDraftTags] = useState<string[]>([]);

  const { data: variants, isLoading: variantsLoading } = useQuery({
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

  const { data: metadata, isLoading: metadataLoading } = useQuery({
    queryKey: ["image-metadata", imageId],
    queryFn: () => getImageMetadata(imageId),
  });

  const { data: imageDetail } = useQuery({
    queryKey: ["image-detail", imageId],
    queryFn: () => getImageDetail(imageId),
  });

  const { data: orgs = [] } = useQuery({
    queryKey: ["organizations"],
    queryFn: listOrganizations,
  });

  function handleOrgCreated(org: Organization) {
    queryClient.setQueryData<Organization[]>(["organizations"], (prev = []) => [...prev, org]);
  }

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

  const variantList = variants ?? [];
  const hasVariants = variantList.length > 0;
  const allFailed = hasVariants && variantList.every((v) => v.generation_status === "failed");
  const anyPending = variantList.some(
    (v) => v.generation_status === "pending" || v.generation_status === "processing"
  );

  function invalidatePeople() {
    queryClient.invalidateQueries({ queryKey: ["image-metadata", imageId] });
    queryClient.invalidateQueries({ queryKey: ["persons"] });
  }

  function enterEditMode() {
    setDraftTitle(imageDetail?.title ?? "");
    setDraftCaption(imageDetail?.caption ?? "");
    setDraftTags(imageDetail?.manual_tags ?? []);
    setEditingInfo(true);
  }

  async function saveInfo() {
    setSavingInfo(true);
    try {
      await updateImageMetadata(imageId, {
        title: draftTitle,
        caption: draftCaption,
        manual_tags: draftTags,
      });
      await queryClient.invalidateQueries({ queryKey: ["image-detail", imageId] });
      setEditingInfo(false);
      toast.success("Image info saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingInfo(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <button onClick={() => history.back()} className="text-gray-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-white">Image Detail</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: image + variants */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-surface-border bg-surface overflow-hidden">
            <img
              src={`${apiBase}/api/images/${imageId}/thumbnail`}
              alt="Image"
              className="w-full object-contain max-h-96"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>

          {/* Variants */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Asset Variants</h2>
              <button
                onClick={handleGenerateVariants}
                disabled={generating || anyPending || variantsLoading}
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

            {variantsLoading ? (
              <VariantsSkeleton />
            ) : hasVariants ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {variantList.map((variant) => (
                  <div key={variant.id}
                    className="rounded-lg border border-surface-border bg-surface-card p-3 space-y-2">
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
                      <a href={getVariantDownloadUrl(variant.id)} download
                        className="flex items-center gap-1 text-xs text-brand-gold hover:underline">
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
                  No variants generated yet. Click &quot;Generate Variants&quot; to create a transparent cutout, square gray background, and branded 16:9 version.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right: image info + people */}
        <div className="space-y-4">

          {/* ── Image Info card ──────────────────────────────────────── */}
          <div className="rounded-xl border border-surface-border bg-surface-card p-4 space-y-3">
            {/* Card header */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Image Info</h2>
              {!editingInfo ? (
                <button
                  onClick={enterEditMode}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md border border-surface-border text-xs text-gray-400 hover:text-white hover:border-brand-gold/40 transition-colors"
                  title="Edit title, caption and tags"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={saveInfo}
                    disabled={savingInfo}
                    className="flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-brand-gold text-brand-navy text-xs font-semibold disabled:opacity-50 transition-colors"
                  >
                    <Check className="w-3 h-3" />
                    {savingInfo ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => setEditingInfo(false)}
                    disabled={savingInfo}
                    className="p-1 rounded-md border border-surface-border text-gray-400 hover:text-white transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {metadataLoading ? (
              <div className="space-y-2">
                <Shimmer className="h-3 w-32" />
                <Shimmer className="h-3 w-24" />
              </div>
            ) : (
              <div className="space-y-3">
                {/* ── Title ── */}
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Title</p>
                  {editingInfo ? (
                    <input
                      autoFocus
                      type="text"
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      placeholder="Add a display title…"
                      className="w-full px-2 py-1 rounded bg-brand-navy border border-surface-border text-white text-xs placeholder-gray-600 focus:outline-none focus:border-brand-gold/50"
                    />
                  ) : (
                    <p className="text-xs text-white">
                      {imageDetail?.title || (
                        <span className="text-gray-600 italic">No title — click Edit to add one</span>
                      )}
                    </p>
                  )}
                </div>

                {/* ── Caption ── */}
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Caption</p>
                  {editingInfo ? (
                    <textarea
                      value={draftCaption}
                      onChange={(e) => setDraftCaption(e.target.value)}
                      placeholder="Add an editorial caption or description…"
                      rows={3}
                      className="w-full px-2 py-1 rounded bg-brand-navy border border-surface-border text-white text-xs placeholder-gray-600 focus:outline-none focus:border-brand-gold/50 resize-none"
                    />
                  ) : (
                    <p className="text-xs text-white whitespace-pre-wrap">
                      {imageDetail?.caption || (
                        <span className="text-gray-600 italic">No caption</span>
                      )}
                    </p>
                  )}
                </div>

                {/* ── Manual tags ── */}
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Tags</p>
                  {editingInfo ? (
                    <TagInput
                      tags={draftTags}
                      suggestions={metadata?.semantic_tags ?? []}
                      onChange={setDraftTags}
                    />
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {(imageDetail?.manual_tags ?? []).length > 0 ? (
                        (imageDetail?.manual_tags ?? []).map((tag) => (
                          <span
                            key={tag}
                            className="px-2.5 py-0.5 rounded-full bg-brand-gold/10 text-brand-gold border border-brand-gold/20 text-xs font-medium"
                          >
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-600 italic">No tags</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t border-surface-border pt-2 space-y-2.5">
                  {/* Source row */}
                  {(() => {
                    const persons = metadata?.persons ?? [];
                    const sources = Array.from(new Set(persons.map((p) => p.source).filter(Boolean))) as string[];
                    const types   = Array.from(new Set(persons.map((p) => p.person_type).filter(Boolean))) as string[];
                    return (
                      <>
                        <div className="flex items-start gap-2">
                          <Radio className="w-3.5 h-3.5 text-gray-500 mt-0.5 shrink-0" />
                          <div className="flex-1">
                            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Source</p>
                            {sources.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {sources.map((src) => {
                                  const style = SOURCE_STYLES[src] ?? "bg-gray-500/10 text-gray-400 border-gray-500/20";
                                  return (
                                    <span key={src} className={`px-2.5 py-1 rounded-full text-xs font-medium border ${style}`}>
                                      {src}
                                    </span>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-600">—</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <Tag className="w-3.5 h-3.5 text-gray-500 mt-0.5 shrink-0" />
                          <div className="flex-1">
                            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Type</p>
                            {types.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {types.map((t) => {
                                  const style = PERSON_TYPE_STYLES[t] ?? "bg-gray-500/15 text-gray-400 border-gray-500/25";
                                  return (
                                    <span key={t} className={`px-2.5 py-1 rounded-full text-xs font-medium border ${style}`}>
                                      {t}
                                    </span>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-600">—</span>
                            )}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* ── People card ──────────────────────────────────────────── */}
          <div className="rounded-xl border border-surface-border bg-surface-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-4 h-4 text-brand-gold" />
              <h2 className="text-sm font-semibold text-white">People</h2>
              {!metadataLoading && !addingPerson && metadata && metadata.persons.length > 0 && (
                <button
                  onClick={() => setAddingPerson(true)}
                  className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-md border border-surface-border text-xs text-gray-400 hover:text-white hover:border-brand-gold/40 transition-colors"
                  title="Add person"
                >
                  <UserPlus className="w-3 h-3" />
                  Add
                </button>
              )}
            </div>

            {metadataLoading ? (
              <PeopleSkeleton />
            ) : (
              <div className="space-y-1">
                {metadata && metadata.persons.length > 0 ? (
                  <>
                    {metadata.persons.map((person) => (
                      <PersonRow
                        key={person.id}
                        person={person}
                        imageId={imageId}
                        orgs={orgs}
                        onSaved={invalidatePeople}
                        onOrgCreated={handleOrgCreated}
                      />
                    ))}
                    {addingPerson && (
                      <div className="pt-1">
                        <AddPersonForm
                          imageId={imageId}
                          orgs={orgs}
                          onOrgCreated={handleOrgCreated}
                          onDone={() => {
                            setAddingPerson(false);
                            invalidatePeople();
                          }}
                        />
                      </div>
                    )}
                  </>
                ) : !addingPerson ? (
                  <div className="text-center py-6 space-y-3">
                    <div className="w-10 h-10 rounded-full bg-surface border border-surface-border flex items-center justify-center mx-auto">
                      <User className="w-5 h-5 text-gray-600" />
                    </div>
                    <p className="text-xs text-gray-500">No people identified yet.</p>
                    <button
                      onClick={() => setAddingPerson(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-surface-border text-xs text-gray-500 hover:text-white hover:border-brand-gold/40 transition-colors"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Add person manually
                    </button>
                  </div>
                ) : (
                  <AddPersonForm
                    imageId={imageId}
                    orgs={orgs}
                    onOrgCreated={handleOrgCreated}
                    onDone={() => {
                      setAddingPerson(false);
                      invalidatePeople();
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
