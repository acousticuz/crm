import { Link, NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/kanban", label: "Kanban" },
];

export function AppLayout(): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b">
        <div className="container flex h-14 items-center justify-between">
          <Link to="/" className="text-lg font-semibold text-primary">
            Acoustic CRM
          </Link>
          <nav className="flex gap-4 text-sm">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "px-3 py-1.5 rounded-md transition-colors hover:bg-accent",
                    isActive && "bg-accent font-medium",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="container flex-1 py-6">
        <Outlet />
      </main>
    </div>
  );
}
