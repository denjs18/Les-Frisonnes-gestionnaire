"use client";

import { useApp } from "@/components/AppProvider";
import { Button } from "@/components/ui";
import { columnLabel, rowLabel } from "@/lib/analysis";
import { canReactivate, COLUMN_REASONS, ROW_REASONS } from "@/lib/labels";

interface Item {
  index: number;
  name: string;
  reasonText: string;
  reactivate: "on" | "off-removal" | null;
}

function ItemList({ title, items, onReactivate }: { title: string; items: Item[]; onReactivate: (item: Item) => void }) {
  if (items.length === 0) return null;
  return (
    <details className="rounded-2xl border border-line bg-surface px-4 py-2">
      <summary className="min-h-12 cursor-pointer py-2 text-lg font-bold">
        {title} ({items.length})
      </summary>
      <ul>
        {items.map((item) => (
          <li key={item.index} className="flex items-center gap-3 border-t border-line py-3">
            <div className="min-w-0 flex-1">
              <p className="break-words font-bold">{item.name}</p>
              <p className="text-sm text-muted">{item.reasonText}</p>
            </div>
            {item.reactivate && (
              <Button variant="secondary" className="shrink-0" onClick={() => onReactivate(item)}>
                Réactiver
              </Button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Les produits et clients ignorés, avec la raison et la possibilité de les réactiver. */
export function IgnoredLists() {
  const { state, view, dispatch } = useApp();
  const session = state.session;
  if (!session || !view) return null;
  const { model } = session;
  const { analysis } = view;

  const columns: Item[] = analysis.columns.flatMap((status, index) =>
    status.active || !status.reason
      ? []
      : [
          {
            index,
            name: columnLabel(model.columns[index]),
            reasonText: COLUMN_REASONS[status.reason].long,
            reactivate: status.reason === "manual" ? ("off-removal" as const) : canReactivate(status.reason) ? ("on" as const) : null,
          },
        ],
  );
  const rows: Item[] = analysis.rows.flatMap((status, index) =>
    status.active || !status.reason
      ? []
      : [
          {
            index,
            name: rowLabel(model.rows[index]),
            reasonText: ROW_REASONS[status.reason].long,
            reactivate: status.reason === "manual" ? ("off-removal" as const) : canReactivate(status.reason) ? ("on" as const) : null,
          },
        ],
  );

  return (
    <div className="flex flex-col gap-3">
      <ItemList
        title="Produits ignorés"
        items={columns}
        onReactivate={(item) => dispatch({ type: "setColumnOverride", c: item.index, value: item.reactivate === "on" ? "on" : null })}
      />
      <ItemList
        title="Clients ignorés"
        items={rows}
        onReactivate={(item) => dispatch({ type: "setRowOverride", r: item.index, value: item.reactivate === "on" ? "on" : null })}
      />
    </div>
  );
}
