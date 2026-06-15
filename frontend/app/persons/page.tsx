"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { UserPlus, Search } from "lucide-react";
import { listPersons } from "@/lib/api";
import { formatDate, CATEGORY_OPTIONS } from "@/lib/utils";

export default function PersonsPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["persons", search, category, page],
    queryFn: () => listPersons({ search, category, page, page_size: 20 }),
    staleTime: 10_000,
  });

  const persons = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Person Master</h1>
          <p className="text-gray-400 text-sm mt-1">{total} persons in database</p>
        </div>
        <Link
          href="/persons/new"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-gold text-brand-navy font-semibold text-sm hover:bg-brand-gold-light transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Add Person
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search persons..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-surface-card border border-surface-border text-white placeholder-gray-500 focus:outline-none focus:border-brand-gold/50 text-sm"
          />
        </div>
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          className="px-3 py-2.5 rounded-lg bg-surface-card border border-surface-border text-white text-sm focus:outline-none focus:border-brand-gold/50"
        >
          <option value="">All Categories</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : persons.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p>No persons found.</p>
          <Link href="/persons/new" className="text-brand-gold hover:underline mt-2 inline-block">
            Add the first person
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-surface-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-card border-b border-surface-border">
              <tr>
                {["Name", "Designation", "Organization", "Category", "Images", "Added", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {persons.map((person) => (
                <tr key={person.id} className="hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-white">{person.full_name}</p>
                      {person.aliases.length > 0 && (
                        <p className="text-xs text-gray-500">
                          {person.aliases.slice(0, 2).join(", ")}
                          {person.aliases.length > 2 && ` +${person.aliases.length - 2}`}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{person.designation ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-400">{person.organization ?? "—"}</td>
                  <td className="px-4 py-3">
                    {person.category && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-brand-navy border border-surface-border text-gray-300">
                        {person.category}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-white">{person.image_count}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(person.created_at)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/persons/${person.id}`} className="text-brand-gold text-xs hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Pagination */}
          {total > 20 && (
            <div className="flex justify-center gap-2 p-4 border-t border-surface-border">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded text-sm border border-surface-border text-gray-400 hover:text-white disabled:opacity-50"
              >
                Prev
              </button>
              <span className="px-3 py-1 text-sm text-gray-400">Page {page}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={persons.length < 20}
                className="px-3 py-1 rounded text-sm border border-surface-border text-gray-400 hover:text-white disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
