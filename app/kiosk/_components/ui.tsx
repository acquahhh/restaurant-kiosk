"use client";

import { forwardRef } from "react";

type Variant = "hero" | "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "xl";

const VARIANTS: Record<Variant, string> = {
  // The one most important action on a screen.
  hero: "bg-plantain text-ink active:bg-plantain-deep disabled:bg-sand-deep disabled:text-ink-muted",
  primary: "bg-palm text-white active:bg-palm-deep disabled:bg-sand-deep disabled:text-ink-muted",
  secondary: "bg-sand text-ink active:bg-sand-deep disabled:text-ink-muted",
  ghost: "bg-transparent text-ink active:bg-sand disabled:text-ink-muted",
  danger: "bg-transparent text-pepper active:bg-pepper-soft disabled:text-ink-muted",
};

const SIZES: Record<Size, string> = {
  md: "min-h-touch px-6 text-xl",
  lg: "min-h-touch-lg px-10 text-2xl",
  xl: "min-h-[120px] px-12 text-4xl font-bold",
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(function Button({ variant = "primary", size = "md", className = "", type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center gap-3 rounded-button font-semibold transition-[background-color,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${className.includes("justify-") ? "" : "justify-center"} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    />
  );
});

/** Minus / count / plus. Minus at 1 calls onChange(0) only when allowZero is set. */
export function Stepper({
  value, onChange, min = 1, max = 20, label, allowZero = false, compact = false,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  label: string;
  allowZero?: boolean;
  compact?: boolean;
}) {
  const floor = allowZero ? 0 : min;
  const size = compact ? "h-14 w-14 text-2xl" : "h-touch w-touch text-3xl";
  return (
    <div className="inline-flex items-center gap-1 rounded-button bg-sand p-1" role="group" aria-label={label}>
      <button
        type="button"
        className={`${size} rounded-[10px] font-semibold active:bg-sand-deep disabled:text-ink-muted/40`}
        onClick={() => onChange(Math.max(floor, value - 1))}
        disabled={value <= floor}
        aria-label={`Decrease ${label}`}
      >
        <MinusIcon />
      </button>
      <output className={`${compact ? "w-10 text-xl" : "w-14 text-2xl"} text-center font-bold tabular-nums`} aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className={`${size} rounded-[10px] font-semibold active:bg-sand-deep disabled:text-ink-muted/40`}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`Increase ${label}`}
      >
        <PlusIcon />
      </button>
    </div>
  );
}

/* Icons: only functional ones, drawn as simple strokes. */
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function PlusIcon({ className = "mx-auto h-6 w-6" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke}><path d="M12 5v14M5 12h14" /></svg>;
}
export function MinusIcon({ className = "mx-auto h-6 w-6" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke}><path d="M5 12h14" /></svg>;
}
export function BackIcon({ className = "h-7 w-7" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke}><path d="M15 5l-7 7 7 7" /></svg>;
}
export function CloseIcon({ className = "h-7 w-7" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke}><path d="M6 6l12 12M18 6L6 18" /></svg>;
}
export function SearchIcon({ className = "h-7 w-7" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>;
}
export function CheckIcon({ className = "h-6 w-6" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}

/** Modal shell used by the customize sheet and confirmation dialogs. */
export function Dialog({
  open, onClose, labelledBy, children, className = "",
}: {
  open: boolean;
  onClose?: () => void;
  labelledBy: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
      <div className="absolute inset-0 bg-ink/55 animate-[fade-in_180ms_ease-out]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`relative flex max-h-full flex-col overflow-hidden rounded-panel bg-canvas shadow-[0_24px_80px_rgba(28,27,24,0.35)] animate-[sheet-in_240ms_cubic-bezier(0.22,1,0.36,1)] ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
