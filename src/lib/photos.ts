/**
 * Photo pipeline.
 *
 * Digital: drop any JPG/PNG/WebP straight off the camera into src/photos/digital/.
 *   Camera, lens, aperture, shutter, ISO, focal length and date are read from EXIF
 *   at build time. src/photos/digital/photos.json can optionally add a title/place
 *   (or override any EXIF field) per file name.
 *
 * Film: one folder per roll in src/photos/film/<roll>/ with scans + a roll.json
 *   ({ title, stock, camera, date, notes? }). Frames are ordered by file name.
 *
 * Published images are re-encoded by Astro/sharp, which drops all metadata —
 * GPS location never reaches the live site.
 */
import type { ImageMetadata } from 'astro';
import exifr from 'exifr';
import path from 'node:path';

type ImageModule = { default: ImageMetadata };

export interface DigitalPhoto {
  id: string;
  file: string;
  image: ImageMetadata;
  title: string;
  place?: string;
  camera?: string;
  lens?: string;
  settings?: string; // "35mm · f/1.8 · 1/250s · ISO 100"
  year?: string;
  taken?: Date;
}

export interface FilmFrame {
  image: ImageMetadata;
  number: string; // edge marking: 1, 1A, 2, 2A…
}

export interface FilmRoll {
  id: string;
  title: string;
  stock: string;
  camera: string;
  date: string;
  notes?: string;
  frames: FilmFrame[];
}

interface PhotoNote {
  title?: string;
  place?: string;
  camera?: string;
  lens?: string;
  settings?: string;
  year?: string;
}

const digitalImages = import.meta.glob<ImageModule>(
  '/src/photos/digital/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}',
  { eager: true },
);
const digitalNotes = import.meta.glob<{ default: Record<string, PhotoNote> }>(
  '/src/photos/digital/photos.json',
  { eager: true },
);
const filmImages = import.meta.glob<ImageModule>(
  '/src/photos/film/*/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}',
  { eager: true },
);
const filmRolls = import.meta.glob<{ default: Omit<FilmRoll, 'id' | 'frames'> }>(
  '/src/photos/film/*/roll.json',
  { eager: true },
);

// Friendlier names for common camera model strings found in EXIF.
const CAMERA_NAMES: Record<string, string> = {
  'ILCE-6000': 'Sony a6000',
  'ILCE-6100': 'Sony a6100',
  'ILCE-6400': 'Sony a6400',
  'ILCE-6600': 'Sony a6600',
  'ILCE-6700': 'Sony a6700',
  'ILCE-7M4': 'Sony a7 IV',
  'ILCE-1M2': 'Sony a1 II',
  'ILME-FX3': 'Sony FX3',
};

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

function shutter(t?: number) {
  if (!t) return undefined;
  return t >= 1 ? `${+t.toFixed(1)}s` : `1/${Math.round(1 / t)}s`;
}

async function readExif(globKey: string) {
  try {
    const file = path.join(process.cwd(), globKey);
    const x = await exifr.parse(file, {
      pick: ['Make', 'Model', 'LensModel', 'FNumber', 'ExposureTime', 'ISO', 'FocalLength', 'DateTimeOriginal'],
      gps: false,
    });
    if (!x) return {};
    const settings = [
      x.FocalLength && `${Math.round(x.FocalLength)}mm`,
      x.FNumber && `f/${+Number(x.FNumber).toFixed(1)}`,
      shutter(x.ExposureTime),
      x.ISO && `ISO ${x.ISO}`,
    ].filter(Boolean);
    const taken: Date | undefined = x.DateTimeOriginal instanceof Date ? x.DateTimeOriginal : undefined;
    return {
      camera: x.Model ? CAMERA_NAMES[x.Model] ?? `${x.Make ?? ''} ${x.Model}`.trim() : undefined,
      lens: x.LensModel as string | undefined,
      settings: settings.length ? settings.join(' · ') : undefined,
      year: taken ? String(taken.getFullYear()) : undefined,
      taken,
    };
  } catch {
    return {};
  }
}

let digitalCache: Promise<DigitalPhoto[]> | undefined;

/** All digital photos, newest first (by EXIF date, then file name). */
export function getDigitalPhotos(): Promise<DigitalPhoto[]> {
  digitalCache ??= (async () => {
    const notes = Object.values(digitalNotes)[0]?.default ?? {};
    const photos = await Promise.all(
      Object.entries(digitalImages).map(async ([key, mod]) => {
        const file = path.basename(key);
        const exif = await readExif(key);
        const note = notes[file] ?? {};
        return {
          id: file.replace(/\.[^.]+$/, ''),
          file,
          image: mod.default,
          title: note.title ?? file.replace(/\.[^.]+$/, ''),
          ...exif,
          ...note,
        } satisfies DigitalPhoto;
      }),
    );
    return photos.sort((a, b) => {
      if (a.taken && b.taken) return b.taken.getTime() - a.taken.getTime();
      if (a.taken || b.taken) return a.taken ? -1 : 1;
      return byName(a.file, b.file);
    });
  })();
  return digitalCache;
}

/** All film rolls, newest folder last (roll-01, roll-02…), frames in file order. */
export function getFilmRolls(): FilmRoll[] {
  const rolls = new Map<string, FilmRoll>();
  for (const [key, mod] of Object.entries(filmRolls)) {
    const id = path.basename(path.dirname(key));
    rolls.set(id, { id, ...mod.default, frames: [] });
  }
  const keys = Object.keys(filmImages).sort(byName);
  for (const key of keys) {
    const id = path.basename(path.dirname(key));
    let roll = rolls.get(id);
    if (!roll) {
      roll = { id, title: id, stock: '', camera: '', date: '', frames: [] };
      rolls.set(id, roll);
    }
    const n = roll.frames.length;
    roll.frames.push({
      image: filmImages[key].default,
      number: `${Math.floor(n / 2) + 1}${n % 2 ? 'A' : ''}`,
    });
  }
  return [...rolls.values()].filter((r) => r.frames.length).sort((a, b) => byName(a.id, b.id));
}

export function captionFor(p: DigitalPhoto) {
  return [p.lens ?? p.camera, p.settings, [p.place, p.year].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(' · ');
}
