// Rasterise the brand SVG into the PNG sizes a PWA manifest needs (Next only auto-handles
// favicons, not manifest icons). Run: node scripts/gen-pwa-icons.mjs
import sharp from "sharp";
import { mkdirSync, readFileSync } from "node:fs";

const OUT = "public/icons";
mkdirSync(OUT, { recursive: true });

const brand = readFileSync("src/app/icon.svg");

// White star on transparent — composited onto a full-bleed brand square for the maskable icon.
const star = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
     <polygon fill="#fff" points="16 4.5 18.3 13.7 27.5 16 18.3 18.3 16 27.5 13.7 18.3 4.5 16 13.7 13.7"/>
     <polygon fill="#fff" points="25 3.5 25.7 6.3 28.5 7 25.7 7.7 25 10.5 24.3 7.7 21.5 7 24.3 6.3"/>
   </svg>`,
);

for (const size of [192, 512]) {
  await sharp(brand, { density: 512 }).resize(size, size).png().toFile(`${OUT}/icon-${size}.png`);
}

// Maskable: star kept inside the ~80% safe zone on a solid brand background.
const inner = await sharp(star, { density: 512 }).resize(320, 320).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#0052FF" } })
  .composite([{ input: inner, gravity: "center" }])
  .png()
  .toFile(`${OUT}/icon-maskable-512.png`);

console.log("✅ wrote icon-192.png, icon-512.png, icon-maskable-512.png to", OUT);
