import { Trophy, Phone, ChevronRight, ChevronLeft, Clock } from "lucide-react";
import { GREEN, MID, GOLD, GOLD_MUTED, SURFACE, SURFACE2, BORDER, TEXT, TEXT2, TEXT3, WIN_GOLD, LOSS_RED, F_DISPLAY, F_UI } from "../../lib/theme.js";
import { DEFAULT_TOURNAMENTS } from "../../lib/constants.js";
import { getRoundLabel } from "../../lib/utils.js";

export default function DrawsTab({ myEntries, activeTournament, setActiveTournament, setActiveRound, setActiveTab, members, tournaments }) {
  const TOURNAMENTS = tournaments || DEFAULT_TOURNAMENTS;
  const myDrawEntries = myEntries;

  const drawEntry = activeTournament
    ? myDrawEntries.find(e => e.id === activeTournament)
    : null;
  const drawTourn = drawEntry
    ? TOURNAMENTS.find(t => t.id === drawEntry.tournamentId)
    : null;

  if (!activeTournament || !drawEntry) {
    return (
      <div>
        <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "600", color: GOLD_MUTED, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "12px" }}>
          My Competitions · {myDrawEntries.length} entered
        </div>

        {myDrawEntries.length === 0 ? (
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "40px 24px", textAlign: "center", boxShadow: "0 1px 3px rgba(74,14,31,0.06)" }}>
            <Trophy size={32} strokeWidth={1} color={BORDER} style={{ marginBottom: "12px" }} />
            <div style={{ fontFamily: F_DISPLAY, fontSize: "20px", fontWeight: "600", color: TEXT2, marginBottom: "6px" }}>No competitions yet</div>
            <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT3, marginBottom: "20px", lineHeight: 1.5 }}>Go to <strong>My Ties</strong> and tap<br/><strong>+ Enter Tournament</strong> to get started.</div>
            <button onClick={() => setActiveTab("myties")}
              style={{ background: MID, border: "none", borderRadius: "8px", color: "#fff", padding: "10px 24px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600" }}>
              Go to My Ties
            </button>
          </div>
        ) : (
          myDrawEntries.map(entry => {
            const t = TOURNAMENTS.find(t => t.id === entry.tournamentId);
            if (!t) return null;
            const wins   = entry.ties.filter(r => r.result === "W").length;
            const losses = entry.ties.filter(r => r.result === "L").length;
            const byes   = entry.ties.filter(r => r.result === "BYE").length;
            const currentRound = entry.ties.length;
            const statusCol = entry.status === "active" ? GREEN
              : entry.status === "champion" ? WIN_GOLD : LOSS_RED;
            const statusLabel = entry.status === "active" ? "Active"
              : entry.status === "champion" ? "Champion" : "Eliminated";

            return (
              <button key={entry.id} onClick={() => { setActiveTournament(entry.id); setActiveRound(0); }}
                style={{ width: "100%", background: SURFACE, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${t.color || GOLD}`, borderRadius: "12px", padding: "14px 16px", marginBottom: "10px", cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 1px 3px rgba(74,14,31,0.06)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <div style={{ fontFamily: F_DISPLAY, fontSize: "17px", fontWeight: "600", color: GREEN }}>{t.name}</div>
                    <span style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: statusCol, background: `${statusCol}12`, border: `1px solid ${statusCol}33`, borderRadius: "20px", padding: "1px 8px" }}>{statusLabel}</span>
                  </div>
                  <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>
                    {currentRound > 0
                      ? `Round ${currentRound} of ${entry.totalRounds} · ${wins}W ${losses}L${byes ? ` ${byes} Bye` : ""}`
                      : `${entry.totalRounds} rounds · Not started`}
                  </div>
                </div>
                <ChevronRight size={18} strokeWidth={1.5} color={TEXT3} />
              </button>
            );
          })
        )}
      </div>
    );
  }

  // ── DETAIL VIEW ──
  const t = drawTourn;
  const acCol = t?.color || GOLD;

  return (
    <div>
      <button onClick={() => setActiveTournament(null)}
        style={{ background: "none", border: "none", color: TEXT2, cursor: "pointer", fontSize: "13px", padding: "0 0 16px", fontFamily: F_UI, display: "inline-flex", alignItems: "center", gap: "4px" }}>
        <ChevronLeft size={14} strokeWidth={2} />Back
      </button>

      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderTop: `4px solid ${acCol}`, borderRadius: "12px", padding: "16px", marginBottom: "16px", boxShadow: "0 1px 3px rgba(74,14,31,0.06)" }}>
        <div style={{ fontFamily: F_DISPLAY, fontSize: "22px", fontWeight: "700", color: GREEN, marginBottom: "2px" }}>{t?.name}</div>
        <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT2 }}>{t?.type} · {drawEntry.totalRounds} rounds · {drawEntry.ties.length} played</div>
        <div style={{ marginTop: "8px", display: "flex", gap: "8px" }}>
          {[
            { label: "Won",  val: drawEntry.ties.filter(r => r.result === "W").length,   col: WIN_GOLD },
            { label: "Lost", val: drawEntry.ties.filter(r => r.result === "L").length,   col: LOSS_RED },
            { label: "Bye",  val: drawEntry.ties.filter(r => r.result === "BYE").length, col: TEXT3   },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center", background: SURFACE2, borderRadius: "8px", padding: "6px 12px" }}>
              <div style={{ fontFamily: F_DISPLAY, fontSize: "20px", fontWeight: "700", color: s.col }}>{s.val}</div>
              <div style={{ fontFamily: F_UI, fontSize: "9px", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {drawEntry.ties.length === 0 ? (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "32px", textAlign: "center" }}>
          <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT3 }}>No rounds recorded yet. Go to My Ties to enter your first opponent.</div>
        </div>
      ) : (
        <div>
          <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "600", color: GOLD_MUTED, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "10px" }}>Round by Round</div>
          {drawEntry.ties.map((tie, i) => {
            const isWin  = tie.result === "W";
            const isLoss = tie.result === "L";
            const isBye  = tie.result === "BYE";
            const isPending = !tie.result;
            const borderCol = isWin ? WIN_GOLD : isLoss ? LOSS_RED : isBye ? GOLD_MUTED : BORDER;
            const oppMember = members.find(m => m.name.toUpperCase() === (tie.opponent || "").toUpperCase());
            return (
              <div key={i} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${borderCol}`, borderRadius: "12px", padding: "14px 16px", marginBottom: "8px", boxShadow: "0 1px 3px rgba(74,14,31,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                  <div>
                    <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "3px" }}>{tie.roundLabel}</div>
                    <div style={{ fontFamily: F_DISPLAY, fontSize: "17px", fontWeight: "600", color: TEXT }}>
                      {isBye ? "Bye" : (tie.opponent || "TBC")}
                    </div>
                    {oppMember?.phone && !isBye && (
                      <a href={`tel:${oppMember.phone.replace(/\s/g,"")}`}
                        style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", color: GOLD, textDecoration: "none", fontFamily: F_UI, fontWeight: "500", marginTop: "2px" }}>
                        <Phone size={12} strokeWidth={1.75} />{oppMember.phone}
                      </a>
                    )}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {isWin && <div style={{ fontFamily: F_DISPLAY, fontSize: "22px", fontWeight: "700", color: WIN_GOLD, lineHeight: 1 }}>{tie.myScore}–{tie.oppScore}</div>}
                    {isLoss && <div style={{ fontFamily: F_DISPLAY, fontSize: "22px", fontWeight: "700", color: LOSS_RED, lineHeight: 1 }}>{tie.myScore}–{tie.oppScore}</div>}
                    {isBye && <div style={{ fontFamily: F_UI, fontSize: "11px", color: GOLD_MUTED, fontWeight: "500" }}>Advanced</div>}
                    {isPending && <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>Pending</div>}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "600",
                    color: isWin ? WIN_GOLD : isLoss ? LOSS_RED : isBye ? GOLD_MUTED : TEXT3 }}>
                    {isWin ? "Won" : isLoss ? "Lost" : isBye ? "Bye" : "Not played yet"}
                  </span>
                  {tie.date && (
                    <span style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, display: "flex", alignItems: "center", gap: "3px" }}>
                      <Clock size={11} strokeWidth={1.75} />{new Date(tie.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {Array.from({ length: drawEntry.totalRounds - drawEntry.ties.length }, (_, i) => (
            <div key={`future-${i}`} style={{ background: SURFACE2, border: `1px dashed ${BORDER}`, borderRadius: "12px", padding: "14px 16px", marginBottom: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT3 }}>
                {getRoundLabel(drawEntry.ties.length + i, drawEntry.totalRounds)}
              </div>
              <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>Upcoming</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
