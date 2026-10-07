// Integração oficial do Missão Tática com o Google Agenda.
// O token OAuth fica apenas na memória. Nenhuma chave secreta é usada no navegador.
const BASE_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created https://www.googleapis.com/auth/userinfo.email';
const EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const API = 'https://www.googleapis.com/calendar/v3';
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const CATEGORY_STYLE = {
    work: { colorId: '9', prefix: '💼 TRABALHO' },
    law: { colorId: '3', prefix: '⚖️ ADVOCACIA' },
    study: { colorId: '7', prefix: '📚 ESTUDO' },
    home: { colorId: '10', prefix: '🏠 CASA' },
    life: { colorId: '4', prefix: '💗 PESSOAL' },
    personal: { colorId: '4', prefix: '💗 PESSOAL' },
    health: { colorId: '11', prefix: '🩺 SAÚDE' },
    finance: { colorId: '5', prefix: '💰 FINANÇAS' },
    leisure: { colorId: '6', prefix: '🎮 LAZER' },
    family: { colorId: '2', prefix: '👨‍👩‍👧‍👦 FAMÍLIA' },
    career: { colorId: '1', prefix: '🚀 CARREIRA' },
    default: { colorId: '8', prefix: '🎯 MISSÃO' }
};

function categoryStyle(category) {
    const id = String(category?.id || '').toLowerCase();
    if (CATEGORY_STYLE[id]) return CATEGORY_STYLE[id];
    const label = String(category?.label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (label.includes('advoc')) return CATEGORY_STYLE.law;
    if (label.includes('famil')) return CATEGORY_STYLE.family;
    if (label.includes('saude')) return CATEGORY_STYLE.health;
    if (label.includes('trabalho')) return CATEGORY_STYLE.work;
    if (label.includes('estud')) return CATEGORY_STYLE.study;
    if (label.includes('casa') || label.includes('infra')) return CATEGORY_STYLE.home;
    if (label.includes('financ')) return CATEGORY_STYLE.finance;
    if (label.includes('lazer')) return CATEGORY_STYLE.leisure;
    if (label.includes('carreira')) return CATEGORY_STYLE.career;
    if (label.includes('pessoal') || label.includes('vida')) return CATEGORY_STYLE.life;
    return CATEGORY_STYLE.default;
}

function weekDate(key, offset = 0) {
    const parts = String(key || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(part => !Number.isInteger(part))) throw new Error('Semana inválida.');
    const date = new Date(parts[0], parts[1] - 1, parts[2] + offset);
    if (Number.isNaN(date.getTime())) throw new Error('Semana inválida.');
    return date;
}

function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function hash(value) {
    let n = 0xcbf29ce484222325n;
    for (const byte of new TextEncoder().encode(String(value))) {
        n = (n ^ BigInt(byte)) * 0x100000001b3n & 0xffffffffffffffffn;
    }
    return n.toString(16).padStart(16, '0');
}

function clock(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours < 24 && minutes < 60 ? { hours, minutes } : null;
}

function eventTime(day, startTime, endTime, duration, timeZone) {
    const startClock = clock(startTime);
    if (!startClock) return { start: { date: dateKey(day) }, end: { date: dateKey(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) } };
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), startClock.hours, startClock.minutes);
    const endClock = clock(endTime);
    const end = endClock
        ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), endClock.hours, endClock.minutes)
        : new Date(start.getTime() + Math.max(1, Number(duration) || 30) * 60000);
    if (end <= start) end.setDate(end.getDate() + 1);
    return {
        start: { dateTime: start.toISOString(), timeZone },
        end: { dateTime: end.toISOString(), timeZone }
    };
}

