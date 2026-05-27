import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function NotFoundPage(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="space-y-4 text-center">
        <h1 className="text-3xl font-semibold">404</h1>
        <p className="text-sm text-muted-foreground">Sahifa topilmadi.</p>
        <Button asChild>
          <Link to="/dashboard">Bosh sahifa</Link>
        </Button>
      </div>
    </div>
  );
}
