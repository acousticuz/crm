import { createBrowserRouter, Navigate, useLocation } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { KanbanPage } from "@/pages/KanbanPage";
import { CallsPage } from "@/pages/CallsPage";
import { CoachingPage } from "@/pages/CoachingPage";
import { InboxPage } from "@/pages/InboxPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { ScorecardPage } from "@/pages/ScorecardPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { useAuth } from "@/lib/auth";
import type { ReactNode } from "react";

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/kanban" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "kanban", element: <KanbanPage /> },
      { path: "calls", element: <CallsPage /> },
      { path: "inbox", element: <InboxPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "scorecard/:callId", element: <ScorecardPage /> },
      { path: "coaching/:operatorId", element: <CoachingPage /> },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);
