// app/ClientFrame.tsx
"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import GlobalFiltersProvider from "@/components/GlobalFiltersProvider";
import ImpersonationBanner from "@/components/ImpersonationBanner";
/**
 * Règle simple :
 * - Sidebar MASQUÉE sur /login uniquement
 * - Sidebar VISIBLE partout ailleurs (donc après connexion)
 * Le contenu principal décale à droite (ml-64) seulement quand la sidebar est visible.
 */
export default function ClientFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  const isPublicBooking = pathname?.startsWith("/book/") ?? false;
  const isPublicPage = isLogin || isPublicBooking;

  return (
    <GlobalFiltersProvider>
      {!isPublicPage && <Sidebar />}
      <div className={isPublicPage ? "min-h-screen" : "min-h-screen sm:ml-64"}>
        {!isPublicPage && <ImpersonationBanner />}
        {children}
      </div>
    </GlobalFiltersProvider>
  );
}
