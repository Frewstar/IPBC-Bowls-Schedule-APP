// ════════════════════════════════════════════════════════════════════════════
//  Which competitions a member sees
//
//  Two vocabularies meet here and they are not the same words.
//
//    what a member is browsing as (activeSection)
//        "gents" · "ladies" · "gents-senior" · "ladies-senior"      SINGULAR
//
//    what a competition is tagged with (tournaments.section)
//        "gents" · "ladies" · "mixed" · "seniors"                   PLURAL
//        "gents-seniors" · "ladies-seniors"        ← added for 2026
//
//  The rule used to be four lines that knew about "gents", "ladies", "mixed"
//  and "seniors" only. When the 2026 senior competitions went in under
//  "gents-seniors" and "ladies-seniors", they matched none of them and fell
//  through to `return false` — so all five were invisible to everybody, in the
//  app and in the Settings list, while sitting perfectly well in the database.
//
//  Both callers now come through here so they cannot drift apart again: the
//  member-facing filter in App.jsx and the Settings chips.
// ════════════════════════════════════════════════════════════════════════════

// "gents-senior" → "gents"; "ladies" → "ladies". The half that says which
// section, ignoring whether they are a senior.
export function baseSection(section) {
  return String(section || "gents").toLowerCase().startsWith("ladies") ? "ladies" : "gents";
}

export function isSeniorSection(section) {
  return String(section || "").toLowerCase().includes("senior");
}

// Is this competition one of the senior sets?
export function isSeniorTournament(tSection) {
  return isSeniorSection(tSection);
}

// The one rule. `tSection` is tournaments.section, `memSection` is whatever
// the member is browsing as.
export function tournamentVisibleToMember(tSection, memSection) {
  const t = String(tSection || "gents").toLowerCase();
  const mIsSenior = isSeniorSection(memSection);
  const mBase = baseSection(memSection);

  // Mixed is for everyone — that is what makes it mixed.
  if (t === "mixed") return true;

  // Generic seniors: no section of its own, so both senior sections get it.
  // These are the original four (Senior Singles, Pairs, Triples, Rinks).
  if (t === "seniors") return mIsSenior;

  // Section-specific seniors, the 2026 set. A Gents Senior gets the three
  // gents ones; a Ladies Senior gets the two ladies ones. Neither gets the
  // other's, which is the distinction that adding them made.
  if (t === "gents-seniors")  return mIsSenior && mBase === "gents";
  if (t === "ladies-seniors") return mIsSenior && mBase === "ladies";

  // Ordinary section competitions. A senior still belongs to their section, so
  // a Gents Senior sees the gents competitions as well as the senior ones.
  if (t === "gents")  return mBase === "gents";
  if (t === "ladies") return mBase === "ladies";

  // Unknown tag. Deliberately not visible: a competition tagged with something
  // nobody has taught this function about is a mistake to notice, not a row to
  // quietly show to the wrong section.
  return false;
}

// The Settings chips: All / Gents / Ladies / Seniors / Mixed. "Seniors" means
// every senior set — the generic four and both 2026 section-specific sets —
// because a filter chip labelled Seniors that hides five senior competitions
// is the bug this file exists to stop.
export function matchesSectionFilter(tSection, filter) {
  if (filter === "all") return true;
  const t = String(tSection || "gents").toLowerCase();
  if (filter === "seniors") return isSeniorSection(t);
  // Gents/Ladies mean the plain section, not its senior set — the Seniors chip
  // is where those live.
  if (filter === "gents")  return t === "gents";
  if (filter === "ladies") return t === "ladies";
  return t === filter;
}
