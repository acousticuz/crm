// Tiny templating engine for SMS bodies. Supports {key} placeholders only —
// no logic, no escaping, intentionally small. Unknown placeholders are left
// untouched so we don't silently lose data.
//
// The variable map keys mirror the CLAUDE.md §5.5 examples: {ism}, {sana},
// {summa}, and we also support {phone}, {kanal}, {budget} and custom keys.

export function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (full, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      const v = vars[key];
      return v === null || v === undefined ? "" : String(v);
    }
    return full;
  });
}
