import { Button } from "@/components/ui/button";

export function LoginPage(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Acoustic CRM</h1>
        <p className="text-sm text-muted-foreground">
          M1 da to'liq autentifikatsiya ulanadi.
        </p>
        <Button className="w-full" disabled>
          Kirish (tez orada)
        </Button>
      </div>
    </div>
  );
}
