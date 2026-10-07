import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./calendar_sync.v2.js', import.meta.url), 'utf8');
const { buildWeekEvents, createCalendarSync } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const state = {
    currentPlanningWeekStart: '2026-09-28',
    calendarSyncTest: { calendarId: 'calendar-1', enabled: true },
    tasks: [{ id: 10, day: 'monday', text: 'Revisar contrato', startTime: '09:00', endTime: '10:00', category: 'work', priority: 'alta' }],
    taskCategories: [{ id: 'work', label: 'Trabalho' }],
    studyData: { subjects: [{ id: 2, name: 'Inglês' }], studyPlan: { tracks: [{ id: 1, name: 'MBA' }], weeklyBlocks: [
        { id: 20, day: 'tuesday', title: 'Leitura', startTime: '20:00', plannedMinutes: 30, trackId: 1, subjectId: 2, status: 'planned' }
    ] } }
};
const remote = new Map();
const requests = [];
let calendarExists = true;
let authorizedEmail = 'user@example.com';
let requestedScope = '';
let primaryEvents = [];
const owner = { uid: 'uid-123', email: authorizedEmail };

globalThis.window = { google: { accounts: { oauth2: { initTokenClient: ({ callback, scope }) => {
    requestedScope = scope;
    return { requestAccessToken: () => callback({ access_token: 'mock-token', expires_in: 3600 }) };
} } } } };

globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url);
    const method = options.method || 'GET';
    requests.push(`${method} ${path.pathname}`);
    const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
    if (path.pathname.endsWith('/userinfo')) return response({ email: authorizedEmail });
    if (path.pathname === '/calendar/v3/calendars' && method === 'POST') {
        calendarExists = true; return response({ id: 'calendar-1' });
    }
    if (path.pathname === '/calendar/v3/calendars/calendar-1' && method === 'PATCH') return response({ id: 'calendar-1', ...JSON.parse(options.body) });
    if (path.pathname === '/calendar/v3/calendars/calendar-1') return response(calendarExists ? { id: 'calendar-1', summary: 'Missão Tática (Teste)' } : { error: { message: 'missing' } }, calendarExists ? 200 : 404);
    if (path.pathname === '/calendar/v3/calendars/primary/events' && method === 'GET') return response({ items: primaryEvents });
    if (path.pathname.startsWith('/calendar/v3/calendars/primary/events/') && method === 'GET') {
        const event = primaryEvents.find(item => item.id === decodeURIComponent(path.pathname.split('/').at(-1)));
        return response(event || { error: { message: 'missing' } }, event ? 200 : 404);
    }
    if (path.pathname.startsWith('/calendar/v3/calendars/primary/events/') && method === 'PATCH') {
        const eventId = decodeURIComponent(path.pathname.split('/').at(-1));
        const event = primaryEvents.find(item => item.id === eventId);
        if (!event) return response({ error: { message: 'missing' } }, 404);
        Object.assign(event, JSON.parse(options.body));
        return response(event);
    }
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
assert.doesNotMatch(requestedScope, /calendar\.events\.readonly/);
assert.doesNotMatch(requestedScope, /auth\/calendar\.events(?:\s|$)/);
assert.equal(remote.size, 2);
assert.equal(state.calendarSync.calendarId, 'calendar-1');
assert.equal(state.calendarSyncTest, undefined);
assert.ok(requests.some(request => request === 'PATCH /calendar/v3/calendars/calendar-1'));
assert.equal([...remote.values()].find(event => event.summary.includes('Revisar')).start.dateTime, '2026-09-28T12:00:00.000Z');
assert.equal([...remote.values()].find(event => event.summary.includes('Revisar')).colorId, '9');
assert.match([...remote.values()].find(event => event.summary.includes('Revisar')).summary, /^💼 TRABALHO/);
assert.ok([...remote.values()].find(event => event.summary.includes('Leitura')).description.includes('MBA'));
const taskId = [...remote.values()].find(event => event.summary.includes('Revisar')).id;

