import { supabase, FUNCTIONS_URL, ANON_KEY, readToken } from '../sync/supabase';
import { auth } from '../auth.svelte';

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
}

class Assistant {
  chats = $state<ChatSummary[]>([]);
  openId = $state<string | null>(null);
  messages = $state<ChatMessage[]>([]);
  thinking = $state(false);
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
      createdAt: m.created_at as string
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

  async ask(text: string) {
    const body = text.trim();
    if (!body || this.thinking || !auth.user) return;

    let chatId = this.openId;
    if (!chatId) chatId = await this.newChat();
    if (!chatId) return;

    this.error = null;
    this.thinking = true;

    // show the question immediately; the round trip is not instant
    const local: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: body,
      createdAt: new Date().toISOString()
    };
    this.messages = [...this.messages, local];

    const history = this.messages.map((m) => ({ role: m.role, content: m.content }));

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
        body: JSON.stringify({ messages: history })
      });
      const data = await res.json();

      if (!res.ok || !data.reply) {
        this.error = data.detail?.join(' · ') ?? data.error ?? `HTTP ${res.status}`;
        return;
      }

      const reply: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.reply,
        model: data.model,
        createdAt: new Date().toISOString()
      };
      this.messages = [...this.messages, reply];

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
  }
}

export const assistant = new Assistant();
