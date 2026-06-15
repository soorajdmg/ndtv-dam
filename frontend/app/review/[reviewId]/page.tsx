"use client";
import { useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ArrowLeft, CheckCircle, XCircle, UserPlus } from "lucide-react";
import Link from "next/link";
import { resolveReview } from "@/lib/api";

// Minimal review workspace
export default function ReviewWorkspacePage() {
  const { reviewId } = useParams<{ reviewId: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "c" || e.key === "C") confirmMutation.mutate("confirm");
      if (e.key === "r" || e.key === "R") confirmMutation.mutate("reject");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const confirmMutation = useMutation({
    mutationFn: (action: "confirm" | "reject") => resolveReview(reviewId, action),
    onSuccess: (_, action) => {
      toast.success(`Review ${action}ed`);
      qc.invalidateQueries({ queryKey: ["review-queue"] });
      router.push("/review");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/review" className="text-gray-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-white">Review Workspace</h1>
        <div className="ml-auto flex items-center gap-1 text-xs text-gray-500">
          <kbd className="px-1.5 py-0.5 rounded bg-surface-card border border-surface-border">C</kbd> Confirm
          <span className="mx-2">·</span>
          <kbd className="px-1.5 py-0.5 rounded bg-surface-card border border-surface-border">R</kbd> Reject
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Face Crop */}
        <div className="rounded-xl border border-surface-border bg-surface-card overflow-hidden">
          <div className="p-3 border-b border-surface-border">
            <p className="text-sm font-medium text-gray-300">Face Crop</p>
          </div>
          <div className="aspect-square flex items-center justify-center bg-surface">
            <img
              src={`${apiBase}/api/face-detections/placeholder/crop`}
              alt="Face crop"
              className="max-w-full max-h-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).parentElement!.innerHTML =
                  '<p class="text-gray-500 text-sm">Face crop not available</p>';
              }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-4">
          <div className="rounded-xl border border-surface-border bg-surface-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">Review Actions</h2>
            <p className="text-xs text-gray-400">
              Confirm the AI's identification, correct it, or reject the detection.
            </p>

            <div className="space-y-2">
              <button
                onClick={() => confirmMutation.mutate("confirm")}
                disabled={confirmMutation.isPending}
                className="w-full flex items-center gap-2 px-4 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                Confirm AI Match  [C]
              </button>
              <button
                onClick={() => confirmMutation.mutate("reject")}
                disabled={confirmMutation.isPending}
                className="w-full flex items-center gap-2 px-4 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                Reject Detection  [R]
              </button>
              <Link
                href="/persons/new"
                className="w-full flex items-center gap-2 px-4 py-3 rounded-lg border border-surface-border text-gray-300 hover:text-white hover:border-brand-gold/50 font-medium transition-colors text-center justify-center"
              >
                <UserPlus className="w-4 h-4" />
                Create New Person
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
