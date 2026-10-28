import { beforeEach, describe, expect, it } from 'vitest';
import {
  createProject,
  createTimelineItem,
  createUser,
  dayOffset,
  indiaNoon,
  insertProgressUpdate,
  resetDatabase,
  signIn,
} from '../helpers';

type Flag = { type: string; days_overdue?: number; last_update_on?: string };
type Item = { id: string; name: string; flags: Flag[] };

async function setup() {
  const admin = await createUser({ email: 'admin@example.com' });
  const session = await signIn('admin@example.com');
  const project = await createProject(admin.id, 'Mehta Residence');
  return { admin, session, project };
}

async function flagsByName(session: Awaited<ReturnType<typeof signIn>>, projectId: string) {
  const timeline = await session.client.get(`/api/projects/${projectId}/timeline`);
  expect(timeline.status).toBe(200);
  return Object.fromEntries((timeline.body.items as Item[]).map((item) => [item.name, item.flags]));
}

describe('timeline flags', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('works out Overdue, Due soon, and Missing update at each boundary (US3-1 to US3-4, SC-003)', async () => {
    const { admin, session, project } = await setup();
    const make = (name: string, deadline: number) => createTimelineItem(admin.id, { projectId: project.id, name, deadline: dayOffset(deadline) });
    await make('D-1', -1);
    await make('D', 0);
    await make('D+3', 3);
    await make('D+7', 7);
    await make('D+8', 8);
    const done = await make('Done last week', -7);
    await insertProgressUpdate({ itemId: done.id, status: 'DONE', actorId: admin.id, createdAt: indiaNoon(dayOffset(-2)) });
    const stale = await make('Stale 8 days', 30);
    await insertProgressUpdate({ itemId: stale.id, status: 'IN_PROGRESS', actorId: admin.id, createdAt: indiaNoon(dayOffset(-8)) });
    const fresh = await make('Updated 7 days ago', 30);
    await insertProgressUpdate({ itemId: fresh.id, status: 'IN_PROGRESS', actorId: admin.id, createdAt: indiaNoon(dayOffset(-7)) });

    const flags = await flagsByName(session, project.id);
    expect(flags['D-1']).toEqual([{ type: 'OVERDUE', days_overdue: 1 }]);
    expect(flags['D']).toEqual([{ type: 'DUE_SOON' }]);
    expect(flags['D+3']).toEqual([{ type: 'DUE_SOON' }]);
    expect(flags['D+7']).toEqual([{ type: 'DUE_SOON' }]);
    expect(flags['D+8']).toEqual([]);
    expect(flags['Done last week']).toEqual([]);
    expect(flags['Stale 8 days']).toEqual([{ type: 'MISSING_UPDATE', last_update_on: dayOffset(-8) }]);
    expect(flags['Updated 7 days ago']).toEqual([]);
  });

  it('shows every flag that applies on one item (US3-7)', async () => {
    const { admin, session, project } = await setup();
    const late = await createTimelineItem(admin.id, { projectId: project.id, name: 'Late and stale', deadline: dayOffset(-2) });
    await insertProgressUpdate({ itemId: late.id, status: 'IN_PROGRESS', actorId: admin.id, createdAt: indiaNoon(dayOffset(-8)) });
    const soon = await createTimelineItem(admin.id, { projectId: project.id, name: 'Soon and stale', deadline: dayOffset(3) });
    await insertProgressUpdate({ itemId: soon.id, status: 'IN_PROGRESS', actorId: admin.id, createdAt: indiaNoon(dayOffset(-8)) });

    const flags = await flagsByName(session, project.id);
    expect(flags['Late and stale']).toEqual([
      { type: 'OVERDUE', days_overdue: 2 },
      { type: 'MISSING_UPDATE', last_update_on: dayOffset(-8) },
    ]);
    expect(flags['Soon and stale']).toEqual([{ type: 'DUE_SOON' }, { type: 'MISSING_UPDATE', last_update_on: dayOffset(-8) }]);
  });

  it('follows deadline changes and new updates (US3-5, US3-6, Edge Cases)', async () => {
    const { admin, session, project } = await setup();
    const late = await createTimelineItem(admin.id, { projectId: project.id, name: 'Late', deadline: dayOffset(-1) });
    const moved = await session.client.patch(`/api/timeline-items/${late.id}`).send({ deadline: dayOffset(2) });
    expect(moved.body.flags).toEqual([{ type: 'DUE_SOON' }]);
    const detail = await session.client.get(`/api/timeline-items/${late.id}`);
    expect(detail.body.date_changes[0]).toMatchObject({ field: 'DEADLINE', old_value: dayOffset(-1), new_value: dayOffset(2) });

    const earlier = await session.client.patch(`/api/timeline-items/${late.id}`).send({ deadline: dayOffset(-3) });
    expect(earlier.body.flags).toEqual([{ type: 'OVERDUE', days_overdue: 3 }]);

    const stale = await createTimelineItem(admin.id, { projectId: project.id, name: 'Stale', deadline: dayOffset(30) });
    await insertProgressUpdate({ itemId: stale.id, status: 'IN_PROGRESS', actorId: admin.id, createdAt: indiaNoon(dayOffset(-9)) });
    expect((await flagsByName(session, project.id))['Stale']).toEqual([{ type: 'MISSING_UPDATE', last_update_on: dayOffset(-9) }]);
    const updated = await session.client.post(`/api/timeline-items/${stale.id}/progress-updates`).send({ status: 'IN_PROGRESS' });
    expect(updated.body.flags).toEqual([]);
  });

  it('gives archived items no flags and keeps flags on an archived project (US3-8, FR-015)', async () => {
    const { admin, session, project } = await setup();
    await createTimelineItem(admin.id, { projectId: project.id, name: 'Shelved', deadline: dayOffset(-5), archived: true });
    await createTimelineItem(admin.id, { projectId: project.id, name: 'Late', deadline: dayOffset(-4) });
    const before = await session.client.get(`/api/projects/${project.id}/timeline`);
    expect(before.body.archived_items[0].flags).toEqual([]);

    await session.client.post(`/api/projects/${project.id}/archive`);
    const after = await session.client.get(`/api/projects/${project.id}/timeline`);
    expect(after.body.project.archived).toBe(true);
    expect(after.body.items.map((item: Item) => item.flags)).toEqual(before.body.items.map((item: Item) => item.flags));
    expect(after.body.items[0].flags).toEqual([{ type: 'OVERDUE', days_overdue: 4 }]);
  });

  it('does not let anyone set or clear a flag directly (FR-015)', async () => {
    const { admin, session, project } = await setup();
    const late = await createTimelineItem(admin.id, { projectId: project.id, name: 'Late', deadline: dayOffset(-1) });
    const attempt = await session.client.patch(`/api/timeline-items/${late.id}`).send({ flags: [] });
    expect(attempt.status).toBe(400);
    expect((await flagsByName(session, project.id))['Late']).toEqual([{ type: 'OVERDUE', days_overdue: 1 }]);
  });
});
