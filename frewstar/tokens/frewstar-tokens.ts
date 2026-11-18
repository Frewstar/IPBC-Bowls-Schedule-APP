/* @frewstar/tokens v1.2.0 sha256:dd6dc707423294b01ef1ce862432e93622128cf79c6917740af5b7bb98eb49d8 — generated, do not edit in apps */
/*
 * Frewstar design tokens, as data. The same values as frewstar-tokens.css,
 * generated from the same source, for JS use and tests.
 */

export const version = "1.2.0";

export type Mode = "light" | "dark";

/** Raw values. The same in both modes. */
export const primitives = {
  "--fs-gold-400": "#F0C674",
  "--fs-gold-500": "#E8B45A",
  "--fs-gold-600": "#D4A24A",
  "--fs-ink-950": "#0A0A0A",
  "--fs-ink-900": "#111010",
  "--fs-ink-850": "#141414",
  "--fs-ink-800": "#1C1C1C",
  "--fs-ink-750": "#262626",
  "--fs-ink-700": "#3F3A32",
  "--fs-ink-600": "#5A5A5A",
  "--fs-ink-500": "#6B6457",
  "--fs-ink-450": "#7A7264",
  "--fs-ink-400": "#9A9284",
  "--fs-ink-300": "#999999",
  "--fs-paper-0": "#FFFFFF",
  "--fs-paper-50": "#F6F3EE",
  "--fs-paper-100": "#ECE6DC",
  "--fs-paper-200": "#E7E1D6",
  "--fs-paper-300": "#CFC6B6",
  "--fs-white-a06": "rgba(255, 255, 255, 0.06)",
  "--fs-white-a08": "rgba(255, 255, 255, 0.08)",
  "--fs-white-a10": "rgba(255, 255, 255, 0.10)",
  "--fs-green-400": "#38D9A9",
  "--fs-green-700": "#2D6A4F",
  "--fs-amber-500": "#F5842A",
  "--fs-red-500": "#C94040",
  "--fs-red-600": "#B3261E",
  "--fs-red-300": "#F28B82",
  "--fs-scrim-light": "rgba(17, 16, 16, 0.45)",
  "--fs-scrim-dark": "rgba(0, 0, 0, 0.62)",
} as const;

/** What each value is for: shared by both modes, then per mode. */
export const semantic = {
  shared: {
    "--fs-accent": "var(--fs-gold-500)",
    "--fs-accent-strong": "color-mix(in srgb, var(--fs-accent) 85%, #000000)",
    "--fs-accent-soft": "color-mix(in srgb, var(--fs-accent) 15%, transparent)",
    "--fs-accent-on": "var(--fs-ink-950)",
    "--fs-accent-secondary": "var(--fs-accent)",
    "--fs-accent-fill": "var(--fs-accent)",
    "--fs-accent-text": "var(--fs-accent)",
    "--fs-accent-mark": "var(--fs-accent)",
    "--fs-accent-fill-edge": "0 0 0 0 transparent",
    "--fs-status-available": "var(--fs-green-400)",
    "--fs-status-attention": "var(--fs-amber-500)",
    "--fs-status-failed": "var(--fs-red-500)",
    "--fs-font-display": "'Poppins', system-ui, sans-serif",
    "--fs-font-body": "'Poppins', system-ui, sans-serif",
  },
  light: {
    "--fs-surface-canvas": "var(--fs-paper-0)",
    "--fs-surface-default": "var(--fs-paper-50)",
    "--fs-surface-raised": "var(--fs-paper-0)",
    "--fs-surface-hover": "var(--fs-paper-100)",
    "--fs-scrim": "var(--fs-scrim-light)",
    "--fs-fg-primary": "var(--fs-ink-900)",
    "--fs-fg-muted": "var(--fs-ink-500)",
    "--fs-fg-disabled": "var(--fs-ink-400)",
    "--fs-line-faint": "var(--fs-paper-100)",
    "--fs-line-default": "var(--fs-paper-200)",
    "--fs-line-strong": "var(--fs-paper-300)",
    "--fs-status-success": "var(--fs-green-700)",
    "--fs-status-failed-text": "var(--fs-red-600)",
  },
  dark: {
    "--fs-surface-canvas": "var(--fs-ink-950)",
    "--fs-surface-default": "var(--fs-ink-850)",
    "--fs-surface-raised": "var(--fs-ink-800)",
    "--fs-surface-hover": "var(--fs-ink-750)",
    "--fs-scrim": "var(--fs-scrim-dark)",
    "--fs-fg-primary": "var(--fs-paper-0)",
    "--fs-fg-muted": "var(--fs-ink-300)",
    "--fs-fg-disabled": "var(--fs-ink-600)",
    "--fs-line-faint": "var(--fs-white-a06)",
    "--fs-line-default": "var(--fs-white-a08)",
    "--fs-line-strong": "var(--fs-white-a10)",
    "--fs-status-success": "var(--fs-green-400)",
    "--fs-status-failed-text": "var(--fs-red-300)",
  },
} as const;

