import { supabase, FUNCTIONS_URL, ANON_KEY, readToken } from '../sync/supabase';
import { auth } from '../auth.svelte';
import { buildContext, photoByKey } from './context';
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
  createdAt: string;
  /** only a reply that just arrived animates; history renders instantly */
  fresh?: boolean;
}

export interface Memory {
  id: string;
  content: string;
  createdAt: string;
}

class Assistant {
  chats = $state<ChatSummary[]>([]);
  openId = $state<string | null>(null);
  messages = $state<ChatMessage[]>([]);
  thinking = $state(false);
  /** what the assistant just wrote down about you, shown once under the reply */
  justRemembered = $state<string[]>([]);
  memories = $state<Memory[]>([]);
  /* Provider failures are shown, not swallowed. A generic "unavailable" tells
     you nothing about whether the key, the model or the quota is the problem. */
  error = $state<string | null>(null);

  async loadMemories() {
    if (!auth.user) return;
    const { data, error } = await supabase()
      .from('memories')
      .select('id, content, created_at')
      .order('created_at', { ascending: false });
    if (error) return;
    this.memories = (data ?? []).map((m) => ({
      id: m.id as string,
      content: m.content as string,
      createdAt: m.created_at as string
    }));
  }

  async forget(id: string) {
    await supabase().from('memories').delete().eq('id', id);
    this.memories = this.memories.filter((m) => m.id !== id);
  }

  async forgetAll() {
    if (!auth.user) return;
    await supabase().from('memories').delete().eq('user_id', auth.user.id);
    this.memories = [];
  }

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
      fresh: false
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

  /** photo keys attached to the next question, newest-first from the gallery */
  attached = $state<string[]>([]);

  toggleAttach(key: string) {
    this.attached = this.attached.includes(key)
      ? this.attached.filter((k) => k !== key)
      : [...this.attached, key].slice(-3);
  }

  clearAttached() {
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
    play('thinking');

    // show the question immediately; the round trip is not instant
    const local: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: body,
      createdAt: new Date().toISOString(),
      fresh: false
    };
    this.messages = [...this.messages, local];

    const history = this.messages.map((m) => ({ role: m.role, content: m.content }));

    /*
      Everything on the instance, assembled fresh. Not cached, because the
      point is that the assistant knows what is true now — and read through
      the same RLS-scoped layer as the UI, so it can only ever contain this
      user's own material.
    */
    const [instanceContext, images] = await Promise.all([
      buildContext(),
      Promise.all(this.attached.map((k) => photoByKey(k))).then((r) => r.filter(Boolean))
    ]);
    this.attached = [];

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
          images
        })
      });
      const data = await res.json();

      if (!res.ok || !data.reply) {
        this.error = data.detail?.join(' · ') ?? data.error ?? `HTTP ${res.status}`;
        play('deny');
        return;
      }

      const reply: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.reply,
        model: data.model,
        createdAt: new Date().toISOString(),
        fresh: true
      };
      this.messages = [...this.messages, reply];
      play('reply');

      // surfaced rather than silent: being remembered without being told is
      // the part of assistant memory people object to
      if (Array.isArray(data.remembered) && data.remembered.length) {
        this.justRemembered = data.remembered;
        // a second, quieter cue so writing something down is audible as its
        // own event rather than folded into the answer
        setTimeout(() => play('noted'), 260);
        void this.loadMemories();
      }

      await supabase().from('chat_messages').insert({
        chat_id: chatId,
        user_id: auth.user.id,
        role: 'assistant',
        content: data.reply,
        model: data.model
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
  async probe(): Promise<{ groqKey: boolean; geminiKey: boolean; groqModel: string; geminiModel: string } | null> {
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
    this.memories = [];
    this.justRemembered = [];
    this.attached = [];
  }
}

export const assistant = new Assistant();
