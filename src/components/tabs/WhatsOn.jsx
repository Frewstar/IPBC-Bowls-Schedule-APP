import { useState, useEffect, useMemo, useRef } from "react";
import { PartyPopper, Plus, Pencil, Clock, CalendarDays, Trash2, Ban, RotateCcw } from "lucide-react";
import BottomSheet from "../BottomSheet.jsx";
import { supabase } from "../../lib/supabase.js";
import { GREEN, GOLD, GOLD_MUTED, MID, SURFACE, SURFACE2, BORDER, TEXT, TEXT2, TEXT3, LOSS_RED, F_SANS, F_UI } from "../../lib/theme.js";
import { DAY_NAMES, MONTH_ABBR } from "../../lib/utils.js";

const FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ── Dates ───────────────────────────────────────────────────────────────────
// Everything here is calendar arithmetic on a local-midnight Date. Nothing is
// ever routed through toISOString(), which would render a British evening as
// the previous day's UTC date for half the year.

function toISODate(d) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
// "2026-11-07" → a Date at local midnight. `new Date("2026-11-07")` would parse
// it as UTC midnight and land on the 6th in any negative offset.
function fromISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function todayISO() { return toISODate(new Date()); }

// The dates of a weekly series, from the first matching weekday on or after
// `fromISO` up to and including `toISO`.
//
// setDate(+7) steps a local-midnight Date forward one calendar week and stays
// at local midnight across the clock change. Adding 7 * 86400 seconds to an
// instant does not: the last Sunday in March falls inside the season, and
// every Saturday after it would come out an hour early. A band advertised at
// 8pm plays at 8pm in November and 8pm in April.
function seriesDates(fromISO, toISO, weekday) {
  const out = [];
  if (!fromISO || !toISO) return out;
  const end = fromISODate(toISO);
  const d = fromISODate(fromISO);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  // A season's worth of Saturdays is ~30. The cap is a runaway guard, not a limit.
  while (d <= end && out.length < 200) { out.push(toISODate(d)); d.setDate(d.getDate() + 7); }
  return out;
}

// "20:00" → "8pm", "20:30" → "8.30pm". Null time reads as no time at all.
function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}.${String(m).padStart(2, "0")}${suffix}`;
}

function fmtDateLong(iso) {
  const d = fromISODate(iso);
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_ABBR[d.getMonth()]}`;
}

// Sort by the day, then by the clock. An event with no time listed goes first,
// because that's usually the all-day thing.
function byWhen(a, b) {
  if (a.event_date !== b.event_date) return a.event_date < b.event_date ? -1 : 1;
  return (a.start_time || "").localeCompare(b.start_time || "");
}

const BLANK = { title: "", detail: "", start_time: "20:00", event_date: "", weekday: 6, from_date: "", to_date: "" };

