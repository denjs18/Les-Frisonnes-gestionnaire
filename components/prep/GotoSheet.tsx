"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/controls";
import { ArrowLeftIcon, CheckIcon } from "@/components/icons";
import { Button } from "@/components/ui";
import { count, formatQuantity } from "@/lib/format";
import { positionOf, type Plan, type Position } from "@/lib/steps";

interface Props {
  plan: Plan;
  /** Indice de l'étape en cours dans `plan.steps` : ce qui précède est déjà fait. */
  currentIndex: number;
  onGo: (position: Position) => void;
  onClose: () => void;
}

const rowClass = (current: boolean) =>
  `flex w-full min-h-14 items-center gap-3 rounded-2xl border-2 px-3 py-2 text-left transition active:scale-[0.99] ${
    current ? "border-primary bg-primary-soft" : "border-line bg-surface hover:bg-surface-2"
  }`;

const hereBadge = (
  <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-black uppercase tracking-wide text-primary-fg">En cours</span>
);

/**
 * « Aller à… » : reprendre à un produit ou à un client précis, sans la voix.
 * D'abord le produit (la liste de tous les produits), puis l'étape : le total, ou l'un des clients.
 */
export function GotoSheet({ plan, currentIndex, onGo, onClose }: Props) {
  const current = plan.steps[currentIndex];
  const [productIndex, setProductIndex] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hereRef = useRef<HTMLButtonElement>(null);

  // Retour en haut de la liste à chaque changement de vue ; à l'ouverture, le produit en cours est mis en vue.
  useEffect(() => {
    const scroller = wrapperRef.current?.parentElement;
    if (productIndex === null) hereRef.current?.scrollIntoView({ block: "center" });
    else scroller?.scrollTo({ top: 0 });
  }, [productIndex]);

  const product = productIndex === null ? null : plan.products[productIndex];

  return (
    <Sheet title={product ? product.name : "Aller à…"} onClose={onClose}>
      <div ref={wrapperRef} className="flex flex-col gap-3" data-testid="goto-sheet">
        {product === null || productIndex === null ? (
          <>
            <p className="text-base font-semibold text-muted">Choisissez le produit :</p>
            <ul className="flex flex-col gap-2">
              {plan.products.map((candidate, index) => {
                const isCurrent = current?.productIndex === index;
                const done = current !== undefined && index < current.productIndex;
                return (
                  <li key={candidate.colPos}>
                    <button
                      type="button"
                      ref={isCurrent ? hereRef : undefined}
                      onClick={() => setProductIndex(index)}
                      className={`${rowClass(isCurrent)} ${done ? "opacity-70" : ""}`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-base font-black tabular-nums">
                        {done ? <CheckIcon className="text-lg" /> : index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-lg font-extrabold leading-tight">{candidate.name}</span>
                        <span className="block text-sm text-muted">
                          {count(candidate.clients.length, "client", "clients")} · total {formatQuantity(candidate.total)}
                        </span>
                      </span>
                      {isCurrent && hereBadge}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <>
            <Button variant="ghost" className="self-start !px-3" onClick={() => setProductIndex(null)}>
              <ArrowLeftIcon className="text-xl" />
              Tous les produits
            </Button>
            <p className="text-base font-semibold text-muted">Reprendre à :</p>
            <ul className="flex flex-col gap-2">
              {plan.steps.map((step, stepIndex) => {
                if (step.productIndex !== productIndex) return null;
                const isCurrent = stepIndex === currentIndex;
                const done = stepIndex < currentIndex;
                return (
                  <li key={step.id}>
                    <button
                      type="button"
                      onClick={() => onGo(positionOf(step))}
                      className={`${rowClass(isCurrent)} ${done ? "opacity-70" : ""}`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-base font-black tabular-nums">
                        {done ? <CheckIcon className="text-lg" /> : step.stepNumber}
                      </span>
                      <span className="min-w-0 flex-1 break-words text-lg font-extrabold leading-tight">
                        {step.kind === "total" ? "Total à sortir" : step.clientName}
                      </span>
                      <span className="shrink-0 text-2xl font-black tabular-nums">{formatQuantity(step.quantity)}</span>
                      {isCurrent && hereBadge}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Sheet>
  );
}
