import { supabase, FUNCTIONS_URL, ANON_KEY, readToken } from '../sync/supabase';
import { auth } from '../auth.svelte';
import { buildContext } from './context';
import { applyActions, type RawAction } from './actions';
import { play } from '../sound/engine';

/*
  The assistant, and its history.

  Chats are real rows rather than one JSONB blob: a conversation grows without
  bound, and rewriting the whole log on every turn to a single row would get
  slower the longer you talk. Everything is scoped to the signed-in user by
  RLS, so one person's chats are invisible to another on the same terminal.

  The model call goes through the `ai` Edge Function, never straight to Groq:
  this bundle is public, so a provider key in it would be a published key.
*/

export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string | null;
  /** which provider actually served this reply. In memory only — it is not a
      column on chat_messages, so it is here for the session that saw it,
      which is all the debug readout needs. */
  provider?: string | null;
  createdAt: string;
  /** only a reply that just arrived animates; history renders instantly */
  fresh?: boolean;
  /** false while tokens are still landing, so the reveal knows not to finish */
  complete?: boolean;
}

export interface Attachment {
  id: string;
  /** object URL, for the preview only */
  url: string;
  /** base64 without the data: prefix, for the provider */
  data: string;
  mime: string;
  name: string;
}

class Assistant {
  chats = $state<ChatSummary[]>([]);
  openId = $state<string | null>(null);
  messages = $state<ChatMessage[]>([]);
  thinking = $state(false);
  /** what the assistant just wrote down about you, shown once under the reply */
  justRemembered = $state<string[]>([]);
  /** what the assistant just did — settings/reminders */
  justDid = $state<string[]>([]);
  /* Provider failures are shown, not swallowed. A generic "unavailable" tells
     you nothing about whether the key, the model or the quota is the problem. */
  error = $state<string | null>(null);

