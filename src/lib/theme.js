// ── COLOUR PALETTE & FONTS ─────────────────────────────────────────────────
//
// Frewstar tokens. The app's colours and fonts now have one source: the
// Frewstar family tokens in frewstar/tokens/ (synced from the frewstar-ui
// repo, never edited here) plus this app's own frewstar/frewstar-brand.css,
// which holds every value below. src/main.jsx loads both.
//
// Two kinds of constant, and the difference matters:
//
//   var(--fs-…)   Points at a token. Safe ONLY because every place that reads
//                 it passes it straight into a style as a whole value.
//
//   "#rrggbb"     Still a literal, deliberately. These are read in ways a
//                 var() cannot survive:
//                   - hex-alpha glued on the end, e.g. `${GOLD}44` or
//                     GREEN + "22" (about 190 sites) — "var(--x)44" is not a
//                     colour, so the browser would drop the whole declaration;
//                   - lucide icons' `color=` and SVG `stroke=` attributes
//                     (BORDER, TEXT3, GOLD_MUTED…), where var() support in a
//                     presentation attribute is not something to bet on.
//                 Moving one of these means rewriting its call sites first.
//                 test/tokens.test.mjs checks each literal still equals the
//                 value frewstar-brand.css gives its token, so the two
//                 cannot drift apart.

// Pointed at tokens (values in frewstar/frewstar-brand.css):
export const BG         = "var(--fs-surface-canvas)";   // #faf8f5
export const SURFACE    = "var(--fs-surface-raised)";   // #ffffff
export const SURFACE2   = "var(--fs-surface-default)";  // #f5f0eb
export const TEXT       = "var(--fs-fg-primary)";       // #1a0a0e
export const TEXT2      = "var(--fs-fg-muted)";         // #6b5a5e

export const F_DISPLAY  = "var(--fs-font-display)";     // 'Cormorant Garamond', Georgia, serif
export const F_SANS     = "var(--fs-font-body)";        // 'Inter', system-ui, sans-serif
export const F_UI       = F_SANS;

// Still literal — see above. The token each one matches is named beside it.
export const GREEN      = "#6b1d2e";   // --fs-accent
export const MID        = "#6b1d2e";   // --fs-accent
export const GOLD       = "#c9a84c";   // --fs-accent-secondary
export const GOLD_LIGHT = "#e8c56a";   // (app-only, no token)
export const LIGHT      = "#c9a84c";   // --fs-accent-secondary
export const LADIES     = "#5a0a2a";   // (app-only, no token)
export const LADIES_MID = "#8b1a40";   // (app-only, no token)

export const BORDER     = "#e8e0d5";   // --fs-line-default
export const BRAND_HI   = "#8b2439";   // (app-only, no token)
export const GOLD_MUTED = "#9a7a2e";   // (app-only, no token)
export const TEXT3      = "#9e8a8e";   // --fs-fg-disabled

export const WIN_GOLD   = "#c9a84c";   // --fs-accent-secondary
export const LOSS_RED   = "#c0392b";   // --fs-status-failed
export const WIN_BG     = "#fffbf0";   // (app-only, no token)
export const LOSS_BG    = "#fdf5f5";   // (app-only, no token)
