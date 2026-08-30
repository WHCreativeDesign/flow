import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/*
  The Supabase connection.

  The URL and publishable key are meant to be public — the publishable key
  grants nothing on its own, because every table is behind RLS and every
  credential path is behind a SECURITY DEFINER function. What actually
  identifies a user is flow's own session token, sent as the x-flow-token
  header and resolved server-side by public.current_user_id().

  Provider API keys (Groq, Gemini) are deliberately NOT here. flow is a static
  build on GitHub Pages, so anything in this bundle is readable by anyone who
  opens it. Those keys live in the `ai` Edge Function's secrets instead.
*/

const URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://jbrfkgkkaafpaircjetc.supabase.co';
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_A-axS7IHMx2jnIPK2c4Lfg_kJJOdrgS';

export const TOKEN_KEY = 'flow.session.token';

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: the session lasts as long as the tab does */
  }
}

/*
  The token has to travel as a header on every request, and supabase-js fixes
  its headers at construction. So the client is rebuilt whenever the session
  changes rather than mutated — a signed-out client and a signed-in one are
  genuinely different clients, and rebuilding keeps that honest.
*/
let client: SupabaseClient | null = null;
let clientToken: string | null = null;

export function supabase(): SupabaseClient {
  const token = readToken();
  if (!client || clientToken !== token) {
    client = createClient(URL, KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: token ? { 'x-flow-token': token } : {} }
    });
    clientToken = token;
  }
  return client;
}

/** Force the next supabase() call to rebuild — call after the token changes. */
export function resetClient() {
  client = null;
  clientToken = null;
}

export const FUNCTIONS_URL = `${URL}/functions/v1`;
export const ANON_KEY = KEY;
