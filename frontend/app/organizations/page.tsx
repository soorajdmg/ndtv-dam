"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, Plus, X } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import { listOrganizations, createOrganization } from "@/lib/api";
import type { Organization } from "@/lib/types";

function OrgNode({ org, allOrgs, depth = 0 }: { org: Organization; allOrgs: Organization[]; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const children = allOrgs.filter((o) => o.parent_organization_id === org.id);

  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded-lg ${depth === 0 ? "mt-1" : ""}`}
        style={{ paddingLeft: `${depth * 20}px` }}
      >
        <button
          onClick={() => children.length && setExpanded(!expanded)}
          className={`shrink-0 p-1.5 ${!children.length ? "invisible" : ""}`}
        >
          {expanded ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
        </button>
        <Link
          href={`/organizations/${org.id}`}
          className="flex flex-1 min-w-0 items-center gap-2.5 py-1.5 pr-3 rounded-lg hover:bg-surface-hover transition-colors group"
        >
          {org.logo_url ? (
            <img
              src={org.logo_url}
              alt={org.name}
              className="w-8 h-8 rounded object-contain shrink-0 bg-surface border border-surface-border p-0.5"
            />
          ) : (
            <span className="w-8 h-8 rounded shrink-0 bg-surface border border-surface-border flex items-center justify-center text-xs font-bold text-brand-gold uppercase">
              {org.name.slice(0, 2)}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white group-hover:text-brand-gold transition-colors">{org.name}</p>
            {org.entity_type && <p className="text-xs text-gray-400">{org.entity_type}</p>}
          </div>
        </Link>
      </div>
      {expanded && children.map((child) => (
        <OrgNode key={child.id} org={child} allOrgs={allOrgs} depth={depth + 1} />
      ))}
    </div>
  );
}

function CreateOrgForm({ orgs, onClose }: { orgs: Organization[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", entity_type: "", parent_organization_id: "" });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      await createOrganization({
        name: form.name.trim(),
        entity_type: form.entity_type || undefined,
        parent_organization_id: form.parent_organization_id || undefined,
      });
      toast.success(`Organization "${form.name}" created`);
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create organization");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-brand-gold/30 bg-surface-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">New Organization</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Ministry of Finance"
            required
            className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-border text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand-gold/50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Entity Type</label>
          <input
            type="text"
            value={form.entity_type}
            onChange={(e) => setForm({ ...form, entity_type: e.target.value })}
            placeholder="e.g. Government Ministry, Political Party, Corporation"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-border text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand-gold/50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Parent Organization</label>
          <select
            value={form.parent_organization_id}
            onChange={(e) => setForm({ ...form, parent_organization_id: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-border text-white text-sm focus:outline-none focus:border-brand-gold/50"
          >
            <option value="">None (top-level)</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-brand-gold hover:bg-brand-gold-light text-brand-navy font-semibold text-sm disabled:opacity-50 transition-colors"
          >
            {saving ? "Creating..." : "Create"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-lg border border-surface-border text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default function OrganizationsPage() {
  const [showCreate, setShowCreate] = useState(false);

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ["organizations"],
    queryFn: listOrganizations,
  });

  const roots = orgs.filter((o) => !o.parent_organization_id);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Organizations</h1>
          <p className="text-gray-400 text-sm mt-1">{orgs.length} organizations</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-gold text-brand-navy font-semibold text-sm hover:bg-brand-gold-light transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Organization
        </button>
      </div>

      {showCreate && (
        <CreateOrgForm orgs={orgs} onClose={() => setShowCreate(false)} />
      )}

      {isLoading ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : orgs.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No organizations yet.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="text-brand-gold hover:underline mt-2 text-sm"
          >
            Create the first one
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-surface-border bg-surface-card p-4">
          {roots.map((root) => (
            <OrgNode key={root.id} org={root} allOrgs={orgs} />
          ))}
        </div>
      )}
    </div>
  );
}
