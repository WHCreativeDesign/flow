import { FUNCTIONS_URL, ANON_KEY, readToken } from '../sync/supabase';
import { auth } from '../auth.svelte';
import { instance } from '../sync';
import type { Note } from '../notifications.svelte';

/*
  The glance's assistant surfaces: the one-line daily summary and the
  suggestion chips.

  Both are cached per user per day on the instance. The glance re-renders on
  every clock tick, every wake from idle and every return from an app, and
  asking a model on each of those would burn a free tier before lunch for a
  line that does not change minute to minute. So: generate once a day, reuse
  until the date rolls or someone asks for it again.

  Failure here is quiet on purpose. A summary is an ambient nicety on a lock
  screen — if the provider is down, the glance should show a clock and
  notifications, not an error card.
*/

interface Cache {
  day: string;
  summary: string;
  suggestions: string[];
}

const KEY = 'glance-ai';

function today(): string {
  return new Date().toDateString();
}

async function call(mode: 'summary' | 'suggest', context: string): Promise<string | null> {
  try {
    const res = await fetch(`${FUNCTIONS_URL}/ai`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        'x-flow-token': readToken() ?? ''
      },
      body: JSON.stringify({ mode, context })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.reply === 'string' ? data.reply.trim() : null;
  } catch {
    return null;
  }
}

/** What the model is told about the day. Only real state — never invented. */
function contextFrom(notes: Note[], name: string): string {
  const now = new Date();
  const weather = notes.find((n) => n.kind === 'weather');
  const rest = notes.filter((n) => n.kind !== 'weather');

  const lines = [
    `Person: ${name}`,
    `Local time: ${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
    `Date: ${now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}`
  ];
  if (weather) lines.push(`Weather: ${weather.title} — ${weather.body}`);
  if (rest.length) {
    lines.push('Waiting on this instance:');
    for (const n of rest.slice(0, 6)) lines.push(`- ${n.title}: ${n.body}`);
  } else {
    lines.push('Nothing is waiting on this instance.');
  }
  return lines.join('\n');
}

class GlanceAI {
  summary = $state<string | null>(null);
  suggestions = $state<string[]>([]);
  loading = $state(false);

  async load(notes: Note[], force = false) {
    if (!auth.user || this.loading) return;

    const cached = (await instance.getAppState(KEY)) as unknown as Cache | null;
    if (!force && cached?.day === today() && cached.summary) {
      this.summary = cached.summary;
      this.suggestions = cached.suggestions ?? [];
      return;
    }

    this.loading = true;
    try {
      const context = contextFrom(notes, auth.user.displayName);
      const [summary, suggest] = await Promise.all([
        call('summary', context),
        call('suggest', context)
      ]);

      if (summary) this.summary = summary;
      if (suggest) {
        this.suggestions = suggest
          .split('\n')
          .map((l) => l.replace(/^[-*\d.)\s]+/, '').trim())
          .filter(Boolean)
          .slice(0, 3);
      }

      if (summary) {
        await instance.setAppState(KEY, {
          day: today(),
          summary: this.summary,
          suggestions: this.suggestions
        } as unknown as Record<string, unknown>);
      }
    } finally {
      this.loading = false;
    }
  }

  reset() {
    this.summary = null;
    this.suggestions = [];
  }
}

export const glanceAI = new GlanceAI();