  async loadChats() {
    if (!auth.user) return;
    const { data, error } = await supabase()
      .from('chats')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false });
    if (error) return;
    this.chats = (data ?? []).map((c) => ({
      id: c.id as string,
      title: c.title as string,
      updatedAt: c.updated_at as string
    }));
  }

  async openChat(id: string) {
    this.openId = id;
    this.error = null;
    const { data, error } = await supabase()
      .from('chat_messages')
      .select('id, role, content, model, created_at')
      .eq('chat_id', id)
      .order('created_at', { ascending: true });
    if (error) return;
    this.messages = (data ?? []).map((m) => ({
      id: m.id as string,
      role: m.role as ChatMessage['role'],
      content: m.content as string,
      model: m.model as string | null,
      createdAt: m.created_at as string,
      fresh: false,
      complete: true
    }));
  }

  async newChat(): Promise<string | null> {
    if (!auth.user) return null;
    const { data, error } = await supabase()
      .from('chats')
      .insert({ user_id: auth.user.id, title: 'new chat' })
      .select('id, title, updated_at')
      .single();
    if (error || !data) return null;
    this.chats = [
      { id: data.id as string, title: data.title as string, updatedAt: data.updated_at as string },
      ...this.chats
    ];
    this.openId = data.id as string;
    this.messages = [];
    this.error = null;
    return data.id as string;
  }

  async deleteChat(id: string) {
    await supabase().from('chats').delete().eq('id', id);
    this.chats = this.chats.filter((c) => c.id !== id);
    if (this.openId === id) {
      this.openId = null;
      this.messages = [];
    }
  }

  closeChat() {
    this.openId = null;
    this.messages = [];
    this.error = null;
  }

  /*
    Images riding along with the next question. Each carries both an object URL
    for the preview and the base64 the provider needs — a preview built from
    the same bytes that get sent is the only way the thumbnail cannot lie about
    what was attached.
  */
  attached = $state<Attachment[]>([]);

  attach(a: Attachment) {
    if (this.attached.some((x) => x.id === a.id)) return;
    // three is the provider-side cap; dropping the oldest beats a silent no-op
    const next = [...this.attached, a];
    for (const dropped of next.slice(0, Math.max(0, next.length - 3))) {
      URL.revokeObjectURL(dropped.url);
    }
    this.attached = next.slice(-3);
  }

  detach(id: string) {
    const gone = this.attached.find((a) => a.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    this.attached = this.attached.filter((a) => a.id !== id);
  }

  clearAttached() {
    // object URLs are held by the document until revoked, so a chat session of
    // attaching and clearing would leak every blob it ever previewed
    for (const a of this.attached) URL.revokeObjectURL(a.url);
    this.attached = [];
  }

  async ask(text: string) {
    const body = text.trim();
    if (!body || this.thinking || !auth.user) return;

    let chatId = this.openId;
    if (!chatId) chatId = await this.newChat();
    if (!chatId) return;

    this.error = null;
    this.thinking = true;
    this.justRemembered = [];
    this.justDid = [];
    play('thinking');

    // show the question immediately; the round trip is not instant
    const local: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: body,
      createdAt: new Date().toISOString(),
      fresh: false,
      complete: true
    };
    this.messages = [...this.messages, local];

    const history = this.messages.map((m) => ({ role: m.role, content: m.content }));

    /*
      Everything on the instance, assembled fresh. Not cached, because the
      point is that the assistant knows what is true now — and read through
      the same RLS-scoped layer as the UI, so it can only ever contain this
      user's own material.
    */
    const instanceContext = await buildContext();
    const images = this.attached.map((a) => ({ data: a.data, mime: a.mime }));
    this.clearAttached();

    await supabase()
      .from('chat_messages')
      .insert({ chat_id: chatId, user_id: auth.user.id, role: 'user', content: body });

    // the first question names the chat, so history is readable at a glance
    if (this.messages.length === 1) {
      const title = body.length > 42 ? `${body.slice(0, 42)}…` : body;
      await supabase().from('chats').update({ title }).eq('id', chatId);
      this.chats = this.chats.map((c) => (c.id === chatId ? { ...c, title } : c));
    }

    try {
      const res = await fetch(`${FUNCTIONS_URL}/ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
          'x-flow-token': readToken() ?? ''
        },
        body: JSON.stringify({
          messages: history,
          mode: 'chat',
          instance: instanceContext,
          images,
          stream: true
        })
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        this.error = data.detail?.join(' · ') ?? data.error ?? `HTTP ${res.status}`;
        play('deny');
        return;
      }

      /*
        Server-sent events. The reply row is inserted empty and then grown in
        place, so the reveal has something to animate into from the first
        token rather than waiting for the whole answer.
      */
      const replyId = crypto.randomUUID();
      let started = false;
      let text = '';
      let model: string | null = null;
      let provider: string | null = null;
      let data: { reply?: string; remembered?: string[]; actions?: RawAction[] } = {};

      const append = (delta: string) => {
        text += delta;
        if (!started) {
          started = true;
          this.thinking = false;
          play('reply');
          this.messages = [
            ...this.messages,
            {
              id: replyId,
              role: 'assistant',
              content: text,
              model,
              createdAt: new Date().toISOString(),
              fresh: true,
              complete: false
            }
          ];
          return;
        }
        this.messages = this.messages.map((m) => (m.id === replyId ? { ...m, content: text } : m));
      };

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // an event ends at a blank line, and a chunk can split one in half
        let cut: number;
        while ((cut = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          for (const line of raw.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              const evt = JSON.parse(payload);
              if (evt.model) model = evt.model;
              if (evt.provider) provider = evt.provider;
              if (evt.delta) append(evt.delta);
              if (evt.error) streamError = String(evt.error);
              if (evt.done) data = evt;
            } catch {
              /* partial or keepalive frame */
            }
          }
        }
      }

      if (streamError && !text) {
        this.error = streamError;
        play('deny');
        return;
      }

      // the server's cleaned text is authoritative — it has the memory tags
      // stripped, including any the hold-back logic trimmed at the very end
      const finalText = (data.reply ?? text).trim();
      if (!finalText) {
        this.error = streamError ?? 'the assistant returned nothing';
        play('deny');
        return;
      }

      if (!started) {
        this.thinking = false;
        play('reply');
        this.messages = [
          ...this.messages,
          {
            id: replyId,
            role: 'assistant',
            content: finalText,
            model,
            provider,
            createdAt: new Date().toISOString(),
            fresh: true,
            complete: true
          }
        ];
      } else {
        this.messages = this.messages.map((m) =>
          m.id === replyId ? { ...m, content: finalText, model, provider, complete: true } : m
        );
      }

      // surfaced rather than silent: being remembered without being told is
      // the part of assistant memory people object to
      if (Array.isArray(data.remembered) && data.remembered.length) {
        this.justRemembered = data.remembered;
        // a second, quieter cue so writing something down is audible as its
        // own event rather than folded into the answer
        setTimeout(() => play('noted'), 260);
      }

      /*
        Actions execute here, client-side, against the exact same stores the
        real UI writes to — never in the edge function, which only ever
        recognised and structured the tag. Auto-executed and reported after
        the fact, the same trust model memory already uses: a person can
        always undo a setting or delete a note, so asking first would slow
        down the common case for a cost that isn't there.
      */
      if (Array.isArray(data.actions) && data.actions.length) {
        const results = await applyActions(data.actions);
        if (results.length) {
          this.justDid = results;
          setTimeout(() => play('toggle'), 260);
        }
      }

      await supabase().from('chat_messages').insert({
        chat_id: chatId,
        user_id: auth.user.id,
        role: 'assistant',
        content: finalText,
        model
      });
      await supabase().from('chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId);
    } catch (e) {
      this.error = (e as Error).message;
      play('deny');
    } finally {
      this.thinking = false;
    }
  }

  /** Setup check for settings: which provider keys the function actually has. */
  async probe(): Promise<{ groqKey: boolean; nvidiaKey: boolean; geminiKey: boolean; groqKeys?: number; nvidiaKeys?: number; geminiKeys?: number; groqModel: string; nvidiaModel: string; geminiModel: string } | null> {
    try {
      const res = await fetch(`${FUNCTIONS_URL}/ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
          'x-flow-token': readToken() ?? ''
        },
        body: JSON.stringify({ probe: true })
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  reset() {
    this.chats = [];
    this.openId = null;
    this.messages = [];
    this.error = null;
    this.justRemembered = [];
    this.justDid = [];
    this.clearAttached();
  }
}

export const assistant = new Assistant();
