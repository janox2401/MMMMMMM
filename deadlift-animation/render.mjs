// Rendert index.html Bild für Bild (Playwright) zu einem Video, erzeugt den Ton und mischt beides.
//   node render.mjs                     -> deadlift.mp4
//   node render.mjs --preview 1,5.5,13  -> einzelne PNG-Standbilder (preview-<t>.png)
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const previewIdx = args.indexOf("--preview");
const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : dir;

const browser = await chromium.launch({ args: ["--disable-gpu-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", e => console.error("Seitenfehler:", e.message));
await page.goto("file://" + path.join(dir, "index.html") + "?export");
const { DURATION, FPS } = await page.evaluate(() => ({ DURATION: TL.DURATION, FPS: TL.FPS }));
const canvas = page.locator("#c");

const run = (cmd, a) => new Promise((res, rej) => { const p = spawn(cmd, a, { stdio: ["ignore", "ignore", "inherit"] }); p.on("close", c => c ? rej(new Error(cmd + " " + c)) : res()); });

if (previewIdx >= 0) {
  for (const t of args[previewIdx + 1].split(",").map(Number)) {
    await page.evaluate(t => renderFrame(t), t);
    await canvas.screenshot({ path: path.join(outDir, `preview-${t}.png`) });
  }
} else {
  const silent = path.join(outDir, "video-silent.mp4");
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-pix_fmt", "yuv420p", "-crf", "17", silent], { stdio: ["pipe", "ignore", "inherit"] });
  const frames = Math.round(DURATION * FPS);
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate(i => renderFrame(i / TL.FPS, i), i);
    ff.stdin.write(await canvas.screenshot({ type: "png" }));
    if (i % 48 === 0) console.log(`Frame ${i}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on("close", r));
  await run("node", [path.join(dir, "gen-audio.mjs"), path.join(outDir, "audio.wav")]);
  await run("ffmpeg", ["-y", "-loglevel", "error", "-i", silent, "-i", path.join(outDir, "audio.wav"),
    "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", path.join(dir, "deadlift.mp4")]);
  console.log("Fertig: deadlift.mp4");
}
await browser.close();
