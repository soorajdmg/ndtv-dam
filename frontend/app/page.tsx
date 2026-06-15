"use client";
import { useQuery } from "@tanstack/react-query";
import { Images, Users, ClipboardCheck, TrendingUp, Activity } from "lucide-react";
import Link from "next/link";
import { getHealth, getBatchShortlist } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRelative } from "@/lib/utils";

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-400">{label}</span>
        <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: 30_000,
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">NDTV Digital Asset Management System</p>
      </div>

      {/* System Health */}
      <div className="rounded-xl border border-surface-border bg-surface-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-brand-gold" />
          <h2 className="text-sm font-medium text-white">System Health</h2>
        </div>
        {health ? (
          <div className="flex gap-4 flex-wrap">
            <StatusBadge status={health.checks.postgres === "ok" ? "completed" : "failed"} />
            <span className="text-xs text-gray-400">PostgreSQL: {health.checks.postgres}</span>
            <span className="text-xs text-gray-400">Qdrant: {health.checks.qdrant}</span>
            <span className="text-xs text-gray-400">Redis: {health.checks.redis}</span>
          </div>
        ) : (
          <p className="text-xs text-gray-500">Loading health status...</p>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          href="/upload"
          className="rounded-xl border border-surface-border bg-surface-card hover:border-brand-gold/50 p-5 transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-brand-gold/20 flex items-center justify-center mb-3 group-hover:bg-brand-gold/30 transition-colors">
            <Images className="w-5 h-5 text-brand-gold" />
          </div>
          <h3 className="font-semibold text-white">Upload Images</h3>
          <p className="text-xs text-gray-400 mt-1">Start a new batch upload</p>
        </Link>
        <Link
          href="/persons"
          className="rounded-xl border border-surface-border bg-surface-card hover:border-brand-gold/50 p-5 transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center mb-3 group-hover:bg-blue-500/30 transition-colors">
            <Users className="w-5 h-5 text-blue-400" />
          </div>
          <h3 className="font-semibold text-white">Person Master</h3>
          <p className="text-xs text-gray-400 mt-1">Manage known persons</p>
        </Link>
        <Link
          href="/review"
          className="rounded-xl border border-surface-border bg-surface-card hover:border-brand-gold/50 p-5 transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center mb-3 group-hover:bg-purple-500/30 transition-colors">
            <ClipboardCheck className="w-5 h-5 text-purple-400" />
          </div>
          <h3 className="font-semibold text-white">Review Queue</h3>
          <p className="text-xs text-gray-400 mt-1">Review face recognitions</p>
        </Link>
      </div>

      {/* Getting Started */}
      <div className="rounded-xl border border-surface-border bg-surface-card p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Getting Started</h2>
        <ol className="space-y-2 text-sm text-gray-400">
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-brand-gold/20 text-brand-gold text-xs flex items-center justify-center font-bold">1</span>
            Add persons to the <Link href="/persons/new" className="text-brand-gold hover:underline">Person Master</Link>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-brand-gold/20 text-brand-gold text-xs flex items-center justify-center font-bold">2</span>
            <Link href="/upload" className="text-brand-gold hover:underline">Upload</Link> a batch of images
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-brand-gold/20 text-brand-gold text-xs flex items-center justify-center font-bold">3</span>
            Track progress in <Link href="/batches" className="text-brand-gold hover:underline">Batches</Link>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-brand-gold/20 text-brand-gold text-xs flex items-center justify-center font-bold">4</span>
            Resolve low-confidence detections in <Link href="/review" className="text-brand-gold hover:underline">Review Queue</Link>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-brand-gold/20 text-brand-gold text-xs flex items-center justify-center font-bold">5</span>
            <Link href="/search" className="text-brand-gold hover:underline">Search</Link> assets semantically
          </li>
        </ol>
      </div>
    </div>
  );
}
