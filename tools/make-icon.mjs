// Builds assets/icon.png and assets/shipshot.ico from assets/icon.svg.
// Run after changing the logo: node tools/make-icon.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../lib/web.mjs';

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const svg = fs.readFileSync(path.join(ASSETS, 'icon.svg'), 'utf8');

const browser = await launchBrowser(false);
const page = await browser.newPage();
const png = async size => {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>*{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
  return page.screenshot({ omitBackground: true });
};

fs.writeFileSync(path.join(ASSETS, 'icon.png'), await png(512));

// An .ico is a small header, one directory entry per size, then the PNG files themselves.
const images = [];
for (const s of SIZES) images.push(await png(s));
const head = Buffer.alloc(6 + 16 * images.length);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(images.length, 4);
let offset = head.length;
images.forEach((img, i) => {
  const e = 6 + 16 * i, s = SIZES[i] % 256; // 256 is written as 0
  head.writeUInt8(s, e);
  head.writeUInt8(s, e + 1);
  head.writeUInt16LE(1, e + 4);
  head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(img.length, e + 8);
  head.writeUInt32LE(offset, e + 12);
  offset += img.length;
});
fs.writeFileSync(path.join(ASSETS, 'shipshot.ico'), Buffer.concat([head, ...images]));
await browser.close();
console.log('  wrote assets/icon.png and assets/shipshot.ico');
