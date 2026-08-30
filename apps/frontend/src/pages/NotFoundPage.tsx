import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function NotFoundPage(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="space-y-4 text-center">
        <p className="eyebrow">Yo'q yo'l</p>
        <h1 className="font-display text-5xl font-semibold tracking-tightish text-foreground">
          404
        </h1>
        <p className="text-sm text-muted-foreground">
          Bunday sahifa topilmadi. Manzilni qayta tekshiring.
        </p>
        <Button asChild>
          <Link to="/dashboard">Bosh sahifaga qaytish</Link>
        </Button>
      </div>
    </div>
  );
}
