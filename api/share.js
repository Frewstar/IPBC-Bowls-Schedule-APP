// ── /e/<event id> — the link Christine pastes into Facebook ─────────────────
//
// This is most of the point of posters. The app is a single-page bundle, so
// the HTML every visitor gets is the same index.html with no event in it;
// Facebook's crawler runs no JavaScript, so a link to the app shows the club
// badge and the word "Irvine Park Bowling Club" whatever you link to. Nobody
// stops scrolling for that.
//
// A serverless function can answer the crawler with the real thing: the
// poster as og:image, the night as the title. A person following the same link
// is sent on into the app, landing on that event.
//
// Rewritten from /e/:id in vercel.json. Serves HTML, never JSON.
//
// The URL and publishable key are the ones in src/lib/supabase.js — the same
// pair that ships inside the JavaScript bundle, so there is nothing here that
// isn't already public. Kept literal rather than imported because this file is
// built by Vercel's Node runtime, not by Vite.
const SUPABASE_URL = "https://pjszrcaikpxdasknwyjb.supabase.co";
const SUPABASE_KEY = "sb_publishable_uxYyWwgMqVG-lButlv7ymg_zXRoHm29";
const BUCKET = "event-posters";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Same reading as the app: "8pm", "4–9pm". Kept in step with fmtWhen in
// WhatsOn.jsx by hand — two files, because this one cannot import from the
// Vite bundle. If the app's wording changes, change it here too.
function fmtTime(t, suffix = true) {
  if (!t) return "";
  const [h, m] = String(t).split(":").map(Number);
  if (h === 0 && m === 0) return "midnight";
  const s = suffix ? (h < 12 ? "am" : "pm") : "";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${s}` : `${h12}.${String(m).padStart(2, "0")}${s}`;
}
function fmtWhen(start, end) {
  if (!start) return end ? `until ${fmtTime(end)}` : "";
  if (!end) return fmtTime(start);
  const sh = Number(String(start).split(":")[0]), eh = Number(String(end).split(":")[0]);
  const sameHalf = (sh < 12) === (eh < 12) && !(eh === 0 && sh !== 0);
  return `${fmtTime(start, !sameHalf)}–${fmtTime(end)}`;
}
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function fmtDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y) return "";
  // Local-midnight, never toISOString: a British evening must not render as
  // the previous day. Same rule as the app.
  const dt = new Date(y, m - 1, d);
  return `${DAYS[dt.getDay()]} ${d} ${MONTHS[m - 1]}`;
}

function page({ origin, id, title, description, image, imageAlt }) {
  const appUrl = id ? `${origin}/?event=${encodeURIComponent(id)}` : `${origin}/`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Irvine Park Bowling Club">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(origin)}/e/${esc(id)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:alt" content="${esc(imageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<meta http-equiv="refresh" content="0; url=${esc(appUrl)}">
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#faf8f5; color:#4a0e1f; font-family:system-ui,sans-serif; text-align:center; padding:24px; }
  a { color:#6b1d2e; }
</style>
</head>
<body>
  <div>
    <p>${esc(title)}</p>
    <p><a href="${esc(appUrl)}">Open it in the club app</a></p>
  </div>
  <script>location.replace(${JSON.stringify(appUrl)});</script>
</body>
</html>`;
}

export default async function handler(req, res) {
  const id = String((req.query && req.query.id) || "");
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const origin = `${proto}://${host}`;
  // The club badge, for an event with no poster and for anything that goes
  // wrong. A card showing the club still reads as the club.
  const fallbackImage = `${origin}/icon-512.png`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");

  if (!UUID.test(id)) {
    // Not a link this app made. Send them to the app rather than to an error.
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(404).send(page({
      origin, id: "", title: "Irvine Park Bowling Club",
      description: "What's on at the club.", image: fallbackImage, imageAlt: "Irvine Park Bowling Club",
    }));
  }

  let ev = null;
  try {
    const url = `${SUPABASE_URL}/rest/v1/club_events`
      + `?id=eq.${encodeURIComponent(id)}`
      + `&select=id,title,detail,event_date,start_time,end_time,cancelled,poster_path`;
    const r = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      // Well inside Vercel's limit; a crawler that waits is better than one
      // that gets a card with no image because we hung.
      signal: AbortSignal.timeout(4000),
    });
    if (r.ok) ev = (await r.json())[0] || null;
  } catch { /* fall through to the generic card */ }

  if (!ev) {
    // A night that has been removed. Still a working link into the app.
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.status(200).send(page({
      origin, id, title: "Irvine Park Bowling Club",
      description: "What's on at the club.", image: fallbackImage, imageAlt: "Irvine Park Bowling Club",
    }));
  }

  const when = [fmtDate(ev.event_date), fmtWhen(ev.start_time, ev.end_time)].filter(Boolean).join(", ");
  const title = ev.cancelled ? `CANCELLED — ${ev.title}` : ev.title;
  const description = [
    ev.cancelled ? `This has been cancelled. It was ${when}.` : when,
    ev.detail || "",
    "Irvine Park Bowling Club",
  ].filter(Boolean).join(" · ");

  const image = ev.poster_path
    ? `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${ev.poster_path.split("/").map(encodeURIComponent).join("/")}`
    : fallbackImage;

  // Five minutes: long enough that a link doing the rounds isn't one request
  // per share, short enough that a poster added after the first paste shows up
  // the same evening.
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  return res.status(200).send(page({
    origin, id, title, description, image,
    imageAlt: ev.poster_path ? ev.title : "Irvine Park Bowling Club",
  }));
}
