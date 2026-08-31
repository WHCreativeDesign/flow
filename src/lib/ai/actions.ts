import { instance } from '../sync';
import { auth } from '../auth.svelte';
import { settings, type FlowSettings } from '../settings.svelte';
import { supabase } from '../sync/supabase';
import { searchPlaces, type Place } from '../data/weather';

/*
  Executing what the assistant asked for.

  Every action here calls the exact function a person tapping a switch or
  pressing a button already calls — settings.update(), instance.setAppState(),
  the browser's own RLS-scoped supabase(). Nothing in this file has more
  reach than the UI already has, and the vocabulary it recognises is closed:
  a RawAction whose `name` is not one of the cases below is simply ignored.
  That closedness is the actual security boundary, not this file's care — the
  edge function that produces these never had an admin or other-user action
  to hand it in the first place.

  Every function returns a short, human-readable line describing what
  happened (or why nothing did), for display under the reply — silently
  succeeding is how "the assistant changed something" turns into "did it? I
  can't tell," and silently failing is worse.
*/

export interface RawAction {
  name:
    | 'setting'
    | 'note-create'
    | 'note-delete'
    | 'weather-set'
    | 'message-send'
    | 'reminder-create'
    | 'reminder-delete';
  attrs: Record<string, string>;
  content: string;
}

interface StoredNote {
  id: string;
  text: string;
  updated: number;
}

async function applySetting(attrs: Record<string, string>): Promise<string> {
  const key = attrs.key;
  const value = attrs.value ?? '';

  const parseBool = (v: string) => v.trim().toLowerCase() === 'true';

  switch (key) {
    case 'soundEnabled':
      settings.update({ soundEnabled: parseBool(value) });
      return `sound turned ${parseBool(value) ? 'on' : 'off'}`;

    case 'soundVolume': {
      const n = Number(value);
      if (!Number.isFinite(n)) return `couldn't understand volume "${value}"`;
      const clamped = Math.min(1, Math.max(0, n));
      settings.update({ soundVolume: clamped });
      return `volume set to ${Math.round(clamped * 100)}%`;
    }

    case 'idleTimeoutSec': {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n) || n < 0) return `couldn't understand idle timeout "${value}"`;
      settings.update({ idleTimeoutSec: n });
      return n === 0 ? 'idle timeout turned off' : `idle timeout set to ${n}s`;
    }

    case 'use24hClock':
      settings.update({ use24hClock: parseBool(value) });
      return `clock set to ${parseBool(value) ? '24-hour' : '12-hour'}`;

    case 'graphics': {
      const n = Number(value);
      if (n !== 1 && n !== 2 && n !== 3) return `graphics tier must be 1, 2 or 3, not "${value}"`;
      settings.update({ graphics: n as FlowSettings['graphics'] });
      return `graphics set to tier ${n}`;
    }

    case 'aiEnabled':
      settings.update({ aiEnabled: parseBool(value) });
      return `assistant surfaces on the glance turned ${parseBool(value) ? 'on' : 'off'}`;

    case 'deviceLabel': {
      const label = value.trim() || 'this terminal';
      settings.update({ deviceLabel: label });
      return `this terminal renamed to "${label}"`;
    }

    default:
      return `"${key}" isn't a setting I can change`;
  }
}

async function createNote(content: string): Promise<string> {
  const text = content.trim();
  if (!text) return 'no note content given';
  const state = await instance.getAppState('notes');
  const notes = ((state?.notes as StoredNote[] | undefined) ?? []).slice();
  const title = text.split('\n')[0].trim() || 'untitled';
  notes.unshift({ id: crypto.randomUUID(), text, updated: Date.now() });
  await instance.setAppState('notes', { notes });
  return `note created: "${title}"`;
}