export function buildWeekEvents(state, ownerUid, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
    const week = state?.currentPlanningWeekStart;
    const result = new Map();
    if (!week || !ownerUid) return result;
    const subjects = state.studyData?.subjects || [];
    const tracks = state.studyData?.studyPlan?.tracks || [];
    const categories = state.taskCategories || [];

    function add(type, item, title, description, duration, style = CATEGORY_STYLE.default) {
        const index = DAYS.indexOf(item?.day);
        if (index < 0 || item?.id == null) return;
        const id = `mt${hash(`${ownerUid}|${week}|${type}|${item.id}`)}`;
        const body = {
            id,
            summary: `${style.prefix} · ${title}`,
            description,
            colorId: style.colorId,
            ...eventTime(weekDate(week, index), item.startTime, item.endTime, duration, timeZone),
            extendedProperties: { private: { mtWeek: week, mtOwner: ownerUid, mtSource: type, mtActivityType: item.activityType === 'meeting' ? 'meeting' : 'task' } }
        };
        body.extendedProperties.private.mtHash = hash(JSON.stringify(body));
        result.set(id, body);
    }

    for (const task of state.tasks || []) {
        if (task.activityType === 'meeting' && (task.meetingOutcome === 'not_held' || task.googleCalendarSourceStatus === 'cancelled')) continue;
        if (task.googleCalendarWeekStart && task.googleCalendarWeekStart !== week) continue;
        // Uma missão convertida da agenda principal já possui um evento no Google.
        // Não a copie para a agenda secundária do Missão Tática.
        if (task.googleCalendarSource === 'primary' && task.googleCalendarEventId) continue;
        const category = categories.find(cat => String(cat.id) === String(task.category));
        const style = categoryStyle(category || { id: task.category });
        const subtasks = (task.subtasks || []).map(sub => `${sub.completed ? '✓' : '○'} ${sub.text}`).join(' | ');
        const duration = parseInt(String(task.time || '').replace(/[^0-9]/g, ''), 10) || 30;
        add('task', task, task.text || 'Missão', [
            'Origem: Missão Tática', `Tipo: ${task.activityType === 'meeting' ? 'Reunião' : 'Tarefa'}`,
            `Categoria: ${category?.label || 'Geral'}`,
            `Prioridade: ${task.priority || 'média'}`,
            `Status: ${task.completed ? 'Concluída' : 'Pendente'}`,
            `Duração estimada: ${duration} min`,
            subtasks ? `Subtarefas: ${subtasks}` : ''
        ].filter(Boolean).join('\n'), duration, style);
    }

    for (const block of state.studyData?.studyPlan?.weeklyBlocks || []) {
        if (block.status === 'cancelled') continue;
        const track = tracks.find(t => String(t.id) === String(block.trackId));
        const subject = subjects.find(s => String(s.id) === String(block.subjectId));
        const duration = parseInt(block.plannedMinutes, 10) || 30;
        add('study', block, block.title || 'Bloco de estudo', [
            'Origem: Missão Tática', 'Tipo: Estudo planejado',
            `Trilha: ${track?.name || 'Trilha'}`,
            `Disciplina: ${subject?.name || 'Sem disciplina vinculada'}`,
            `Status: ${block.status === 'completed' ? 'Concluído' : block.status === 'partial' ? 'Parcial' : 'Planejado'}`,
            `Duração planejada: ${duration} min`,
            block.notes ? `Observações: ${block.notes}` : ''
        ].filter(Boolean).join('\n'), duration, CATEGORY_STYLE.study);
    }
    return result;
}

function zonedParts(value, timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(value));
    return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

