import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/shell/BrandMark";
import { useAuth } from "@/lib/auth";

interface LocationState {
  from?: { pathname: string };
}

export function LoginPage(): JSX.Element {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as LocationState | null)?.from?.pathname ?? "/kanban";

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        "Login xato";
      setError(typeof msg === "string" ? msg : "Login xato");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      {/* A very faint waveform watermark behind the form — anchors the page
          visually without competing with the form itself. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.05]"
      >
        <svg viewBox="0 0 800 200" className="w-[800px] text-foreground">
          {Array.from({ length: 80 }).map((_, i) => {
            const x = i * 10;
            const h = 30 + 70 * Math.abs(Math.sin(i * 0.42) * Math.sin(i * 0.13));
            return (
              <rect
                key={i}
                x={x}
                y={(200 - h) / 2}
                width={4}
                height={h}
                rx={2}
                fill="currentColor"
              />
            );
          })}
        </svg>
      </div>

      <form
        onSubmit={onSubmit}
        className="relative w-full max-w-sm space-y-5 rounded-lg border bg-card p-7 shadow-md"
      >
        <div className="flex flex-col items-start gap-3">
          <BrandMark />
          <div>
            <p className="eyebrow mb-1">Kirish</p>
            <h1 className="font-display text-2xl font-semibold tracking-tightish">
              Xush kelibsiz
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Davom etish uchun ma'lumotlaringizni kiriting.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Parol</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <Button type="submit" className="w-full" disabled={loading || !email || !password}>
          {loading ? "Kirilmoqda..." : "Kirish"}
        </Button>
      </form>
    </div>
  );
}
