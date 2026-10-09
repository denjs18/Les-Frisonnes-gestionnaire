"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { CloseIcon } from "./icons";
import { Button } from "./ui";

/** Fenêtre qui monte du bas de l'écran (<dialog> natif : focus, Échap et fond bloqué gérés par le navigateur). */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      // Un événement « close » tardif (dialogue rouvert entre-temps) ne doit rien fermer.
      onClose={(event) => {
        if (!event.currentTarget.open) onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="rounded-t-3xl border-t-2 border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:border-2">
        <div className="mb-3 flex items-start gap-2">
          <h2 id={titleId} className="min-w-0 flex-1 pt-2 font-serif text-xl font-bold leading-snug">
            {title}
          </h2>
          <Button variant="ghost" aria-label="Fermer" onClick={onClose} className="!px-3 text-2xl">
            <CloseIcon />
          </Button>
        </div>
        <div className="max-h-[68dvh] overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </dialog>
  );
}

/** Interrupteur à grosse zone tactile, avec son libellé. */
export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-base font-bold">
          {label}
        </label>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-9 w-16 shrink-0 rounded-full border-2 transition-colors ${
          checked ? "border-primary bg-primary" : "border-line bg-surface-2"
        }`}
      >
        <span
          className={`absolute top-0.5 h-7 w-7 rounded-full bg-white shadow transition-all ${checked ? "left-8" : "left-0.5"}`}
        />
      </button>
    </div>
  );
}

/** Choix parmi quelques options (taille du texte, thème…), en gros boutons. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-flow-col auto-cols-fr gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={`min-h-12 rounded-xl border-2 px-2 text-base font-bold transition ${
            option.value === value ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface hover:bg-surface-2"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
