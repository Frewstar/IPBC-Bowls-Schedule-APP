import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X } from "lucide-react";
import BottomSheet from "../BottomSheet.jsx";
import { GREEN, GOLD, MID, SURFACE, SURFACE2, BORDER, TEXT, TEXT2, TEXT3, LOSS_RED, F_SANS, F_UI } from "../../lib/theme.js";
import { DAY_NAMES, MONTH_ABBR, fixtureStatus } from "../../lib/utils.js";

const BLANK = { event_date: "", event: "", time: "", venue: "home", rinks: "" };

function FixtureRow({ fix, i, total, isAdmin, onEdit }) {
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
        <div style={{ fontFamily: F_SANS, fontSize: "20px", fontWeight: "700", color: isPast ? TEXT3 : GREEN, lineHeight: 1 }}>{fix.date.getDate()}</div>
        <div style={{ fontFamily: F_UI, fontSize: "9px", color: TEXT3, textTransform: "uppercase", fontWeight: "500" }}>{DAY_NAMES[fix.date.getDay()]}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: F_UI, fontSize: "14px", fontWeight: isToday ? "700" : "500", color: isPast ? TEXT2 : TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fix.event}</div>
        <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT2, marginTop: "1px" }}>{fix.time}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px" }}>
          <span style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", padding: "2px 9px", borderRadius: "20px", background: fix.venue === "home" ? GREEN : GOLD, color: fix.venue === "home" ? "#fff" : "#4a0e1f" }}>
            {fix.venue === "home" ? "Home" : "Away"}
          </span>
          {fix.rinks && <span style={{ fontFamily: F_UI, fontSize: "10px", color: TEXT3 }}>{fix.rinks} rinks</span>}
        </div>
        {isAdmin && (
          <button onClick={() => onEdit(fix)} style={{ background: "none", border: "none", padding: "8px", cursor: "pointer", color: TEXT3, display: "flex", alignItems: "center", minHeight: "44px" }}>
            <Pencil size={13} strokeWidth={1.75} />
          </button>
        )}
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

function toDateInput(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 10);
}

