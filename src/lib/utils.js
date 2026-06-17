import { DEFAULT_TOURNAMENTS as TOURNAMENTS } from "./constants.js";

export const DAY_NAMES  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
export const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function getSurname(name) {
  return name.trim().split(/\s+/).slice(-1)[0].toUpperCase();
}

export function getRoundLabel(idx, total) {
  if (total === 1) return "Final";
  if (idx === total - 1) return "Final";
  if (idx === total - 2) return "Semi Final";
  if (total >= 4 && idx === total - 3) return "Quarter Final";
  return `Round ${idx + 1}`;
}

export function fmtDate(iso) {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${parseInt(d)} ${MONTH_ABBR[parseInt(m) - 1]}`;
}

// Parse the date from tournament round strings like "1st Round\n9th June" → "2025-06-09"
export function parseTournRoundDate(roundStr) {
  if (!roundStr) return "";
  const lines = roundStr.split("\n");
  if (lines.length < 2) return "";
  const raw = lines[1].trim();
  const m = raw.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)/i);
  if (!m) return "";
  const day = m[1].padStart(2, "0");
  const MONTHS = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
  const month = MONTHS[m[2].toLowerCase().slice(0, 3)];
  if (!month) return "";
  return `2025-${month}-${day}`;
}

// Get auto-date for a given tournament + round index
export function getTournRoundDate(tournamentId, roundIdx) {
  const t = TOURNAMENTS.find(t2 => t2.id === tournamentId);
  return t?.rounds?.[roundIdx] ? parseTournRoundDate(t.rounds[roundIdx]) : "";
}

export function fixtureStatus(fixtureDate) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const fixStr   = `${fixtureDate.getFullYear()}-${fixtureDate.getMonth()}-${fixtureDate.getDate()}`;
  if (fixStr === todayStr) return "today";
  if (fixtureDate < today) return "past";
  return "upcoming";
}

// Days until a date (negative = past, 0 = today)
export function countdownDays(isoDate) {
  if (!isoDate) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(isoDate); target.setHours(0,0,0,0);
  return Math.round((target - today) / 86400000);
}

// Format countdown as readable label
export function countdownLabel(isoDate) {
  const d = countdownDays(isoDate);
  if (d === null) return null;
  if (d < 0) return null;
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d <= 7) return `In ${d} days`;
  return `In ${Math.ceil(d/7)} weeks`;
}

// Find the most urgent pending tie across all active entries
export function findUrgentTie(allEntries) {
  const pending = allEntries
    .filter(e => e.status === "active")
    .flatMap(e => e.ties.filter(t => !t.result).map(t => ({ ...t, entry: e })));
  if (!pending.length) return null;
  pending.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(a.date) - new Date(b.date);
  });
  return pending[0];
}
