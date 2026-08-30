// Run with: node generate-icons.mjs
// Requires: npm install sharp
//
// Regenerates every icon in public/ from the club crest at ipbc-logo.png.
// That file is the master — replace it and re-run this rather than editing the
// generated sizes by hand.

import sharp from "sharp";

const MASTER = "./ipbc-logo.png";
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

// scale = how much of the canvas the crest fills.
// Maskable icons are cropped to whatever shape the launcher likes, so the crest
// has to sit inside the safe zone — the middle 80% — with the background
// running to the edges.
const OUTPUTS = [
  { name: "ipbc-badge.png",        size: 192, scale: 1.00 },  // the crest in the app header, shown at 46px
  { name: "icon-192.png",          size: 192, scale: 0.96 },
  { name: "icon-512.png",          size: 512, scale: 0.96 },
  { name: "apple-touch-icon.png",  size: 180, scale: 0.96 },
  { name: "favicon-32.png",        size:  32, scale: 1.00 },
  { name: "icon-512-maskable.png", size: 512, scale: 0.72 },
  { name: "ipbc-logo.png",         size: 512, scale: 1.00 },  // spare copy, unused by the app
];

for (const { name, size, scale } of OUTPUTS) {
  const inner = Math.round(size * scale);
  const crest = await sharp(MASTER)
    .resize(inner, inner, { fit: "contain", background: WHITE })
    .toBuffer();

  await sharp({ create: { width: size, height: size, channels: 3, background: WHITE } })
    .composite([{ input: crest, gravity: "centre" }])
    // The crest is flat colour, so a palette PNG is a fraction of the size and
    // visually identical. These are all precached by the service worker, and
    // members are on phones.
    .png({ palette: true, colours: 128, compressionLevel: 9 })
    .toFile(`./public/${name}`);

  console.log(`✅ public/${name}  ${size}×${size}`);
}

console.log("\n🎯 Icons regenerated from ipbc-logo.png");
