import { instance } from '../sync';
import { idb } from '../storage/idb';
import { auth } from '../auth.svelte';
import { settings } from '../settings.svelte';

/*
  Everything the assistant is allowed to see.

  "Allowed" is the operative word: this reads only through `instance`, which
  is RLS-scoped to the signed-in user, and only through the local IndexedDB
  blob store, which is this device's. There is no path here to another user's
  rows — not because this file is careful, but because the layer underneath it
  cannot return them. One person's terminal is one person's terminal.

  The pack is text, assembled fresh per question rather than cached, because
  the whole point is that the assistant knows what is true *now*. It is capped
  hard: a model given fifty notes verbatim will answer about the wrong one,
  and a free tier will not carry it. Bodies are trimmed, lists are topped, and
  the oldest material is what goes.
*/

const MAX_NOTE_BODY = 400;
const MAX_NOTES = 25;
const MAX_THREADS = 12;
const MAX_MSGS_PER_THREAD = 12;
const MAX_TRACKS = 40;

interface Note {
  id: string;
  title?: string;
  body?: string;
  updated?: number;
}
interface Thread {
  id: string;
  name?: string;
  msgs?: Array<{ text?: string; at?: number }>;
}

function clip(text: string, max: number): string {
  const t = (text ?? '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function stamp(n?: number): string {
  if (!n) return '';
  return new Date(n).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Photos: how many, and when. The bytes are handled separately — see below. */
async function photoSummary(): Promise<string> {
  try {
    const keys = (await idb.keys('photos')) as string[];
    if (!keys.length) return 'Camera: no photos saved.';
    const dates = keys
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => b - a);
    const newest = dates[0] ? stamp(dates[0]) : 'unknown';
    const oldest = dates[dates.length - 1] ? stamp(dates[dates.length - 1]) : 'unknown';
    return `Camera: ${keys.length} photo${keys.length === 1 ? '' : 's'} saved on this device, newest ${newest}, oldest ${oldest}.`;
  } catch {
    return 'Camera: photo library unreadable on this device.';
  }
}

export async function buildContext(): Promise<string> {
  if (!auth.user) return '';

  const [notesState, msgState, weatherState, musicState, cameraState, photos] = await Promise.all([
    instance.getAppState('notes'),
    instance.getAppState('messages'),
    instance.getAppState('weather'),
    instance.getAppState('music'),
    instance.getAppState('camera'),
    photoSummary()
  ]);

  const out: string[] = [];
  const now = new Date();

  out.push('=== This terminal ===');
  out.push(`Signed in as: ${auth.user.displayName}`);
  out.push(`Now: ${now.toLocaleString()}`);
  out.push(`Terminal name: ${settings.current.deviceLabel}`);

  /* --- notes --- */
  const notes = (notesState?.notes as Note[] | undefined) ?? [];
  out.push('', `=== Notes (${notes.length}) ===`);
  if (!notes.length) {
    out.push('None.');
  } else {
    for (const n of notes.slice(0, MAX_NOTES)) {
      const title = clip(n.title ?? '', 80) || 'untitled';
      const body = clip(n.body ?? '', MAX_NOTE_BODY);
      out.push(`- [${stamp(n.updated)}] ${title}${body ? `\n  ${body}` : ''}`);
    }
    if (notes.length > MAX_NOTES) out.push(`  …and ${notes.length - MAX_NOTES} older notes.`);
  }

  /* --- messages --- */
  const threads = (msgState?.threads as Thread[] | undefined) ?? [];
  out.push('', `=== Message threads (${threads.length}) ===`);
  if (!threads.length) {
    out.push('None.');
  } else {
    for (const t of threads.slice(0, MAX_THREADS)) {
      out.push(`- ${t.name ?? 'untitled thread'} (${t.msgs?.length ?? 0} messages)`);
      for (const m of (t.msgs ?? []).slice(-MAX_MSGS_PER_THREAD)) {
        out.push(`    [${stamp(m.at)}] ${clip(m.text ?? '', 180)}`);
      }
    }
  }

  /* --- photos --- */
  out.push('', '=== Camera ===');
  out.push(photos);
  const shots = (cameraState?.shots as unknown[] | undefined)?.length;
  if (shots) out.push(`Gallery index carries ${shots} entries.`);
  out.push(
    'You cannot see the photos themselves unless one is attached to the question. ' +
      'If asked about what is in a photo, say it must be attached.'
  );

  /* --- weather --- */
  const place = weatherState?.place as { name?: string } | undefined;
  out.push('', '=== Weather ===');
  out.push(place?.name ? `Saved place: ${place.name}` : 'No place saved.');

  /* --- music --- */
  const tracks = (musicState?.tracks as Array<{ name?: string }> | undefined) ?? [];
  out.push('', `=== Music (${tracks.length} tracks) ===`);
  if (!tracks.length) out.push('Library empty.');
  else out.push(tracks.slice(0, MAX_TRACKS).map((t) => `- ${clip(t.name ?? '', 90)}`).join('\n'));

  /* --- settings --- */
  const s = settings.current;
  out.push('', '=== Settings ===');
  out.push(
    `sound ${s.soundEnabled ? 'on' : 'off'} at ${Math.round(s.soundVolume * 100)}%, ` +
      `${s.use24hClock ? '24-hour' : '12-hour'} clock, ` +
      `idle after ${s.idleTimeoutSec === 0 ? 'never' : `${s.idleTimeoutSec}s`}, ` +
      `graphics tier ${s.graphics}.`
  );

  return out.join('\n');
}

/** The most recent photo as a data URL, for questions that are about an image. */
export async function latestPhoto(): Promise<{ data: string; mime: string } | null> {
  try {
    const keys = (await idb.keys('photos')) as string[];
    if (!keys.length) return null;
    const newest = keys.map(String).sort((a, b) => Number(b) - Number(a))[0];
    const blob = (await idb.get('photos', newest)) as Blob | undefined;
    if (!blob) return null;
    return await toDataUrl(blob);
  } catch {
    return null;
  }
}

export async function photoByKey(key: string): Promise<{ data: string; mime: string } | null> {
  try {
    const blob = (await idb.get('photos', key)) as Blob | undefined;
    if (!blob) return null;
    return await toDataUrl(blob);
  } catch {
    return null;
  }
}

export async function listPhotoKeys(): Promise<string[]> {
  try {
    const keys = (await idb.keys('photos')) as string[];
    return keys.map(String).sort((a, b) => Number(b) - Number(a));
  } catch {
    return [];
  }
}

function toDataUrl(blob: Blob): Promise<{ data: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const url = String(r.result);
      // strip the data: prefix — the provider wants raw base64
      resolve({ data: url.slice(url.indexOf(',') + 1), mime: blob.type || 'image/jpeg' });
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
