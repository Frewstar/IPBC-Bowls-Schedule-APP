// ── STORAGE KEYS ───────────────────────────────────────────────────────────
export const MEMBERS_KEY  = "bowls_members_v1";
export const TIES_KEY     = "bowls_ties_v2";
export const SETTINGS_KEY = "ipbc_settings_v1";
export const ENTRIES_KEY  = "bowls_entries_v1";
export const NAME_KEY     = "bowls_myname";

export function load(key, fallback) {
  try { const r = localStorage.getItem(key); if (r) return JSON.parse(r); } catch {}
  return fallback;
}

export function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── CSV helpers ─────────────────────────────────────────────────────────────
import { getSurname } from "./utils.js";

export function membersToCSV(members) {
  const rows = [["Name", "Phone", "Section"]];
  members
    .slice()
    .sort((a, b) => getSurname(a.name).localeCompare(getSurname(b.name)))
    .forEach(m => rows.push([m.name, m.phone || "", m.section || "gents"]));
  return rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const header = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim().toLowerCase());
  const nameIdx    = header.indexOf("name");
  const phoneIdx   = header.indexOf("phone");
  const sectionIdx = header.indexOf("section");
  if (nameIdx === -1) return null;
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].match(/("(?:[^"]|"")*"|[^,]*)/g).map(c => c.replace(/^"|"$/g, "").replace(/""/g, '"').trim());
    const name = cols[nameIdx]?.toUpperCase().trim();
    if (!name) continue;
    const phone   = phoneIdx   !== -1 ? (cols[phoneIdx]   || "").trim() : "";
    const section = sectionIdx !== -1 ? (cols[sectionIdx] || "gents").toLowerCase().trim() : "gents";
    results.push({ id: Date.now().toString() + i, name, phone, section: section === "ladies" ? "ladies" : "gents" });
  }
  return results.length ? results : null;
}