/** Shape and motion: shared by both modes, then per mode. */
export const component = {
  shared: {
    "--fs-radius-pill": "999px",
    "--fs-radius-card": "20px",
    "--fs-radius-input": "12px",
    "--fs-radius-inset": "8px",
    "--fs-touch": "44px",
    "--fs-button-height": "48px",
    "--fs-space-unit": "4px",
    "--fs-space-1": "4px",
    "--fs-space-2": "8px",
    "--fs-space-3": "12px",
    "--fs-space-4": "16px",
    "--fs-space-5": "20px",
    "--fs-space-6": "24px",
    "--fs-space-8": "32px",
    "--fs-space-10": "40px",
    "--fs-space-12": "48px",
    "--fs-space-16": "64px",
    "--fs-space-20": "80px",
    "--fs-dur-tap": "180ms",
    "--fs-dur-quick": "220ms",
    "--fs-dur-enter": "320ms",
    "--fs-dur-exit": "220ms",
    "--fs-dur-max": "600ms",
    "--fs-dur-screen-enter": "280ms",
    "--fs-dur-screen-exit": "200ms",
    "--fs-dur-toast-enter": "250ms",
    "--fs-dur-toast-exit": "200ms",
    "--fs-dur-expand": "250ms",
    "--fs-stagger-step": "40ms",
    "--fs-ease-enter": "cubic-bezier(0.2, 0, 0, 1)",
    "--fs-ease-exit": "cubic-bezier(0.4, 0, 1, 1)",
    "--fs-ease-standard": "cubic-bezier(0.2, 0, 0.2, 1)",
    "--fs-move-sm": "8px",
    "--fs-move-md": "16px",
    "--fs-press-scale": "0.97",
    "--fs-ease-emphasized": "var(--fs-ease-enter)",
    "--fs-duration-fast": "var(--fs-dur-tap)",
    "--fs-duration-slow": "var(--fs-dur-enter)",
  },
  light: {
    "--fs-shadow-sm": "0 1px 3px rgba(17, 16, 16, 0.10)",
    "--fs-shadow-md": "0 18px 40px rgba(17, 16, 16, 0.14)",
    "--fs-shadow-lg": "0 24px 50px rgba(0, 0, 0, 0.38)",
  },
  dark: {
    "--fs-shadow-sm": "0 1px 3px rgba(0, 0, 0, 0.60)",
    "--fs-shadow-md": "0 6px 20px -6px rgba(0, 0, 0, 0.85)",
    "--fs-shadow-lg": "0 18px 50px -12px rgba(0, 0, 0, 0.90)",
  },
} as const;

/** The motion tokens under "reduce motion" (the OS setting, or data-fs-motion="reduce" on <html>). */
export const reducedMotion = {
  "--fs-dur-tap": "180ms",
  "--fs-dur-quick": "200ms",
  "--fs-dur-enter": "200ms",
  "--fs-dur-exit": "200ms",
  "--fs-dur-max": "200ms",
  "--fs-dur-screen-enter": "200ms",
  "--fs-dur-screen-exit": "200ms",
  "--fs-dur-toast-enter": "200ms",
  "--fs-dur-toast-exit": "200ms",
  "--fs-dur-expand": "200ms",
  "--fs-stagger-step": "0ms",
  "--fs-move-sm": "0px",
  "--fs-move-md": "0px",
  "--fs-press-scale": "1",
} as const;

export type PrimitiveName = keyof typeof primitives;
export type SemanticName = keyof typeof semantic.shared | keyof typeof semantic.light;
export type ComponentName = keyof typeof component.shared | keyof typeof component.light;
export type TokenName = PrimitiveName | SemanticName | ComponentName;

/**
 * A token's value in a mode, following var() references to the end. A value
 * that is not a bare var() (a color-mix(), a font stack) comes back as written.
 * The reducedMotion option reads the motion tokens as they are under "reduce motion".
 */
export function resolve(name: TokenName, mode: Mode = "light", options: { reducedMotion?: boolean } = {}): string {
  const table: Record<string, string> = {
    ...primitives,
    ...semantic.shared,
    ...semantic[mode],
    ...component.shared,
    ...component[mode],
    ...(options.reducedMotion ? reducedMotion : {}),
  };
  let value: string = table[name] ?? "";
  for (let hops = 0; hops < 10; hops++) {
    const next = /^var\((--fs-[a-z0-9-]+)\)$/.exec(value)?.[1];
    const found = next === undefined ? undefined : table[next];
    if (found === undefined) return value;
    value = found;
  }
  return value;
}

/**
 * Text colour for an accent: near-black ("#0A0A0A") or white, whichever has the higher
 * WCAG contrast. The same rule as Studio's onAccentFor(). CSS cannot make this
 * choice, so an app with a dark accent sets --fs-accent-on in its brand file.
 */
export function onAccentFor(hex: string): string {
  const nearBlack = primitives["--fs-ink-950"];
  const white = primitives["--fs-paper-0"];
  return contrast(hex, nearBlack) >= contrast(hex, white) ? nearBlack : white;
}

/** WCAG 2.x contrast ratio between two #RGB / #RRGGBB colours. */
export function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function luminance(hex: string): number {
  const body = hex.replace("#", "");
  const full = body.length === 3 ? body.split("").map((c) => c + c).join("") : body;
  const channel = (i: number) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}
