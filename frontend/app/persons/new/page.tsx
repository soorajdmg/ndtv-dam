"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ArrowLeft, Plus, X, Building2 } from "lucide-react";
import Link from "next/link";
import { createPerson, listOrganizations, createOrganization } from "@/lib/api";
import { CATEGORY_OPTIONS } from "@/lib/utils";

export default function NewPersonPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    designation: "",
    organization: "",
    category: "",
  });
  const [aliases, setAliases] = useState<string[]>([]);
  const [aliasInput, setAliasInput] = useState("");

  // "select" = picking from dropdown, "custom" = typing a new one
  const [orgMode, setOrgMode] = useState<"select" | "custom">("select");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgType, setNewOrgType] = useState("");

  const { data: orgs = [] } = useQuery({
    queryKey: ["organizations"],
    queryFn: listOrganizations,
  });

  const addAlias = () => {
    const trimmed = aliasInput.trim();
    if (trimmed && !aliases.includes(trimmed)) {
      setAliases([...aliases, trimmed]);
      setAliasInput("");
    }
  };

  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) return toast.error("Organization name is required");
    setCreatingOrg(true);
    try {
      const org = await createOrganization({
        name: newOrgName.trim(),
        entity_type: newOrgType.trim() || undefined,
      });
      toast.success(`Organization "${org.name}" created`);
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      setForm({ ...form, organization: org.name });
      setOrgMode("select");
      setNewOrgName("");
      setNewOrgType("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create organization");
    } finally {
      setCreatingOrg(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) return toast.error("Full name is required");

    setLoading(true);
    try {
      const person = await createPerson({ ...form, aliases });
      toast.success(`Person "${person.full_name}" created!`);
      router.push(`/persons/${person.id}`);
    } catch (err: any) {
      const msg = err.message ?? "Failed to create person";
      if (msg.includes("409")) {
        toast.error("A person with this name already exists");
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/persons" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-white">Add New Person</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Full Name */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Full Name *</label>
          <input
            type="text"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="e.g. Nirmala Sitharaman"
            className="w-full px-4 py-3 rounded-lg bg-surface-card border border-surface-border text-white placeholder-gray-500 focus:outline-none focus:border-brand-gold/50"
            required
          />
        </div>

        {/* Aliases */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Aliases</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAlias())}
              placeholder="Add alias and press Enter"
              className="flex-1 px-4 py-2.5 rounded-lg bg-surface-card border border-surface-border text-white placeholder-gray-500 focus:outline-none focus:border-brand-gold/50 text-sm"
            />
            <button
              type="button"
              onClick={addAlias}
              className="px-3 py-2 rounded-lg border border-surface-border text-gray-400 hover:text-white transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {aliases.map((alias) => (
              <span
                key={alias}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-card border border-surface-border text-sm text-gray-300"
              >
                {alias}
                <button
                  type="button"
                  onClick={() => setAliases(aliases.filter((a) => a !== alias))}
                  className="text-gray-500 hover:text-red-400"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Designation */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Designation</label>
          <input
            type="text"
            value={form.designation}
            onChange={(e) => setForm({ ...form, designation: e.target.value })}
            placeholder="e.g. Finance Minister"
            className="w-full px-4 py-3 rounded-lg bg-surface-card border border-surface-border text-white placeholder-gray-500 focus:outline-none focus:border-brand-gold/50"
          />
        </div>

        {/* Organization */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-300">Organization</label>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setOrgMode("select")}
                className={`px-2 py-0.5 rounded transition-colors ${orgMode === "select" ? "text-brand-gold" : "text-gray-500 hover:text-gray-300"}`}
              >
                Select existing
              </button>
              <span className="text-gray-600">|</span>
              <button
                type="button"
                onClick={() => setOrgMode("custom")}
                className={`px-2 py-0.5 rounded transition-colors ${orgMode === "custom" ? "text-brand-gold" : "text-gray-500 hover:text-gray-300"}`}
              >
                Type custom
              </button>
            </div>
          </div>

          {orgMode === "select" ? (
            <div className="space-y-2">
              <select
                value={form.organization}
                onChange={(e) => setForm({ ...form, organization: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-surface-card border border-surface-border text-white focus:outline-none focus:border-brand-gold/50"
              >
                <option value="">None</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.name}>{o.name}{o.entity_type ? ` (${o.entity_type})` : ""}</option>
                ))}
              </select>
              {/* Inline create new org */}
              <div className="rounded-lg border border-surface-border bg-surface p-3 space-y-2">
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> Create a new organization
                </p>
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="Organization name"
                  className="w-full px-3 py-2 rounded-lg bg-surface-card border border-surface-border text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand-gold/50"
                />
                <input
                  type="text"
                  value={newOrgType}
                  onChange={(e) => setNewOrgType(e.target.value)}
                  placeholder="Entity type (optional, e.g. Government Ministry)"
                  className="w-full px-3 py-2 rounded-lg bg-surface-card border border-surface-border text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand-gold/50"
                />
                <button
                  type="button"
                  onClick={handleCreateOrg}
                  disabled={creatingOrg || !newOrgName.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-card border border-surface-border text-xs text-gray-300 hover:text-white hover:border-brand-gold/40 disabled:opacity-50 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  {creatingOrg ? "Creating..." : "Create & select"}
                </button>
              </div>
            </div>
          ) : (
            <input
              type="text"
              value={form.organization}
              onChange={(e) => setForm({ ...form, organization: e.target.value })}
              placeholder="e.g. Ministry of Finance"
              className="w-full px-4 py-3 rounded-lg bg-surface-card border border-surface-border text-white placeholder-gray-500 focus:outline-none focus:border-brand-gold/50"
            />
          )}
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Category</label>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="w-full px-4 py-3 rounded-lg bg-surface-card border border-surface-border text-white focus:outline-none focus:border-brand-gold/50"
          >
            <option value="">Select category</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-brand-gold hover:bg-brand-gold-light text-brand-navy font-semibold transition-colors disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Person"}
        </button>
      </form>
    </div>
  );
}
