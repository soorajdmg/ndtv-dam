"use client";
import { cn } from "@/lib/utils";
import type { Person } from "@/lib/types";

interface PersonBadgeProps {
  person: Pick<Person, "full_name" | "designation" | "organization">;
  className?: string;
}

export function PersonBadge({ person, className }: PersonBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-brand-navy border border-surface-border text-xs",
        className
      )}
    >
      <span className="font-medium text-white">{person.full_name}</span>
      {person.designation && (
        <span className="text-gray-400">{person.designation}</span>
      )}
      {person.organization && (
        <span className="text-brand-gold">{person.organization}</span>
      )}
    </span>
  );
}
