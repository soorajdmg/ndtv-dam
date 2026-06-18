"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import NextImage from "next/image";
import { useAuth } from "@/lib/auth";

const PUBLIC_PATHS = ["/login"];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading, sessionStatus } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    // Never redirect while the NextAuth session or our auth state is still resolving.
    // This is the critical guard that prevents the "re-login" flash: after a Google
    // OAuth callback NextAuth briefly emits "unauthenticated" before "authenticated",
    // which would set user=null. Without checking sessionStatus here, AuthGuard would
    // immediately push the user back to /login even though auth is succeeding.
    if (isLoading || sessionStatus === "loading") return;

    if (!user && !isPublic) {
      // Confirmed: no session and no valid backend JWT — send to login.
      router.replace("/login");
    }
    if (user && isPublic) {
      // Confirmed: authenticated user on a public page — send to dashboard.
      router.replace("/");
    }
  }, [user, isLoading, sessionStatus, isPublic, router]);

  // Block render while auth state is being determined.
  if (isLoading || sessionStatus === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-surface-bg">
        <NextImage
          src="/ndtv_logo.png"
          alt="NDTV"
          width={110}
          height={35}
          className="object-contain brightness-0 invert opacity-80"
        />
        <div className="w-8 h-8 border-2 border-brand-gold border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-400 tracking-wide">Verifying your session…</p>
      </div>
    );
  }

  return <>{children}</>;
}
