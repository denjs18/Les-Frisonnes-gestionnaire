"use client";

import { useApp } from "@/components/AppProvider";
import { Sheet } from "@/components/controls";
import { Banner, Button } from "@/components/ui";
import { columnLabel, rowLabel, type Override } from "@/lib/analysis";
import { canReactivate, COLUMN_REASONS, ROW_REASONS } from "@/lib/labels";
import type { ColumnReason, RowReason } from "@/lib/rules";

interface Props {
  kind: "column" | "row";
  index: number;
  onClose: () => void;
}

/** Détail d'un produit (colonne) ou d'un client (ligne) : est-il retenu, pourquoi pas, et comment le changer. */
export function ItemSheet({ kind, index, onClose }: Props) {
  const { state, view, dispatch } = useApp();
  const session = state.session;
  if (!session || !view) return null;

  const isColumn = kind === "column";
  const status = isColumn ? view.analysis.columns[index] : view.analysis.rows[index];
  if (!status) return null;
  const { model } = session;
  const name = isColumn ? columnLabel(model.columns[index]) : rowLabel(model.rows[index]);
  const where = isColumn ? `Colonne ${model.columns[index].letter} du fichier` : `Ligne ${model.rows[index].number} du fichier`;
  const noun = isColumn ? "produit" : "client";
  const reason = status.reason;
  const reasonText = reason
    ? (isColumn ? COLUMN_REASONS[reason as ColumnReason] : ROW_REASONS[reason as RowReason]).long
    : null;

  const setOverride = (value: Override | null) => {
    dispatch(isColumn ? { type: "setColumnOverride", c: index, value } : { type: "setRowOverride", r: index, value });
    onClose();
  };

  return (
    <Sheet title={name} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm font-semibold text-muted">{where}</p>

        {status.active ? (
          <Banner tone="ok" icon={false}>
            Ce {noun} est <strong>utilisé</strong> pour la préparation.
            {status.forced && " Vous l'avez réactivé à la main."}
          </Banner>
        ) : (
          <Banner tone="warn">
            Ce {noun} est <strong>ignoré</strong>. {reasonText}
          </Banner>
        )}

        <div className="flex flex-col gap-2">
          {status.active && (
            <Button variant="secondary" size="lg" onClick={() => setOverride("off")}>
              Ignorer ce {noun}
            </Button>
          )}
          {!status.active && reason === "manual" && (
            <Button variant="primary" size="lg" onClick={() => setOverride(null)}>
              Réactiver ce {noun}
            </Button>
          )}
          {!status.active && reason !== null && reason !== "manual" && canReactivate(reason) && (
            <Button variant="primary" size="lg" onClick={() => setOverride("on")}>
              Réactiver ce {noun}
            </Button>
          )}
          <Button variant="ghost" size="lg" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
