"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/signup"];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (isLoading) return;
    if (!user && !isPublic) {
      router.replace("/login");
    }
    if (user && isPublic) {
      router.replace("/");
    }
  }, [user, isLoading, isPublic, router]);

  // While loading, show nothing to avoid flash
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-bg">
        <div className="w-8 h-8 border-2 border-brand-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
