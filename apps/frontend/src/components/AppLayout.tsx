import { Link, NavLink, Outlet } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IncomingCallToast } from "@/components/IncomingCallToast";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const navItems = [
  { to: "/kanban", label: "Kanban" },
  { to: "/calls", label: "Qo'ng'iroqlar" },
  { to: "/inbox", label: "Inbox" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/settings", label: "Sozlamalar" },
];

export function AppLayout(): JSX.Element {
  const { user, logout } = useAuth();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-lg font-semibold text-primary">
              Acoustic CRM
            </Link>
            <nav className="flex gap-2 text-sm">
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
          <div className="flex items-center gap-3 text-sm">
            {user && (
              <span className="text-muted-foreground">
                {user.email} · <span className="text-xs">{user.role}</span>
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="mr-1 h-4 w-4" /> Chiqish
            </Button>
          </div>
        </div>
      </header>
      <main className="container flex-1 py-6">
        <Outlet />
      </main>
      <IncomingCallToast />
    </div>
  );
}
