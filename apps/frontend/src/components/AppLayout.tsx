import { useState } from "react";
import { Outlet } from "react-router-dom";
import { IncomingCallToast } from "@/components/IncomingCallToast";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { MobileTabBar } from "@/components/shell/MobileTabBar";
import { Sheet, SheetContent } from "@/components/ui/sheet";

/**
 * Application shell — Soft Modern.
 *
 * Desktop (≥md = 768px):
 *   - 240px persistent sidebar, collapsible to 64px icon rail.
 *   - 48px top bar pinned to viewport top.
 * Mobile (<md):
 *   - Sidebar hidden; primary nav surfaces as a 5-item bottom tab bar
 *     with 44px touch targets (Kanban, Mijozlar, Qo'ng'iroqlar, Inbox,
 *     Sozlamalar). Secondary nav still reachable via the top-bar hamburger
 *     drawer.
 *
 * Routes / hooks / providers — untouched.
 */
export function AppLayout(): JSX.Element {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar — visible from md and up. */}
      <div className="sticky top-0 hidden h-screen md:block">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      </div>

      {/* Mobile drawer — reuses Sidebar so behaviour stays in one place. */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent className="w-[260px] max-w-[260px] border-r-0 p-0">
          <Sidebar
            collapsed={false}
            onToggle={() => undefined}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Main column. The bottom tab bar adds 56px to the mobile main padding
          so content never lives under the chrome. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMobileSidebar={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 pb-20 pt-6 md:px-6 md:pb-8 lg:px-10 lg:pt-8">
          <div className="mx-auto w-full max-w-screen-2xl">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile bottom tab bar — only renders below md. */}
      <MobileTabBar />

      <IncomingCallToast />
    </div>
  );
}
