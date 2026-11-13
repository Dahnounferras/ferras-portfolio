#!/usr/bin/env node
/**
 * Removes GPS location from source photos — losslessly (no re-encode).
 * Lens, exposure, camera and date EXIF are kept for the site's captions.
 *
 *   node scripts/strip-gps.mjs            # every JPEG under src/
 *   node scripts/strip-gps.mjs --staged   # only staged JPEGs (pre-commit hook), re-stages them
 *
 * The live site already strips all metadata from served images; this keeps
 * location out of the originals committed to the (public) repo too.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import piexif from 'piexifjs';

const JPEG = /\.(jpe?g)$/i;
const OTHER_IMAGE = /\.(png|webp|heic|tiff?)$/i;
const staged = process.argv.includes('--staged');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = staged
  ? execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { encoding: 'utf8' })
      .split('\0')
      .filter(Boolean)
  : walk('src');

let cleaned = 0;
for (const file of files) {
  if (OTHER_IMAGE.test(file)) {
    console.warn(`strip-gps: skipped ${file} — only JPEGs are checked; export as JPEG or make sure it has no location data.`);
    continue;
  }
  if (!JPEG.test(file)) continue;

  const data = readFileSync(file).toString('binary');
  let exif;
  try {
    exif = piexif.load(data);
  } catch {
    continue; // no EXIF block
  }
  if (!exif.GPS || Object.keys(exif.GPS).length === 0) continue;

  exif.GPS = {};
  if (exif['0th']) delete exif['0th'][piexif.ImageIFD.GPSTag];
  const out = piexif.insert(piexif.dump(exif), data);
  writeFileSync(file, Buffer.from(out, 'binary'));
  if (staged) execFileSync('git', ['add', '--', file]);
  cleaned++;
  console.log(`strip-gps: removed location from ${file}`);
}

if (cleaned) console.log(`strip-gps: cleaned ${cleaned} photo${cleaned > 1 ? 's' : ''}.`);