state.tasks[0].text = 'Revisar aditivo';
state.tasks[0].day = 'thursday';
await sync.syncNow({ force: true });
assert.equal(remote.size, 2);
assert.equal(remote.get(taskId).summary, '💼 TRABALHO · Revisar aditivo');
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

authorizedEmail = 'user@example.com';
const inboundState = {
    currentPlanningWeekStart: '2026-09-28',
    calendarSync: { calendarId: 'calendar-1', enabled: true },
    tasks: [], taskCategories: [],
    studyData: { subjects: [], studyPlan: { tracks: [], weeklyBlocks: [] } }
};
primaryEvents = [
    {
        id: 'event-created', summary: 'Consulta médica', status: 'confirmed',
        creator: { self: true }, organizer: { self: true }, updated: '2026-09-29T12:00:00Z',
        start: { dateTime: '2026-09-30T13:00:00-03:00' }, end: { dateTime: '2026-09-30T14:00:00-03:00' }
    },
    {
        id: 'event-invite', summary: 'Reunião externa', status: 'confirmed',
        creator: { email: 'other@example.com' }, organizer: { email: 'other@example.com' },
        attendees: [{ self: true, responseStatus: 'accepted' }], updated: '2026-09-29T13:00:00Z',
        start: { dateTime: '2026-10-01T10:30:00-03:00' }, end: { dateTime: '2026-10-01T11:15:00-03:00' }
    }
];
const inboundSync = createCalendarSync({ clientId: 'test-id', getState: () => inboundState, saveState: () => {}, getUser: () => owner, enableInbound: true });
inboundSync.setOwner(owner);
await inboundSync.connect();
assert.match(requestedScope, /auth\/calendar\.events(?:\s|$)/);
assert.doesNotMatch(requestedScope, /calendar\.events\.readonly/);
assert.equal(inboundSync.getInbox().length, 2);
assert.equal(inboundSync.getInbox()[0].day, 'wednesday');
assert.equal(inboundSync.getInbox()[0].originType, 'Criado por você');
assert.equal(inboundSync.getInbox()[1].originType, 'Convite recebido');

inboundState.tasks.push({ id: 'linked-task', day: 'wednesday', text: 'Rascunho', category: 'health' });
await inboundSync.markInboxConverted('event-created', 'linked-task');
assert.equal(inboundSync.getInbox().length, 1);
assert.equal(inboundState.tasks[0].text, 'Consulta médica');
assert.equal(inboundState.tasks[0].startTime, '13:00');
assert.equal(primaryEvents[0].colorId, '11');
assert.equal(buildWeekEvents(inboundState, owner.uid, 'America/Sao_Paulo').size, 0);

inboundState.tasks[0].category = 'law';
await inboundSync.syncNow({ force: true });
assert.equal(primaryEvents[0].colorId, '3');

primaryEvents[0] = { ...primaryEvents[0], summary: 'Consulta remarcada', updated: '2026-09-30T12:00:00Z', start: { dateTime: '2026-09-30T14:00:00-03:00' }, end: { dateTime: '2026-09-30T15:30:00-03:00' } };
await inboundSync.refreshInbox();
assert.equal(inboundState.tasks[0].text, 'Consulta remarcada');
assert.equal(inboundState.tasks[0].startTime, '14:00');
assert.equal(inboundState.tasks[0].time, '90 min');

inboundSync.ignoreInboxEvent('event-invite');
assert.equal(inboundSync.getInbox().length, 0);
primaryEvents = [primaryEvents[1]];
await inboundSync.refreshInbox();
assert.equal(inboundState.tasks[0].googleCalendarSourceMissing, true);

console.log('Calendar sync: envio, entrada manual, cores, convites, vínculo, atualização e remoção conferidos.');

