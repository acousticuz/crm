import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useBranches } from "@/hooks/useKanban";
import { useAcousticPurchases, type AcousticClient } from "@/hooks/useContacts";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function ClientsPage(): JSX.Element {
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState(isoDaysAgo(30));
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const { data: branches = [] } = useBranches();
  const allBranchesSelected = branchIds.length === 0;
  const filters = useMemo(
    () => ({
      q: q.trim() || undefined,
      dateFrom,
      dateTo,
      branchIds: allBranchesSelected ? undefined : branchIds,
      page,
      pageSize: PAGE_SIZE,
    }),
    [allBranchesSelected, branchIds, dateFrom, dateTo, page, q],
  );
  const { data, isLoading } = useAcousticPurchases(filters);
  const clients = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function resetPage(fn: () => void): void {
    fn();
    setPage(1);
  }

  function toggleBranch(id: string): void {
    resetPage(() => {
      setBranchIds((current) =>
        current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
      );
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow mb-1">Hisobot</p>
          <h1 className="font-display text-3xl font-semibold tracking-tightish text-foreground">
            Mijozlar
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acoustic Analytics'dagi xarid qilgan mijozlar va sotib olingan mahsulotlar.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm shadow-xs">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono font-medium text-foreground">{total}</span>
          <span className="text-muted-foreground">ta xaridor</span>
        </div>
      </div>

      <div className="card-surface grid gap-3 p-3 lg:grid-cols-[1fr_160px_160px_320px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(event) => resetPage(() => setQ(event.target.value))}
            placeholder="Mijoz ismi yoki telefon raqam..."
            className="pl-9"
          />
        </div>
        <Input
          type="date"
          value={dateFrom}
          onChange={(event) => resetPage(() => setDateFrom(event.target.value))}
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(event) => resetPage(() => setDateTo(event.target.value))}
        />
        <div className="rounded-md border border-input bg-background p-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allBranchesSelected}
              onChange={() => resetPage(() => setBranchIds([]))}
            />
            <span>Barcha filiallar</span>
          </label>
          <div className="mt-2 max-h-28 space-y-1 overflow-y-auto pr-1">
            {branches.map((branch) => (
              <label key={branch.id} className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={allBranchesSelected || branchIds.includes(branch.id)}
                  onChange={() => toggleBranch(branch.id)}
                />
                <span className="truncate">{branch.name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card shadow-xs">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            Yuklanmoqda...
          </div>
        ) : clients.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Tanlangan davr va filiallar bo'yicha xaridor topilmadi.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-surface/70">
                <tr>
                  <th>Mijoz</th>
                  <th>Xarid sanasi</th>
                  <th>Filial</th>
                  <th>Mahsulotlar</th>
                  <th>Summa</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <ClientRow key={client.id} client={client} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="font-mono">
          Sahifa {page} / {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Oldingi
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            Keyingi
          </Button>
        </div>
      </div>
    </div>
  );
}

function ClientRow({ client }: { client: AcousticClient }): JSX.Element {
  return (
    <tr className="transition-colors hover:bg-surface/60">
      <td>
        <div className="font-medium text-foreground">{client.fullName}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
          <span>{client.phones[0] ?? "Telefon yo'q"}</span>
          {client.acoustic?.clientId && <span>API ID: {client.acoustic.clientId}</span>}
        </div>
      </td>
      <td>
        <StatusBadge status={client.acoustic?.status} />
        <div className="mt-1 font-mono text-xs text-muted-foreground">
          {client.acoustic?.purchaseDate ?? "—"}
        </div>
      </td>
      <td>
        <div className="font-medium text-foreground">
          {client.acoustic?.purchaseBranchName ?? "Filial ko'rsatilmagan"}
        </div>
        <div className="mt-0.5 font-mono text-xs text-muted-foreground">
          API ID: {client.acoustic?.purchaseBranchId ?? "—"}
        </div>
      </td>
      <td>
        <ProductsSummary client={client} />
      </td>
      <td className="font-mono text-foreground">
        {formatMoney(client.acoustic?.purchaseAmount)}
      </td>
    </tr>
  );
}

function ProductsSummary({ client }: { client: AcousticClient }): JSX.Element {
  const products = client.acoustic?.products ?? [];
  if (!products.length) {
    return <span className="text-muted-foreground">Mahsulot yo'q</span>;
  }
  const visible = products.slice(0, 2);
  return (
    <div className="max-w-72 space-y-1">
      {visible.map((product, index) => (
        <div key={`${product.product_ref_id ?? index}-${product.product_name ?? "product"}`} className="truncate text-xs text-foreground">
          {product.product_name ?? "Nomalum mahsulot"}
          {product.quantity != null ? <span className="text-muted-foreground"> x{product.quantity}</span> : null}
        </div>
      ))}
      {products.length > visible.length ? (
        <div className="text-xs text-muted-foreground">+{products.length - visible.length} ta mahsulot</div>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: string | undefined }): JSX.Element {
  const meta =
    status === "purchased"
      ? { label: "Sotib olgan", className: "bg-success/15 text-success" }
      : { label: status ?? "Noma'lum", className: "bg-muted text-muted-foreground" };
  return <Badge className={cn("border-0", meta.className)}>{meta.label}</Badge>;
}

function formatMoney(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("uz-UZ").format(value) + " so'm";
}
