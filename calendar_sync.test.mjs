import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./calendar_sync.js', import.meta.url), 'utf8');
const { buildWeekEvents, createCalendarSync } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const state = {
    currentPlanningWeekStart: '2026-09-28',
    tasks: [{ id: 10, day: 'monday', text: 'Revisar contrato', startTime: '09:00', endTime: '10:00', category: 'work', priority: 'alta' }],
    taskCategories: [{ id: 'work', label: 'Trabalho' }],
    studyData: { subjects: [{ id: 2, name: 'Inglês' }], studyPlan: { tracks: [{ id: 1, name: 'MBA' }], weeklyBlocks: [
        { id: 20, day: 'tuesday', title: 'Leitura', startTime: '20:00', plannedMinutes: 30, trackId: 1, subjectId: 2, status: 'planned' }
    ] } }
};
const remote = new Map();
const requests = [];
let calendarExists = false;
let authorizedEmail = 'user@example.com';
const owner = { uid: 'uid-123', email: authorizedEmail };

globalThis.window = { google: { accounts: { oauth2: { initTokenClient: ({ callback }) => ({
    requestAccessToken: () => callback({ access_token: 'mock-token', expires_in: 3600 })
}) } } } };

globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url);
    const method = options.method || 'GET';
    requests.push(`${method} ${path.pathname}`);
    const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
    if (path.pathname.endsWith('/userinfo')) return response({ email: authorizedEmail });
    if (path.pathname === '/calendar/v3/calendars' && method === 'POST') {
        calendarExists = true; return response({ id: 'calendar-1' });
    }
    if (path.pathname === '/calendar/v3/calendars/calendar-1') return response(calendarExists ? { id: 'calendar-1' } : { error: { message: 'missing' } }, calendarExists ? 200 : 404);
    if (path.pathname.endsWith('/events') && method === 'GET') {
        const week = path.searchParams.get('privateExtendedProperty')?.split('=')[1];
        return response({ items: [...remote.values()].filter(item => item.extendedProperties.private.mtWeek === week) });
    }
    if (path.pathname.endsWith('/events') && method === 'POST') {
        const event = JSON.parse(options.body); remote.set(event.id, event); return response(event);
    }
    if (path.pathname.includes('/events/') && method === 'PUT') {
        const event = JSON.parse(options.body); remote.set(event.id, event); return response(event);
    }
    if (path.pathname.includes('/events/') && method === 'DELETE') {
        remote.delete(path.pathname.split('/').at(-1)); return { ok: true, status: 204 };
    }
    throw new Error(`Unexpected ${method} ${url}`);
};

const sync = createCalendarSync({ clientId: 'test-id', getState: () => state, saveState: () => {}, getUser: () => owner });
sync.setOwner(owner);
await sync.connect();
assert.equal(sync.view().status, 'Sincronizado');
assert.equal(remote.size, 2);
assert.equal(state.calendarSyncTest.calendarId, 'calendar-1');
assert.equal([...remote.values()].find(event => event.summary.includes('Revisar')).start.dateTime, '2026-09-28T12:00:00.000Z');
assert.ok([...remote.values()].find(event => event.summary.includes('Leitura')).description.includes('MBA'));
const taskId = [...remote.values()].find(event => event.summary.includes('Revisar')).id;

state.tasks[0].text = 'Revisar aditivo';
state.tasks[0].day = 'thursday';
await sync.syncNow({ force: true });
assert.equal(remote.size, 2);
assert.equal(remote.get(taskId).summary, 'Missão Tática — Revisar aditivo');
assert.equal(remote.get(taskId).start.dateTime, '2026-10-01T12:00:00.000Z');
assert.ok(requests.some(request => request.startsWith('PUT ') && request.endsWith(taskId)));

state.tasks = [];
await sync.syncNow({ force: true });
assert.equal(remote.has(taskId), false);
assert.ok(requests.some(request => request.startsWith('DELETE ') && request.endsWith(taskId)));

state.currentPlanningWeekStart = '2026-10-05';
await sync.syncNow({ force: true });
assert.equal(remote.size, 2); // a semana anterior continua no calendário

sync.pause();
assert.equal(sync.view().enabled, false);
assert.equal(remote.size, 2); // pausar não remove os eventos

authorizedEmail = 'another@example.com';
await sync.connect();
assert.match(sync.view().error, /mesma conta Google/);
assert.equal(remote.size, 2);

const desired = buildWeekEvents(state, owner.uid, 'America/Sao_Paulo');
assert.equal(desired.size, 1);
console.log('Calendar sync: criação, edição, remoção, virada de semana, pausa e conta conferidas.');
