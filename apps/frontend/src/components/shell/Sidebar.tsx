import { Link, NavLink } from "react-router-dom";
import {
  BarChart3,
  ChevronsLeft,
  Inbox,
  KanbanSquare,
  Phone,
  Settings,
  Waves,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Single source of truth for the sidebar nav. Same to/label as the previous
// AppLayout header — only icons + a sidebar shell are new. Routes untouched.
export const NAV_ITEMS = [
  { to: "/kanban", label: "Kanban", icon: KanbanSquare },
  { to: "/calls", label: "Qo'ng'iroqlar", icon: Phone },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/settings", label: "Sozlamalar", icon: Settings },
] as const;

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  // Optional onNavigate so the mobile drawer can close itself when a link
  // is clicked. Desktop sidebar passes nothing.
  onNavigate?: () => void;
}

/**
 * Left navigation rail. Two modes:
 *   - expanded (default): brand mark + label + icon for every link
 *   - collapsed: icons only, hover tooltip via native title attr
 * The shell decides which mode to render based on viewport + a user toggle.
 */
export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps): JSX.Element {
  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r bg-card transition-[width] duration-200 ease-out",
        collapsed ? "w-[64px]" : "w-[232px]",
      )}
    >
      {/* Brand row — clicking the mark always lands on /. Lock the height to
          match the top bar so the layout's grid corners line up. */}
      <div
        className={cn(
          "flex h-14 items-center border-b",
          collapsed ? "justify-center px-2" : "justify-between px-4",
        )}
      >
        <Link
          to="/"
          onClick={onNavigate}
          className="flex items-center gap-2 text-foreground"
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-xs">
            <Waves className="h-4 w-4" />
          </span>
          {!collapsed && (
            <span className="text-sm font-semibold tracking-tightish">Acoustic CRM</span>
          )}
        </Link>
        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            title="Sidebar'ni yig'ish"
            className="hidden h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground lg:inline-flex"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Nav. NavLink isActive drives the active-state styles. */}
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                    "text-muted-foreground hover:bg-surface hover:text-foreground",
                    isActive && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                    collapsed && "justify-center px-2",
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Collapse handle when in icon-only mode — pulls the bar back out. */}
      {collapsed && (
        <button
          type="button"
          onClick={onToggle}
          title="Sidebar'ni kengaytirish"
          className="m-2 hidden h-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground lg:flex"
        >
          <ChevronsLeft className="h-4 w-4 rotate-180" />
        </button>
      )}
    </aside>
  );
}
