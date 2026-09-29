// Integração experimental, exclusiva de agenda_teste.html.
// O token OAuth fica apenas na memória. Nenhuma chave secreta é usada no navegador.
const SCOPE = 'https://www.googleapis.com/auth/calendar.app.created https://www.googleapis.com/auth/userinfo.email';
const API = 'https://www.googleapis.com/calendar/v3';
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

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

    function add(type, item, title, description, duration) {
        const index = DAYS.indexOf(item?.day);
        if (index < 0 || item?.id == null) return;
        const id = `mt${hash(`${ownerUid}|${week}|${type}|${item.id}`)}`;
        const body = {
            id,
            summary: `Missão Tática — ${title}`,
            description,
            ...eventTime(weekDate(week, index), item.startTime, item.endTime, duration, timeZone),
            extendedProperties: { private: { mtWeek: week, mtOwner: ownerUid, mtSource: type } }
        };
        body.extendedProperties.private.mtHash = hash(JSON.stringify(body));
        result.set(id, body);
    }

    for (const task of state.tasks || []) {
        const category = categories.find(cat => String(cat.id) === String(task.category));
        const subtasks = (task.subtasks || []).map(sub => `${sub.completed ? '✓' : '○'} ${sub.text}`).join(' | ');
        const duration = parseInt(String(task.time || '').replace(/[^0-9]/g, ''), 10) || 30;
        add('task', task, task.text || 'Missão', [
            'Origem: Missão Tática', 'Tipo: Missão do board',
            `Categoria: ${category?.label || 'Geral'}`,
            `Prioridade: ${task.priority || 'média'}`,
            `Status: ${task.completed ? 'Concluída' : 'Pendente'}`,
            `Duração estimada: ${duration} min`,
            subtasks ? `Subtarefas: ${subtasks}` : ''
        ].filter(Boolean).join('\n'), duration);
    }

    for (const block of state.studyData?.studyPlan?.weeklyBlocks || []) {
        if (block.status === 'cancelled') continue;
        const track = tracks.find(t => String(t.id) === String(block.trackId));
        const subject = subjects.find(s => String(s.id) === String(block.subjectId));
        const duration = parseInt(block.plannedMinutes, 10) || 30;
        add('study', block, `Estudo: ${block.title || 'Bloco de estudo'}`, [
            'Origem: Missão Tática', 'Tipo: Estudo planejado',
            `Trilha: ${track?.name || 'Trilha'}`,
            `Disciplina: ${subject?.name || 'Sem disciplina vinculada'}`,
            `Status: ${block.status === 'completed' ? 'Concluído' : block.status === 'partial' ? 'Parcial' : 'Planejado'}`,
            `Duração planejada: ${duration} min`,
            block.notes ? `Observações: ${block.notes}` : ''
        ].filter(Boolean).join('\n'), duration);
    }
    return result;
}

export function createCalendarSync({ clientId, getState, saveState, getUser, onChange = () => {} }) {
    let token = '';
    let expiresAt = 0;
    let activeUid = '';
    let timer = null;
    let running = false;
    let status = 'Desconectado';
    let error = '';
    let lastSyncedAt = '';
    let lastSyncedFingerprint = '';

    const config = () => getState()?.calendarSyncTest || {};
    const connected = () => Boolean(token && Date.now() < expiresAt);
    const emit = () => onChange();
    const view = () => ({ status: config().enabled && !connected() && !running ? 'Reconectar' : status, error, enabled: Boolean(config().enabled), connected: connected(), busy: running, lastSyncedAt, calendarId: config().calendarId || '' });

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
            try { await api(`/calendars/${encodeURIComponent(id)}`); return id; }
            catch (e) { if (e.status !== 404) throw e; }
        }
        const calendar = await api('/calendars', {
            method: 'POST',
            body: JSON.stringify({ summary: 'Missão Tática (Teste)', description: 'Agenda de teste sincronizada pelo Missão Tática. Alterações partem do aplicativo.', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
        });
        id = calendar.id;
        getState().calendarSyncTest = { ...config(), calendarId: id, enabled: true };
        saveState();
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

    async function syncNow({ force = false } = {}) {
        if (!config().enabled || !getUser()) return;
        if (!connected()) { status = 'Reconectar'; emit(); return; }
        if (running) { clearTimeout(timer); timer = setTimeout(() => syncNow({ force: true }), 1500); return; }
        const state = getState();
        const week = state.currentPlanningWeekStart;
        const owner = getUser().uid;
        const desired = buildWeekEvents(state, owner);
        const fingerprint = `${week}|${JSON.stringify([...desired.values()])}`;
        if (!force && fingerprint === lastSyncedFingerprint) return;
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
            lastSyncedAt = new Date().toISOString();
            status = 'Sincronizado';
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
                    client_id: clientId, scope: SCOPE, login_hint: user.email,
                    callback: response => response.error ? reject(new Error(response.error_description || response.error)) : resolve(response),
                    error_callback: response => reject(new Error(response.type === 'popup_closed' ? 'Conexão cancelada.' : 'Não foi possível abrir a autorização do Google.'))
                });
                client.requestAccessToken({ prompt: '' });
            });
            token = result.access_token;
            expiresAt = Date.now() + Math.max(0, Number(result.expires_in) - 60) * 1000;
            await verifyIdentity(user.email);
            if (getUser()?.uid !== user.uid) throw new Error('A conta do aplicativo mudou. Conecte novamente.');
            getState().calendarSyncTest = { ...config(), enabled: true };
            saveState();
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
        getState().calendarSyncTest = { ...config(), enabled: false };
        saveState();
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

    return { view, connect, pause, schedule, syncNow, setOwner };
}
