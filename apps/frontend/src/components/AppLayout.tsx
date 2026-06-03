import { useState } from "react";
import { Outlet } from "react-router-dom";
import { IncomingCallToast } from "@/components/IncomingCallToast";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { Sheet, SheetContent } from "@/components/ui/sheet";

/**
 * Application shell — sidebar + top bar + content. Pure layout: every route,
 * link, hook, and provider from the previous shell stays as-is.
 *
 * Responsive behavior:
 *   - lg+ (≥1024px): persistent left sidebar, collapsible to icons.
 *   - <lg: sidebar disappears off-canvas and reappears as a drawer (Sheet)
 *     triggered from the top bar hamburger.
 */
export function AppLayout(): JSX.Element {
  // Desktop collapse persists across navigation (component stays mounted).
  // Mobile drawer is a separate transient state.
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar (always visible at lg+). */}
      <div className="sticky top-0 hidden h-screen lg:block">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      </div>

      {/* Mobile drawer — reuses the same Sidebar so behavior never forks. */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent className="w-[232px] max-w-[232px] border-r-0 p-0">
          <Sidebar
            collapsed={false}
            onToggle={() => undefined}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Main column: top bar pinned to viewport top + scrollable content. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMobileSidebar={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-6 lg:px-8">
          <div className="mx-auto w-full max-w-screen-2xl">
            <Outlet />
          </div>
        </main>
      </div>

      <IncomingCallToast />
    </div>
  );
}
