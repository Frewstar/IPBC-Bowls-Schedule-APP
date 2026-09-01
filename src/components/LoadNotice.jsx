import { RefreshCw, CloudOff, Inbox } from "lucide-react";
import { SURFACE, SURFACE2, BORDER, TEXT, TEXT2, TEXT3, GOLD_MUTED, F_SANS, F_UI } from "../lib/theme.js";

// ════════════════════════════════════════════════════════════════════════════
//  LoadNotice — the four honest answers to "why is there nothing here?"
//
//  Pairs with useRemoteData. The app used to have one answer for all of them
//  ("here is Irvine Park's copy"), which is the tenancy bug Track 0 removes.
//  The four cases:
//
//    loading, nothing yet   -> say we are fetching
//    failed,  nothing yet   -> say we could not reach the server, offer retry.
//                              NEVER "no fixtures" — we do not know that.
//    failed,  data on screen -> thin strip above the data: it may be stale.
//    ready,   no rows        -> a real empty state. The club genuinely has none.
//
//  Renders null when there is nothing to say (ready, with data).
// ════════════════════════════════════════════════════════════════════════════

const wrap = {
  background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px",
  padding: "28px 20px", textAlign: "center", margin: "8px 0 16px",
};
const titleStyle = { fontFamily: F_SANS, fontSize: "15px", fontWeight: "700", color: TEXT, marginBottom: "5px" };
const hintStyle  = { fontFamily: F_UI, fontSize: "12px", color: TEXT3, lineHeight: 1.55, maxWidth: "300px", margin: "0 auto" };

function RetryButton({ onRetry }) {
  if (!onRetry) return null;
  return (
    <button onClick={onRetry}
      style={{
        marginTop: "14px", background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "8px",
        color: TEXT2, padding: "9px 16px", fontSize: "12px", fontFamily: F_UI, fontWeight: "600",
        cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", minHeight: "40px",
      }}>
      <RefreshCw size={13} strokeWidth={2} /> Try again
    </button>
  );
}

export default function LoadNotice({
  status,            // "loading" | "ready" | "failed"
  hasData,           // is there anything on screen already?
  onRetry,
  noun = "this",     // "fixtures", "members" — used in the sentences below
  emptyTitle,
  emptyHint,
}) {
  // Something is already rendered and the last read worked — nothing to say.
  if (status === "ready" && hasData) return null;

  if (status === "failed" && hasData) {
    // Stale, not empty. A thin strip so it does not shout over real content.
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap",
        background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "8px",
        padding: "8px 12px", marginBottom: "12px",
        fontFamily: F_UI, fontSize: "11px", color: TEXT2,
      }}>
        <CloudOff size={13} strokeWidth={1.75} color={GOLD_MUTED} />
        <span style={{ flex: 1, minWidth: "140px" }}>Couldn&rsquo;t refresh — showing what was last loaded.</span>
        {onRetry && (
          <button onClick={onRetry}
            style={{ background: "none", border: "none", color: GOLD_MUTED, fontFamily: F_UI, fontSize: "11px", fontWeight: "700", cursor: "pointer", padding: "4px 2px", textDecoration: "underline" }}>
            Retry
          </button>
        )}
      </div>
    );
  }

  if (status === "failed") {
    // We do not know whether there is anything. Do not guess.
    return (
      <div style={wrap}>
        <CloudOff size={26} strokeWidth={1.4} color={TEXT3} style={{ marginBottom: "10px" }} />
        <div style={titleStyle}>Couldn&rsquo;t load {noun}</div>
        <div style={hintStyle}>
          The club&rsquo;s data couldn&rsquo;t be reached. Check your connection — nothing has been lost.
        </div>
        <RetryButton onRetry={onRetry} />
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div style={{ ...wrap, padding: "24px 20px" }}>
        <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3, animation: "pulse 1.4s ease-in-out infinite" }}>
          Loading {noun}…
        </div>
      </div>
    );
  }

  // status === "ready" && !hasData — genuinely empty.
  return (
    <div style={wrap}>
      <Inbox size={26} strokeWidth={1.4} color={TEXT3} style={{ marginBottom: "10px" }} />
      <div style={titleStyle}>{emptyTitle || `No ${noun} yet`}</div>
      {emptyHint && <div style={hintStyle}>{emptyHint}</div>}
    </div>
  );
}
