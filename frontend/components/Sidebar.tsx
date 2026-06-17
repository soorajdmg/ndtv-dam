"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import NextImage from "next/image";
import {
  Building2,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const NAV_ITEMS = [
  { href: "/", label: "Asset Library", icon: LayoutDashboard },
  { href: "/persons", label: "Persons", icon: Users },
  { href: "/organizations", label: "Organizations", icon: Building2 },
  { href: "/review", label: "Review Queue", icon: ClipboardCheck },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 bg-surface-card border-r border-surface-border flex flex-col">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
        <NextImage src="/ndtv_logo.png" alt="NDTV" width={120} height={38} className="object-contain brightness-0 invert" />
        <span className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase">DAM</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
                active
                  ? "bg-brand-gold/20 text-brand-gold font-medium"
                  : "text-gray-400 hover:text-white hover:bg-surface-hover"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer — user info + logout */}
      <div className="p-4 border-t border-surface-border space-y-2">
        {user && (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-300 truncate">{user.full_name}</p>
              <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-surface-hover transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
        <p className="text-[10px] text-gray-600">NDTV DAM PoC v0.1</p>
      </div>
    </aside>
  );
}
