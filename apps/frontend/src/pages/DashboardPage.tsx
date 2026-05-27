export function DashboardPage(): JSX.Element {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Boshqaruv paneli</h1>
        <p className="text-sm text-muted-foreground">
          KPI va statistika M9 milestone'da qo'shiladi.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {["Qo'ng'iroqlar", "QA ball", "Konversiya"].map((title) => (
          <div key={title} className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="mt-2 text-2xl font-semibold">—</p>
          </div>
        ))}
      </div>
    </div>
  );
}
