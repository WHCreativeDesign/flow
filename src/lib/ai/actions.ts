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
  name:
    | 'setting'
    | 'reminder-create'
    | 'reminder-delete'
    | 'memory-create'
    | 'memory-update'
    | 'memory-delete'
    | 'memory-link'
    | 'memory-unlink';
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

/*
  The memory graph is otherwise only ever written to from the memory app
  itself (see memory.svelte.ts) or the assistant's own <remember>/quick-info
  paths server-side. These four give the assistant the same reach a person
  already has from that app — create, retitle or rewrite, delete, and link
  or unlink two existing nodes — through the identical RLS-scoped table
  writes, never through memory.svelte.ts's own client-side cache (which may
  not even be loaded if the memory app isn't open), so a change here is
  correct regardless of what else happens to be on screen.
*/
/* Every node hangs off the one base node unless it is deliberately linked
   somewhere else. Doing it here rather than trusting the model to emit a
   memory-link means the graph stays a graph even when it forgets: an
   unlinked scrap floating on its own is exactly the shape this was meant to
   stop producing. */
async function linkToRoot(nodeId: string) {
  if (!auth.user) return;
  const { data: root } = await supabase()
    .from('memory_nodes')
    .select('id')
    .eq('source', 'root')
    .limit(1)
    .maybeSingle();
  if (!root?.id || root.id === nodeId) return;
  await supabase().from('memory_links').insert({ user_id: auth.user.id, a_id: root.id, b_id: nodeId });
}

async function createMemory(attrs: Record<string, string>, content: string): Promise<string> {
  const body = content.trim();
  if (!body) return 'no memory content given';
  if (!auth.user) return 'not signed in';
  const title = attrs.title?.trim() || (body.length <= 40 ? body : `${body.slice(0, 40)}…`);

  const { data, error } = await supabase()
    .from('memory_nodes')
    .insert({ user_id: auth.user.id, title, body, source: 'chat' })
    .select('id')
    .single();
  if (error || !data) return "couldn't save that memory";
  await linkToRoot(data.id as string);
  return `remembered: "${title}"`;
}

async function updateMemory(attrs: Record<string, string>, content: string): Promise<string> {
  const id = attrs.id;
  if (!id) return 'no memory id given';
  const title = attrs.title?.trim();
  const body = content.trim();
  if (!title && !body) return 'nothing to change';

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title) patch.title = title;
  if (body) patch.body = body;

  const { data, error } = await supabase().from('memory_nodes').update(patch).eq('id', id).select('id');
  if (error) return "couldn't update that memory";
  if (!data?.length) return "couldn't find that memory";
  return `updated: "${title ?? 'that memory'}"`;
}

async function deleteMemory(attrs: Record<string, string>): Promise<string> {
  const id = attrs.id;
  if (!id) return 'no memory id given';
  const { data, error } = await supabase().from('memory_nodes').delete().eq('id', id).select('id');
  if (error) return "couldn't forget that memory";
  if (!data?.length) return "couldn't find that memory";
  return 'forgot that memory';
}

async function linkMemories(attrs: Record<string, string>): Promise<string> {
  const a = attrs.a;
  const b = attrs.b;
  if (!a || !b || a === b) return 'need two different memory ids to link';
  if (!auth.user) return 'not signed in';

  const { error } = await supabase().from('memory_links').insert({ user_id: auth.user.id, a_id: a, b_id: b });
  if (error) return 'those memories are already linked, or one of them was not found';
  return 'linked those two memories';
}

/* a_id/b_id order isn't guaranteed to match how the link was created, so
   this reads both candidate rows via a parameterized `.in()` filter (never
   raw string interpolation of ids into a query) and picks the exact pair
   client-side before deleting it by its own id. */
async function unlinkMemories(attrs: Record<string, string>): Promise<string> {
  const a = attrs.a;
  const b = attrs.b;
  if (!a || !b) return 'need two memory ids to unlink';

  const { data: candidates, error: selectError } = await supabase()
    .from('memory_links')
    .select('id, a_id, b_id')
    .in('a_id', [a, b])
    .in('b_id', [a, b]);
  if (selectError) return "couldn't unlink those memories";
  const match = (candidates ?? []).find((l) => (l.a_id === a && l.b_id === b) || (l.a_id === b && l.b_id === a));
  if (!match) return 'those memories were not linked';

  const { error } = await supabase().from('memory_links').delete().eq('id', match.id);
  if (error) return "couldn't unlink those memories";
  return 'unlinked those two memories';
}

/* Mirrors MAX_ACTIONS in the ai edge function. Six was enough for a setting
   and a reminder; "link these together" or "merge the duplicates" is
   legitimately a dozen memory edits in one reply, and quietly dropping the
   tail of them looks exactly like the assistant half-doing what was asked. */
const MAX_ACTIONS = 24;

export async function applyActions(actions: RawAction[]): Promise<string[]> {
  const results: string[] = [];
  for (const a of actions.slice(0, MAX_ACTIONS)) {
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
        case 'memory-create':
          results.push(await createMemory(a.attrs, a.content));
          break;
        case 'memory-update':
          results.push(await updateMemory(a.attrs, a.content));
          break;
        case 'memory-delete':
          results.push(await deleteMemory(a.attrs));
          break;
        case 'memory-link':
          results.push(await linkMemories(a.attrs));
          break;
        case 'memory-unlink':
          results.push(await unlinkMemories(a.attrs));
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
