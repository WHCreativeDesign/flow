import { instance } from './sync';
import { idb } from './storage/idb';
import { codeOf, toF, type Forecast, type Place } from './data/weather';
import { supabase } from './sync/supabase';

/*
  Glance notifications.

  These are read out of real instance state — notes, threads, captures, the
  library, and the actual forecast. Nothing here is invented: if the instance
  is empty, the glance says so rather than showing a plausible-looking feed.
*/
export interface Note {
  id: string;
  kind: 'weather' | 'notes' | 'messages' | 'camera' | 'music' | 'reminder';
  title: string;
  body: string;
  /** the app an orb press should open */
  app: string;
  at?: number;
  /** weather only: which glyph the condition maps to */
  glyph?: string;
  /*
    What this card is *about*. Clearing a card records its signature, so it
    stays gone until the underlying thing actually changes — a newer message
    or another capture brings it back, re-reading the same state does not.
  */
  signature: string;
}

interface StoredNote {
  id: string;
  text: string;
  updated: number;
}

/* The unit is the Weather app's own toggle (°F/°C), read off the same
   instance state it's saved to — so a glance card can never show a
   different unit than the app it's a shortcut to. */
function weatherNote(wx: Forecast, place: Place, useF: boolean): Note | null {
  // a real alert or nothing — the next wet hour, read from the forecast
  const wet = wx.hourly.slice(1, 13).find((h) => h.precip >= 50);
  if (wet) {
    const when = new Date(wet.time).toLocaleTimeString([], { hour: 'numeric' }).toLowerCase().replace(' ', '');
    return {
      id: 'wx-precip',
      kind: 'weather',
      title: `${codeOf(wet.code).label} around ${when}`,
      body: `${wet.precip}% chance in ${place.name.split(',')[0].toLowerCase()}`,
      app: 'weather',
      glyph: codeOf(wet.code).glyph,
      signature: `wx-precip:${wet.time}`
    };
  }
  return {
    id: 'wx-now',
    kind: 'weather',
    title: `${toF(wx.tempC, useF)}° and ${codeOf(wx.code).label}`,
    body: `feels ${toF(wx.feelsC, useF)}° in ${place.name.split(',')[0].toLowerCase()}`,
    app: 'weather',
    glyph: codeOf(wx.code).glyph,
    signature: `wx-now:${wx.code}:${toF(wx.tempC, useF)}`
  };
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

/* The shared board: the single newest message from anyone on the instance,
   not just the signed-in user's own — see flow_shared_messaging. */
async function latestMessage(): Promise<{ thread: string; text: string; at: number } | null> {
  try {
    const { data } = await supabase()
      .from('thread_messages')
      .select('text, at, thread_id, message_threads(name)')
      .order('at', { ascending: false })
      .limit(1);
    const row = data?.[0] as
      | { text: string; at: string; thread_id: string; message_threads: { name: string } | null }
      | undefined;
    if (!row) return null;
    return { thread: row.message_threads?.name ?? 'message', text: row.text, at: new Date(row.at).getTime() };
  } catch {
    return null;
  }
}

export async function collect(): Promise<Note[]> {
  const out: Note[] = [];

  const [notesState, latest, weatherState, reminders] = await Promise.all([
    instance.getAppState('notes'),
    latestMessage(),
    instance.getAppState('weather'),
    dueReminders()
  ]);

  // one card per due reminder, oldest as well as newest — a reminder does not
  // get quieter for having waited, unlike the "latest message" card below
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

  const place = weatherState?.place as Place | undefined;
  if (place) {
    try {
      const { fetchForecast } = await import('./data/weather');
      const wx = await fetchForecast(place);
      const useF = typeof weatherState?.useF === 'boolean' ? (weatherState.useF as boolean) : false;
      const n = weatherNote(wx, place, useF);
      if (n) out.push(n);
    } catch {
      /* offline: the glance simply carries no weather line */
    }
  }

  if (latest) {
    out.push({
      id: 'msg-latest',
      kind: 'messages',
      title: latest.thread,
      body: latest.text,
      app: 'messages',
      at: latest.at,
      signature: `msg:${latest.at}`
    });
  }

  const notes = (notesState?.notes as StoredNote[] | undefined) ?? [];
  const recent = [...notes].sort((a, b) => b.updated - a.updated)[0];
  if (recent) {
    out.push({
      id: 'note-recent',
      kind: 'notes',
      title: recent.text.trim().split('\n')[0] || 'untitled',
      body: `${notes.length} ${notes.length === 1 ? 'note' : 'notes'} on this instance`,
      app: 'notes',
      at: recent.updated,
      signature: `note:${recent.updated}`
    });
  }

  try {
    const [photos, tracks] = await Promise.all([idb.keys('photos'), idb.keys('tracks')]);
    if (photos.length) {
      out.push({
        id: 'cam-count',
        kind: 'camera',
        title: `${photos.length} ${photos.length === 1 ? 'capture' : 'captures'}`,
        body: 'in your gallery',
        app: 'camera',
        at: Number(photos[photos.length - 1]),
        signature: `cam:${photos.length}`
      });
    }
    if (tracks.length) {
      out.push({
        id: 'music-count',
        kind: 'music',
        title: `${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}`,
        body: 'in your library',
        app: 'music',
        signature: `music:${tracks.length}`
      });
    }
  } catch {
    /* storage unavailable */
  }

  const cleared = new Set(await readCleared());
  return out.filter((n) => !cleared.has(n.signature));
}

