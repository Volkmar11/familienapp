// Rendert public/zeitreise.html headless Frame für Frame und baut eine MP4.
// Voraussetzungen: ffmpeg installiert + einmalig:  npm i -D puppeteer
// Nutzung: node scripts/render-zeitreise.cjs  ->  zeitreise-17-juni-1956.mp4
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const FPS = 30;
const OUT_DIR = '/tmp/zr_frames';
const HTML = 'file://' + path.resolve(__dirname, '../public/zeitreise.html');

(async () => {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--force-color-profile=srgb'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(HTML, { waitUntil: 'load' });

  // Auf das Hintergrundbild warten, dann Auto-Play stoppen
  await page.waitForFunction('window.bgReady === true', { timeout: 20000 });
  await page.evaluate(() => { try { cancelAnimationFrame(raf); } catch (e) {} });

  const T_END = await page.evaluate(() => T_END);
  const total = Math.ceil(T_END * FPS);
  console.log(`Rendere ${total} Frames (${T_END.toFixed(1)}s @ ${FPS}fps) …`);

  // Overlay-Buttons ausblenden, damit sie nicht im Bild landen
  await page.addStyleTag({ content: '#bar,#hint{display:none!important}' });
  const canvasEl = await page.$('#c');

  for (let i = 0; i < total; i++) {
    const t = i / FPS;
    await page.evaluate((tt) => {
      try { cancelAnimationFrame(raf); } catch (e) {}
      render(tt);
    }, t);
    await canvasEl.screenshot({ path: path.join(OUT_DIR, `f${String(i).padStart(4, '0')}.png`) });
    if (i % 30 === 0) process.stdout.write(`\r  ${i}/${total}`);
  }
  process.stdout.write(`\r  ${total}/${total}\n`);
  await browser.close();

  const out = path.resolve(__dirname, '../zeitreise-17-juni-1956.mp4');
  console.log('Baue MP4 …');
  execFileSync('ffmpeg', [
    '-y', '-framerate', String(FPS),
    '-i', path.join(OUT_DIR, 'f%04d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    out,
  ], { stdio: 'inherit' });

  console.log('Fertig:', out);
})().catch((e) => { console.error(e); process.exit(1); });
