import { instance } from '../sync';
import { idb } from '../storage/idb';
import { auth } from '../auth.svelte';
import { settings } from '../settings.svelte';
import { supabase } from '../sync/supabase';

/*
  Everything the assistant is allowed to see.

  "Allowed" is the operative word: this reads only through `instance`, which
  is RLS-scoped to the signed-in user, only through the local IndexedDB blob
  store, which is this device's, and only through the browser's own
  RLS-scoped Supabase client for reminders. There is no path here to another
  user's rows — not because this file is careful, but because the layer
  underneath it cannot return them. One person's terminal is one person's
  terminal.

  Message threads are the one deliberate exception: they are a shared board,
  not a private notebook, so this reads every thread on the instance and
  every sender's name, not only the signed-in user's own. See the
  flow_shared_messaging migration for why that table's RLS is shaped that
  way on purpose.

  The pack is text, assembled fresh per question rather than cached, because
  the whole point is that the assistant knows what is true *now*. It is capped
  hard: a model given fifty notes verbatim will answer about the wrong one,
  and a free tier will not carry it. Bodies are trimmed, lists are topped, and
  the oldest material is what goes.

  Notes and threads carry their real id in the listing. That is what lets the
  assistant's action tags (note-delete, message-send, reminder-delete)
  reference an existing row exactly rather than needing to invent one — see
  src/lib/ai/actions.ts, which trusts these ids came from here and nowhere else.
*/

const MAX_NOTE_BODY = 400;
const MAX_NOTES = 25;
const MAX_THREADS = 12;
const MAX_MSGS_PER_THREAD = 12;
const MAX_TRACKS = 40;
const MAX_REMINDERS = 20;

/* The real shapes each app stores — see Notes.svelte / Messages.svelte.
   {id, title?, body?} was a stale guess from before this file ever read
   those components; text-only notes with no separate title field meant
   every note this had ever described to the assistant showed as "untitled"
   with no body. */
interface StoredNote {
  id: string;
  text: string;
  updated: number;
}
interface ThreadRow {
  id: string;
  name: string;
}
interface ThreadMsgRow {
  thread_id: string;
  sender_name: string;
  text: string;
  at: string;
}

function clip(text: string, max: number): string {
  const t = (text ?? '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function stamp(n?: number): string {
  if (!n) return '';
  return new Date(n).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function noteTitleAndBody(text: string): { title: string; body: string } {
  const t = (text ?? '').trim();
  const nl = t.indexOf('\n');
  if (nl === -1) return { title: t || 'untitled', body: '' };
  return { title: t.slice(0, nl).trim() || 'untitled', body: t.slice(nl + 1) };
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

/* The shared board: every thread, every sender — not scoped to the signed-in
   user, unlike everything else this file reads. See the module doc above. */
async function threadSummary(): Promise<string[]> {
  const { data: threads } = await supabase()
    .from('message_threads')
    .select('id, name')
    .order('created_at', { ascending: false })
    .limit(MAX_THREADS);
  if (!threads?.length) return ['None.'];

  const ids = threads.map((t: ThreadRow) => t.id);
  const { data: msgs } = await supabase()
    .from('thread_messages')
    .select('thread_id, sender_name, text, at')
    .in('thread_id', ids)
    .order('at', { ascending: true });

  const byThread = new Map<string, ThreadMsgRow[]>();
  for (const m of (msgs ?? []) as ThreadMsgRow[]) {
    const list = byThread.get(m.thread_id) ?? [];
    list.push(m);
    byThread.set(m.thread_id, list);
  }

  const out: string[] = [];
  for (const t of threads as ThreadRow[]) {
    const all = byThread.get(t.id) ?? [];
    out.push(`- [id: ${t.id}] ${t.name} (${all.length} messages)`);
    for (const m of all.slice(-MAX_MSGS_PER_THREAD)) {
      out.push(`    [${stamp(new Date(m.at).getTime())}] ${m.sender_name}: ${clip(m.text, 180)}`);
    }
  }
  return out;
}

async function reminderSummary(): Promise<string[]> {
  if (!auth.user) return ['None.'];
  const { data, error } = await supabase()
    .from('reminders')
    .select('id, text, due_at')
    .order('due_at', { ascending: true })
    .limit(MAX_REMINDERS);
  if (error || !data?.length) return ['None.'];
  return data.map(
    (r: { id: string; text: string; due_at: string }) =>
      `- [id: ${r.id}] due ${new Date(r.due_at).toLocaleString()}: ${clip(r.text, 160)}`
  );
}

export async function buildContext(): Promise<string> {
  if (!auth.user) return '';

  const [notesState, threadLines, weatherState, musicState, cameraState, photos, reminders] = await Promise.all([
    instance.getAppState('notes'),
    threadSummary(),
    instance.getAppState('weather'),
    instance.getAppState('music'),
    instance.getAppState('camera'),
    photoSummary(),
    reminderSummary()
  ]);

  const out: string[] = [];
  const now = new Date();

  out.push('=== This terminal ===');
  out.push(`Signed in as: ${auth.user.displayName}`);
  out.push(`Now: ${now.toISOString()} (${now.toLocaleString()})`);
  out.push(`Terminal name: ${settings.current.deviceLabel}`);

  /* --- notes --- */
  const notes = (notesState?.notes as StoredNote[] | undefined) ?? [];
  out.push('', `=== Notes (${notes.length}) ===`);
  if (!notes.length) {
    out.push('None.');
  } else {
    for (const n of notes.slice(0, MAX_NOTES)) {
      const { title, body } = noteTitleAndBody(n.text);
      out.push(`- [id: ${n.id}] [${stamp(n.updated)}] ${clip(title, 80)}${body ? `\n  ${clip(body, MAX_NOTE_BODY)}` : ''}`);
    }
    if (notes.length > MAX_NOTES) out.push(`  …and ${notes.length - MAX_NOTES} older notes.`);
  }

  /* --- messages: the shared board, everyone's threads, everyone's senders --- */
  out.push('', '=== Message threads (shared with everyone on this instance) ===');
  out.push(...threadLines);

  /* --- reminders --- */
  out.push('', '=== Reminders ===');
  out.push(...reminders);

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

export async function photoBlob(key: string): Promise<Blob | null> {
  try {
    return ((await idb.get('photos', key)) as Blob | undefined) ?? null;
  } catch {
    return null;
  }
}

/** base64 + mime for a Blob from anywhere — the gallery or a file picker. */
export async function encodeImage(blob: Blob): Promise<{ data: string; mime: string }> {
  return toDataUrl(blob);
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
