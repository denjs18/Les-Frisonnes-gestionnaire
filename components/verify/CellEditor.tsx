"use client";

import { useApp } from "@/components/AppProvider";
import { Sheet } from "@/components/controls";
import { CheckIcon, MinusIcon, PlusIcon } from "@/components/icons";
import { Banner, Button } from "@/components/ui";
import { cellKey, columnLabel, rowLabel } from "@/lib/analysis";
import { formatQuantity } from "@/lib/format";
import { COLUMN_REASONS, displayValue, issueMessage, ROW_REASONS } from "@/lib/labels";
import { canKeep, checkCell, cleanIntegerText } from "@/lib/rules";
import type { CellValue } from "@/lib/types";

interface Props {
  r: number;
  c: number;
  onClose: () => void;
  /** Passe à une autre cellule (la prochaine valeur à vérifier). */
  onJump: (r: number, c: number) => void;
}

export function CellEditor({ r, c, onClose, onJump }: Props) {
  const { state, view, dispatch } = useApp();
  const session = state.session;
  if (!session || !view || session.cells[r]?.[c] === undefined) return null;

  const { analysis } = view;
  const { model } = session;
  const value = session.cells[r][c];
  const original = model.cells[r][c];
  const { issue } = checkCell(value);
  const confirmed = Boolean(session.confirmed[cellKey(r, c)]);
  const rowStatus = analysis.rows[r];
  const columnStatus = analysis.columns[c];
  const ignored = !rowStatus.active || !columnStatus.active;

  const base = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const integerText = cleanIntegerText(value);
  const nextPending = analysis.pending.find((p) => !(p.r === r && p.c === c));

  const set = (next: CellValue) => dispatch({ type: "setCell", r, c, value: next });
  const advance = () => (nextPending ? onJump(nextPending.r, nextPending.c) : onClose());

  return (
    <Sheet title={`${rowLabel(model.rows[r])} · ${columnLabel(model.columns[c])}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-center gap-3">
          <Button variant="secondary" size="xl" aria-label="Moins un" className="!px-6" onClick={() => set(Math.max(0, Math.ceil(base) - 1))}>
            <MinusIcon className="text-4xl" />
          </Button>
          <input
            inputMode="numeric"
            enterKeyHint="done"
            pattern="[0-9]*"
            autoComplete="off"
            aria-label="Quantité"
            // La touche « OK » du clavier (Android, iPhone) range le clavier au lieu de rester sans effet.
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            value={typeof value === "number" ? String(value) : ""}
            placeholder={typeof value === "string" ? value : "0"}
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, "").slice(0, 4);
              set(digits === "" ? null : Number(digits));
            }}
            className={`h-20 w-32 min-w-0 rounded-2xl border-2 text-center text-5xl font-black tabular-nums placeholder:text-2xl ${
              issue && !confirmed ? "border-warn bg-warn-soft" : "border-line bg-surface-2"
            }`}
          />
          <Button variant="secondary" size="xl" aria-label="Plus un" className="!px-6" onClick={() => set(Math.floor(base) + 1)}>
            <PlusIcon className="text-4xl" />
          </Button>
        </div>

        {issue && !confirmed && <Banner tone="warn">{issueMessage(issue, value)}</Banner>}
        {issue && confirmed && (
          <Banner tone="ok" icon={false}>
            <span className="flex items-center gap-2 font-semibold">
              <CheckIcon className="text-xl" />
              Valeur gardée telle quelle : {displayValue(value)}
            </span>
          </Banner>
        )}
        {ignored && (
          <Banner tone="info">
            {!rowStatus.active && rowStatus.reason
              ? `Ce client est ignoré (${ROW_REASONS[rowStatus.reason].short}).`
              : columnStatus.reason
                ? `Ce produit est ignoré (${COLUMN_REASONS[columnStatus.reason].short}).`
                : ""}{" "}
            Cette valeur ne sera pas utilisée. Touchez le nom du client ou du produit pour le réactiver.
          </Banner>
        )}
        {value !== original && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            Valeur du fichier : <strong className="text-fg">{original === null ? "vide" : `« ${displayValue(original)} »`}</strong>
            <Button variant="ghost" className="!min-h-10" onClick={() => set(original)}>
              Rétablir
            </Button>
          </p>
        )}

        <div className="flex flex-col gap-2">
          {canKeep(issue) && !confirmed && (
            <Button
              variant="warn"
              size="lg"
              onClick={() => {
                dispatch({ type: "confirmCell", r, c });
                advance();
              }}
            >
              Garder {displayValue(value)} tel quel
            </Button>
          )}
          {integerText !== null && (
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                set(integerText);
                if (checkCell(integerText).issue === null) advance();
              }}
            >
              Convertir « {displayValue(value)} » en nombre ({formatQuantity(integerText)})
            </Button>
          )}
          {value !== null && value !== 0 && (
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                set(0);
                if (issue) advance();
              }}
            >
              Mettre à 0 (sauter ce client)
            </Button>
          )}
          {nextPending && (
            <Button variant="secondary" size="lg" onClick={() => onJump(nextPending.r, nextPending.c)}>
              Valeur suivante à vérifier ({analysis.pending.length - (issue && !confirmed ? 1 : 0)})
            </Button>
          )}
          <Button variant="primary" size="lg" onClick={onClose}>
            OK
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
