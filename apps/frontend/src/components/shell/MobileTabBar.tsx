import { NavLink } from "react-router-dom";
import { BarChart3, Inbox, KanbanSquare, Phone, Users } from "lucide-react";
import { cn } from "@/lib/utils";

// Five most-used primary destinations for the thumb-zone tab bar. Settings
// stays in the drawer because operators visit it once per setup, not daily.
const TABS = [
  { to: "/kanban", label: "Kanban", icon: KanbanSquare },
  { to: "/calls", label: "Qo'ng'iroqlar", icon: Phone },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/clients", label: "Mijozlar", icon: Users },
  { to: "/dashboard", label: "Panel", icon: BarChart3 },
] as const;

/**
 * Mobile bottom tab bar — only renders under md (768px). 56px tall + safe
 * area padding so the canvas lands above the iOS home indicator. Each tab
 * is a 44px hit target with a quiet accent dot for the active route.
 */
export function MobileTabBar(): JSX.Element {
  return (
    <nav
      aria-label="Bosh menyu"
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur md:hidden",
        "shadow-card",
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-screen-sm grid-cols-5">
        {TABS.map((tab) => (
          <li key={tab.to}>
            <NavLink
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  // 44px+ hit target; column of icon + tiny label, no chips.
                  "flex h-14 flex-col items-center justify-center gap-1 text-2xs font-medium",
                  "transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <tab.icon className="h-5 w-5" />
                  <span className="leading-none">{tab.label}</span>
                  {/* Active dot — quietly indicates the current tab without
                      filling the cell. */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute bottom-1 h-1 w-1 rounded-full transition-opacity",
                      isActive ? "bg-primary opacity-100" : "opacity-0",
                    )}
                  />
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