// Meeting integration: filter-based week fetches still resolve originals by ID.
primaryEvents = [{ id:'coaktion-meeting',summary:'Reunião · Coaktion',status:'confirmed',
 start:{dateTime:'2026-09-30T10:00:00-03:00'},end:{dateTime:'2026-09-30T11:00:00-03:00'},
 organizer:{email:'private@example.com'},description:'SEGREDO',htmlLink:'https://private.example.com' }];
await inboundSync.refreshInbox();
assert.equal(inboundSync.getInbox().length,1);
const meeting={id:'meeting-task',activityType:'meeting',category:'work',completed:false,xp:99,rewardedCoins:0};
inboundState.tasks.push(meeting);
const requestsBefore=requests.length;
await inboundSync.markInboxConverted('coaktion-meeting','meeting-task');
assert.equal(meeting.sanitizedOrigin,'coaktion');
assert.equal(requests.slice(requestsBefore).some(r=>r.startsWith('PATCH /calendar/v3/calendars/primary')),false,'Espelho da Coaktion não recebe alterações de cor.');
assert.doesNotMatch(JSON.stringify(inboundState.calendarInboxItems.find(e=>e.id==='coaktion-meeting')),/SEGREDO|private/);
await inboundSync.refreshInbox();await inboundSync.refreshInbox();
assert.equal(inboundState.calendarInboxItems.filter(e=>e.id==='coaktion-meeting').length,1);
assert.equal(inboundState.tasks.filter(t=>t.googleCalendarEventId==='coaktion-meeting').length,1);
primaryEvents[0]={...primaryEvents[0],start:{dateTime:'2026-10-06T15:00:00-03:00'},end:{dateTime:'2026-10-06T16:30:00-03:00'}};
await inboundSync.refreshInbox();
assert.equal(meeting.googleCalendarWeekStart,'2026-10-05');assert.equal(meeting.day,'tuesday');assert.equal(meeting.startTime,'15:00');assert.equal(meeting.time,'90 min');assert.equal(meeting.googleCalendarSourceMissing,false);
assert.equal(inboundSync.getInbox({includeHandled:true}).some(e=>e.id==='coaktion-meeting'),false);
inboundState.currentPlanningWeekStart='2026-10-05';await inboundSync.refreshInbox();
assert.equal(inboundSync.getInbox({includeHandled:true}).filter(e=>e.id==='coaktion-meeting').length,1);
primaryEvents[0]={id:'coaktion-meeting',status:'cancelled'};await inboundSync.refreshInbox();
assert.equal(meeting.googleCalendarSourceStatus,'cancelled');assert.equal(meeting.completed,false);assert.equal(meeting.xp,99);assert.equal(meeting.rewardedCoins,0);
primaryEvents[0]={id:'coaktion-meeting',summary:'Reunião · Coaktion',status:'confirmed',start:{dateTime:'2026-10-07T09:00:00-03:00'},end:{dateTime:'2026-10-07T10:00:00-03:00'}};
await inboundSync.refreshInbox();assert.equal(meeting.googleCalendarSourceStatus,'active');assert.equal(meeting.googleCalendarSourceMissing,false);assert.equal(meeting.day,'wednesday');
meeting.completed=true;meeting.rewardedXp=99;primaryEvents[0]={id:'coaktion-meeting',status:'cancelled'};
await inboundSync.refreshInbox();assert.equal(meeting.completed,true);assert.equal(meeting.rewardedXp,99,'Cancelamento posterior não reverte realização registrada.');
primaryEvents[0]={id:'coaktion-meeting',summary:'Reunião · Coaktion',status:'confirmed',start:{dateTime:'2026-10-07T09:00:00-03:00'},end:{dateTime:'2026-10-07T10:00:00-03:00'}};
inboundState.tasks=inboundState.tasks.filter(t=>t.id!=='meeting-task');await inboundSync.refreshInbox();
assert.equal(inboundSync.getInbox().find(e=>e.id==='coaktion-meeting').status,'pending','Limpar missões não deixa vínculo pendente impedindo nova conversão.');
console.log('Reuniões: privacidade, identidade, remarcação entre semanas, cancelamento, restauração e histórico verificados.');
