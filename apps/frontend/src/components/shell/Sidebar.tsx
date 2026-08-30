import { Link, NavLink } from "react-router-dom";
import {
  BarChart3,
  ChevronsLeft,
  Inbox,
  KanbanSquare,
  Phone,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/shell/BrandMark";

// Single source of truth for sidebar nav. Grouped so the eye finds the
// section by intent — operative work first, analytics next, setup last.
type NavItem = {
  to: string;
  label: string;
  icon: typeof KanbanSquare;
};

const NAV_GROUPS: { eyebrow: string; items: readonly NavItem[] }[] = [
  {
    eyebrow: "Ish jarayoni",
    items: [
      { to: "/kanban", label: "Kanban", icon: KanbanSquare },
      { to: "/clients", label: "Mijozlar", icon: Users },
      { to: "/calls", label: "Qo'ng'iroqlar", icon: Phone },
      { to: "/inbox", label: "Inbox", icon: Inbox },
    ],
  },
  {
    eyebrow: "Tahlil",
    items: [{ to: "/dashboard", label: "Boshqaruv paneli", icon: BarChart3 }],
  },
  {
    eyebrow: "Sozlash",
    items: [{ to: "/settings", label: "Sozlamalar", icon: Settings }],
  },
];

// Flat list kept exported so other components (mobile drawer header, command
// palette, etc.) can iterate the same source of truth.
export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

/**
 * Soft Modern left rail. Two modes:
 *   - expanded (240px): brand mark + grouped link list with quiet eyebrows
 *   - collapsed (64px): glyph + icon-only links with native tooltip
 */
export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps): JSX.Element {
  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r bg-background transition-[width] duration-200 ease-out",
        collapsed ? "w-[64px]" : "w-[240px]",
      )}
    >
      {/* Brand row — height locked to the 48px top bar so corners align. */}
      <div
        className={cn(
          "flex h-12 items-center border-b",
          collapsed ? "justify-center px-2" : "justify-between px-4",
        )}
      >
        <Link to="/" onClick={onNavigate} className="flex items-center">
          <BrandMark glyphOnly={collapsed} />
        </Link>
        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            title="Sidebar'ni yig'ish"
            className="hidden h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground md:inline-flex"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Nav — grouped by intent. Eyebrows hide in the collapsed state so the
          rail stays tidy at 64px. */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-4">
          {NAV_GROUPS.map((group) => (
            <li key={group.eyebrow}>
              {!collapsed && (
                <p className="eyebrow mb-1.5 px-2.5">{group.eyebrow}</p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          // 44px tall — touch target without looking bulky on
                          // desktop, exactly what the mobile drawer needs too.
                          "group relative flex h-11 items-center gap-3 rounded-md px-2.5 text-sm font-medium transition-colors",
                          "text-muted-foreground hover:bg-surface hover:text-foreground",
                          isActive &&
                            "bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft hover:text-primary-soft-foreground",
                          collapsed && "justify-center px-2",
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {/* Active rail — quiet 2px accent stroke on the
                              leading edge marks the current page without a
                              heavy filled background. */}
                          {isActive && (
                            <span
                              aria-hidden
                              className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-primary"
                            />
                          )}
                          <item.icon className="h-4 w-4 shrink-0" />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </nav>

      {/* Collapse handle in icon-only mode. */}
      {collapsed && (
        <button
          type="button"
          onClick={onToggle}
          title="Sidebar'ni kengaytirish"
          className="m-2 hidden h-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground md:flex"
        >
          <ChevronsLeft className="h-4 w-4 rotate-180" />
        </button>
      )}
    </aside>
  );
}
