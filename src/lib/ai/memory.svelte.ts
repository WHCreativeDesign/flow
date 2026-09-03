import { supabase } from '../sync/supabase';
import { auth } from '../auth.svelte';

/*
  The memory graph. Every memory the assistant keeps — from a chat's
  <remember> tag or from quick info's capture — is a titled markdown node,
  editable by the person it's about, optionally linked to other nodes. See
  the memory_nodes/memory_links migration; both tables carry the same
  user_id-scoped RLS every other flow table does.

  x/y persist a manually-dragged layout across reloads. A brand-new node has
  neither yet — the graph view seeds a position for it locally and only
  writes x/y back once it's actually been placed.
*/

export interface MemoryNode {
  id: string;
  title: string;
  body: string;
  /* 'root' is the one base node per person — the profile everything else
     hangs off. 'chat' | 'quickinfo' | 'manual' | 'migrated' are ordinary
     nodes. The graph draws the root larger because it is the hub, and
     createMemory() links new nodes back to it. */
  source: string;
  x: number | null;
  y: number | null;
  updatedAt: string;
}

export interface MemoryLink {
  id: string;
  aId: string;
  bId: string;
}

class MemoryStore {
  nodes = $state<MemoryNode[]>([]);
  links = $state<MemoryLink[]>([]);
  loaded = $state(false);

  async load() {
    if (!auth.user) return;
    const [{ data: nodeRows }, { data: linkRows }] = await Promise.all([
      supabase().from('memory_nodes').select('id, title, body, source, x, y, updated_at').order('updated_at', { ascending: false }),
      supabase().from('memory_links').select('id, a_id, b_id')
    ]);
    this.nodes = (nodeRows ?? []).map((n) => ({
      id: n.id as string,
      title: n.title as string,
      body: n.body as string,
      source: (n.source as string) ?? 'chat',
      x: n.x as number | null,
      y: n.y as number | null,
      updatedAt: n.updated_at as string
    }));
    this.links = (linkRows ?? []).map((l) => ({ id: l.id as string, aId: l.a_id as string, bId: l.b_id as string }));
    this.loaded = true;
  }

  async createNode(title: string, body: string): Promise<MemoryNode | null> {
    if (!auth.user) return null;
    const { data, error } = await supabase()
      .from('memory_nodes')
      .insert({ user_id: auth.user.id, title: title.trim() || 'untitled', body, source: 'manual' })
      .select('id, title, body, source, x, y, updated_at')
      .single();
    if (error || !data) return null;
    const node: MemoryNode = {
      id: data.id as string,
      title: data.title as string,
      body: data.body as string,
      source: (data.source as string) ?? 'manual',
      x: data.x as number | null,
      y: data.y as number | null,
      updatedAt: data.updated_at as string
    };
    this.nodes = [node, ...this.nodes];
    return node;
  }

  async updateNode(id: string, patch: Partial<Pick<MemoryNode, 'title' | 'body' | 'x' | 'y'>>) {
    const row: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
    const { error } = await supabase().from('memory_nodes').update(row).eq('id', id);
    if (error) return;
    this.nodes = this.nodes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: row.updated_at as string } : n));
  }

  async deleteNode(id: string) {
    await supabase().from('memory_nodes').delete().eq('id', id);
    this.nodes = this.nodes.filter((n) => n.id !== id);
    this.links = this.links.filter((l) => l.aId !== id && l.bId !== id);
  }

  async link(aId: string, bId: string) {
    if (!auth.user || aId === bId) return;
    if (this.links.some((l) => (l.aId === aId && l.bId === bId) || (l.aId === bId && l.bId === aId))) return;
    const { data, error } = await supabase()
      .from('memory_links')
      .insert({ user_id: auth.user.id, a_id: aId, b_id: bId })
      .select('id, a_id, b_id')
      .single();
    if (error || !data) return;
    this.links = [...this.links, { id: data.id as string, aId: data.a_id as string, bId: data.b_id as string }];
  }

  async unlink(id: string) {
    await supabase().from('memory_links').delete().eq('id', id);
    this.links = this.links.filter((l) => l.id !== id);
  }

  reset() {
    this.nodes = [];
    this.links = [];
    this.loaded = false;
  }
}

export const memoryStore = new MemoryStore();
