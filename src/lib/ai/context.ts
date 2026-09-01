import { auth } from '../auth.svelte';
import { settings } from '../settings.svelte';
import { supabase } from '../sync/supabase';

/*
  Everything the assistant is allowed to see.

  "Allowed" is the operative word: this reads only through the browser's own
  RLS-scoped Supabase client, for the signed-in user's own reminders. There
  is no path here to another user's rows — not because this file is careful,
  but because the layer underneath it cannot return them.

  The pack is text, assembled fresh per question rather than cached, because
  the whole point is that the assistant knows what is true *now*.

  Reminders carry their real id in the listing. That is what lets the
  assistant's action tags (reminder-delete) reference an existing row
  exactly rather than needing to invent one — see src/lib/ai/actions.ts,
  which trusts these ids came from here and nowhere else.
*/

const MAX_REMINDERS = 20;

function clip(text: string, max: number): string {
  const t = (text ?? '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
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

  const reminders = await reminderSummary();

  const out: string[] = [];
  const now = new Date();

  out.push('=== This terminal ===');
  out.push(`Signed in as: ${auth.user.displayName}`);
  // local time first and unlabelled, because that is what "what time is it"
  // means; the ISO form is for computing a reminder's "at", never for saying
  // the time out loud — it reads as UTC and answering with it is wrong.
  out.push(`Now: ${now.toLocaleString()} (ISO, for scheduling only: ${now.toISOString()})`);
  out.push(`Terminal name: ${settings.current.deviceLabel}`);

  /* --- reminders --- */
  out.push('', '=== Reminders ===');
  out.push(...reminders);

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

/** base64 + mime for a Blob from anywhere — an image attachment or a capture. */
export async function encodeImage(blob: Blob): Promise<{ data: string; mime: string }> {
  return toDataUrl(blob);
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
