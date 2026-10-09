import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { AlertIcon, ArrowLeftIcon, CheckIcon, HelpIcon, SettingsIcon } from "./icons";

export type Variant = "primary" | "secondary" | "ghost" | "danger" | "ok" | "warn";
export type Size = "md" | "lg" | "xl" | "none";

const BASE =
  "inline-flex items-center justify-center gap-2 text-center font-bold leading-tight select-none transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-primary-fg shadow-sm hover:brightness-110",
  secondary: "border-2 border-line bg-surface text-fg hover:bg-surface-2",
  ghost: "bg-transparent text-fg hover:bg-surface-2",
  danger: "bg-danger text-danger-fg hover:brightness-110",
  ok: "bg-ok text-ok-fg hover:brightness-110",
  warn: "bg-warn text-warn-fg hover:brightness-105",
};

const SIZES: Record<Size, string> = {
  md: "min-h-12 rounded-xl px-4 text-base",
  lg: "min-h-14 rounded-2xl px-5 text-lg",
  xl: "min-h-20 rounded-3xl px-6 text-2xl",
  none: "",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra = ""): string {
  return [BASE, VARIANTS[variant], SIZES[size], extra].filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size };

export function Button({ variant, size, className, ...props }: ButtonProps) {
  return <button type="button" className={buttonClass(variant, size, className)} {...props} />;
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-surface p-4 shadow-sm ${className}`}>{children}</section>;
}

const BANNER_TONES = {
  warn: "border-warn bg-warn-soft text-fg",
  danger: "border-danger bg-danger-soft text-fg",
  info: "border-primary bg-primary-soft text-fg",
  ok: "border-ok bg-ok-soft text-fg",
} as const;

export function Banner({
  tone = "info",
  children,
  icon = true,
  className = "",
  ...props
}: {
  tone?: keyof typeof BANNER_TONES;
  children: ReactNode;
  icon?: boolean;
  className?: string;
} & Omit<ComponentProps<"div">, "children" | "className">) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl border-2 p-3 text-base ${BANNER_TONES[tone]} ${className}`} {...props}>
      {icon && tone === "ok" && <CheckIcon className="mt-0.5 shrink-0 text-xl" />}
      {icon && tone === "info" && <HelpIcon className="mt-0.5 shrink-0 text-xl" />}
      {icon && (tone === "warn" || tone === "danger") && <AlertIcon className="mt-0.5 shrink-0 text-xl" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Liens Aide et Réglages, présents dans les en-têtes. */
export function HeaderLinks() {
  return (
    <>
      <Link href="/aide" aria-label="Aide" className={buttonClass("ghost", "md", "!px-3 text-2xl")}>
        <HelpIcon />
      </Link>
      <Link href="/reglages" aria-label="Réglages" className={buttonClass("ghost", "md", "!px-3 text-2xl")}>
        <SettingsIcon />
      </Link>
    </>
  );
}

export function ScreenHeader({
  title,
  backHref,
  backLabel = "Retour",
  actions,
}: {
  title: string;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-1 px-2 py-2">
        {backHref && (
          <Link href={backHref} aria-label={backLabel} className={buttonClass("ghost", "md", "!px-3 text-2xl")}>
            <ArrowLeftIcon />
          </Link>
        )}
        <h1 className={`min-w-0 flex-1 truncate text-xl font-extrabold ${backHref ? "" : "pl-2"}`}>{title}</h1>
        <nav className="flex shrink-0 items-center gap-1">{actions ?? <HeaderLinks />}</nav>
      </div>
    </header>
  );
}

/** Zone de contenu centrée, avec la marge de sécurité des iPhone en bas. */
export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <main className={`mx-auto w-full max-w-3xl flex-1 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 ${className}`}>
      {children}
    </main>
  );
}

export function Skeleton({ label = "Chargement…" }: { label?: string }) {
  return (
    <div role="status" className="mx-auto flex min-h-[50dvh] w-full max-w-3xl items-center justify-center p-8 text-lg text-muted">
      {label}
    </div>
  );
}