async function deleteNote(attrs: Record<string, string>): Promise<string> {
  const id = attrs.id;
  if (!id) return 'no note id given';
  const state = await instance.getAppState('notes');
  const notes = (state?.notes as StoredNote[] | undefined) ?? [];
  const found = notes.find((n) => n.id === id);
  if (!found) return "couldn't find that note";
  await instance.setAppState('notes', { notes: notes.filter((n) => n.id !== id) });
  const title = found.text.trim().split('\n')[0] || 'untitled';
  return `note deleted: "${title}"`;
}

async function setWeatherPlace(attrs: Record<string, string>): Promise<string> {
  const query = attrs.place?.trim();
  if (!query) return 'no place given';
  let results: Place[];
  try {
    results = await searchPlaces(query);
  } catch {
    return `couldn't look up "${query}" — offline?`;
  }
  const place = results[0];
  if (!place) return `couldn't find a place named "${query}"`;
  const current = await instance.getAppState('weather');
  const useF = typeof current?.useF === 'boolean' ? current.useF : false;
  await instance.setAppState('weather', { place, useF });
  return `weather place set to ${place.name}`;
}

/* Messages is the shared board (see flow_shared_messaging): this posts as
   the signed-in user into a table anyone on the instance can read, not a
   private per-user blob like every other action here. */
async function sendMessage(attrs: Record<string, string>, content: string): Promise<string> {
  const target = attrs.thread?.trim();
  const text = content.trim();
  if (!target || !text || !auth.user) return 'a thread and a message are both required';

  const { data: threads } = await supabase().from('message_threads').select('id, name');
  let thread = (threads ?? []).find((t) => t.id === target);
  if (!thread) thread = (threads ?? []).find((t) => t.name.toLowerCase() === target.toLowerCase());

  let created = false;
  if (!thread) {
    const { data, error } = await supabase()
      .from('message_threads')
      .insert({ name: target, created_by: auth.user.id })
      .select('id, name')
      .single();
    if (error || !data) return "couldn't start that thread";
    thread = data;
    created = true;
  }

  const { error } = await supabase()
    .from('thread_messages')
    .insert({ thread_id: thread.id, sender_id: auth.user.id, sender_name: auth.user.displayName, text });
  if (error) return "couldn't send that message";

  return created ? `started "${thread.name}" and sent your message` : `sent to "${thread.name}"`;
}

async function createReminder(attrs: Record<string, string>, content: string): Promise<string> {
  const text = content.trim();
  const at = attrs.at;
  if (!text || !at) return 'a reminder needs both a time and text';

  const due = new Date(at);
  if (Number.isNaN(due.getTime())) return `couldn't understand the time "${at}"`;
  if (!auth.user) return 'not signed in';

  const { error } = await supabase()
    .from('reminders')
    .insert({ user_id: auth.user.id, text, due_at: due.toISOString() });
  if (error) return "couldn't set that reminder";

  return `reminder set for ${due.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}

async function deleteReminder(attrs: Record<string, string>): Promise<string> {
  const id = attrs.id;
  if (!id) return 'no reminder id given';
  const { data, error } = await supabase().from('reminders').delete().eq('id', id).select('id');
  if (error) return "couldn't remove that reminder";
  if (!data?.length) return "couldn't find that reminder";
  return 'reminder removed';
}

export async function applyActions(actions: RawAction[]): Promise<string[]> {
  const results: string[] = [];
  for (const a of actions.slice(0, 6)) {
    try {
      switch (a.name) {
        case 'setting':
          results.push(await applySetting(a.attrs));
          break;
        case 'note-create':
          results.push(await createNote(a.content));
          break;
        case 'note-delete':
          results.push(await deleteNote(a.attrs));
          break;
        case 'weather-set':
          results.push(await setWeatherPlace(a.attrs));
          break;
        case 'message-send':
          results.push(await sendMessage(a.attrs, a.content));
          break;
        case 'reminder-create':
          results.push(await createReminder(a.attrs, a.content));
          break;
        case 'reminder-delete':
          results.push(await deleteReminder(a.attrs));
          break;
        default:
          // a name outside the closed vocabulary: never executed
          break;
      }
    } catch {
      results.push('something went wrong doing that');
    }
  }
  return results;
}
