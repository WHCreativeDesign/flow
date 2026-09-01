import { instance } from './sync';
import { supabase } from './sync/supabase';

/*
  Glance notifications.

  These are read out of real instance state — right now, just reminders.
  Nothing here is invented: if the instance is empty, the glance says so
  rather than showing a plausible-looking feed.
*/
export interface Note {
  id: string;
  kind: 'reminder';
  title: string;
  body: string;
  /** the app an orb press should open */
  app: string;
  at?: number;
  /*
    What this card is *about*. Clearing a card records its signature, so it
    stays gone until the underlying thing actually changes — a newer message
    or another capture brings it back, re-reading the same state does not.
  */
  signature: string;
}

/*
  Which cards have been cleared lives on the instance, not in localStorage:
  it belongs to the person, not to the browser. Two users sharing a terminal
  must not clear each other's glance, and clearing a card on the phone should
  clear it on the wall too.
*/
async function readCleared(): Promise<string[]> {
  const state = await instance.getAppState('notifications');
  const list = state?.cleared;
  return Array.isArray(list) ? (list as string[]) : [];
}

/** Clear one card. It returns when its signature changes, not before. */
export async function clearNote(signature: string) {
  const next = [...new Set([...(await readCleared()), signature])].slice(-40);
  await instance.setAppState('notifications', { cleared: next });
}

async function dueReminders(): Promise<Array<{ id: string; text: string; due_at: string }>> {
  try {
    const { data } = await supabase()
      .from('reminders')
      .select('id, text, due_at')
      .lte('due_at', new Date().toISOString())
      .order('due_at', { ascending: false });
    return data ?? [];
  } catch {
    return [];
  }
}

export async function collect(): Promise<Note[]> {
  const out: Note[] = [];

  const reminders = await dueReminders();

  // one card per due reminder, oldest as well as newest — a reminder does not
  // get quieter for having waited
  for (const r of reminders) {
    out.push({
      id: `reminder-${r.id}`,
      kind: 'reminder',
      title: r.text,
      body: `reminder · ${new Date(r.due_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
      app: 'assistant',
      at: new Date(r.due_at).getTime(),
      // the reminder's own id, not the due timestamp: once dismissed it
      // must never resurface, and a fired reminder never changes
      signature: `reminder:${r.id}`
    });
  }

  const cleared = new Set(await readCleared());
  return out.filter((n) => !cleared.has(n.signature));
}

