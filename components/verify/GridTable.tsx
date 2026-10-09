"use client";

import { useEffect, useRef } from "react";
import { cellKey, columnLabel, rowLabel, type Analysis } from "@/lib/analysis";
import { COLUMN_REASONS, ROW_REASONS } from "@/lib/labels";
import type { Session } from "@/lib/state";
import { cellView, type CellTone } from "@/lib/table";

const TONE_CLASS: Record<CellTone, string> = {
  empty: "text-muted",
  ok: "font-bold",
  warn: "bg-warn font-extrabold text-warn-fg ring-2 ring-inset ring-warn-fg/50",
  kept: "bg-warn-soft font-bold ring-2 ring-inset ring-warn",
  inactive: "bg-surface-2 text-muted opacity-70",
};

/** Largeurs fixes : la colonne des noms de clients, puis chaque colonne de produit. */
const HEAD_WIDTH = "7rem";
const COLUMN_WIDTH = "5rem";

interface Props {
  session: Session;
  analysis: Analysis;
  /** Cellule à garder visible (celle que l'on est en train de modifier). */
  focus: { r: number; c: number } | null;
  onCell: (r: number, c: number) => void;
  onColumn: (c: number) => void;
  onRow: (r: number) => void;
}

export function GridTable({ session, analysis, focus, onCell, onColumn, onRow }: Props) {
  const { model } = session;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focus) return;
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-cell="${focus.r}:${focus.c}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focus]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Tableau des quantités : clients en lignes, produits en colonnes"
      tabIndex={0}
      className="max-h-[58dvh] overflow-auto overscroll-contain rounded-2xl border-2 border-line bg-surface"
    >
      <table
        className="table-fixed border-separate border-spacing-0 text-sm"
        style={{ width: `calc(${HEAD_WIDTH} + ${model.columns.length} * ${COLUMN_WIDTH})` }}
      >
        <colgroup>
          <col style={{ width: HEAD_WIDTH }} />
          {model.columns.map((_, c) => (
            <col key={c} style={{ width: COLUMN_WIDTH }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 top-0 z-30 border-b-2 border-r-2 border-line bg-surface-2 p-2 text-left align-bottom text-xs font-bold text-muted"
            >
              Clients ↓ Produits →
            </th>
            {model.columns.map((column, c) => {
              const status = analysis.columns[c];
              return (
                <th
                  key={c}
                  scope="col"
                  className={`sticky top-0 z-20 border-b-2 border-line p-0 align-bottom ${
                    status.active ? "bg-surface-2" : "bg-surface-2 opacity-70"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onColumn(c)}
                    className="flex h-full min-h-[4.75rem] w-full flex-col items-stretch justify-between gap-1 p-1.5 text-left"
                  >
                    <span className="line-clamp-4 break-words text-[11px] font-bold leading-tight">{columnLabel(column)}</span>
                    {!status.active && status.reason && (
                      <span className="rounded bg-line/70 px-1 text-center text-[10px] font-semibold leading-tight">
                        {COLUMN_REASONS[status.reason].short}
                      </span>
                    )}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row, r) => {
            const status = analysis.rows[r];
            return (
              <tr key={r}>
                <th
                  scope="row"
                  className={`sticky left-0 z-10 border-b border-r-2 border-line bg-surface-2 p-0 text-left ${
                    status.active ? "" : "opacity-70"
                  }`}
                >
                  <button type="button" onClick={() => onRow(r)} className="block min-h-11 w-full px-2 py-1 text-left">
                    <span className="line-clamp-2 break-words text-xs font-bold leading-tight">{rowLabel(row)}</span>
                    {!status.active && status.reason && (
                      <span className="mt-0.5 block text-[10px] font-semibold leading-tight text-muted">
                        {ROW_REASONS[status.reason].short}
                      </span>
                    )}
                  </button>
                </th>
                {model.columns.map((column, c) => {
                  const view = cellView(session.cells[r][c], analysis, r, c, Boolean(session.confirmed[cellKey(r, c)]));
                  const isFocus = focus?.r === r && focus?.c === c;
                  return (
                    <td key={c} className="h-px border-b border-line/60 p-0">
                      <button
                        type="button"
                        data-cell={`${r}:${c}`}
                        onClick={() => onCell(r, c)}
                        aria-label={`${rowLabel(row)}, ${columnLabel(column)} : ${view.text === "" ? "vide" : view.text}${
                          view.tone === "warn" ? ", à vérifier" : ""
                        }`}
                        className={`block h-full min-h-11 w-full scroll-ml-32 scroll-mt-20 truncate px-1 text-center text-base ${TONE_CLASS[view.tone]} ${
                          isFocus ? "outline-4 -outline-offset-4 outline-primary" : ""
                        }`}
                      >
                        {view.text}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
