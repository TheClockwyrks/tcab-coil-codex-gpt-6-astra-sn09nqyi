/* global document */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
import process from "node:process";
import { URL } from "node:url";

const root = resolve("dist");
const server = createServer(async (req, res) => {
  try {
    let name = new URL(req.url, "http://localhost").pathname.replace(
      /^\/coil\//,
      "/",
    );
    if (name.endsWith("/")) name += "index.html";
    const file = resolve(root, `.${name}`);
    assert(file.startsWith(`${root}/`));
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type":
        {
          ".html": "text/html",
          ".js": "application/javascript",
          ".png": "image/png",
          ".wav": "audio/wav",
        }[extname(file)] ?? "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const prefix of ["/", "/coil/"]) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });
    const errors = [],
      loaded = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (/\.(png|wav)$/.test(r.url())) {
        assert.equal(r.status(), 200);
        loaded.push(r.url());
      }
    });
    await page.goto(base + prefix);
    await page.waitForTimeout(450);
    assert.equal(loaded.length, 11);
    const pixels = () =>
      page.evaluate(() => document.querySelector("canvas").toDataURL());
    const title = await pixels();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(190);
    assert.notEqual(await pixels(), title);
    await page.keyboard.press("KeyP");
    await page.waitForTimeout(60);
    const paused = await pixels();
    await page.waitForTimeout(300);
    assert.equal(await pixels(), paused);
    await page.keyboard.press("KeyM");
    await page.waitForTimeout(60);
    assert.notEqual(await pixels(), paused);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    await page.setViewportSize({ width: 900, height: 600 });
    await page.waitForTimeout(80);
    assert.deepEqual(errors, []);
    await page.close();
  }
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/coil/");
  await page.waitForTimeout(450);
  // Engine fit: a centered 1280×720 stage on a portrait surface.
  const scale = 390 / 1280,
    top = (844 - 720 * scale) / 2;
  await page.touchscreen.tap(640 * scale, top + 447 * scale);
  await page.waitForTimeout(150);
  assert.deepEqual(errors, []);
  await context.close();
  process.stdout.write(
    "Chromium: all 11 assets loaded at root and /coil/; play, pause, mute, resize and touch passed.\n",
  );
} finally {
  await browser.close();
  server.close();
}
