import { supabase, readToken, writeToken, resetClient } from './sync/supabase';

/*
  Who is using this terminal.

  flow's users are household users — "User 1", "User 2" — identified by a
  short password on a shared screen, not by email. So this is not Supabase
  Auth: it is a small custom scheme (see the flow_users_and_sessions
  migration) where the password is bcrypt-hashed in Postgres and never leaves
  it, and the browser only ever holds an opaque session token.

  The admin is a separate, hidden account. Unlocking it in settings does NOT
  change who is signed in — you stay yourself and additionally hold an admin
  token for as long as the panel is open. That token is kept in memory only,
  so it dies with the tab.
*/

export interface FlowUser {
  id: string;
  displayName: string;
  username: string;
  isAdmin: boolean;
  avatarHue: number;
}

export interface PickerUser {
  id: string;
  displayName: string;
  username: string;
  avatarHue: number;
}

class Auth {
  user = $state<FlowUser | null>(null);
  /** null until the stored token has been checked, so the shell can wait */
  ready = $state(false);
  users = $state<PickerUser[]>([]);
  error = $state<string | null>(null);
  busy = $state(false);

  /** admin panel unlock — memory only, never persisted */
  adminToken = $state<string | null>(null);

  async init() {
    await this.refreshUsers();
    const token = readToken();
    if (token) {
      const { data } = await supabase().rpc('flow_session', { p_token: token });
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.user_id) {
        this.user = {
          id: row.user_id,
          displayName: row.display_name,
          username: row.username,
          isAdmin: row.is_admin,
          avatarHue: row.avatar_hue ?? 205
        };
      } else {
        // expired or revoked: drop it rather than retrying with a dead token
        writeToken(null);
        resetClient();
      }
    }
    this.ready = true;
  }

  async refreshUsers() {
    const { data, error } = await supabase().rpc('flow_list_users');
    if (error) return;
    this.users = (data ?? []).map((u: Record<string, unknown>) => ({
      id: u.id as string,
      displayName: u.display_name as string,
      username: u.username as string,
      avatarHue: (u.avatar_hue as number) ?? 205
    }));
  }

  async login(username: string, password: string): Promise<boolean> {
    this.busy = true;
    this.error = null;
    try {
      const { data, error } = await supabase().rpc('flow_login', {
        p_username: username,
        p_password: password
      });
      if (error) {
        this.error = 'could not reach the instance';
        return false;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.token) {
        this.error = 'wrong password';
        return false;
      }
      writeToken(row.token);
      resetClient();
      const picked = this.users.find((u) => u.username === username);
      this.user = {
        id: row.user_id,
        displayName: row.display_name,
        username,
        isAdmin: row.is_admin,
        avatarHue: picked?.avatarHue ?? 205
      };
      return true;
    } finally {
      this.busy = false;
    }
  }

  async logout() {
    const token = readToken();
    if (token) await supabase().rpc('flow_logout', { p_token: token });
    writeToken(null);
    resetClient();
    this.user = null;
    this.adminToken = null;
  }

  /* ---- the hidden admin ---- */

  async unlockAdmin(password: string): Promise<boolean> {
    const { data, error } = await supabase().rpc('flow_admin_unlock', { p_password: password });
    if (error) return false;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.token) return false;
    this.adminToken = row.token;
    return true;
  }

  lockAdmin() {
    this.adminToken = null;
  }

  async adminListUsers() {
    if (!this.adminToken) return [];
    const { data, error } = await supabase().rpc('flow_admin_list_users', {
      p_admin_token: this.adminToken
    });
    if (error) return [];
    return (data ?? []) as Array<{
      id: string;
      display_name: string;
      username: string;
      is_admin: boolean;
      hidden: boolean;
      avatar_hue: number;
    }>;
  }

  async adminCreateUser(displayName: string, password: string, hue: number) {
    if (!this.adminToken) throw new Error('locked');
    const { error } = await supabase().rpc('flow_admin_create_user', {
      p_admin_token: this.adminToken,
      p_display_name: displayName,
      p_password: password,
      p_avatar_hue: hue
    });
    if (error) throw new Error(error.message);
    await this.refreshUsers();
  }

  async adminSetPassword(userId: string, password: string) {
    if (!this.adminToken) throw new Error('locked');
    const { error } = await supabase().rpc('flow_admin_set_password', {
      p_admin_token: this.adminToken,
      p_user_id: userId,
      p_password: password
    });
    if (error) throw new Error(error.message);
  }

  async adminRenameUser(userId: string, displayName: string) {
    if (!this.adminToken) throw new Error('locked');
    const { error } = await supabase().rpc('flow_admin_rename_user', {
      p_admin_token: this.adminToken,
      p_user_id: userId,
      p_display_name: displayName
    });
    if (error) throw new Error(error.message);
    await this.refreshUsers();
  }

  /* ---- provider key pool (admin) ---- */

  async adminListKeys() {
    if (!this.adminToken) return [];
    const { data, error } = await supabase().rpc('flow_admin_list_keys', {
      p_admin_token: this.adminToken
    });
    if (error) return [];
    return (data ?? []) as Array<{
      id: string;
      provider: string;
      masked: string;
      label: string;
      disabled: boolean;
      last_error: string | null;
    }>;
  }

  async adminAddKey(provider: 'groq' | 'gemini', key: string, label: string) {
    if (!this.adminToken) throw new Error('locked');
    const { error } = await supabase().rpc('flow_admin_add_key', {
      p_admin_token: this.adminToken,
      p_provider: provider,
      p_key: key,
      p_label: label
    });
    if (error) throw new Error(error.message);
  }

  async adminDeleteKey(id: string) {
    if (!this.adminToken) throw new Error('locked');
    const { error } = await supabase().rpc('flow_admin_delete_key', {
      p_admin_token: this.adminToken,
      p_key_id: id
    });
    if (error) throw new Error(error.message);
  }

  async adminSetKeyEnabled(id: string, enabled: boolean) {
    if (!this.adminToken) throw new Error('locked');
    const { error } = await supabase().rpc('flow_admin_set_key_enabled', {
      p_admin_token: this.adminToken,
      p_key_id: id,
      p_enabled: enabled
    });
    if (error) throw new Error(error.message);
  }

  async adminDeleteUser(userId: string) {
    if (!this.adminToken) throw new Error('locked');
    const { error } = await supabase().rpc('flow_admin_delete_user', {
      p_admin_token: this.adminToken,
      p_user_id: userId
    });
    if (error) throw new Error(error.message);
    await this.refreshUsers();
  }
}

export const auth = new Auth();
