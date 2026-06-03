import { Bell, LogOut, Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SalesScriptPanel } from "@/components/SalesScriptPanel";
import { useAuth } from "@/lib/auth";

interface TopBarProps {
  // Mobile-only menu trigger surfaces the sidebar drawer.
  onOpenMobileSidebar: () => void;
}

/**
 * Minimal application top bar. Holds a global search input (visual scaffold —
 * not yet wired to a backend endpoint), the SalesScriptPanel trigger, a
 * notifications bell (placeholder), and the current user identity.
 *
 * Sticky to the viewport top so it stays in reach when long pages scroll.
 */
export function TopBar({ onOpenMobileSidebar }: TopBarProps): JSX.Element {
  const { user, logout } = useAuth();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/80 lg:px-6">
      {/* Hamburger — only meaningful on narrow screens where the sidebar is a
          drawer. Hidden on desktop because the sidebar is always visible there. */}
      <button
        type="button"
        onClick={onOpenMobileSidebar}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground lg:hidden"
        aria-label="Sidebar'ni ochish"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Search input — visual only for now. Kept narrow on small screens so
          it doesn't crowd out the action cluster. */}
      <div className="relative flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
        <Input
          type="search"
          placeholder="Qidirish (mijoz, raqam, karta)..."
          className="h-9 pl-8"
          aria-label="Global qidiruv"
        />
      </div>

      {/* Right-aligned action cluster. */}
      <div className="ml-auto flex items-center gap-2">
        <SalesScriptPanel />
        <button
          type="button"
          title="Bildirishnomalar"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          {/* Future: unread badge dot lives here. */}
        </button>
        {user && (
          <div className="hidden items-center gap-2 border-l pl-3 text-xs md:flex">
            <div className="flex flex-col items-end leading-tight">
              <span className="font-medium text-foreground">{user.email}</span>
              <span className="text-2xs uppercase tracking-wider text-muted-foreground">
                {user.role}
              </span>
            </div>
          </div>
        )}
        <Button variant="ghost" size="icon" onClick={logout} title="Chiqish">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