export default function WhatsOnTab({ myName, isAdmin = false }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [sheet, setSheet] = useState(null);      // null | "add" | { edit: row }
  const [mode, setMode] = useState("once");      // "once" | "weekly"
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null); // null | "one" | "series"

  // Cancel the outgoing message's timer as well as showing the new one.
  // Without this, two toasts close together share the first one's clock and
  // the second vanishes after whatever is left of it — which on a slow tap is
  // no time at all.
  const toastTimer = useRef(null);
  function showToast(msg) {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Every other table in this app loads once on mount and then goes stale for
  // as long as the phone stays on that build. A notice nobody sees is a failed
  // feature, so this one reloads whenever the app comes back to the foreground
  // — the same visibilitychange hook App.jsx already uses to look for a new
  // service worker, and the exact moment a member actually looks at What's On.
  useEffect(() => {
    let alive = true;
    function refresh() {
      supabase.from("club_events").select("*")
        .gte("event_date", todayISO())
        .order("event_date", { ascending: true })
        .then(({ data, error }) => {
          if (!alive) return;
          if (error) showToast("Couldn't load what's on — pull down to retry");
          else if (data) setEvents(data);
          setLoading(false);
        });
    }
    refresh();
    // Also re-reads across midnight: the query window starts at "today", and a
    // phone left open overnight gets the new day's list on the next foreground.
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  const sorted = useMemo(() => [...events].sort(byWhen), [events]);
  const today = todayISO();
  const weekEnd = toISODate(new Date(Date.now() + 7 * 86400000));

  const sections = useMemo(() => ([
    { label: "Tonight",   rows: sorted.filter(e => e.event_date === today) },
    { label: "This week", rows: sorted.filter(e => e.event_date > today && e.event_date <= weekEnd) },
    { label: "Later on",  rows: sorted.filter(e => e.event_date > weekEnd) },
  ].filter(s => s.rows.length > 0)), [sorted, today, weekEnd]);

  // ── Admin actions ─────────────────────────────────────────────────────────
  function openAdd() {
    setMode("once");
    setForm({ ...BLANK, event_date: today, from_date: today });
    setConfirmDel(null);
    setSheet("add");
  }
  function openEdit(row) {
    setForm({ ...BLANK, title: row.title, detail: row.detail || "", start_time: row.start_time || "", event_date: row.event_date });
    setConfirmDel(null);
    setSheet({ edit: row });
  }

  const editing = sheet && sheet.edit ? sheet.edit : null;
  const dates = mode === "weekly" ? seriesDates(form.from_date, form.to_date, form.weekday) : [];

  const blockedReason =
    !form.title.trim() ? "Give it a name"
    : mode === "once" && !form.event_date ? "Pick a date"
    : mode === "weekly" && !form.from_date ? "Pick the first night"
    : mode === "weekly" && !form.to_date ? "Pick the last night"
    : mode === "weekly" && dates.length === 0 ? `No ${FULL_DAYS[form.weekday]}s between those dates`
    : null;

  function rowFrom(dateISO) {
    return {
      title: form.title.trim(),
      detail: form.detail.trim() || null,
      event_date: dateISO,
      start_time: form.start_time.trim() || null,
      created_by: myName || null,
      // club_id is left out on purpose — the column defaults to IPBC, the same
      // way every other insert in this app leaves it out.
    };
  }

  async function save() {
    if (blockedReason) { showToast(blockedReason); return; }
    setSaving(true);
    try {
      if (editing) {
        const patch = { title: form.title.trim(), detail: form.detail.trim() || null, start_time: form.start_time.trim() || null };
        const { error } = await supabase.from("club_events").update(patch).eq("id", editing.id);
        if (error) { showToast(`Couldn't save: ${error.message}`); return; }
        setEvents(prev => prev.map(e => (e.id === editing.id ? { ...e, ...patch } : e)));
        setSheet(null);
        return;
      }
      if (mode === "once") {
        const { data, error } = await supabase.from("club_events").insert(rowFrom(form.event_date)).select().single();
        if (error) { showToast(dupeMessage(error, 1)); return; }
        setEvents(prev => [...prev.filter(e => e.id !== data.id), data]);
        setSheet(null);
        showToast("Added");
        return;
      }
      await saveSeries();
    } finally {
      setSaving(false);
    }
  }

  // Generate the nights as ordinary rows. No recurrence rule is stored and
  // nothing is expanded on read, so cancelling one night later is an edit to
  // one row.
  async function saveSeries() {
    const title = form.title.trim();
    // Don't write a night that's already listed. The unique index is the real
    // guard — this is here so a second tap reads as "already done" rather than
    // as a database error, which is the shape of the club_fixtures duplicate.
    const { data: existing, error: readErr } = await supabase.from("club_events")
      .select("event_date")
      .gte("event_date", dates[0])
      .lte("event_date", dates[dates.length - 1])
      .ilike("title", title);
    if (readErr) { showToast(`Couldn't check the diary: ${readErr.message}`); return; }
    const taken = new Set((existing || []).map(r => r.event_date));
    const fresh = dates.filter(d => !taken.has(d));

    if (fresh.length === 0) {
      showToast(`All ${dates.length} ${FULL_DAYS[form.weekday]}s are already listed`);
      setSheet(null);
      return;
    }

    const seriesId = crypto.randomUUID();
    const rows = fresh.map(d => ({ ...rowFrom(d), series_id: seriesId }));
    const { data, error } = await supabase.from("club_events").insert(rows).select();
    if (error) { showToast(dupeMessage(error, rows.length)); return; }

    setEvents(prev => {
      const ids = new Set(data.map(r => r.id));
      return [...prev.filter(e => !ids.has(e.id)), ...data];
    });
    setSheet(null);
    const skipped = dates.length - fresh.length;
    showToast(skipped
      ? `Added ${data.length} nights, skipped ${skipped} already listed`
      : `Added ${data.length} nights`);
  }

  // 23505 is the unique index doing its job — two taps that raced past the
  // check above. Say that, rather than showing the raw constraint name.
  function dupeMessage(error, n) {
    if (error?.code === "23505")
      return n === 1 ? "That's already in the diary for that night" : "Those nights are already in the diary";
    return `Couldn't save: ${error?.message || "no response from the server"}`;
  }

  // Cancelling keeps the row and the row keeps showing, struck through. A
  // member expecting a band has to be told there isn't one; deleting it tells
  // them nothing at all.
  async function setCancelled(row, cancelled) {
    setEvents(prev => prev.map(e => (e.id === row.id ? { ...e, cancelled } : e)));
    const { error } = await supabase.from("club_events").update({ cancelled }).eq("id", row.id);
    if (error) {
      setEvents(prev => prev.map(e => (e.id === row.id ? { ...e, cancelled: !cancelled } : e)));
      showToast(`Couldn't save: ${error.message}`);
      return;
    }
    setSheet(null);
    showToast(cancelled ? "Marked as cancelled — it still shows, struck through" : "Back on");
  }

  async function removeOne(row) {
    const { error } = await supabase.from("club_events").delete().eq("id", row.id);
    if (error) { showToast(`Couldn't remove: ${error.message}`); return; }
    setEvents(prev => prev.filter(e => e.id !== row.id));
    setSheet(null);
    showToast("Removed");
  }

  // Removing the rest of a series leaves nights already past alone — the query
  // is from today forward, same as the list.
  async function removeSeries(row) {
    const { error } = await supabase.from("club_events").delete()
      .eq("series_id", row.series_id).gte("event_date", todayISO());
    if (error) { showToast(`Couldn't remove: ${error.message}`); return; }
    setEvents(prev => prev.filter(e => e.series_id !== row.series_id));
    setSheet(null);
    showToast("Series removed");
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: "520px", margin: "0 auto", paddingBottom: "32px" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "600", color: GOLD_MUTED, letterSpacing: "0.12em", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: "7px" }}>
          <PartyPopper size={14} strokeWidth={2} />What's On
        </div>
        {isAdmin && (
          <button onClick={openAdd} style={{ background: MID, border: "none", borderRadius: "8px", color: "#fff", padding: "8px 14px", fontFamily: F_UI, fontSize: "12px", fontWeight: "700", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <Plus size={14} strokeWidth={2.5} />New
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", fontFamily: F_UI, fontSize: "13px", color: TEXT3 }}>Loading…</div>
      ) : sections.length === 0 ? (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "40px 24px", textAlign: "center", boxShadow: "0 1px 3px rgba(74,14,31,0.06)" }}>
          <CalendarDays size={32} strokeWidth={1} color={BORDER} style={{ marginBottom: "12px" }} />
          <div style={{ fontFamily: F_SANS, fontSize: "20px", fontWeight: "600", color: TEXT2, marginBottom: "6px" }}>Nothing listed yet</div>
          <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT3, lineHeight: 1.5 }}>
            {isAdmin ? "Tap New to put the band, the karaoke or a one-off night in the diary." : "Social nights at the club will be listed here."}
          </div>
        </div>
      ) : sections.map(({ label, rows }, si) => (
        <div key={label}>
          <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "600", color: GOLD_MUTED, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "10px", marginTop: si === 0 ? "4px" : "22px" }}>{label}</div>
          {rows.map(e => <EventCard key={e.id} e={e} isAdmin={isAdmin} onEdit={() => openEdit(e)} />)}
        </div>
      ))}

      {/* ── Add / edit ── */}
      <BottomSheet open={!!sheet} onClose={() => setSheet(null)} title={editing ? "Edit night" : "Add to What's On"}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

          {!editing && (
            <Field label="How often?">
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => setMode("once")} style={toggleBtn(mode === "once")}>Just once</button>
                <button onClick={() => setMode("weekly")} style={toggleBtn(mode === "weekly")}>Every week</button>
              </div>
            </Field>
          )}

          <Field label="What is it?">
            <input value={form.title} onChange={ev => setForm(f => ({ ...f, title: ev.target.value }))}
              placeholder="Band, Karaoke, Quiz Night…" style={inp} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "7px" }}>
              {["Band", "Karaoke", "Quiz Night", "Race Night", "Domino Drive"].map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, title: t }))} style={chip(form.title === t)}>{t}</button>
              ))}
            </div>
          </Field>

          <Field label="Anything else? (optional)">
            <input value={form.detail} onChange={ev => setForm(f => ({ ...f, detail: ev.target.value }))}
              placeholder="Who's playing, tickets, members and guests…" style={inp} />
          </Field>

          <Field label="Start time">
            <input type="time" value={form.start_time} onChange={ev => setForm(f => ({ ...f, start_time: ev.target.value }))} style={inp} />
            <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "5px", lineHeight: 1.5 }}>
              The time on the clock. 8pm stays 8pm when the clocks change.
            </div>
          </Field>

          {editing ? (
            <Field label="Date">
              <div style={{ fontFamily: F_SANS, fontSize: "17px", fontWeight: "600", color: TEXT }}>{fmtDateLong(editing.event_date)}</div>
              <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "4px", lineHeight: 1.5 }}>
                To move a night, cancel this one and add the new date — that way anyone
                turning up on the old night still sees it's off.
              </div>
            </Field>
          ) : mode === "once" ? (
            <Field label="Date">
              <input type="date" value={form.event_date} onChange={ev => setForm(f => ({ ...f, event_date: ev.target.value }))} style={inp} />
            </Field>
          ) : (
            <>
              <Field label="Which night?">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px" }}>
                  {FULL_DAYS.map((d, i) => (
                    <button key={d} onClick={() => setForm(f => ({ ...f, weekday: i }))} style={toggleBtn(form.weekday === i)}>{DAY_NAMES[i]}</button>
                  ))}
                </div>
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <Field label="From"><input type="date" value={form.from_date} onChange={ev => setForm(f => ({ ...f, from_date: ev.target.value }))} style={inp} /></Field>
                <Field label="Until"><input type="date" value={form.to_date} onChange={ev => setForm(f => ({ ...f, to_date: ev.target.value }))} style={inp} /></Field>
              </div>
              {dates.length > 0 && (
                <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "9px", padding: "11px 13px", fontFamily: F_UI, fontSize: "12px", color: TEXT2, lineHeight: 1.55 }}>
                  <strong style={{ color: TEXT }}>{dates.length} {FULL_DAYS[form.weekday]}{dates.length === 1 ? "" : "s"}</strong>
                  {" — "}{fmtDateLong(dates[0])} to {fmtDateLong(dates[dates.length - 1])}.
                  <div style={{ color: TEXT3, marginTop: "4px" }}>
                    Each one goes in as its own night, so you can cancel one later without touching the rest.
                  </div>
                </div>
              )}
            </>
          )}

          {blockedReason && !editing && (
            <div style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}44`, borderRadius: "9px", padding: "10px 13px", fontFamily: F_UI, fontSize: "13px", color: TEXT2, lineHeight: 1.5 }}>
              {blockedReason} first.
            </div>
          )}

          <button onClick={save} disabled={saving} style={{ width: "100%", background: saving ? TEXT3 : MID, border: "none", borderRadius: "10px", color: "#fff", padding: "14px", fontFamily: F_UI, fontSize: "14px", fontWeight: "700", cursor: saving ? "default" : "pointer" }}>
            {saving ? "Saving…" : editing ? "Save changes" : mode === "weekly" && dates.length ? `Add ${dates.length} nights` : "Add to the diary"}
          </button>

          {editing && (
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {editing.cancelled ? (
                <button onClick={() => setCancelled(editing, false)} style={secondaryBtn}>
                  <RotateCcw size={15} strokeWidth={1.75} />It's back on
                </button>
              ) : (
                <button onClick={() => setCancelled(editing, true)} style={secondaryBtn}>
                  <Ban size={15} strokeWidth={1.75} />Cancel this night
                </button>
              )}
              <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, lineHeight: 1.5, padding: "0 2px" }}>
                A cancelled night stays on the list with a line through it, so anyone
                who was coming finds out. Removing it takes it off the list entirely.
              </div>

              {confirmDel === "one" ? (
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={() => removeOne(editing)} style={{ ...dangerBtn, flex: 1 }}>Yes, remove it</button>
                  <button onClick={() => setConfirmDel(null)} style={secondaryBtn}>Keep it</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDel("one")} style={dangerBtn}>
                  <Trash2 size={15} strokeWidth={1.75} />Remove this night
                </button>
              )}

              {editing.series_id && (confirmDel === "series" ? (
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={() => removeSeries(editing)} style={{ ...dangerBtn, flex: 1 }}>Yes, remove them all</button>
                  <button onClick={() => setConfirmDel(null)} style={secondaryBtn}>Keep them</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDel("series")} style={dangerBtn}>
                  <Trash2 size={15} strokeWidth={1.75} />Remove every remaining {form.title || "night"} in this run
                </button>
              ))}
            </div>
          )}
        </div>
      </BottomSheet>

      {toast && (
        <div style={{ position: "fixed", bottom: "80px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: GREEN, color: "#fff", borderRadius: "10px", padding: "10px 18px", fontSize: "13px", fontFamily: F_UI, fontWeight: "600", boxShadow: "0 4px 16px rgba(0,0,0,0.2)", maxWidth: "90vw", textAlign: "center" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────
function EventCard({ e, isAdmin, onEdit }) {
  const d = fromISODate(e.event_date);
  const off = e.cancelled;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "12px",
      background: SURFACE, border: `1px solid ${off ? `${LOSS_RED}44` : BORDER}`,
      borderLeft: `4px solid ${off ? LOSS_RED : GOLD}`,
      borderRadius: "12px", padding: "13px 14px", marginBottom: "8px",
      boxShadow: "0 1px 3px rgba(74,14,31,0.06)",
    }}>
      <div style={{ minWidth: "38px", flexShrink: 0, textAlign: "center" }}>
        <div style={{ fontFamily: F_SANS, fontSize: "21px", fontWeight: "700", color: off ? TEXT3 : GREEN, lineHeight: 1 }}>{d.getDate()}</div>
        <div style={{ fontFamily: F_UI, fontSize: "9px", color: TEXT3, textTransform: "uppercase", fontWeight: "600", marginTop: "2px" }}>{DAY_NAMES[d.getDay()]}</div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: F_SANS, fontSize: "17px", fontWeight: "700", lineHeight: 1.25,
          color: off ? TEXT3 : TEXT,
          textDecoration: off ? "line-through" : "none",
        }}>
          {e.title}
        </div>
        {e.detail && (
          <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT2, marginTop: "3px", lineHeight: 1.45, textDecoration: off ? "line-through" : "none" }}>
            {e.detail}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "5px", flexWrap: "wrap" }}>
          {e.start_time && (
            <span style={{ fontFamily: F_UI, fontSize: "12px", color: off ? TEXT3 : TEXT2, display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <Clock size={11} strokeWidth={1.75} />{fmtTime(e.start_time)}
            </span>
          )}
          {off && (
            <span style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "700", color: LOSS_RED, background: `${LOSS_RED}12`, border: `1px solid ${LOSS_RED}44`, borderRadius: "20px", padding: "2px 9px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Cancelled
            </span>
          )}
        </div>
      </div>

      {isAdmin && (
        <button onClick={onEdit} aria-label={`Edit ${e.title}`}
          style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT3, cursor: "pointer", padding: "11px 12px", flexShrink: 0, display: "inline-flex", alignItems: "center", minHeight: "44px" }}>
          <Pencil size={13} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "600", color: TEXT2, marginBottom: "6px", letterSpacing: "0.02em" }}>{label}</div>
      {children}
    </div>
  );
}

const inp = { width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "10px", border: `1px solid ${BORDER}`, fontSize: "14px", fontFamily: F_UI, color: TEXT, background: SURFACE };
const toggleBtn = active => ({ flex: 1, padding: "11px 8px", borderRadius: "10px", border: `1px solid ${active ? GREEN : BORDER}`, background: active ? GREEN : SURFACE, color: active ? "#fff" : TEXT2, fontFamily: F_UI, fontSize: "13px", fontWeight: active ? "700" : "500", cursor: "pointer" });
const chip = active => ({ background: active ? MID : SURFACE2, border: `1px solid ${active ? MID : BORDER}`, borderRadius: "16px", color: active ? "#fff" : TEXT2, padding: "5px 11px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, fontWeight: active ? "600" : "400" });
const secondaryBtn = { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "10px", color: TEXT2, padding: "12px", fontFamily: F_UI, fontSize: "13px", fontWeight: "600", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "7px" };
const dangerBtn = { background: SURFACE, border: `1px solid ${LOSS_RED}44`, borderRadius: "10px", color: LOSS_RED, padding: "12px", fontFamily: F_UI, fontSize: "13px", fontWeight: "600", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "7px" };
