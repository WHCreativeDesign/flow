import { auth } from '../auth.svelte';
import { settings, type FlowSettings } from '../settings.svelte';
import { supabase } from '../sync/supabase';

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
  name: 'setting' | 'reminder-create' | 'reminder-delete';
  attrs: Record<string, string>;
  content: string;
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
