"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate, truncateId } from "@/lib/utils";

// Fetch all batches via API — backend needs this route
async function listBatches() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/batches?page=1&page_size=50`);
  if (!res.ok) return { items: [], total: 0 };
  return res.json();
}

export default function BatchesPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["batches"],
    queryFn: listBatches,
    refetchInterval: 10_000,
  });

  const batches = data?.items ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Batches</h1>
          <p className="text-gray-400 text-sm mt-1">All uploaded image batches</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-border text-gray-400 hover:text-white transition-colors text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="text-gray-400 text-sm">Loading batches...</div>
      ) : batches.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p>No batches yet.</p>
          <Link href="/upload" className="text-brand-gold hover:underline mt-2 inline-block">
            Upload your first batch
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-surface-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-card border-b border-surface-border">
              <tr>
                {["Batch ID", "Submitted", "Total", "Processed", "Failed", "Status", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {batches.map((batch: any) => (
                <tr key={batch.batch_id} className="hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3 font-mono text-brand-gold text-xs">
                    {truncateId(batch.batch_id)}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(batch.created_at)}</td>
                  <td className="px-4 py-3 text-white">{batch.total}</td>
                  <td className="px-4 py-3 text-green-400">{batch.processed}</td>
                  <td className="px-4 py-3 text-red-400">{batch.failed}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={batch.status} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/batches/${batch.batch_id}`}
                      className="text-brand-gold text-xs hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
