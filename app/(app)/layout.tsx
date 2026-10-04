import { redirect } from "next/navigation";
import { isPlatformAdmin } from "@/lib/api/admin";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware already guarantees a session exists here; this is the
  // is_platform_admin() gate — the one that actually matters. Never trust a
  // frontend role flag instead of this RPC (see ADMIN_ANALYSIS.md §11).
  const admin = await isPlatformAdmin();
  if (!admin) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login?error=not-admin");
  }

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto bg-background p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
