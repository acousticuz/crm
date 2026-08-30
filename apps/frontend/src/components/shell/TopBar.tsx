import { Bell, LogOut, Menu, Moon, Search, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SalesScriptPanel } from "@/components/SalesScriptPanel";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

interface TopBarProps {
  onOpenMobileSidebar: () => void;
}

// Friendly role labels — Uzbek translations of the backend enum so the chip
// reads as a human title and not a SHOUTED_ENUM.
const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  TENANT_ADMIN: "Tenant admin",
  SUPERVISOR: "Supervayzer",
  OPERATOR: "Operator",
  ANALYST: "Analitik",
};

function initialsFromEmail(email: string): string {
  const namePart = email.split("@")[0] ?? "";
  const parts = namePart.split(/[._\-+]/).filter(Boolean);
  if (parts.length === 0) return email.slice(0, 2).toUpperCase();
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

/**
 * Soft Modern top bar — 48px tall, sticky, holds:
 *   - mobile hamburger (drawer trigger for secondary nav)
 *   - global search input with a Ctrl/Cmd+K hint
 *   - SalesScriptPanel quick-access
 *   - theme toggle + notifications
 *   - user identity chip + sign-out
 */
export function TopBar({ onOpenMobileSidebar }: TopBarProps): JSX.Element {
  const { user, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/65 lg:px-6">
      <button
        type="button"
        onClick={onOpenMobileSidebar}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground md:hidden"
        aria-label="Sidebar'ni ochish"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Search — visually scaffolded; the focus ring on accent signals it's
          the keyboard entry point. Ctrl+K hint sits in the right slot so the
          shortcut is discoverable without crowding the placeholder. */}
      <div className="relative hidden max-w-md flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
        <Input
          type="search"
          placeholder="Mijoz, raqam yoki karta bo'yicha qidirish"
          className="h-9 pl-9 pr-14 text-sm"
          aria-label="Global qidiruv"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden h-6 -translate-y-1/2 items-center gap-0.5 rounded border border-border bg-surface px-1.5 font-mono text-2xs text-muted-foreground md:inline-flex">
          <span>⌘</span>
          <span>K</span>
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <SalesScriptPanel />
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === "dark" ? "Yorug' rejim" : "Qorong'u rejim"}
          aria-label="Rejim almashtirish"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button
          type="button"
          title="Bildirishnomalar"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
        </button>

        {user && (
          <div className="hidden items-center gap-2 border-l pl-3 md:flex">
            <span
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-full",
                "bg-primary-soft font-mono text-xs font-semibold text-primary-soft-foreground",
              )}
              title={user.email}
            >
              {initialsFromEmail(user.email)}
            </span>
            <div className="flex flex-col items-start leading-tight">
              <span className="max-w-[180px] truncate text-xs font-medium text-foreground">
                {user.email}
              </span>
              <span className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">
                {ROLE_LABEL[user.role] ?? user.role}
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
