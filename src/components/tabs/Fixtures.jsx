import { ChevronLeft, ChevronRight } from "lucide-react";
import { GREEN, GOLD, SURFACE, SURFACE2, BORDER, TEXT, TEXT2, TEXT3, F_DISPLAY, F_UI } from "../../lib/theme.js";
import { FIXTURES } from "../../lib/constants.js";
import { DAY_NAMES, MONTH_ABBR, fixtureStatus } from "../../lib/utils.js";

function FixtureRow({ fix, i, total }) {
  const status  = fixtureStatus(fix.date);
  const isToday = status === "today";
  const isPast  = status === "past";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "12px",
      padding: "12px 14px",
      borderBottom: i < total - 1 ? `1px solid ${BORDER}` : "none",
      background: isToday ? `${GREEN}0d` : "transparent",
      borderLeft: isToday ? `3px solid ${GREEN}` : "3px solid transparent",
      minHeight: "52px",
    }}>
      <div style={{ minWidth: "36px", flexShrink: 0, textAlign: "center" }}>
        <div style={{ fontFamily: F_DISPLAY, fontSize: "20px", fontWeight: "700", color: isPast ? TEXT3 : GREEN, lineHeight: 1 }}>{fix.date.getDate()}</div>
        <div style={{ fontFamily: F_UI, fontSize: "9px", color: TEXT3, textTransform: "uppercase", fontWeight: "500" }}>{DAY_NAMES[fix.date.getDay()]}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: F_UI, fontSize: "14px", fontWeight: isToday ? "700" : "500", color: isPast ? TEXT2 : TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fix.event}</div>
        <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT2, marginTop: "1px" }}>{fix.time}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px", flexShrink: 0 }}>
        <span style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", padding: "2px 9px", borderRadius: "20px", background: fix.venue === "home" ? GREEN : GOLD, color: fix.venue === "home" ? "#fff" : "#4a0e1f" }}>
          {fix.venue === "home" ? "Home" : "Away"}
        </span>
        {fix.rinks && <span style={{ fontFamily: F_UI, fontSize: "10px", color: TEXT3 }}>{fix.rinks} rinks</span>}
      </div>
    </div>
  );
}

function groupByMonth(fixList) {
  const g = {};
  fixList.forEach(f => {
    const key = `${f.date.getFullYear()}-${f.date.getMonth()}`;
    if (!g[key]) g[key] = { label: `${MONTH_ABBR[f.date.getMonth()]} ${f.date.getFullYear()}`, fixtures: [] };
    g[key].fixtures.push(f);
  });
  return g;
}

export default function FixturesTab({ fixturesExpanded, setFixturesExpanded, seasonYear }) {
  const upcoming = FIXTURES.filter(f => fixtureStatus(f.date) !== "past");
  const nextUp = upcoming[0] || null;
  const shownUpcoming = fixturesExpanded ? upcoming : upcoming.slice(0, 5);
  const pastFixtures = FIXTURES.filter(f => fixtureStatus(f.date) === "past");

  return (
    <div>
      {/* ── Next Fixture hero card ── */}
      {nextUp && (
        <div style={{ background: GREEN, borderRadius: "14px", padding: "20px", marginBottom: "16px", boxShadow: "0 4px 16px rgba(74,14,31,0.18)" }}>
          <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", letterSpacing: "0.18em", color: `${GOLD}cc`, textTransform: "uppercase", marginBottom: "6px" }}>
            {fixtureStatus(nextUp.date) === "today" ? "Today's Fixture" : "Next Fixture"}
          </div>
          <div style={{ fontFamily: F_DISPLAY, fontSize: "24px", fontWeight: "700", color: "#fff", marginBottom: "8px", lineHeight: 1.1 }}>{nextUp.event}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontFamily: F_DISPLAY, fontSize: "16px", fontWeight: "600", color: GOLD }}>
              {DAY_NAMES[nextUp.date.getDay()]} {nextUp.date.getDate()} {MONTH_ABBR[nextUp.date.getMonth()]}
            </span>
            <span style={{ fontFamily: F_UI, fontSize: "12px", color: "rgba(255,255,255,0.75)" }}>{nextUp.time}</span>
            <span style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", padding: "3px 10px", borderRadius: "20px", background: nextUp.venue === "home" ? GOLD : "rgba(255,255,255,0.15)", color: nextUp.venue === "home" ? "#4a0e1f" : "#fff", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {nextUp.venue === "home" ? "Home" : "Away"}
            </span>
            {nextUp.rinks && <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", fontFamily: F_UI }}>{nextUp.rinks} rinks</span>}
          </div>
        </div>
      )}

      {/* ── Upcoming: next 5 or all ── */}
      {shownUpcoming.length > 0 && (() => {
        const grouped = groupByMonth(shownUpcoming);
        return (
          <>
            {Object.values(grouped).map(({ label, fixtures: mF }) => (
              <div key={label} style={{ marginBottom: "12px" }}>
                <div style={{ background: SURFACE2, padding: "8px 14px", fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: GREEN, letterSpacing: "0.1em", textTransform: "uppercase", borderLeft: `3px solid ${GREEN}` }}>{label}</div>
                <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderTop: "none" }}>
                  {mF.map((fix, i) => <FixtureRow key={i} fix={fix} i={i} total={mF.length} />)}
                </div>
              </div>
            ))}
            {upcoming.length > 5 && (
              <button onClick={() => setFixturesExpanded(v => !v)}
                style={{ width: "100%", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "10px", color: GREEN, padding: "13px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                {fixturesExpanded
                  ? <><ChevronLeft size={16} strokeWidth={2} /> Show fewer</>
                  : <><ChevronRight size={16} strokeWidth={2} /> See all {upcoming.length} upcoming fixtures</>}
              </button>
            )}
          </>
        );
      })()}

      {/* ── Past fixtures (collapsed section) ── */}
      {pastFixtures.length > 0 && (() => {
        const grouped = groupByMonth(pastFixtures);
        return (
          <div style={{ marginTop: "8px" }}>
            <div style={{ fontSize: "10px", color: TEXT3, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: "600", marginBottom: "10px", padding: "0 2px" }}>Past — {pastFixtures.length} fixtures</div>
            {Object.values(grouped).reverse().map(({ label, fixtures: mF }) => (
              <div key={label} style={{ marginBottom: "10px", opacity: 0.6 }}>
                <div style={{ background: SURFACE2, padding: "7px 14px", fontFamily: F_UI, fontSize: "10px", fontWeight: "700", color: TEXT2, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</div>
                <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderTop: "none" }}>
                  {mF.map((fix, i) => <FixtureRow key={i} fix={fix} i={i} total={mF.length} />)}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      <div style={{ textAlign: "center", marginTop: "12px", fontFamily: F_UI, fontSize: "10px", color: TEXT3 }}>
        Irvine Park BC · {seasonYear || new Date().getFullYear()} Season · {FIXTURES.length} fixtures
      </div>
    </div>
  );
}
