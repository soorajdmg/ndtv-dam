import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Providers } from "@/components/Providers";
import { AuthGuard } from "@/components/AuthGuard";
import { SidebarGuard } from "@/components/SidebarGuard";

export const metadata: Metadata = {
  title: "NDTV Digital Asset Management",
  description: "AI-powered Digital Asset Management for NDTV Profit",
  icons: { icon: "/favicon.jpg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AuthGuard>
            <div className="flex min-h-screen">
              <SidebarGuard>
                <Sidebar />
              </SidebarGuard>
              <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
            </div>
          </AuthGuard>
        </Providers>
      </body>
    </html>
  );
}
