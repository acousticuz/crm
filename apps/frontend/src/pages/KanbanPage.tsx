export function KanbanPage(): JSX.Element {
  const columns = ["Yangi", "Bog'lanildi", "Taklif", "Tasdiqlandi", "Yutdi"];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Kanban</h1>
        <p className="text-sm text-muted-foreground">
          To'liq drag-and-drop Kanban M3 milestone'da ishlaydi.
        </p>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div
            key={col}
            className="min-w-[240px] flex-1 rounded-lg border bg-muted/30 p-3"
          >
            <p className="mb-2 text-sm font-medium">{col}</p>
            <p className="text-xs text-muted-foreground">Kartalar yo'q</p>
          </div>
        ))}
      </div>
    </div>
  );
}
