import { useState, useEffect } from "react";
import BottomSheet from "./BottomSheet.jsx";
import { GREEN, GOLD_MUTED, BORDER, SURFACE, SURFACE2, TEXT, TEXT2, TEXT3, F_UI, F_SANS, LOSS_RED } from "../lib/theme.js";

const ROUND_LABELS = ["", "1st Round", "2nd Round", "3rd Round", "4th Round", "Semi-Final", "Final"];

export default function DrawResultSheet({ open, onClose, draw, mySlot, myName, currentRound, opponentName, onSave }) {
  const [datePlayed, setDatePlayed]     = useState("");
  const [myScore, setMyScore]           = useState("");
  const [oppScore, setOppScore]         = useState("");
  const [saving, setSaving]             = useState(false);

  useEffect(() => {
    if (open) { setDatePlayed(""); setMyScore(""); setOppScore(""); setSaving(false); }
  }, [open, mySlot, currentRound]);

  const isFinal    = currentRound === 6;
  const isBye      = !opponentName || opponentName === "BYE";
  const scoresSet  = myScore !== "" && oppScore !== "";
  const myScoreNum = parseInt(myScore, 10);
  const oppScoreNum = parseInt(oppScore, 10);
  const autoResult = scoresSet ? (myScoreNum > oppScoreNum ? "W" : myScoreNum < oppScoreNum ? "L" : null) : null;

  async function handleSave() {
    if (!isBye && !autoResult) return;
    setSaving(true);
    const result = isBye ? "BYE" : autoResult;
    await onSave({
      round_num: currentRound,
      player_slot: mySlot,
      player_name: myName,
      opponent_name: opponentName,
      player_score: isBye ? null : myScoreNum,
      opponent_score: isBye ? null : oppScoreNum,
      result,
      date_played: datePlayed || null,
    });
    setSaving(false);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={`${draw?.tournament_name} — ${ROUND_LABELS[currentRound] || `Round ${currentRound}`}`}>
      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>

        {/* Matchup */}
        <div style={{ background: SURFACE2, borderRadius: "10px", padding: "14px", textAlign: "center" }}>
          <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>
            {ROUND_LABELS[currentRound] || `Round ${currentRound}`}
          </div>
          {isBye ? (
            <div style={{ fontFamily: F_SANS, fontSize: "18px", fontWeight: "700", color: GOLD_MUTED }}>BYE — advance to next round</div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px" }}>
              <div style={{ fontFamily: F_SANS, fontSize: "16px", fontWeight: "700", color: TEXT }}>{myName}</div>
              <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3 }}>vs</div>
              <div style={{ fontFamily: F_SANS, fontSize: "16px", fontWeight: "700", color: TEXT }}>{opponentName || "TBD"}</div>
            </div>
          )}
        </div>

        {/* Date played */}
        <div>
          <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>Date Played</div>
          <input type="date" value={datePlayed} onChange={e => setDatePlayed(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", border: `1px solid ${BORDER}`, borderRadius: "10px", fontSize: "16px", fontFamily: F_UI, color: TEXT, background: SURFACE, outline: "none" }} />
        </div>

        {/* Scores */}
        {!isBye && (
          <div>
            <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Score</div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginBottom: "4px" }}>{myName}</div>
                <input type="number" min="0" max="99" value={myScore} onChange={e => setMyScore(e.target.value)}
                  placeholder="0"
                  style={{ width: "100%", boxSizing: "border-box", padding: "14px", border: `1px solid ${autoResult === "W" ? GREEN : autoResult === "L" ? LOSS_RED : BORDER}`, borderRadius: "10px", fontSize: "24px", fontFamily: F_SANS, fontWeight: "700", color: TEXT, background: SURFACE, outline: "none", textAlign: "center" }} />
              </div>
              <div style={{ fontFamily: F_UI, fontSize: "18px", color: TEXT3, paddingTop: "18px" }}>–</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginBottom: "4px" }}>{opponentName}</div>
                <input type="number" min="0" max="99" value={oppScore} onChange={e => setOppScore(e.target.value)}
                  placeholder="0"
                  style={{ width: "100%", boxSizing: "border-box", padding: "14px", border: `1px solid ${autoResult === "L" ? GREEN : autoResult === "W" ? LOSS_RED : BORDER}`, borderRadius: "10px", fontSize: "24px", fontFamily: F_SANS, fontWeight: "700", color: TEXT, background: SURFACE, outline: "none", textAlign: "center" }} />
              </div>
            </div>
            {/* Result indicator */}
            {autoResult && (
              <div style={{ marginTop: "10px", textAlign: "center", fontFamily: F_UI, fontSize: "14px", fontWeight: "700",
                color: autoResult === "W" ? GREEN : LOSS_RED }}>
                {autoResult === "W" ? (isFinal ? "🏆 Winner!" : "✓ You win — advance to next round") : "✗ Eliminated"}
              </div>
            )}
            {scoresSet && !autoResult && (
              <div style={{ marginTop: "10px", textAlign: "center", fontFamily: F_UI, fontSize: "13px", color: TEXT3 }}>Scores are equal — check and re-enter</div>
            )}
          </div>
        )}

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving || (!isBye && !autoResult)}
          style={{ padding: "14px", background: (isBye || autoResult) ? GREEN : SURFACE2, border: `1px solid ${(isBye || autoResult) ? GREEN : BORDER}`, borderRadius: "10px", color: (isBye || autoResult) ? "#fff" : TEXT3, fontFamily: F_UI, fontSize: "14px", fontWeight: "700", cursor: (isBye || autoResult) ? "pointer" : "default" }}>
          {saving ? "Saving…" : isBye ? "Record BYE — advance" : autoResult === "W" ? (isFinal ? "🏆 Record win & check roll of honour" : "Record Win") : autoResult === "L" ? "Record Loss" : "Enter scores above"}
        </button>

      </div>
    </BottomSheet>
  );
}
