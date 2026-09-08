import { supabase } from '../sync/supabase';
import { auth } from '../auth.svelte';

/*
  The assignment tracker. One row per assignment: a title, which class it's
  for, when it's due, and — once it's graded — the grade and how much it
  actually moved the class grade. RLS-scoped the same way every other flow
  table is (see the memory_nodes/memory_links migration for the shape this
  mirrors).

  completedAt is what lets a finished assignment gray out and drop to the
  bottom immediately, then disappear the next day, without a server-side job:
  the UI reads it directly (see Assignments.svelte's `visible` filter) and a
  reload just re-evaluates the same cutoff against the same timestamp.
*/

export interface Assignment {
  id: string;
  title: string;
  subject: string;
  description: string;
  dueAt: string | null;
  status: 'open' | 'done';
  grade: string;
  gradeImpact: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AssignmentPatch = Partial<
  Pick<Assignment, 'title' | 'subject' | 'description' | 'dueAt' | 'grade' | 'gradeImpact'>
>;

function fromRow(r: Record<string, unknown>): Assignment {
  return {
    id: r.id as string,
    title: r.title as string,
    subject: (r.subject as string) ?? '',
    description: (r.description as string) ?? '',
    dueAt: (r.due_at as string) ?? null,
    status: (r.status as 'open' | 'done') ?? 'open',
    grade: (r.grade as string) ?? '',
    gradeImpact: (r.grade_impact as string) ?? '',
    completedAt: (r.completed_at as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string
  };
}

const COLUMNS = 'id, title, subject, description, due_at, status, grade, grade_impact, completed_at, created_at, updated_at';

class AssignmentStore {
  items = $state<Assignment[]>([]);
  loaded = $state(false);

  async load() {
    if (!auth.user) return;
    const { data } = await supabase()
      .from('assignments')
      .select(COLUMNS)
      .order('due_at', { ascending: true, nullsFirst: false });
    this.items = (data ?? []).map(fromRow);
    this.loaded = true;
  }

  async create(patch: AssignmentPatch): Promise<Assignment | null> {
    if (!auth.user) return null;
    const { data, error } = await supabase()
      .from('assignments')
      .insert({
        user_id: auth.user.id,
        title: patch.title?.trim() || 'untitled assignment',
        subject: patch.subject?.trim() ?? '',
        description: patch.description ?? '',
        due_at: patch.dueAt ?? null,
        grade: patch.grade ?? '',
        grade_impact: patch.gradeImpact ?? ''
      })
      .select(COLUMNS)
      .single();
    if (error || !data) return null;
    const a = fromRow(data);
    this.items = [...this.items, a];
    return a;
  }

  async update(id: string, patch: AssignmentPatch) {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) row.title = patch.title.trim() || 'untitled assignment';
    if (patch.subject !== undefined) row.subject = patch.subject;
    if (patch.description !== undefined) row.description = patch.description;
    if (patch.dueAt !== undefined) row.due_at = patch.dueAt;
    if (patch.grade !== undefined) row.grade = patch.grade;
    if (patch.gradeImpact !== undefined) row.grade_impact = patch.gradeImpact;

    const { error } = await supabase().from('assignments').update(row).eq('id', id);
    if (error) return;
    this.items = this.items.map((a) =>
      a.id === id
        ? {
            ...a,
            ...(patch.title !== undefined ? { title: row.title as string } : {}),
            ...(patch.subject !== undefined ? { subject: patch.subject! } : {}),
            ...(patch.description !== undefined ? { description: patch.description! } : {}),
            ...(patch.dueAt !== undefined ? { dueAt: patch.dueAt! } : {}),
            ...(patch.grade !== undefined ? { grade: patch.grade! } : {}),
            ...(patch.gradeImpact !== undefined ? { gradeImpact: patch.gradeImpact! } : {}),
            updatedAt: row.updated_at as string
          }
        : a
    );
  }

  async setDone(id: string, done: boolean) {
    const now = new Date().toISOString();
    const row = { status: done ? 'done' : 'open', completed_at: done ? now : null, updated_at: now };
    const { error } = await supabase().from('assignments').update(row).eq('id', id);
    if (error) return;
    this.items = this.items.map((a) =>
      a.id === id ? { ...a, status: row.status as 'open' | 'done', completedAt: row.completed_at, updatedAt: now } : a
    );
  }

  async remove(id: string) {
    await supabase().from('assignments').delete().eq('id', id);
    this.items = this.items.filter((a) => a.id !== id);
  }

  reset() {
    this.items = [];
    this.loaded = false;
  }
}

export const assignmentStore = new AssignmentStore();
