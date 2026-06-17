// Run once with: node generate-icons.mjs
// Requires: npm install sharp
// Generates icon-192.png, icon-512.png, apple-touch-icon.png from public/icon.svg

import sharp from "sharp";
import { readFileSync } from "fs";

const svg = readFileSync("./public/icon.svg");

const sizes = [
  { name: "icon-192.png",        size: 192 },
  { name: "icon-512.png",        size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

for (const { name, size } of sizes) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(`./public/${name}`);
  console.log(`✅ Generated public/${name}`);
}

console.log("\n🎯 All icons generated — ready to build!");
