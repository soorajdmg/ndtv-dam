"use client";
import { usePathname } from "next/navigation";

const HIDE_SIDEBAR_PATHS = ["/login"];

export function SidebarGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hide = HIDE_SIDEBAR_PATHS.some((p) => pathname.startsWith(p));
  if (hide) return null;
  return <>{children}</>;
}