function sanitizeKnownCoaktion(item, force = false) {
    const title = String(item.summary || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
    if (!force && item.sanitizedOrigin !== 'coaktion' && title !== 'reuniao · coaktion') return item;
    const safe = {};
    for (const key of ['id', 'status', 'source', 'sourceCalendar', 'weekStart', 'eventDate', 'day', 'startTime', 'endTime', 'duration', 'allDay', 'googleUpdatedAt', 'sourceMissing', 'sourceStatus', 'linkedTaskId']) {
        if (Object.hasOwn(item, key)) safe[key] = item[key];
    }
    return { ...safe, summary: 'Reunião · Coaktion', activityType: 'meeting', sanitizedOrigin: 'coaktion', originType: 'Coaktion', organizer: '', htmlLink: '' };
}

export function normalizePrimaryEvent(event, week, timeZone, allowOutsideWeek = false) {
    if (!event?.id || event.status === 'cancelled') return null;
    if ((event.attendees || []).some(attendee => attendee.self && attendee.responseStatus === 'declined')) return null;
    const allDay = Boolean(event.start?.date && !event.start?.dateTime);
    let eventDate = event.start?.date || '';
    let startTime = '';
    let endTime = '';
    let duration = 30;
    if (!allDay && event.start?.dateTime) {
        const start = zonedParts(event.start.dateTime, timeZone);
        eventDate = `${start.year}-${start.month}-${start.day}`;
        startTime = `${start.hour}:${start.minute}`;
        if (event.end?.dateTime) {
            const end = zonedParts(event.end.dateTime, timeZone);
            endTime = `${end.hour}:${end.minute}`;
            duration = Math.max(1, Math.round((new Date(event.end.dateTime) - new Date(event.start.dateTime)) / 60000));
        }
    }
    if (!eventDate) return null;
    const dayIndex = Math.round((Date.parse(`${eventDate}T12:00:00Z`) - Date.parse(`${week}T12:00:00Z`)) / 86400000);
    if (!allowOutsideWeek && (dayIndex < 0 || dayIndex > 6)) return null;
    const localDay = new Date(`${eventDate}T12:00:00Z`).getUTCDay();
    const dayOffset = (localDay + 6) % 7;
    const actualWeek = new Date(Date.parse(`${eventDate}T12:00:00Z`) - dayOffset * 86400000).toISOString().slice(0, 10);
    const properties = event.extendedProperties?.private || {};
    const title = String(event.summary || 'Compromisso sem título');
    const normalizedTitle = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
    const coaktion = normalizedTitle === 'reuniao · coaktion' || properties.mtOrigin === 'coaktion';
    const activityType = coaktion || properties.mtActivityType === 'meeting' || /^(reuniao|meeting)\b/.test(normalizedTitle) ? 'meeting' : 'task';
    return {
        id: event.id,
        status: 'pending',
        source: 'Google Agenda',
        sourceCalendar: 'primary',
        weekStart: actualWeek,
        summary: coaktion ? 'Reunião · Coaktion' : title,
        activityType,
        sanitizedOrigin: coaktion ? 'coaktion' : '',
        eventDate,
        day: DAYS[dayOffset],
        startTime,
        endTime,
        duration,
        allDay,
        originType: coaktion ? 'Coaktion' : event.creator?.self || event.organizer?.self ? 'Criado por você' : 'Convite recebido',
        organizer: coaktion ? '' : event.organizer?.displayName || event.organizer?.email || '',
        htmlLink: coaktion ? '' : event.htmlLink || '',
        googleUpdatedAt: event.updated || '',
        sourceMissing: false,
        sourceStatus: 'active'
    };
}

export function createCalendarSync({ clientId, getState, saveState, getUser, onChange = () => {}, enableInbound = false }) {
    let token = '';
    let expiresAt = 0;
    let activeUid = '';
    let timer = null;
    let running = false;
    let status = 'Desconectado';
    let error = '';
    let lastSyncedAt = '';
    let lastSyncedFingerprint = '';

    const config = () => getState()?.calendarSync || getState()?.calendarSyncTest || {};
    const storeConfig = patch => {
        const state = getState();
        state.calendarSync = { ...config(), ...patch };
        if (state.calendarSyncTest) delete state.calendarSyncTest;
        saveState();
    };
    const connected = () => Boolean(token && Date.now() < expiresAt);
    const emit = () => onChange();
    const view = () => ({ status: config().enabled && !connected() && !running ? 'Reconectar' : status, error, enabled: Boolean(config().enabled), connected: connected(), busy: running, lastSyncedAt, calendarId: config().calendarId || '', inboundEnabled: enableInbound, pendingInbox: getInbox().filter(item => item.status === 'pending').length });

    async function api(path, options = {}) {
        if (!connected()) throw new Error('Autorização expirada. Clique em Reconectar.');
        const response = await fetch(`${API}${path}`, {
            ...options,
            headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
        });
        if (response.status === 401) {
            token = '';
            throw new Error('Autorização expirada. Clique em Reconectar.');
        }
        if (!response.ok) {
            let detail = '';
            try { detail = (await response.json()).error?.message || ''; } catch (_) { /* resposta sem JSON */ }
            const err = new Error(detail || `Google Agenda: erro ${response.status}.`);
            err.status = response.status;
            throw err;
        }
        return response.status === 204 ? null : response.json();
    }

    async function verifyIdentity(expectedEmail) {
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error('Não foi possível conferir a conta Google escolhida.');
        const identity = await response.json();
        if (!identity.email || identity.email.toLowerCase() !== String(expectedEmail || '').toLowerCase()) {
            token = '';
            throw new Error(`Escolha a mesma conta Google usada no Missão Tática (${expectedEmail}).`);
        }
    }

    async function ensureCalendar() {
        let id = config().calendarId;
        if (id) {
            try {
                const existing = await api(`/calendars/${encodeURIComponent(id)}`);
                if (existing?.summary === 'Missão Tática (Teste)') {
                    await api(`/calendars/${encodeURIComponent(id)}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ summary: 'Missão Tática', description: 'Blocos pessoais sincronizados pelo Missão Tática. Alterações partem do aplicativo.' })
                    });
                }
                if (!getState().calendarSync || getState().calendarSyncTest) storeConfig({ calendarId: id, enabled: true });
                return id;
            }
            catch (e) { if (e.status !== 404) throw e; }
        }
        const calendar = await api('/calendars', {
            method: 'POST',
            body: JSON.stringify({ summary: 'Missão Tática', description: 'Blocos pessoais sincronizados pelo Missão Tática. Alterações partem do aplicativo.', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
        });
        id = calendar.id;
        storeConfig({ calendarId: id, enabled: true });
        return id;
    }

    async function listWeek(id, week) {
        const items = [];
        let page = '';
        do {
            const query = new URLSearchParams({ privateExtendedProperty: `mtWeek=${week}`, maxResults: '2500', showDeleted: 'false' });
            if (page) query.set('pageToken', page);
            const result = await api(`/calendars/${encodeURIComponent(id)}/events?${query}`);
            items.push(...(result.items || []));
            page = result.nextPageToken || '';
        } while (page);
        return items;
    }

    function getInbox({ includeHandled = false } = {}) {
        const state = getState();
        const week = state?.currentPlanningWeekStart;
        const items = Array.isArray(state?.calendarInboxItems) ? state.calendarInboxItems : [];
        return items
            .filter(item => item.weekStart === week && (includeHandled || item.status === 'pending'))
            .sort((a, b) => `${a.eventDate}|${a.startTime || '99:99'}|${a.summary}`.localeCompare(`${b.eventDate}|${b.startTime || '99:99'}|${b.summary}`));
    }

    function updateLinkedTask(item) {
        if (item.status !== 'converted' || !item.linkedTaskId) return;
        const task = (getState().tasks || []).find(candidate => String(candidate.id) === String(item.linkedTaskId));
        if (!task) return;
        task.googleCalendarSource = 'primary';
        task.googleCalendarEventId = item.id;
        task.googleCalendarOrigin = item.originType;
        task.googleCalendarUpdatedAt = item.googleUpdatedAt;
        task.googleCalendarSourceMissing = Boolean(item.sourceMissing);
        task.googleCalendarSourceStatus = item.sourceStatus || (item.sourceMissing ? 'unavailable' : 'active');
        task.googleCalendarWeekStart = item.weekStart;
        task.googleCalendarEventDate = item.eventDate;
        task.googleCalendarAllDay = Boolean(item.allDay);
        if (item.sanitizedOrigin === 'coaktion') {
            task.activityType = 'meeting';
            task.sanitizedOrigin = 'coaktion';
        }
        if (!item.sourceMissing) {
            task.text = item.summary;
            task.day = item.day;
            task.startTime = item.startTime;
            task.endTime = item.endTime;
            task.time = `${item.duration || 30} min`;
        }
    }

    async function pullPrimaryEvents() {
        if (!enableInbound) return [];
        const state = getState();
        const week = state.currentPlanningWeekStart;
        if (!week) return [];
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const timeMin = weekDate(week).toISOString();
        const timeMax = weekDate(week, 7).toISOString();
        const items = [];
        let page = '';
        do {
            const query = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', showDeleted: 'false', maxResults: '2500' });
            if (page) query.set('pageToken', page);
            const result = await api(`/calendars/primary/events?${query}`);
            items.push(...(result.items || []));
            page = result.nextPageToken || '';
        } while (page);

        // Resolve each missing linked ID independently: leaving the week is not cancellation.
        const normalized = items.map(event => normalizePrimaryEvent(event, week, timeZone)).filter(Boolean);
        const before = JSON.stringify(state.calendarInboxItems || []);
        const oldItems = (Array.isArray(state.calendarInboxItems) ? state.calendarInboxItems : []).map(item => sanitizeKnownCoaktion(item));
        const oldById = new Map(oldItems.map(item => [item.id, item]));
        const fetchedIds = new Set(normalized.map(item => item.id));
        const sourceUpdates = new Map();
        for (const previous of oldItems) {
            const linkedTask = (state.tasks || []).find(task => String(task.id) === String(previous.linkedTaskId));
            if (previous.status !== 'converted' || !linkedTask || fetchedIds.has(previous.id)) continue;
            if (previous.weekStart !== week && (linkedTask.completed || previous.sourceStatus === 'cancelled')) continue;
            try {
                const event = await api(`/calendars/primary/events/${encodeURIComponent(previous.id)}`);
                const incoming = normalizePrimaryEvent(event, week, timeZone, true);
                if (incoming) { normalized.push(incoming); fetchedIds.add(incoming.id); }
                else sourceUpdates.set(previous.id, { ...previous, sourceMissing: true,
                    sourceStatus: event.status === 'cancelled' ? 'cancelled' : 'unavailable' });
            } catch (err) {
                if (![404, 410].includes(err.status)) throw err;
                sourceUpdates.set(previous.id, { ...previous, sourceMissing: true,
                    sourceStatus: err.status === 410 ? 'cancelled' : 'unavailable' });
            }
        }
        const retained = oldItems.filter(item => item.weekStart !== week || fetchedIds.has(item.id) || item.status === 'converted');
        for (const [id, update] of sourceUpdates) {
            const index = retained.findIndex(item => item.id === id);
            if (index >= 0) retained[index] = update;
            updateLinkedTask(update);
        }
        for (const incoming of normalized) {
            const previous = oldById.get(incoming.id);
            const exists = previous?.linkedTaskId && (state.tasks || []).some(task => String(task.id) === String(previous.linkedTaskId));
            // Clearing a linked task makes its live event available again; no dangling conversion.
            const safeIncoming = sanitizeKnownCoaktion(incoming, previous?.sanitizedOrigin === 'coaktion');
            const merged = { ...safeIncoming, status: previous?.status === 'converted' && !exists ? 'pending' : previous?.status || 'pending', linkedTaskId: exists ? previous.linkedTaskId : null };
            const index = retained.findIndex(item => item.id === incoming.id);
            if (index >= 0) retained[index] = merged;
            else retained.push(merged);
            updateLinkedTask(merged);
        }
        state.calendarInboxItems = retained;
        if (JSON.stringify(retained) !== before) saveState();
        return getInbox();
    }

    async function refreshInbox() {
        if (!enableInbound || !config().enabled || !getUser()) return [];
        if (!connected()) { status = 'Reconectar'; emit(); return []; }
        if (running) return getInbox();
        running = true; error = ''; status = 'Lendo agenda principal...'; emit();
        try {
            const items = await pullPrimaryEvents();
            const failures = await syncLinkedEventColors();
            lastSyncedAt = new Date().toISOString();
            status = failures.length ? 'Sincronizado com aviso' : 'Sincronizado';
            error = failures.length ? 'Algumas cores não puderam ser atualizadas. Reconecte o Google Agenda e tente novamente.' : '';
            return items;
        } catch (e) {
            console.error('Falha ao ler a agenda principal', e);
            error = e.message || 'Não foi possível ler a agenda principal.';
            status = connected() ? 'Erro de sincronização' : 'Reconectar';
            return [];
        } finally { running = false; emit(); }
    }

    function ignoreInboxEvent(eventId) {
        const item = (getState().calendarInboxItems || []).find(candidate => candidate.id === eventId);
        if (!item) return;
        item.status = 'ignored';
        saveState(); emit();
    }

    async function syncLinkedEventColors({ eventId = '' } = {}) {
        if (!enableInbound || !connected()) return [];
        const state = getState();
        const categories = state.taskCategories || [];
        const tasks = (state.tasks || []).filter(task =>
            task.googleCalendarSource === 'primary' &&
            task.googleCalendarEventId &&
            !task.googleCalendarSourceMissing &&
            task.sanitizedOrigin !== 'coaktion' &&
            (!eventId || task.googleCalendarEventId === eventId)
        );
        const failures = [];
        let changed = false;
        for (const task of tasks) {
            const category = categories.find(cat => String(cat.id) === String(task.category));
            const colorId = categoryStyle(category || { id: task.category }).colorId;
            if (task.googleCalendarColorId === colorId && !task.googleCalendarColorSyncError) continue;
            try {
                await api(`/calendars/primary/events/${encodeURIComponent(task.googleCalendarEventId)}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ colorId })
                });
                task.googleCalendarColorId = colorId;
                task.googleCalendarColorSyncError = '';
                changed = true;
            } catch (e) {
                task.googleCalendarColorSyncError = e.message || 'Não foi possível atualizar a cor no Google Agenda.';
                failures.push(task);
                changed = true;
            }
        }
        if (changed) saveState();
        return failures;
    }

    async function markInboxConverted(eventId, taskId) {
        const item = (getState().calendarInboxItems || []).find(candidate => candidate.id === eventId);
        if (!item) return;
        item.status = 'converted';
        item.linkedTaskId = taskId;
        updateLinkedTask(item);
        saveState(); emit();
        const failures = await syncLinkedEventColors({ eventId });
        if (failures.length) {
            error = 'A missão foi salva, mas a cor ainda não foi atualizada no Google. Reconecte e sincronize novamente.';
            status = 'Cor pendente';
        }
        emit();
    }

    async function syncNow({ force = false } = {}) {
        if (!config().enabled || !getUser()) return;
        if (!connected()) { status = 'Reconectar'; emit(); return; }
        if (running) { clearTimeout(timer); timer = setTimeout(() => syncNow({ force: true }), 1500); return; }
        const state = getState();
        const week = state.currentPlanningWeekStart;
        const owner = getUser().uid;
        const desired = buildWeekEvents(state, owner);
        const fingerprint = `${week}|${JSON.stringify([...desired.values()])}`;
        if (!force && fingerprint === lastSyncedFingerprint) {
            if (enableInbound) await refreshInbox();
            return;
        }
        running = true; error = ''; status = 'Sincronizando...'; emit();
        try {
            const id = await ensureCalendar();
            const remote = await listWeek(id, week);
            const managed = new Map(remote.filter(item => item.extendedProperties?.private?.mtOwner === owner && item.id?.startsWith('mt')).map(item => [item.id, item]));
            for (const [eventId, body] of desired) {
                const existing = managed.get(eventId);
                if (existing?.extendedProperties?.private?.mtHash === body.extendedProperties.private.mtHash) continue;
                if (existing) {
                    await api(`/calendars/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`, { method: 'PUT', body: JSON.stringify(body) });
                } else {
                    try { await api(`/calendars/${encodeURIComponent(id)}/events`, { method: 'POST', body: JSON.stringify(body) }); }
                    catch (e) {
                        if (e.status !== 409) throw e;
                        await api(`/calendars/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`, { method: 'PUT', body: JSON.stringify(body) });
                    }
                }
            }
            for (const [eventId] of managed) {
                if (!desired.has(eventId)) await api(`/calendars/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
            }
            lastSyncedFingerprint = fingerprint;
            let colorFailures = [];
            if (enableInbound) {
                await pullPrimaryEvents();
                colorFailures = await syncLinkedEventColors();
            }
            lastSyncedAt = new Date().toISOString();
            status = colorFailures.length ? 'Sincronizado com aviso' : 'Sincronizado';
            error = colorFailures.length ? 'Algumas cores não puderam ser atualizadas no Google Agenda.' : '';
            if (`${getState().currentPlanningWeekStart}|${JSON.stringify([...buildWeekEvents(getState(), owner).values()])}` !== fingerprint) schedule();
        } catch (e) {
            console.error('Falha na sincronização com Google Agenda', e);
            error = e.message || 'Não foi possível sincronizar.';
            status = connected() ? 'Erro de sincronização' : 'Reconectar';
        } finally { running = false; emit(); }
    }

    function schedule() {
        if (!config().enabled) return;
        if (!connected()) { status = 'Reconectar'; emit(); return; }
        clearTimeout(timer);
        timer = setTimeout(() => { timer = null; syncNow(); }, 1400);
    }

    async function connect() {
        const user = getUser();
        if (!user) return;
        if (!window.google?.accounts?.oauth2) { error = 'O Google ainda está carregando. Tente de novo em alguns segundos.'; emit(); return; }
        error = ''; status = 'Conectando...'; emit();
        try {
            const result = await new Promise((resolve, reject) => {
                const client = window.google.accounts.oauth2.initTokenClient({
                    client_id: clientId, scope: enableInbound ? `${BASE_SCOPE} ${EVENTS_SCOPE}` : BASE_SCOPE, login_hint: user.email,
                    callback: response => response.error ? reject(new Error(response.error_description || response.error)) : resolve(response),
                    error_callback: response => reject(new Error(response.type === 'popup_closed' ? 'Conexão cancelada.' : 'Não foi possível abrir a autorização do Google.'))
                });
                client.requestAccessToken({ prompt: '' });
            });
            token = result.access_token;
            expiresAt = Date.now() + Math.max(0, Number(result.expires_in) - 60) * 1000;
            await verifyIdentity(user.email);
            if (getUser()?.uid !== user.uid) throw new Error('A conta do aplicativo mudou. Conecte novamente.');
            storeConfig({ enabled: true });
            lastSyncedFingerprint = '';
            await syncNow({ force: true });
        } catch (e) {
            error = e.message || 'Não foi possível conectar.';
            status = 'Desconectado'; emit();
        }
    }

    function pause() {
        clearTimeout(timer);
        token = ''; expiresAt = 0;
        storeConfig({ enabled: false });
        status = 'Pausado'; error = ''; emit();
    }

    function setOwner(user) {
        if (activeUid !== (user?.uid || '')) {
            clearTimeout(timer);
            token = ''; expiresAt = 0; lastSyncedFingerprint = ''; lastSyncedAt = '';
            activeUid = user?.uid || '';
        }
        status = user ? (config().enabled ? 'Reconectar' : 'Desconectado') : 'Desconectado';
        error = ''; emit();
    }

    return { view, connect, pause, schedule, syncNow, refreshInbox, getInbox, ignoreInboxEvent, markInboxConverted, setOwner };
}
