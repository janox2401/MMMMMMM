// Rendert index.html Bild für Bild mit Playwright und baut daraus mit ffmpeg eine MP4.
// Aufruf: node render.mjs   →  erzeugt hallo.mp4
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const FPS = 30;
const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, "hallo.mp4");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("file://" + path.join(dir, "index.html") + "?export");
await page.evaluate(() => document.fonts.ready);
const duration = await page.evaluate(() => window.DURATION);

// Frames als PNG direkt an ffmpeg streamen
const ffmpeg = spawn("ffmpeg", [
  "-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", out,
], { stdio: ["pipe", "ignore", "inherit"] });

const frames = Math.round(duration * FPS);
for (let i = 0; i < frames; i++) {
  await page.evaluate(t => window.render(t), i / FPS);
  ffmpeg.stdin.write(await page.screenshot({ type: "png" }));
}
ffmpeg.stdin.end();
await new Promise(r => ffmpeg.on("close", r));
await browser.close();
console.log(`Fertig: ${out} (${frames} Frames)`);
