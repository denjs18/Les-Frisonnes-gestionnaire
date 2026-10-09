"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Plan } from "@/lib/steps";
import { formatQuantity } from "@/lib/format";

interface Props {
  plan: Plan;
  /** Indice de l'étape en cours dans plan.steps. */
  current: number;
  className?: string;
}

/**
 * Le tableau du fichier en miniature : produits en colonnes, clients en lignes, une ligne TOTAL en haut.
 * La cellule en cours est en jaune, ce qui est déjà fait est estompé.
 */
export function MiniTable({ plan, current, className = "" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => {
    const rows = new Map<number, string>();
    const stepOf = new Map<string, number>();
    plan.steps.forEach((step, index) => {
      stepOf.set(`${step.colPos}:${step.rowPos ?? "T"}`, index);
      if (step.rowPos !== null && step.clientName !== null) rows.set(step.rowPos, step.clientName);
    });
    const clients = [...rows.entries()].sort((a, b) => a[0] - b[0]);
    return { clients, stepOf };
  }, [plan]);

  const currentStep = plan.steps[current];

  // Garde la cellule en cours au centre de la fenêtre du mini-tableau (sans faire défiler la page).
  useEffect(() => {
    const container = containerRef.current;
    const cell = container?.querySelector<HTMLElement>('[data-current="true"]');
    if (!container || !cell) return;
    container.scrollTo({
      left: cell.offsetLeft - (container.clientWidth - cell.offsetWidth) / 2,
      top: cell.offsetTop - (container.clientHeight - cell.offsetHeight) / 2,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [current]);

  return (
    <div
      ref={containerRef}
      data-testid="mini-table"
      role="region"
      aria-label="Tableau en miniature : la cellule en cours est en jaune"
      className={`relative overflow-auto overscroll-contain rounded-xl border-2 border-line bg-surface ${className}`}
    >
      <table className="border-separate border-spacing-0 text-center text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-30 w-20 min-w-20 border-b-2 border-r-2 border-line bg-surface-2" />
            {plan.products.map((product) => {
              const isCurrent = product.colPos === currentStep?.colPos;
              return (
                <th
                  key={product.colPos}
                  scope="col"
                  className={`sticky top-0 z-20 w-12 min-w-12 border-b-2 border-line px-0.5 py-1 align-bottom ${
                    isCurrent ? "bg-primary text-primary-fg" : "bg-surface-2"
                  }`}
                >
                  <span className="line-clamp-3 break-words text-[9px] font-bold leading-[1.1]">{product.name}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th
              scope="row"
              className="sticky left-0 z-10 border-b-2 border-r-2 border-line bg-surface-2 px-1 py-1 text-left text-[10px] font-extrabold"
            >
              TOTAL
            </th>
            {plan.products.map((product) => {
              const index = layout.stepOf.get(`${product.colPos}:T`) ?? -1;
              const isCurrent = index === current;
              return (
                <td
                  key={product.colPos}
                  data-current={isCurrent}
                  className={`border-b-2 border-line px-0.5 py-1 text-sm font-black tabular-nums ${
                    isCurrent
                      ? "bg-accent text-accent-fg outline-4 -outline-offset-4 outline-fg"
                      : index < current
                        ? "text-muted opacity-60"
                        : product.colPos === currentStep?.colPos
                          ? "bg-primary-soft"
                          : ""
                  }`}
                >
                  {formatQuantity(product.total)}
                </td>
              );
            })}
          </tr>
          {layout.clients.map(([rowPos, name]) => {
            const isCurrentRow = rowPos === currentStep?.rowPos;
            return (
              <tr key={rowPos}>
                <th
                  scope="row"
                  className={`sticky left-0 z-10 w-20 max-w-20 truncate border-b border-r-2 border-line px-1 py-1 text-left text-[10px] font-bold ${
                    isCurrentRow ? "bg-accent text-accent-fg" : "bg-surface-2"
                  }`}
                >
                  {name}
                </th>
                {plan.products.map((product) => {
                  const index = layout.stepOf.get(`${product.colPos}:${rowPos}`);
                  const line = product.clients.find((c) => c.rowPos === rowPos);
                  const isCurrent = index === current;
                  const isCurrentColumn = product.colPos === currentStep?.colPos;
                  return (
                    <td
                      key={product.colPos}
                      data-current={isCurrent}
                      className={`border-b border-line/60 px-0.5 py-1 text-sm tabular-nums ${
                        isCurrent
                          ? "bg-accent font-black text-accent-fg outline-4 -outline-offset-4 outline-fg"
                          : index !== undefined && index < current
                            ? "text-muted opacity-50"
                            : isCurrentColumn
                              ? "bg-primary-soft font-bold"
                              : "font-bold"
                      }`}
                    >
                      {line ? formatQuantity(line.quantity) : ""}
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
