"use client";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  Building2,
  Users,
  Pencil,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Calendar,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  getOrganization,
  updateOrganization,
  deleteOrganization,
  listOrganizations,
  listPersonsByOrg,
} from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";

const PAGE_SIZE = 20;

export default function OrgDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", entity_type: "", parent_organization_id: "" });
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [page, setPage] = useState(1);

  const { data: org, isLoading, error } = useQuery({
    queryKey: ["organization", orgId],
    queryFn: () => getOrganization(orgId),
  });

  const { data: allOrgs = [] } = useQuery({
    queryKey: ["organizations"],
    queryFn: listOrganizations,
  });

  const { data: personsData } = useQuery({
    queryKey: ["org-persons", orgId, page],
    queryFn: () => listPersonsByOrg(orgId, page, PAGE_SIZE),
    enabled: !!org,
  });

  const parent = org?.parent_organization_id
    ? allOrgs.find((o) => o.id === org.parent_organization_id)
    : null;

  const children = allOrgs.filter((o) => o.parent_organization_id === orgId);

  function openEdit() {
    if (!org) return;
    setEditForm({
      name: org.name,
      entity_type: org.entity_type ?? "",
      parent_organization_id: org.parent_organization_id ?? "",
    });
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm.name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      await updateOrganization(orgId, {
        name: editForm.name.trim(),
        entity_type: editForm.entity_type || undefined,
        parent_organization_id: editForm.parent_organization_id || null,
      });
      toast.success("Organization updated");
      queryClient.invalidateQueries({ queryKey: ["organization", orgId] });
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
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
      await deleteOrganization(orgId);
      toast.success("Organization deleted");
      // Remove from cache instead of invalidating to avoid a 404 refetch before navigation
      queryClient.removeQueries({ queryKey: ["organization", orgId] });
      queryClient.removeQueries({ queryKey: ["org-persons", orgId] });
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      router.push("/organizations");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (isLoading) return <div className="p-6 text-gray-400">Loading...</div>;
  if (error) return <div className="p-6 text-red-400">Failed to load organization: {error instanceof Error ? error.message : "Unknown error"}</div>;
  if (!org) return <div className="p-6 text-gray-400">Organization not found.</div>;

  const totalPages = Math.max(1, Math.ceil((personsData?.total ?? 0) / PAGE_SIZE));

  // Orgs available as parent options (exclude self and current children to avoid cycles)
  const parentOptions = allOrgs.filter((o) => o.id !== orgId && o.parent_organization_id !== orgId);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/organizations" className="text-gray-400 hover:text-white transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <Building2 className="w-5 h-5 text-brand-gold shrink-0" />
          <h1 className="text-2xl font-bold text-white truncate">{org.name}</h1>
          {org.entity_type && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-brand-navy border border-surface-border text-gray-300 shrink-0">
              {org.entity_type}
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
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Edit Organization</h2>
            <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Name *</label>
                <input
                  type="text"
                  value={editForm.name}
                  required
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-border text-white text-sm focus:outline-none focus:border-brand-gold/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Entity Type</label>
                <input
                  type="text"
                  value={editForm.entity_type}
                  placeholder="e.g. Government Ministry, Political Party, Corporation"
                  onChange={(e) => setEditForm({ ...editForm, entity_type: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-border text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand-gold/50"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-400 mb-1">Parent Organization</label>
                <select
                  value={editForm.parent_organization_id}
                  onChange={(e) => setEditForm({ ...editForm, parent_organization_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-border text-white text-sm focus:outline-none focus:border-brand-gold/50"
                >
                  <option value="">None (top-level)</option>
                  {parentOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-lg bg-brand-gold hover:bg-brand-gold-light text-brand-navy font-semibold text-sm disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-5 py-2 rounded-lg border border-surface-border text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Details + Hierarchy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Details */}
        <div className="rounded-xl border border-surface-border bg-surface-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Details</h2>
          <div className="space-y-2.5 text-sm">
            {org.entity_type && (
              <div className="flex gap-2">
                <span className="text-gray-400 w-32 shrink-0">Entity Type</span>
                <span className="text-white">{org.entity_type}</span>
              </div>
            )}
            {parent && (
              <div className="flex gap-2">
                <span className="text-gray-400 w-32 shrink-0">Parent Org</span>
                <Link
                  href={`/organizations/${parent.id}`}
                  className="text-brand-gold hover:text-brand-gold-light hover:underline transition-colors"
                >
                  {parent.name}
                </Link>
              </div>
            )}
            <div className="flex gap-2">
              <span className="text-gray-400 w-32 shrink-0">Members</span>
              <span className="text-white">{personsData?.total ?? "—"}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-400 w-32 shrink-0">Sub-orgs</span>
              <span className="text-white">{children.length}</span>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-gray-400 w-32 shrink-0">Created</span>
              <span className="flex items-center gap-1 text-gray-300">
                <Calendar className="w-3.5 h-3.5 text-gray-500" />
                {formatDate(org.created_at)}
              </span>
            </div>
          </div>
        </div>

        {/* Child organizations */}
        {children.length > 0 && (
          <div className="rounded-xl border border-surface-border bg-surface-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-brand-gold" />
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                Sub-organizations ({children.length})
              </h2>
            </div>
            <div className="space-y-1">
              {children.map((child) => (
                <Link
                  key={child.id}
                  href={`/organizations/${child.id}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors group"
                >
                  <Building2 className="w-3.5 h-3.5 text-brand-gold shrink-0" />
                  <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{child.name}</span>
                  {child.entity_type && (
                    <span className="text-xs text-gray-500">{child.entity_type}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* People */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-brand-gold" />
          <h2 className="text-sm font-semibold text-white">
            People ({personsData?.total ?? 0})
          </h2>
        </div>

        {!personsData || personsData.items.length === 0 ? (
          <div className="rounded-xl border border-surface-border bg-surface-card p-8 flex flex-col items-center justify-center gap-2 text-center">
            <Users className="w-8 h-8 text-gray-600" />
            <p className="text-sm text-gray-400">No people linked to this organization.</p>
            <p className="text-xs text-gray-500">People will appear here once they are assigned to this organization.</p>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-surface-border bg-surface-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Designation</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Category</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Images</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {personsData.items.map((person) => (
                    <tr key={person.id} className="hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/persons/${person.id}`}
                          className="font-medium text-white hover:text-brand-gold transition-colors"
                        >
                          {person.full_name}
                        </Link>
                        {person.aliases.length > 0 && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            aka {person.aliases.slice(0, 2).join(", ")}
                            {person.aliases.length > 2 && ` +${person.aliases.length - 2}`}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400">{person.designation ?? "—"}</td>
                      <td className="px-4 py-3">
                        {person.category ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-brand-navy border border-surface-border text-gray-300">
                            {person.category}
                          </span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">{person.image_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <Pagination
                page={page}
                totalPages={totalPages}
                onChange={(p) => {
                  setPage(p);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Pagination ────────────────────────────────────────────────────────────────

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
          <span key={`e-${i}`} className="px-1 text-gray-500 text-sm">…</span>
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
