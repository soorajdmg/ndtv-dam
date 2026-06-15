"use client";
import { CheckCircle, XCircle } from "lucide-react";

interface BulkReviewControlsProps {
  selectedCount: number;
  onBulkConfirm: () => void;
  onBulkReject: () => void;
  loading?: boolean;
}

export function BulkReviewControls({
  selectedCount,
  onBulkConfirm,
  onBulkReject,
  loading,
}: BulkReviewControlsProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-3 p-3 bg-surface-card border border-surface-border rounded-lg">
      <span className="text-sm text-gray-300">
        <span className="font-semibold text-white">{selectedCount}</span> selected
      </span>
      <div className="flex gap-2 ml-auto">
        <button
          onClick={onBulkConfirm}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          <CheckCircle className="w-4 h-4" />
          Bulk Confirm
        </button>
        <button
          onClick={onBulkReject}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          <XCircle className="w-4 h-4" />
          Bulk Reject
        </button>
      </div>
    </div>
  );
}
