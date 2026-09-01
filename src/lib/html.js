// ════════════════════════════════════════════════════════════════════════════
//  Escaping for the one place this app builds HTML by hand
//
//  React escapes everything it renders, which is why nothing else here needs
//  this. The tie sheet is the exception: buildTieSheetHtml assembles a whole
//  HTML document as a string and that document is then opened with
//  window.document.write() or as a blob: URL — both of which run in the app's
//  own origin, where the member's PIN is sitting in localStorage.
//
//  The names on the sheet are player names off the draw. They are not
//  attacker-supplied in any realistic sense at a bowling club, but they are
//  not constants either, and the honest reason to escape them is smaller than
//  a script tag: one member with an ampersand or an apostrophe in their name
//  renders as `&amp;` on a printed sheet pinned to the clubhouse wall.
// ════════════════════════════════════════════════════════════════════════════

// & first, or the escapes escape each other.
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