export default function FixturesTab({ fixtures = [], fixturesExpanded, setFixturesExpanded, seasonYear, isAdmin = false, addFixture, editFixture, deleteFixture }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [confirmDel, setConfirmDel] = useState(false);

  const upcoming = fixtures.filter(f => fixtureStatus(f.date) !== "past");
  const nextUp = upcoming[0] || null;
  const shownUpcoming = fixturesExpanded ? upcoming : upcoming.slice(0, 5);
  const pastFixtures = fixtures.filter(f => fixtureStatus(f.date) === "past");

  function openAdd() {
    setEditingId(null);
    setForm(BLANK);
    setConfirmDel(false);
    setSheetOpen(true);
  }

  function openEdit(fix) {
    setEditingId(fix.id);
    setForm({ event_date: toDateInput(fix.date), event: fix.event, time: fix.time || "", venue: fix.venue || "home", rinks: fix.rinks || "" });
    setConfirmDel(false);
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!form.event_date || !form.event) return;
    const payload = { event_date: form.event_date, event: form.event, time: form.time, venue: form.venue, rinks: form.rinks || null };
    if (editingId) {
      await editFixture(editingId, payload);
    } else {
      await addFixture(payload);
    }
    setSheetOpen(false);
  }

  async function handleDelete() {
    await deleteFixture(editingId);
    setSheetOpen(false);
    setConfirmDel(false);
  }

  const formValid = form.event_date && form.event.trim();

  return (
    <div>
      {/* ── Admin toolbar ── */}
      {isAdmin && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
          <button onClick={openAdd} style={{ background: MID, border: "none", borderRadius: "8px", color: "#fff", padding: "9px 16px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <Plus size={15} strokeWidth={2.5} /> Add Fixture
          </button>
        </div>
      )}

      {/* ── Next Fixture hero card ── */}
      {nextUp && (
        <div style={{ background: GREEN, borderRadius: "14px", padding: "20px", marginBottom: "16px", boxShadow: "0 4px 16px rgba(74,14,31,0.18)" }}>
          <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", letterSpacing: "0.18em", color: `${GOLD}cc`, textTransform: "uppercase", marginBottom: "6px" }}>
            {fixtureStatus(nextUp.date) === "today" ? "Today's Fixture" : "Next Fixture"}
          </div>
          <div style={{ fontFamily: F_SANS, fontSize: "24px", fontWeight: "700", color: "#fff", marginBottom: "8px", lineHeight: 1.1 }}>{nextUp.event}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontFamily: F_SANS, fontSize: "16px", fontWeight: "600", color: GOLD }}>
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
                  {mF.map((fix, i) => <FixtureRow key={fix.id || i} fix={fix} i={i} total={mF.length} isAdmin={isAdmin} onEdit={openEdit} />)}
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

      {/* ── Past fixtures ── */}
      {pastFixtures.length > 0 && (() => {
        const grouped = groupByMonth(pastFixtures);
        return (
          <div style={{ marginTop: "8px" }}>
            <div style={{ fontSize: "10px", color: TEXT3, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: "600", marginBottom: "10px", padding: "0 2px" }}>Past — {pastFixtures.length} fixtures</div>
            {Object.values(grouped).reverse().map(({ label, fixtures: mF }) => (
              <div key={label} style={{ marginBottom: "10px", opacity: 0.6 }}>
                <div style={{ background: SURFACE2, padding: "7px 14px", fontFamily: F_UI, fontSize: "10px", fontWeight: "700", color: TEXT2, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</div>
                <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderTop: "none" }}>
                  {mF.map((fix, i) => <FixtureRow key={fix.id || i} fix={fix} i={i} total={mF.length} isAdmin={isAdmin} onEdit={openEdit} />)}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      <div style={{ textAlign: "center", marginTop: "12px", fontFamily: F_UI, fontSize: "10px", color: TEXT3 }}>
        Irvine Park BC · {seasonYear || new Date().getFullYear()} Season · {fixtures.length} fixtures
      </div>

      {/* ── Add / Edit fixture sheet ── */}
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={editingId ? "Edit Fixture" : "Add Fixture"}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

          <div>
            <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "1px" }}>Date</div>
            <input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
              style={{ width: "100%", boxSizing: "border-box", padding: "12px", border: `1px solid ${BORDER}`, borderRadius: "8px", fontSize: "16px", fontFamily: F_UI, outline: "none", background: SURFACE, color: TEXT }} />
          </div>

          <div>
            <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "1px" }}>Event / Opponent</div>
            <input placeholder="e.g. Ayr BC" value={form.event} onChange={e => setForm(f => ({ ...f, event: e.target.value }))}
              style={{ width: "100%", boxSizing: "border-box", padding: "12px", border: `1px solid ${BORDER}`, borderRadius: "8px", fontSize: "16px", fontFamily: F_UI, outline: "none", background: SURFACE, color: TEXT }} />
          </div>

          <div>
            <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "1px" }}>Time</div>
            <input placeholder="e.g. 2:00 PM" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
              style={{ width: "100%", boxSizing: "border-box", padding: "12px", border: `1px solid ${BORDER}`, borderRadius: "8px", fontSize: "16px", fontFamily: F_UI, outline: "none", background: SURFACE, color: TEXT }} />
          </div>

          <div>
            <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "1px" }}>Venue</div>
            <div style={{ display: "flex", gap: "8px" }}>
              {["home", "away"].map(v => (
                <button key={v} onClick={() => setForm(f => ({ ...f, venue: v }))}
                  style={{ flex: 1, padding: "11px", borderRadius: "8px", border: `1px solid ${form.venue === v ? (v === "home" ? GREEN : GOLD) : BORDER}`, background: form.venue === v ? (v === "home" ? `${GREEN}18` : `${GOLD}18`) : SURFACE, color: form.venue === v ? (v === "home" ? GREEN : "#4a0e1f") : TEXT2, fontFamily: F_UI, fontSize: "14px", fontWeight: form.venue === v ? "700" : "400", cursor: "pointer", textTransform: "capitalize" }}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "1px" }}>Rinks <span style={{ fontWeight: "400", textTransform: "none" }}>(optional)</span></div>
            <input placeholder="e.g. 4" value={form.rinks} onChange={e => setForm(f => ({ ...f, rinks: e.target.value }))}
              style={{ width: "100%", boxSizing: "border-box", padding: "12px", border: `1px solid ${BORDER}`, borderRadius: "8px", fontSize: "16px", fontFamily: F_UI, outline: "none", background: SURFACE, color: TEXT }} />
          </div>

          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            <button onClick={handleSave} disabled={!formValid}
              style={{ flex: 1, background: formValid ? MID : BORDER, border: "none", borderRadius: "8px", color: formValid ? "#fff" : TEXT3, padding: "13px", fontSize: "14px", cursor: formValid ? "pointer" : "default", fontFamily: F_UI, fontWeight: "700" }}>
              {editingId ? "Save Changes" : "Add Fixture"}
            </button>
            <button onClick={() => setSheetOpen(false)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "13px 16px", fontSize: "14px", cursor: "pointer", fontFamily: F_UI }}>
              Cancel
            </button>
          </div>

          {editingId && !confirmDel && (
            <button onClick={() => setConfirmDel(true)}
              style={{ background: "none", border: `1px solid ${LOSS_RED}55`, borderRadius: "8px", color: LOSS_RED, padding: "11px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
              <Trash2 size={14} strokeWidth={1.75} /> Delete Fixture
            </button>
          )}

          {confirmDel && (
            <div style={{ background: "#fef2f2", border: `1px solid ${LOSS_RED}44`, borderRadius: "8px", padding: "12px 14px" }}>
              <div style={{ fontFamily: F_UI, fontSize: "13px", color: LOSS_RED, marginBottom: "10px" }}>Delete this fixture permanently?</div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={handleDelete} style={{ flex: 1, background: "#c0392b", border: "none", borderRadius: "7px", color: "#fff", padding: "10px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700" }}>Yes, delete</button>
                <button onClick={() => setConfirmDel(false)} style={{ flex: 1, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "7px", color: TEXT, padding: "10px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI }}>Keep</button>
              </div>
            </div>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
