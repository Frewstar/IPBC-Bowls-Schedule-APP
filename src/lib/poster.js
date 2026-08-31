// ── Event posters ───────────────────────────────────────────────────────────
// The promoter's JPEG, on the event and on the Open Graph card of the shared
// link. The bytes live in Supabase Storage; club_events.poster_path holds the
// object path and nothing else.
//
// Not base64 in the row. profile.avatar does that and at 60px it is fine, but
// a readable poster is 300KB-1MB and base64 adds a third again — on
// club_events that would be every member downloading every poster on every
// What's On load.
import { supabase } from "./supabase.js";

export const POSTER_BUCKET = "event-posters";

// Supabase can resize on read, which is what the 64px thumbnail wants. It is a
// paid add-on, and on this project it is OFF — verified against production:
//
//   GET /storage/v1/render/image/public/event-posters/<path>?width=128
//   403 {"error":"FeatureNotEnabled","message":"feature not enabled for this tenant"}
//
// So the thumbnail is the full object scaled by the browser. That is only
// tolerable because the upload path below caps a poster at ~1400px and under
// 300KB, and because the same bytes are what the detail view needs a tap
// later — the thumbnail is a prefetch, not waste. A typical month has none.
//
// Flip this to true after enabling Image Transformations on the Supabase
// dashboard and thumbnails become ~4KB. Nothing else needs to change; the img
// tags already fall back to the full object if a render URL fails.
export const IMAGE_TRANSFORMS = false;

// The public object URL. The bucket is public so this carries no credentials,
// which is exactly what Facebook's crawler needs.
export function posterUrl(path, transform) {
  if (!path) return null;
  const opts = transform && IMAGE_TRANSFORMS ? { transform } : undefined;
  return supabase.storage.from(POSTER_BUCKET).getPublicUrl(path, opts).data.publicUrl;
}

export function posterThumbUrl(path, px = 128) {
  return posterUrl(path, { width: px, height: px, resize: "cover", quality: 70 });
}

// ── Getting it down to size, on the phone, before it leaves ─────────────────
// A camera shot of a poster on the clubhouse wall is 4MB and 4032px. Uploading
// that raw would blow the bucket's 2MB limit, cost the uploader their data
// allowance, and hand every member a 4MB download.
const MAX_EDGE = 1400;      // long edge, enough to read a poster full-screen
const TARGET_BYTES = 300 * 1024;
const QUALITY_STEPS = [0.8, 0.7, 0.6, 0.5];

// createImageBitmap with imageOrientation:"from-image" applies the EXIF
// rotation. Without it a poster photographed in portrait arrives on its side,
// which is the single most likely way this feature looks broken. The
// HTMLImageElement path is the fallback for browsers without it.
async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch { /* fall through */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That file isn't an image the phone can read."));
      img.src = url;
    });
  } finally {
    // Revoking immediately is safe: the decode has already happened.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function canvasToBlob(canvas, quality) {
  return new Promise(resolve => canvas.toBlob(b => resolve(b), "image/jpeg", quality));
}

// Always re-encodes, even for a small file: the result is then known to be
// JPEG, known to be within the bucket's MIME list, and stripped of the EXIF
// the camera attached — which on a phone photo includes where it was taken.
export async function shrinkForUpload(file) {
  const bmp = await decode(file);
  const w = bmp.width, h = bmp.height;
  if (!w || !h) throw new Error("That file isn't an image the phone can read.");

  let scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  let blob = null;

  // Drop the quality first, and only then the size: a poster that has gone
  // soft is still readable, one that has gone small is not.
  for (let pass = 0; pass < 3 && !blob; pass++) {
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";           // JPEG has no alpha; a transparent PNG
    ctx.fillRect(0, 0, cw, ch);       // would otherwise come out black.
    ctx.drawImage(bmp, 0, 0, cw, ch);

    for (const q of QUALITY_STEPS) {
      const b = await canvasToBlob(canvas, q);
      if (!b) throw new Error("The phone couldn't process that image.");
      if (b.size <= TARGET_BYTES) { blob = b; break; }
      blob = b;                       // keep the smallest we managed
    }
    if (blob && blob.size <= TARGET_BYTES) break;
    blob = null;
    scale *= 0.75;
  }

  if (!blob) throw new Error("Couldn't get that image small enough — try a screenshot of it instead.");
  if (bmp.close) bmp.close();
  return blob;
}

// ── Upload ──────────────────────────────────────────────────────────────────
// Two steps, and the first one is the lock. bowls_poster_ticket checks the PIN
// and the role server-side and hands back ONE object path; the bucket's insert
// policy allows a write only to a path that has a live ticket. The publishable
// key on its own uploads nothing.
export async function uploadPoster({ eventId, name, pin, file }) {
  const blob = await shrinkForUpload(file);

  const { data: ticket, error } = await supabase.rpc("bowls_poster_ticket", {
    p_name: name || "", p_pin: pin || "", p_event_id: eventId,
  });
  if (error) throw new Error(`Couldn't get permission to upload: ${error.message}`);
  if (!ticket || ticket.status !== "ok") throw new Error(ticket?.message || "Couldn't get permission to upload.");

  const { error: upErr } = await supabase.storage.from(POSTER_BUCKET)
    // 300 rather than the default hour: a poster taken down by mistake stops
    // being served from the CDN in five minutes rather than sixty. Replacing
    // one is instant either way — every upload gets a fresh filename.
    .upload(ticket.path, blob, { contentType: "image/jpeg", cacheControl: "300", upsert: false });
  if (upErr) throw new Error(`Couldn't upload the poster: ${upErr.message}`);

  return { path: ticket.path, bytes: blob.size };
}

// Really deletes the object, not just the column. Christine will pick the
// wrong file at some point, and a "removed" poster still sitting on a public
// URL is the version of this that matters.
export async function removePoster({ path, name, pin }) {
  const { data: ticket, error } = await supabase.rpc("bowls_poster_remove_ticket", {
    p_name: name || "", p_pin: pin || "", p_object_path: path,
  });
  if (error) throw new Error(`Couldn't get permission to remove it: ${error.message}`);
  if (!ticket || ticket.status !== "ok") throw new Error(ticket?.message || "Couldn't get permission to remove it.");

  const { data, error: rmErr } = await supabase.storage.from(POSTER_BUCKET).remove([path]);
  if (rmErr) throw new Error(`Couldn't remove the poster: ${rmErr.message}`);
  // remove() reports no error when the delete policy refuses — it just deletes
  // nothing. An empty result is the failure, so say so rather than showing
  // "Removed" over a file that is still there.
  if (!data || data.length === 0) throw new Error("The poster wasn't removed — try again in a moment.");
}

// The link Christine pastes into Facebook. /e/<id> is served by api/share.js
// with the poster as the Open Graph image; a person following it lands in the
// app on that night.
export function shareUrl(eventId) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/e/${eventId}`;
}
