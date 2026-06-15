"use client";
import { cn, scoreToBarColor } from "@/lib/utils";
import type { QualityBreakdown } from "@/lib/types";

interface ScoreBreakdownBarProps {
  quality: QualityBreakdown;
  className?: string;
}

const SCORE_FIELDS: { key: keyof QualityBreakdown; label: string; weight: number }[] = [
  { key: "sharpness", label: "Sharpness", weight: 0.30 },
  { key: "brightness", label: "Brightness", weight: 0.20 },
  { key: "face_visibility", label: "Face", weight: 0.20 },
  { key: "contrast", label: "Contrast", weight: 0.15 },
  { key: "composition", label: "Composition", weight: 0.15 },
];

export function ScoreBreakdownBar({ quality, className }: ScoreBreakdownBarProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {SCORE_FIELDS.map(({ key, label, weight }) => {
        const val = quality[key];
        const pct = val !== undefined ? Math.round(val * 100) : 0;
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-24 shrink-0">{label}</span>
            <div className="flex-1 bg-surface-border rounded-full h-1.5">
              <div
                className={cn("h-1.5 rounded-full transition-all", scoreToBarColor(val))}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-gray-300 w-8 text-right">{pct}%</span>
          </div>
        );
      })}
      {quality.overall !== undefined && (
        <div className="flex items-center gap-2 pt-1 border-t border-surface-border">
          <span className="text-xs font-medium text-white w-24 shrink-0">Overall</span>
          <div className="flex-1 bg-surface-border rounded-full h-2">
            <div
              className={cn("h-2 rounded-full transition-all", scoreToBarColor(quality.overall))}
              style={{ width: `${Math.round((quality.overall ?? 0) * 100)}%` }}
            />
          </div>
          <span className="text-xs font-bold text-white w-8 text-right">
            {Math.round((quality.overall ?? 0) * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}
