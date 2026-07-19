/* ===== UUID Helper ===== */
function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Fallback for non-secure contexts (HTTP)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/* ===== API Client ===== */
const api = {
    async request(method, url, body = null) {
        const opts = { method, cache: 'no-store', headers: { 'Content-Type': 'application/json' } };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(url, opts);
        if (!res.ok && res.status !== 204) {
            const err = await res.json().catch(() => ({ detail: 'Request failed' }));
            throw new Error(err.detail || 'Request failed');
        }
        if (res.status === 204) return null;
        return res.json();
    },
    get: (url) => api.request('GET', url),
    post: (url, body) => api.request('POST', url, body),
    put: (url, body) => api.request('PUT', url, body),
    del: (url) => api.request('DELETE', url),
};

/* ===== Toast ===== */
let toastTimeout;
function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.add('hidden'), 2500);
}

/* ===== Breast Names ===== */
const BREAST_LEFT_KEY = 'puffin-breast-left-name';
const BREAST_RIGHT_KEY = 'puffin-breast-right-name';
const DEFAULT_LEFT_NAME = 'Left';
const DEFAULT_RIGHT_NAME = 'Right';

/* ===== Bottle Defaults ===== */
const BOTTLE_TYPE_KEY = 'puffin-bottle-type-default';
const BOTTLE_UNIT_KEY = 'defaultBottleUnit';
const DEFAULT_BOTTLE_TYPE = 'breastmilk';
const DEFAULT_BOTTLE_UNIT = 'oz';

function getDefaultBottleType() {
    return localStorage.getItem(BOTTLE_TYPE_KEY) || DEFAULT_BOTTLE_TYPE;
}

function getDefaultBottleUnit() {
    const unit = localStorage.getItem(BOTTLE_UNIT_KEY) || DEFAULT_BOTTLE_UNIT;
    return unit === 'mL' ? 'mL' : 'oz';
}

function validateBottleAmountUnit(amount, unit) {
    if (unit === 'mL' && !Number.isInteger(Number(amount))) {
        showToast('mL amounts must be whole numbers');
        return false;
    }
    return true;
}

function updateBottleUnitLabels() {
    const defaultUnit = getDefaultBottleUnit();
    const selects = [
        document.getElementById('feeding-bottle-unit-timer-select'),
        document.getElementById('feeding-bottle-unit-manual-select'),
    ];
    for (const sel of selects) {
        if (!sel) continue;
        sel.querySelector('option[value="oz"]').textContent = 'oz' + (defaultUnit === 'oz' ? ' (default)' : '');
        sel.querySelector('option[value="mL"]').textContent = 'mL' + (defaultUnit === 'mL' ? ' (default)' : '');
        sel.value = defaultUnit;
    }
}

function updateBottleTypeLabels() {
    const defaultType = getDefaultBottleType();
    const selects = [
        document.getElementById('feeding-bottle-type-timer-select'),
        document.getElementById('feeding-bottle-type-manual-select'),
    ];
    for (const sel of selects) {
        if (!sel) continue;
        sel.querySelector('option[value="breastmilk"]').textContent =
            'Breastmilk' + (defaultType === 'breastmilk' ? ' (default)' : '');
        sel.querySelector('option[value="formula"]').textContent =
            'Formula' + (defaultType === 'formula' ? ' (default)' : '');
        sel.value = defaultType;
    }
}

function getBreastNames() {
    return {
        left: localStorage.getItem(BREAST_LEFT_KEY) || DEFAULT_LEFT_NAME,
        right: localStorage.getItem(BREAST_RIGHT_KEY) || DEFAULT_RIGHT_NAME,
    };
}

function updateBreastLabels() {
    const names = getBreastNames();
    // Feeding modal type buttons
    const leftBtns = document.querySelectorAll('[data-value="breast_left"]');
    leftBtns.forEach(btn => { btn.textContent = `🤱 ${names.left}`; });
    const rightBtns = document.querySelectorAll('[data-value="breast_right"]');
    rightBtns.forEach(btn => { btn.textContent = `🤱 ${names.right}`; });
    // Manual mode labels
    const leftLabel = document.querySelector('label[for="feeding-left-duration"]');
    if (leftLabel) leftLabel.textContent = `🤱 ${names.left} breast (minutes)`;
    const rightLabel = document.querySelector('label[for="feeding-right-duration"]');
    if (rightLabel) rightLabel.textContent = `🤱 ${names.right} breast (minutes)`;
}

/* ===== Child Profiles ===== */
// Profiles themselves live server-side with the logs they label; only the
// *selection* is per-device, so two phones can view two children at once.
const SELECTED_CHILD_KEY = 'puffin-selected-child';
const UNASSIGNED_VIEW = 'unassigned';

let childProfiles = [];
let unassignedCount = 0;
// null means "every log regardless of child" — what an install with no
// profiles always shows, and exactly how Puffin behaved before profiles.
let selectedChild = null;

function hasProfiles() {
    return childProfiles.length > 0;
}

function readStoredChild() {
    const raw = localStorage.getItem(SELECTED_CHILD_KEY);
    if (!raw) return null;
    if (raw === UNASSIGNED_VIEW) return UNASSIGNED_VIEW;
    const id = parseInt(raw, 10);
    return Number.isNaN(id) ? null : id;
}

function storeSelectedChild(value) {
    if (value === null) localStorage.removeItem(SELECTED_CHILD_KEY);
    else localStorage.setItem(SELECTED_CHILD_KEY, String(value));
}

/** The current scope as a query fragment appended to dashboard/activity calls. */
function childQuery() {
    if (selectedChild === UNASSIGNED_VIEW) return '&unassigned=true';
    if (typeof selectedChild === 'number') return `&child_id=${selectedChild}`;
    return '';
}

/**
 * The child new logs are created against.
 *
 * Returns null in the unassigned view so a log created while looking at
 * unassigned logs stays unassigned, matching what is on screen.
 */
function currentChildId() {
    return typeof selectedChild === 'number' ? selectedChild : null;
}

function resolveSelectedChild() {
    if (!hasProfiles()) return null;
    const stored = readStoredChild();
    // The unassigned view only survives while it still has something in it.
    if (stored === UNASSIGNED_VIEW && unassignedCount > 0) return UNASSIGNED_VIEW;
    if (typeof stored === 'number' && childProfiles.some(c => c.id === stored)) return stored;
    return childProfiles[0].id; // default: the first profile created
}

async function loadChildren() {
    try {
        const [profiles, unassigned] = await Promise.all([
            api.get('/api/children'),
            api.get('/api/children/unassigned'),
        ]);
        childProfiles = profiles;
        unassignedCount = unassigned.count;
    } catch (err) {
        // Do NOT fall back to an empty profile list: that is indistinguishable
        // from a genuine zero-profile install, and persisting it would clear
        // the stored selection and silently route every log created this
        // session to "Unassigned". Keep the last known state instead and tell
        // the user, so a flaky request stays a transient error.
        console.error('Failed to load children:', err);
        showToast('Could not load profiles — showing last known state');
        return;
    }
    selectedChild = resolveSelectedChild();
    storeSelectedChild(selectedChild);
    renderChildSwitcher();
    renderChildHeader();
}

function childOptionsHtml() {
    return childProfiles
        .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
        .join('');
}

function renderChildSwitcher() {
    const section = document.getElementById('child-switcher-section');
    const select = document.getElementById('child-switcher');
    section.classList.toggle('hidden', !hasProfiles());
    if (!hasProfiles()) {
        select.innerHTML = '';
        return;
    }
    let html = childOptionsHtml();
    // Offered only while logs actually sit outside every profile.
    if (unassignedCount > 0) {
        html += `<option value="${UNASSIGNED_VIEW}">Unassigned logs</option>`;
    }
    select.innerHTML = html;
    select.value = String(selectedChild);
}

function selectedChildName() {
    const match = childProfiles.find(c => c.id === selectedChild);
    return match ? match.name : null;
}

function renderChildHeader() {
    const title = document.getElementById('child-log-title');
    const bar = document.getElementById('unassigned-bar');
    const name = selectedChildName();

    if (selectedChild === UNASSIGNED_VIEW) {
        title.textContent = 'Unassigned Logs';
    } else if (name) {
        title.textContent = `${name}'s Care Logs`;
    } else {
        title.textContent = '';
    }
    title.classList.toggle('hidden', !title.textContent);

    // The bulk re-assign is the permanent escape hatch that makes declining the
    // one-time migration offer recoverable.
    const showBar = selectedChild === UNASSIGNED_VIEW && hasProfiles();
    bar.classList.toggle('hidden', !showBar);
    if (showBar) {
        const plural = unassignedCount === 1 ? '' : 's';
        document.getElementById('unassigned-bar-count').textContent =
            `${unassignedCount} log${plural} not linked to any child`;
        document.getElementById('unassigned-assign-target').innerHTML = childOptionsHtml();
    }
}

async function refreshChildUI() {
    await loadChildren();
    renderChildList();
    renderExportChildOptions();
    loadDashboard();
}

/**
 * Reload after a change that may have moved a log in or out of unassigned.
 *
 * Editing a log's child, or deleting one, changes the unassigned count — and
 * that count decides whether `Unassigned logs` is in the switcher at all.
 * Refreshing only the dashboard would leave a freshly-unassigned log with no
 * way to reach it until the page was reloaded.
 */
function reloadAfterLogChange() {
    if (hasProfiles()) return refreshChildUI();
    return loadDashboard();
}

/* --- Shared two-step confirmation --- */

function showChildConfirm({ title, body, note, primary, secondary, cancel,
                            onPrimary, onSecondary, onCancel }) {
    document.getElementById('child-confirm-title').textContent = title;
    document.getElementById('child-confirm-body').textContent = body;

    const noteEl = document.getElementById('child-confirm-note');
    noteEl.textContent = note || '';
    noteEl.classList.toggle('hidden', !note);

    const wire = (id, label, handler) => {
        const btn = document.getElementById(id);
        btn.classList.toggle('hidden', !label);
        if (label) btn.textContent = label;
        // Replacing the node drops listeners from a previous step, so the
        // buttons never accumulate stale handlers across the flow.
        const fresh = btn.cloneNode(true);
        btn.parentNode.replaceChild(fresh, btn);
        if (label && handler) fresh.addEventListener('click', handler);
    };
    wire('child-confirm-primary', primary, onPrimary);
    wire('child-confirm-secondary', secondary, onSecondary);
    wire('child-confirm-cancel', cancel, onCancel);

    openModal('child-confirm-modal');
}

/* --- Creating a profile, and the one-time migration offer --- */

async function addChild() {
    const input = document.getElementById('child-new-name');
    const name = input.value.trim();
    if (!name) {
        showToast('Please enter a first name');
        input.focus();
        return;
    }

    const isFirstProfile = !hasProfiles();
    let created;
    try {
        created = await api.post('/api/children', { name });
    } catch (err) {
        showToast('Error: ' + err.message);
        return;
    }
    input.value = '';

    // The bulk offer is made once: at first profile creation, on an install
    // that already has logs.  Re-read the count so it reflects this moment.
    if (isFirstProfile) {
        const { count } = await api.get('/api/children/unassigned');
        if (count > 0) {
            offerMigration(created, count);
            return;
        }
    }
    await refreshChildUI();
    showToast(`${created.name} added`);
}

function offerMigration(child, count) {
    const plural = count === 1 ? '' : 's';
    showChildConfirm({
        title: 'Move existing logs?',
        body: `You have ${count} care log${plural} that aren't linked to any child. `
            + `Move them all to ${child.name}?`,
        note: 'This bulk move is only offered once, when you create your first child. '
            + 'You can always re-assign unassigned logs later from "Unassigned logs" '
            + 'in the child menu.',
        primary: 'Yes, move them',
        secondary: 'No, leave them unassigned',
        cancel: 'Cancel',
        onPrimary: () => confirmMigration(child, count),
        onSecondary: async () => {
            closeModal('child-confirm-modal');
            await refreshChildUI();
            showToast(`${child.name} added`);
        },
        onCancel: () => cancelChildCreation(child),
    });
}

function confirmMigration(child, count) {
    const plural = count === 1 ? '' : 's';
    showChildConfirm({
        title: 'Confirm move',
        body: `This will assign all ${count} existing log${plural} to ${child.name}. `
            + `This can't be undone in bulk.`,
        primary: `Confirm — move all logs to ${child.name}`,
        secondary: 'Go back',
        cancel: 'Cancel',
        onPrimary: () => runBulkAssign(child),
        onSecondary: () => offerMigration(child, count),
        onCancel: () => cancelChildCreation(child),
    });
}

/**
 * Cancel backs all the way out of profile creation.
 *
 * Deleting the just-created profile is what makes "go back and create a
 * different child first" work — the profile never half-exists.  It has no logs
 * of its own yet, so nothing is stranded.
 */
async function cancelChildCreation(child) {
    try {
        await api.del(`/api/children/${child.id}`);
    } catch (err) {
        console.error('Failed to undo profile creation:', err);
    }
    closeModal('child-confirm-modal');
    await refreshChildUI();
    showToast('Profile creation cancelled');
}

async function runBulkAssign(child) {
    try {
        const result = await api.post(`/api/children/${child.id}/assign-unassigned`);
        closeModal('child-confirm-modal');
        await refreshChildUI();
        const plural = result.assigned === 1 ? '' : 's';
        showToast(`Moved ${result.assigned} log${plural} to ${child.name}`);
    } catch (err) {
        showToast('Error: ' + err.message);
    }
}

/* --- Settings: the Children section --- */

function renderChildList() {
    const container = document.getElementById('child-list');
    if (!hasProfiles()) {
        container.innerHTML = '<p class="empty-state">No children yet.</p>';
        return;
    }
    container.innerHTML = childProfiles.map(c => `
        <div class="child-row" data-child-row="${c.id}">
            <span class="child-row-name">${escapeHtml(c.name)}</span>
            <button type="button" class="btn btn-sm btn-secondary" data-child-rename="${c.id}">Rename</button>
            <button type="button" class="btn btn-sm btn-danger" data-child-delete="${c.id}">Delete</button>
        </div>`).join('');
}

function startChildRename(childId) {
    const child = childProfiles.find(c => c.id === childId);
    const row = document.querySelector(`[data-child-row="${childId}"]`);
    if (!child || !row) return;
    row.innerHTML = `
        <input type="text" class="child-rename-input" maxlength="30" value="${escapeAttr(child.name)}">
        <button type="button" class="btn btn-sm btn-primary" data-child-rename-save="${childId}">Save</button>
        <button type="button" class="btn btn-sm btn-secondary" data-child-rename-cancel="1">Cancel</button>`;
    row.querySelector('.child-rename-input').focus();
}

async function saveChildRename(childId) {
    const row = document.querySelector(`[data-child-row="${childId}"]`);
    const name = row.querySelector('.child-rename-input').value.trim();
    if (!name) {
        showToast('Please enter a first name');
        return;
    }
    try {
        await api.put(`/api/children/${childId}`, { name });
        await refreshChildUI();
        showToast('Child renamed');
    } catch (err) {
        showToast('Error: ' + err.message);
    }
}

function confirmChildDelete(childId) {
    const child = childProfiles.find(c => c.id === childId);
    if (!child) return;
    showChildConfirm({
        title: `Delete ${child.name}?`,
        body: `${child.name}'s logs will be kept and moved to "Unassigned logs", `
            + `where you can re-assign them. No log data is deleted.`,
        primary: `Delete ${child.name}`,
        cancel: 'Cancel',
        onPrimary: async () => {
            try {
                await api.del(`/api/children/${childId}`);
                closeModal('child-confirm-modal');
                await refreshChildUI();
                showToast(`${child.name} deleted — their logs are now unassigned`);
            } catch (err) {
                showToast('Error: ' + err.message);
            }
        },
        onCancel: () => closeModal('child-confirm-modal'),
    });
}

function initChildProfiles() {
    document.getElementById('child-switcher').addEventListener('change', (e) => {
        const raw = e.target.value;
        selectedChild = raw === UNASSIGNED_VIEW ? UNASSIGNED_VIEW : parseInt(raw, 10);
        storeSelectedChild(selectedChild);
        renderChildHeader();
        loadDashboard();
    });

    document.getElementById('child-add-btn').addEventListener('click', addChild);
    document.getElementById('child-new-name').addEventListener('keydown', (e) => {
        // The Children section lives inside the settings form; Enter here must
        // add a child, not submit (and close) the whole settings modal.
        if (e.key === 'Enter') {
            e.preventDefault();
            addChild();
        }
    });

    document.getElementById('child-list').addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        if (btn.dataset.childRename) startChildRename(parseInt(btn.dataset.childRename, 10));
        else if (btn.dataset.childRenameSave) saveChildRename(parseInt(btn.dataset.childRenameSave, 10));
        else if (btn.dataset.childRenameCancel) renderChildList();
        else if (btn.dataset.childDelete) confirmChildDelete(parseInt(btn.dataset.childDelete, 10));
    });

    document.getElementById('unassigned-assign-btn').addEventListener('click', () => {
        const targetId = parseInt(document.getElementById('unassigned-assign-target').value, 10);
        const child = childProfiles.find(c => c.id === targetId);
        if (!child) return;
        const count = unassignedCount;
        const plural = count === 1 ? '' : 's';
        showChildConfirm({
            title: `Assign all to ${child.name}?`,
            body: `This will move all ${count} unassigned log${plural} to ${child.name}.`,
            primary: 'Continue',
            cancel: 'Cancel',
            onPrimary: () => showChildConfirm({
                title: 'Confirm assignment',
                body: `This will assign ${count} log${plural} to ${child.name}. `
                    + `This can't be undone in bulk.`,
                primary: `Confirm — assign to ${child.name}`,
                secondary: 'Go back',
                cancel: 'Cancel',
                onPrimary: () => runBulkAssign(child),
                onSecondary: () => document.getElementById('unassigned-assign-btn').click(),
                onCancel: () => closeModal('child-confirm-modal'),
            }),
            onCancel: () => closeModal('child-confirm-modal'),
        });
    });
}

/* ===== Dark Mode ===== */
function initTheme() {
    const saved = localStorage.getItem('puffin-theme');
    if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
    }
    updateThemeIcon();
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const isDark = current === 'dark' ||
        (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('puffin-theme', next);
    updateThemeIcon();
}

function updateThemeIcon() {
    const btn = document.getElementById('theme-toggle');
    const theme = document.documentElement.getAttribute('data-theme');
    const isDark = theme === 'dark' ||
        (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    btn.textContent = isDark ? '☀️' : '🌙';
}

/* ===== Modals ===== */
function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
    if (id === 'feeding-modal') {
        loadLastBreastFeeding();
        loadNoteSuggestions('/api/feedings', 'feeding-note-suggestions', 'feeding-notes');
        updateBottleTypeLabels();
        updateBottleUnitLabels();
    } else if (id === 'diaper-modal') {
        loadNoteSuggestions('/api/diapers', 'diaper-note-suggestions', 'diaper-notes');
    } else if (id === 'health-modal') {
        loadSavedMedNames();
        loadMedDosageMap();
        loadNoteSuggestions('/api/medications', 'med-note-suggestions', 'med-notes');
        loadNoteSuggestions('/api/temperatures', 'temp-note-suggestions', 'temp-notes');
    }
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
    // Reset forms inside the modal
    const forms = document.getElementById(id).querySelectorAll('form');
    forms.forEach(f => {
        f.reset();
        f.querySelectorAll('button[type="submit"]').forEach(btn => { btn.disabled = false; });
    });
    // Clear selected buttons
    document.getElementById(id).querySelectorAll('.btn-option.selected').forEach(b => b.classList.remove('selected'));
    if (id === 'health-modal') {
        resetMedAutocomplete();
    }
    // Reset feeding modal to timer mode
    if (id === 'feeding-modal') {
        document.getElementById('feeding-timer-mode').classList.remove('hidden');
        document.getElementById('feeding-manual-mode').classList.add('hidden');
        document.getElementById('feeding-bottle-timer').classList.add('hidden');
        const timerRow = document.getElementById('timer-toggle-row');
        if (timerRow) timerRow.classList.remove('hidden');
        document.getElementById('feeding-save-btn').disabled = true;
        document.getElementById('feeding-save-btn').textContent = 'Start';
    }
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

/* ===== Option Buttons ===== */
function initOptionButtons() {
    document.querySelectorAll('.btn-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const field = btn.dataset.field;
            const value = btn.dataset.value;
            // Deselect siblings
            btn.closest('.btn-group').querySelectorAll('.btn-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            const input = document.getElementById(field);
            input.value = value;
            input.dispatchEvent(new Event('change'));
        });
    });
}

/* ===== Tabs ===== */
function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const parent = tab.closest('.modal-content');
            parent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            parent.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });
}

/* ===== Breastfeeding Timer ===== */
const TIMER_KEY = 'puffin-feeding-timer';
let timerInterval = null;

function getTimerState() {
    const raw = localStorage.getItem(TIMER_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    // Migrate old format (pre-switching)
    if (state.active && !state.segments) {
        state.segments = [{ side: state.side, startTime: state.startTime, endTime: null }];
        delete state.side;
        delete state.startTime;
        localStorage.setItem(TIMER_KEY, JSON.stringify(state));
    }
    return state;
}

function startTimer(side) {
    // An active session lives only in localStorage until it is ended, so
    // overwriting it destroys every segment recorded so far with no way back.
    // Reaching Start with a timer already running means a mis-tap, not an
    // intent to discard a feed in progress.
    const existing = getTimerState();
    if (existing && existing.active) {
        showTimerUI();
        showToast('A feeding is already in progress');
        return;
    }
    const state = {
        active: true,
        // The timer belongs to whoever was selected when it started, and keeps
        // that child even if the user switches profiles mid-feed.  Only one
        // timer runs at a time; simultaneous per-child timers (tandem feeding)
        // are a separate feature.
        childId: currentChildId(),
        segments: [{ side, startTime: new Date().toISOString(), endTime: null }],
    };
    localStorage.setItem(TIMER_KEY, JSON.stringify(state));
    showTimerUI();
}

function switchBreast() {
    const state = getTimerState();
    if (!state || !state.active || state.paused) return;

    const current = state.segments[state.segments.length - 1];
    const now = new Date().toISOString();
    current.endTime = now;

    const newSide = current.side === 'breast_left' ? 'breast_right' : 'breast_left';
    state.segments.push({ side: newSide, startTime: now, endTime: null });

    localStorage.setItem(TIMER_KEY, JSON.stringify(state));
    showTimerUI();

    const names = getBreastNames();
    const sideLabel = newSide === 'breast_left' ? names.left : names.right;
    showToast(`Switched to ${sideLabel}`);
}

function pauseTimer() {
    const state = getTimerState();
    if (!state || !state.active || state.paused) return;

    const now = new Date().toISOString();
    const currentSeg = state.segments[state.segments.length - 1];
    if (!currentSeg.endTime) {
        currentSeg.endTime = now;
    }
    state.paused = true;
    localStorage.setItem(TIMER_KEY, JSON.stringify(state));
    showTimerUI();
    showToast('Timer paused');
}

function resumeTimer() {
    const state = getTimerState();
    if (!state || !state.active || !state.paused) return;

    const lastSeg = state.segments[state.segments.length - 1];
    const now = new Date().toISOString();
    state.segments.push({ side: lastSeg.side, startTime: now, endTime: null });
    state.paused = false;
    localStorage.setItem(TIMER_KEY, JSON.stringify(state));
    showTimerUI();
    showToast('Timer resumed');
}

function getBreastTimes(segments) {
    const times = { breast_left: 0, breast_right: 0 };
    for (const seg of segments) {
        const end = seg.endTime ? new Date(seg.endTime).getTime() : Date.now();
        const start = new Date(seg.startTime).getTime();
        if (seg.side in times) {
            times[seg.side] += Math.max(0, end - start);
        }
    }
    return times;
}

function formatDurationShort(ms) {
    const totalSec = Math.floor(Math.max(0, ms) / 1000);
    const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return `${m}:${s}`;
}

function showTimerUI() {
    const state = getTimerState();
    if (!state || !state.active) {
        document.getElementById('timer-section').classList.add('hidden');
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        return;
    }

    document.getElementById('timer-section').classList.remove('hidden');

    const currentSeg = state.segments[state.segments.length - 1];
    const currentSide = currentSeg.side;
    const canSwitch = !state.paused && (currentSide === 'breast_left' || currentSide === 'breast_right');

    const names = getBreastNames();
    const sideLabels = {
        breast_left: `${names.left} Breast`,
        breast_right: `${names.right} Breast`,
        bottle: 'Bottle',
    };
    document.getElementById('timer-side').textContent = sideLabels[currentSide] || currentSide;

    // Show/hide switch button
    const switchBtn = document.getElementById('timer-switch-btn');
    if (canSwitch) {
        switchBtn.classList.remove('hidden');
        const otherLabel = currentSide === 'breast_left' ? names.right : names.left;
        switchBtn.textContent = `Switch to ${otherLabel}`;
    } else {
        switchBtn.classList.add('hidden');
    }

    // Show pause or resume button
    const pauseBtn = document.getElementById('timer-pause-btn');
    pauseBtn.classList.remove('hidden');
    pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';

    // Reset end/confirm UI
    document.getElementById('timer-end-btn').classList.remove('hidden');
    const confirmBtn = document.getElementById('timer-confirm-btn');
    confirmBtn.classList.add('hidden');
    confirmBtn.disabled = false;
    document.getElementById('timer-cancel-btn').classList.add('hidden');
    document.getElementById('timer-discard-btn').classList.remove('hidden');
    document.getElementById('timer-discard-confirm-btn').classList.add('hidden');
    document.getElementById('timer-discard-back-btn').classList.add('hidden');

    const breastTimesEl = document.getElementById('timer-breast-times');

    function updateDisplay() {
        // Compute total elapsed from all segments
        let totalMs = 0;
        for (const seg of state.segments) {
            const end = seg.endTime ? new Date(seg.endTime).getTime() : Date.now();
            totalMs += Math.max(0, end - new Date(seg.startTime).getTime());
        }
        const totalSec = Math.floor(totalMs / 1000);
        const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
        const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
        const s = String(totalSec % 60).padStart(2, '0');
        document.getElementById('timer-digits').textContent = `${h}:${m}:${s}`;

        // Per-breast times (only for switchable feeds)
        if (currentSide === 'breast_left' || currentSide === 'breast_right') {
            const bt = getBreastTimes(state.segments);
            const leftAbbr = names.left.charAt(0).toUpperCase();
            const rightAbbr = names.right.charAt(0).toUpperCase();
            const leftLabel = leftAbbr === rightAbbr ? names.left : leftAbbr;
            const rightLabel = leftAbbr === rightAbbr ? names.right : rightAbbr;
            breastTimesEl.innerHTML =
                `<span class="${currentSide === 'breast_left' ? 'active-breast' : ''}">${leftLabel}: ${formatDurationShort(bt.breast_left)}</span>` +
                `<span class="breast-sep">•</span>` +
                `<span class="${currentSide === 'breast_right' ? 'active-breast' : ''}">${rightLabel}: ${formatDurationShort(bt.breast_right)}</span>`;
            breastTimesEl.classList.remove('hidden');
        } else {
            breastTimesEl.classList.add('hidden');
        }
    }

    updateDisplay();
    clearInterval(timerInterval);
    timerInterval = state.paused ? null : setInterval(updateDisplay, 1000);
}

function cancelTimer() {
    localStorage.removeItem(TIMER_KEY);
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    showTimerUI();
    showToast('Feeding session cancelled');
}

async function endTimer() {
    const state = getTimerState();
    if (!state) return;

    // Close the last open segment
    const lastSeg = state.segments[state.segments.length - 1];
    if (!lastSeg.endTime) {
        lastSeg.endTime = new Date().toISOString();
    }

    // Aggregate time per breast
    const totals = {};
    const starts = {};
    for (const seg of state.segments) {
        const start = new Date(seg.startTime).getTime();
        const end = new Date(seg.endTime).getTime();
        const dur = Math.max(0, end - start);
        if (!totals[seg.side]) {
            totals[seg.side] = 0;
            starts[seg.side] = seg.startTime;
        }
        totals[seg.side] += dur;
    }

    const confirmBtn = document.getElementById('timer-confirm-btn');
    confirmBtn.disabled = true;
    try {
        // Save one entry per breast used; link paired breasts with a shared session_id
        const activeSides = Object.entries(totals).filter(([, ms]) => ms >= 1000);
        const sessionId = activeSides.length > 1 ? generateUUID() : null;
        const promises = [];
        for (const [side, totalMs] of activeSides) {
            const durationMinutes = Math.max(1, Math.round(totalMs / 60000));
            const body = {
                timestamp: starts[side],
                feeding_type: side,
                duration_minutes: durationMinutes,
                // A timer started before profiles existed has no childId.
                child_id: state.childId ?? null,
            };
            if (sessionId) body.session_id = sessionId;
            promises.push(api.post('/api/feedings', body));
        }
        await Promise.all(promises);

        localStorage.removeItem(TIMER_KEY);
        showTimerUI();

        // Build toast message
        const sides = Object.entries(totals).filter(([, ms]) => ms >= 1000);
        const names = getBreastNames();
        const sideLabels = { breast_left: names.left, breast_right: names.right };
        if (sides.length === 1) {
            const dur = Math.max(1, Math.round(sides[0][1] / 60000));
            showToast(`Feeding logged: ${sideLabels[sides[0][0]] || sides[0][0]} ${dur}min`);
        } else {
            const parts = sides.map(([s, ms]) => {
                const dur = Math.max(1, Math.round(ms / 60000));
                return `${sideLabels[s] || s} ${dur}min`;
            });
            showToast(`Feeding logged: ${parts.join(' + ')}`);
        }
        reloadAfterLogChange();
    } catch (e) {
        confirmBtn.disabled = false;
        showToast('Error saving feeding: ' + e.message);
    }
}

function initTimer() {
    showTimerUI();

    document.getElementById('timer-switch-btn').addEventListener('click', switchBreast);

    document.getElementById('timer-pause-btn').addEventListener('click', () => {
        const pauseBtn = document.getElementById('timer-pause-btn');
        if (pauseBtn.textContent === 'Resume') {
            resumeTimer();
        } else {
            pauseTimer();
        }
    });

    document.getElementById('timer-end-btn').addEventListener('click', () => {
        // Two-step confirmation — hide switch and pause too
        document.getElementById('timer-end-btn').classList.add('hidden');
        document.getElementById('timer-switch-btn').classList.add('hidden');
        document.getElementById('timer-pause-btn').classList.add('hidden');
        document.getElementById('timer-discard-btn').classList.add('hidden');
        document.getElementById('timer-confirm-btn').classList.remove('hidden');
        document.getElementById('timer-cancel-btn').classList.remove('hidden');
    });

    document.getElementById('timer-confirm-btn').addEventListener('click', () => {
        endTimer();
    });

    document.getElementById('timer-cancel-btn').addEventListener('click', () => {
        document.getElementById('timer-end-btn').classList.remove('hidden');
        // Re-show switch and pause buttons if applicable
        const state = getTimerState();
        if (state) {
            const currentSide = state.segments[state.segments.length - 1].side;
            if (!state.paused && (currentSide === 'breast_left' || currentSide === 'breast_right')) {
                document.getElementById('timer-switch-btn').classList.remove('hidden');
            }
            document.getElementById('timer-pause-btn').classList.remove('hidden');
        }
        document.getElementById('timer-confirm-btn').classList.add('hidden');
        document.getElementById('timer-cancel-btn').classList.add('hidden');
        document.getElementById('timer-discard-btn').classList.remove('hidden');
    });

    document.getElementById('timer-discard-btn').addEventListener('click', () => {
        document.getElementById('timer-end-btn').classList.add('hidden');
        document.getElementById('timer-switch-btn').classList.add('hidden');
        document.getElementById('timer-pause-btn').classList.add('hidden');
        document.getElementById('timer-discard-btn').classList.add('hidden');
        document.getElementById('timer-discard-confirm-btn').classList.remove('hidden');
        document.getElementById('timer-discard-back-btn').classList.remove('hidden');
    });

    document.getElementById('timer-discard-confirm-btn').addEventListener('click', () => {
        cancelTimer();
    });

    document.getElementById('timer-discard-back-btn').addEventListener('click', () => {
        document.getElementById('timer-end-btn').classList.remove('hidden');
        const state = getTimerState();
        if (state) {
            const currentSide = state.segments[state.segments.length - 1].side;
            if (!state.paused && (currentSide === 'breast_left' || currentSide === 'breast_right')) {
                document.getElementById('timer-switch-btn').classList.remove('hidden');
            }
            document.getElementById('timer-pause-btn').classList.remove('hidden');
        }
        document.getElementById('timer-discard-confirm-btn').classList.add('hidden');
        document.getElementById('timer-discard-back-btn').classList.add('hidden');
        document.getElementById('timer-discard-btn').classList.remove('hidden');
    });
}

/* ===== Last Feeding Info ===== */
async function loadLastBreastFeeding() {
    const infoEl = document.getElementById('last-feeding-info');
    try {
        // Scoped like every other read: this banner drives the next-feed
        // decision, so showing a sibling's session here is actively misleading.
        const feedings = await api.get(`/api/feedings?limit=20${childQuery()}`);
        const now = Date.now();

        // Find the most recent breast feeding session. Feedings sharing a session_id
        // were recorded together and belong to the same session; feedings with no
        // session_id are each their own standalone session.
        let lastSessionId = undefined;
        let lastSessionFeedings = [];
        for (const f of feedings) {
            if (new Date(f.timestamp).getTime() > now) continue;
            if (f.feeding_type !== 'breast_left' && f.feeding_type !== 'breast_right') continue;

            if (lastSessionFeedings.length === 0) {
                lastSessionFeedings.push(f);
                lastSessionId = f.session_id;
            } else if (lastSessionId && f.session_id === lastSessionId) {
                lastSessionFeedings.push(f);
            } else {
                break;
            }
        }

        if (lastSessionFeedings.length === 0) {
            infoEl.classList.add('hidden');
            return;
        }

        const parts = [];
        const names = getBreastNames();
        const lastLeft = lastSessionFeedings.find(f => f.feeding_type === 'breast_left');
        const lastRight = lastSessionFeedings.find(f => f.feeding_type === 'breast_right');
        if (lastLeft) parts.push(`${names.left}: ${lastLeft.duration_minutes || '?'}min`);
        if (lastRight) parts.push(`${names.right}: ${lastRight.duration_minutes || '?'}min`);

        const mostRecent = lastSessionFeedings.reduce((a, b) =>
            new Date(a.timestamp) > new Date(b.timestamp) ? a : b);

        infoEl.innerHTML =
            `<strong>Last session:</strong> ${parts.join(' • ')}` +
            ` <span class="text-secondary">(${timeAgo(mostRecent.timestamp)})</span>`;
        infoEl.classList.remove('hidden');
    } catch (e) {
        console.error('Failed to load last feeding info:', e);
        infoEl.classList.add('hidden');
    }
}

/* ===== Feeding Form: Timer toggle ===== */
function initFeedingForm() {
    const timerCheckbox = document.getElementById('start-timer');
    const timerToggleRow = document.getElementById('timer-toggle-row');
    const timerMode = document.getElementById('feeding-timer-mode');
    const manualMode = document.getElementById('feeding-manual-mode');
    const bottleOzTimerGroup = document.getElementById('feeding-bottle-timer');
    const bottleOzTimerInput = document.getElementById('feeding-bottle-timer-input');
    const saveBtn = document.getElementById('feeding-save-btn');

    function updateMode() {
        const isTimer = timerCheckbox.checked;
        timerMode.classList.toggle('hidden', !isTimer);
        manualMode.classList.toggle('hidden', isTimer);
        if (isTimer) {
            updateTimerBtnState();
        } else {
            saveBtn.textContent = 'Save';
            updateManualBtnState();
        }
    }

    function updateTimerBtnState() {
        const ft = document.getElementById('feeding-type').value;
        if (!ft) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Start';
            bottleOzTimerGroup.classList.add('hidden');
            if (timerToggleRow) timerToggleRow.classList.remove('hidden');
            return;
        }
        if (ft === 'bottle') {
            // Bottle: hide timer toggle, show amount, require a value, set button to Save
            if (timerToggleRow) timerToggleRow.classList.add('hidden');
            bottleOzTimerGroup.classList.remove('hidden');
            saveBtn.textContent = 'Save';
            const hasAmount = !!bottleOzTimerInput.value;
            saveBtn.disabled = !hasAmount;
        } else {
            // Breast: show timer toggle, hide amount, enable Start
            if (timerToggleRow) timerToggleRow.classList.remove('hidden');
            bottleOzTimerGroup.classList.add('hidden');
            saveBtn.textContent = 'Start';
            saveBtn.disabled = false;
        }
    }

    function updateManualBtnState() {
        const l = document.getElementById('feeding-left-duration').value;
        const r = document.getElementById('feeding-right-duration').value;
        const b = document.getElementById('feeding-bottle').value;
        saveBtn.disabled = !(l || r || b);
    }

    timerCheckbox.addEventListener('change', updateMode);

    // React to feeding type selection (via initOptionButtons dispatching change)
    document.getElementById('feeding-type').addEventListener('change', () => {
        if (timerCheckbox.checked) {
            updateTimerBtnState();
        } else {
            updateManualBtnState();
        }
    });

    bottleOzTimerInput.addEventListener('input', updateTimerBtnState);

    // Manual mode: enable save when any field is entered
    ['feeding-left-duration', 'feeding-right-duration', 'feeding-bottle'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateManualBtnState);
    });

    updateMode();
}

/* ===== Medication Autocomplete ===== */
let savedMedNames = []; // sorted A→Z from /api/medications/saved-names
let medDosageMap = {};  // name -> { dosage_quantity, dosage_unit } from recent logs

async function loadSavedMedNames() {
    try {
        savedMedNames = await api.get('/api/medications/saved-names');
    } catch (e) {
        console.error('Failed to load saved medication names:', e);
        savedMedNames = [];
    }
}

async function loadMedDosageMap() {
    try {
        const meds = await api.get('/api/medications?limit=50');
        medDosageMap = {};
        const seen = new Set();
        for (const m of meds) {
            const name = m.medication_name;
            if (!seen.has(name.toLowerCase())) {
                seen.add(name.toLowerCase());
                medDosageMap[name.toLowerCase()] = { dosage_quantity: m.dosage_quantity, dosage_unit: m.dosage_unit };
            }
        }
    } catch (e) {
        console.error('Failed to load medication dosage map:', e);
    }
}

function resetMedAutocomplete() {
    const chipDisplay = document.getElementById('med-chip-display');
    const nameInput = document.getElementById('med-name-input');
    const hiddenInput = document.getElementById('med-name');
    const dropdown = document.getElementById('med-dropdown');
    chipDisplay.classList.add('hidden');
    nameInput.classList.remove('hidden');
    nameInput.value = '';
    hiddenInput.value = '';
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
}

function selectMedName(name) {
    const chipDisplay = document.getElementById('med-chip-display');
    const chipText = document.getElementById('med-chip-text');
    const nameInput = document.getElementById('med-name-input');
    const hiddenInput = document.getElementById('med-name');
    const dropdown = document.getElementById('med-dropdown');

    chipText.textContent = name;
    hiddenInput.value = name;
    chipDisplay.classList.remove('hidden');
    nameInput.classList.add('hidden');
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';

    // Auto-fill dosage if fields are empty
    const qtyInput = document.getElementById('med-dosage-qty');
    const unitSelect = document.getElementById('med-dosage-unit');
    const match = medDosageMap[name.toLowerCase()];
    if (match && !qtyInput.value) {
        qtyInput.value = match.dosage_quantity;
        unitSelect.value = match.dosage_unit;
    }
}

function renderMedDropdown(query) {
    const dropdown = document.getElementById('med-dropdown');
    const q = query.trim().toLowerCase();
    let matches;
    if (q === '') {
        matches = savedMedNames;
    } else {
        matches = savedMedNames.filter(n => n.toLowerCase().includes(q));
    }

    const items = [];
    for (const name of matches) {
        items.push(`<div class="med-dropdown-item" role="option" data-name="${escapeAttr(name)}">${escapeHtml(name)}</div>`);
    }

    // Show "+ Add" only when query is non-empty and no exact case-insensitive match exists
    const hasExact = savedMedNames.some(n => n.toLowerCase() === q);
    if (q !== '' && !hasExact) {
        items.push(`<div class="med-dropdown-item add-new" role="option" data-add="${escapeAttr(query.trim())}">+ Add &ldquo;${escapeHtml(query.trim())}&rdquo;</div>`);
    }

    if (items.length === 0) {
        dropdown.classList.add('hidden');
        return;
    }

    dropdown.innerHTML = items.join('');
    dropdown.classList.remove('hidden');

    dropdown.querySelectorAll('.med-dropdown-item').forEach(el => {
        el.addEventListener('mousedown', (e) => {
            e.preventDefault(); // prevent blur before click
            const name = el.dataset.name || el.dataset.add;
            selectMedName(name);
        });
    });
}

function initMedAutocomplete() {
    const nameInput = document.getElementById('med-name-input');
    const dropdown = document.getElementById('med-dropdown');
    const dismissBtn = document.getElementById('med-chip-dismiss');

    nameInput.addEventListener('focus', () => {
        renderMedDropdown(nameInput.value);
    });

    nameInput.addEventListener('input', () => {
        renderMedDropdown(nameInput.value);
    });

    nameInput.addEventListener('blur', () => {
        // Small delay so mousedown on dropdown items can fire first
        setTimeout(() => dropdown.classList.add('hidden'), 150);
    });

    dismissBtn.addEventListener('click', () => {
        resetMedAutocomplete();
        document.getElementById('med-name-input').focus();
    });
}

async function loadNoteSuggestions(endpoint, containerId, textareaId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    try {
        const entries = await api.get(`${endpoint}?limit=30`);
        const uniqueNotes = [];
        const seen = new Set();
        for (const e of entries) {
            if (e.notes && !seen.has(e.notes)) {
                seen.add(e.notes);
                uniqueNotes.push(e.notes);
                if (uniqueNotes.length >= 5) break;
            }
        }
        if (uniqueNotes.length === 0) return;
        container.innerHTML = uniqueNotes.map(n =>
            `<span class="note-chip" title="${escapeAttr(n)}">${escapeHtml(n)}</span>`
        ).join('');
        container.querySelectorAll('.note-chip').forEach((chip, i) => {
            chip.addEventListener('click', () => {
                document.getElementById(textareaId).value = uniqueNotes[i];
            });
        });
    } catch (e) {
        console.error('Failed to load note suggestions:', e);
    }
}

/* ===== Form Submissions ===== */
function initForms() {
    // Diaper form
    document.getElementById('diaper-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = document.getElementById('diaper-type').value;
        if (!type) { showToast('Please select a diaper type'); return; }
        const notes = document.getElementById('diaper-notes').value || undefined;
        const timestampInput = document.getElementById('diaper-timestamp').value;
        const timestamp = timestampInput ? new Date(timestampInput).toISOString() : undefined;
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        try {
            await api.post('/api/diapers', { type, notes, timestamp, child_id: currentChildId() });
            closeModal('diaper-modal');
            showToast('Diaper change logged!');
            reloadAfterLogChange();
        } catch (err) {
            submitBtn.disabled = false;
            showToast('Error: ' + err.message);
        }
    });

    // Feeding form
    document.getElementById('feeding-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveBtn = document.getElementById('feeding-save-btn');
        const useTimer = document.getElementById('start-timer').checked;
        const notes = document.getElementById('feeding-notes').value || undefined;
        const timestampInput = document.getElementById('feeding-timestamp').value;
        const timestamp = timestampInput ? new Date(timestampInput).toISOString() : undefined;

        if (useTimer) {
            // Timer mode — bottle becomes a quick log (no timer), breast starts timer
            const feedingType = document.getElementById('feeding-type').value;
            if (!feedingType) { showToast('Please select a feeding type'); return; }

            if (feedingType === 'bottle') {
                const amount = document.getElementById('feeding-bottle-timer-input').value;
                const amountUnit = document.getElementById('feeding-bottle-unit-timer-select').value;
                if (!amount) { showToast(`Please enter ${amountUnit}`); return; }
                if (!validateBottleAmountUnit(amount, amountUnit)) return;
                const bottleType = document.getElementById('feeding-bottle-type-timer-select').value;
                saveBtn.disabled = true;
                try {
                    await api.post('/api/feedings', {
                        feeding_type: 'bottle',
                        amount: parseFloat(amount),
                        amount_unit: amountUnit,
                        bottle_type: bottleType,
                        notes,
                        timestamp,
                        child_id: currentChildId(),
                    });
                    closeModal('feeding-modal');
                    showToast('Feeding logged!');
                    reloadAfterLogChange();
                } catch (err) {
                    saveBtn.disabled = false;
                    showToast('Error: ' + err.message);
                }
                return;
            }

            // Breast: start timer (no API call)
            startTimer(feedingType);
            closeModal('feeding-modal');
            showToast('Timer started!');
            return;
        }

        // Manual mode: create entries for each non-empty field
        const leftDur = document.getElementById('feeding-left-duration').value;
        const rightDur = document.getElementById('feeding-right-duration').value;
        const bottleAmount = document.getElementById('feeding-bottle').value;
        const bottleUnit = document.getElementById('feeding-bottle-unit-manual-select').value;

        if (!leftDur && !rightDur && !bottleAmount) {
            showToast('Please enter at least one value');
            return;
        }
        if (bottleAmount && !validateBottleAmountUnit(bottleAmount, bottleUnit)) return;

        saveBtn.disabled = true;
        try {
            const promises = [];
            let notesAttached = false;
            // Link paired breast feedings with a shared session_id
            const manualSessionId = (leftDur && rightDur) ? generateUUID() : null;
            if (leftDur) {
                const body = {
                    feeding_type: 'breast_left',
                    duration_minutes: parseInt(leftDur),
                    notes: notesAttached ? undefined : notes,
                    timestamp,
                    child_id: currentChildId(),
                };
                if (manualSessionId) body.session_id = manualSessionId;
                promises.push(api.post('/api/feedings', body));
                notesAttached = true;
            }
            if (rightDur) {
                const body = {
                    feeding_type: 'breast_right',
                    duration_minutes: parseInt(rightDur),
                    notes: notesAttached ? undefined : notes,
                    timestamp,
                    child_id: currentChildId(),
                };
                if (manualSessionId) body.session_id = manualSessionId;
                promises.push(api.post('/api/feedings', body));
                notesAttached = true;
            }
            if (bottleAmount) {
                const bottleType = document.getElementById('feeding-bottle-type-manual-select').value;
                promises.push(api.post('/api/feedings', {
                    feeding_type: 'bottle',
                    amount: parseFloat(bottleAmount),
                    amount_unit: bottleUnit,
                    bottle_type: bottleType,
                    notes: notesAttached ? undefined : notes,
                    timestamp,
                    child_id: currentChildId(),
                }));
            }
            await Promise.all(promises);
            closeModal('feeding-modal');
            showToast('Feeding logged!');
            reloadAfterLogChange();
        } catch (err) {
            saveBtn.disabled = false;
            showToast('Error: ' + err.message);
        }
    });

    // Medication form
    document.getElementById('medication-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('med-name').value.trim();
        if (!name) {
            showToast('Please select or add a medication name');
            document.getElementById('med-name-input').focus();
            return;
        }
        const dosageQtyRaw = document.getElementById('med-dosage-qty').value;
        const dosage_unit = document.getElementById('med-dosage-unit').value;
        const notes = document.getElementById('med-notes').value || undefined;
        const timestampInput = document.getElementById('med-timestamp').value;
        const timestamp = timestampInput ? new Date(timestampInput).toISOString() : undefined;
        const dosage_quantity = parseFloat(parseFloat(dosageQtyRaw).toFixed(2));
        if (isNaN(dosage_quantity) || dosage_quantity <= 0) {
            showToast('Quantity must be a positive number');
            return;
        }
        if (!dosage_unit) {
            showToast('Please select a unit');
            return;
        }
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        try {
            await api.post('/api/medications', { medication_name: name, dosage_quantity, dosage_unit, notes, timestamp, child_id: currentChildId() });
            closeModal('health-modal');
            showToast('Medication logged!');
            reloadAfterLogChange();
        } catch (err) {
            submitBtn.disabled = false;
            showToast('Error: ' + err.message);
        }
    });

    // Temperature form
    document.getElementById('temperature-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        let tempValue = parseFloat(document.getElementById('temp-value').value);
        const unit = document.getElementById('temp-unit').value;
        const location = document.getElementById('temp-location').value || undefined;
        const notes = document.getElementById('temp-notes').value || undefined;
        const timestampInput = document.getElementById('temp-timestamp').value;
        const timestamp = timestampInput ? new Date(timestampInput).toISOString() : undefined;

        // Convert F to C if needed
        if (unit === 'f') {
            tempValue = (tempValue - 32) * 5 / 9;
        }

        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        try {
            await api.post('/api/temperatures', {
                temperature_celsius: Math.round(tempValue * 10) / 10,
                location,
                notes,
                timestamp,
                child_id: currentChildId(),
            });
            closeModal('health-modal');
            showToast('Temperature logged!');
            reloadAfterLogChange();
        } catch (err) {
            submitBtn.disabled = false;
            showToast('Error: ' + err.message);
        }
    });
}

/* ===== Edit Modal ===== */
function toLocalDatetime(isoStr) {
    const d = new Date(isoStr);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function openEditModal(type, id, secondaryId = null) {
    const endpoints = {
        diaper: `/api/diapers/${id}`,
        feeding: `/api/feedings/${id}`,
        medication: `/api/medications/${id}`,
        temperature: `/api/temperatures/${id}`,
    };
    try {
        let data, secondaryData = null;
        if (type === 'feeding' && secondaryId) {
            [data, secondaryData] = await Promise.all([
                api.get(`/api/feedings/${id}`),
                api.get(`/api/feedings/${secondaryId}`),
            ]);
        } else {
            data = await api.get(endpoints[type]);
        }
        const titles = {
            diaper: 'Edit Diaper Change',
            feeding: secondaryData ? 'Edit Both Breasts' : 'Edit Feeding',
            medication: 'Edit Medication',
            temperature: 'Edit Temperature',
        };
        document.getElementById('edit-modal-title').textContent = titles[type];
        document.getElementById('edit-form-fields').innerHTML = buildEditFields(type, data, secondaryData);
        const form = document.getElementById('edit-form');
        form.dataset.editType = type;
        form.dataset.editId = id;
        form.dataset.originalTimestamp = toLocalDatetime(data.timestamp);
        if (secondaryData) {
            form.dataset.editSecondaryId = secondaryId;
        } else {
            delete form.dataset.editSecondaryId;
        }
        initEditOptionButtons();
        openModal('edit-modal');
    } catch (err) {
        showToast('Error loading record: ' + err.message);
    }
}

function buildEditFields(type, data, secondaryData = null) {
    let html;
    switch (type) {
        case 'diaper': html = buildDiaperEditFields(data); break;
        case 'feeding': html = buildFeedingEditFields(data, secondaryData); break;
        case 'medication': html = buildMedicationEditFields(data); break;
        case 'temperature': html = buildTemperatureEditFields(data); break;
    }
    return html + buildChildEditField(data);
}

/**
 * The child selector — the only place a single log's association can change.
 *
 * Hidden entirely when no profiles exist, so nothing about editing a log
 * changes for installs that never opted in.  `Unassigned` is selectable: a log
 * mis-assigned during a bulk move can be parked rather than forced onto the
 * wrong child.
 */
function buildChildEditField(data) {
    if (!hasProfiles()) return '';
    const options = childProfiles.map(c =>
        `<option value="${c.id}" ${data.child_id === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
    ).join('');
    const unassignedSelected = data.child_id == null ? 'selected' : '';
    return `
        <div class="form-group">
            <label for="edit-child">Child</label>
            <select id="edit-child">
                ${options}
                <option value="" ${unassignedSelected}>Unassigned</option>
            </select>
        </div>`;
}

function buildDiaperEditFields(data) {
    return `
        <div class="form-group">
            <label>Type</label>
            <div class="btn-group">
                <button type="button" class="btn btn-option ${data.type === 'pee' ? 'selected' : ''}" data-value="pee" data-field="edit-diaper-type">💧 Pee</button>
                <button type="button" class="btn btn-option ${data.type === 'poop' ? 'selected' : ''}" data-value="poop" data-field="edit-diaper-type">💩 Poop</button>
                <button type="button" class="btn btn-option ${data.type === 'both' ? 'selected' : ''}" data-value="both" data-field="edit-diaper-type">💧💩 Both</button>
                <button type="button" class="btn btn-option ${data.type === 'dry' ? 'selected' : ''}" data-value="dry" data-field="edit-diaper-type">🧷 Dry</button>
            </div>
            <input type="hidden" id="edit-diaper-type" value="${data.type}">
        </div>
        <div class="form-group">
            <label for="edit-timestamp">Time</label>
            <input type="datetime-local" id="edit-timestamp" value="${toLocalDatetime(data.timestamp)}">
        </div>
        <div class="form-group">
            <label for="edit-notes">Notes</label>
            <textarea id="edit-notes" rows="2">${escapeHtml(data.notes || '')}</textarea>
        </div>
    `;
}

function buildFeedingEditFields(data, secondaryData = null) {
    if (secondaryData) {
        const leftData = data.feeding_type === 'breast_left' ? data : secondaryData;
        const rightData = data.feeding_type === 'breast_right' ? data : secondaryData;
        const names = getBreastNames();
        const notes = leftData.notes || rightData.notes || '';
        return `
            <input type="hidden" id="edit-left-id" value="${leftData.id}">
            <input type="hidden" id="edit-right-id" value="${rightData.id}">
            <div class="form-group">
                <label for="edit-left-duration">🤱 ${escapeHtml(names.left)} (minutes)</label>
                <input type="number" id="edit-left-duration" min="1" max="120" value="${leftData.duration_minutes || ''}">
            </div>
            <div class="form-group">
                <label for="edit-right-duration">🤱 ${escapeHtml(names.right)} (minutes)</label>
                <input type="number" id="edit-right-duration" min="1" max="120" value="${rightData.duration_minutes || ''}">
            </div>
            <div class="form-group">
                <label for="edit-timestamp">Time</label>
                <input type="datetime-local" id="edit-timestamp" value="${toLocalDatetime(leftData.timestamp)}">
            </div>
            <div class="form-group">
                <label for="edit-notes">Notes</label>
                <textarea id="edit-notes" rows="2">${escapeHtml(notes)}</textarea>
            </div>
        `;
    }
    const isBottle = data.feeding_type === 'bottle';
    const names = getBreastNames();
    const bottleTypeVal = data.bottle_type || 'breastmilk';
    const bottleUnitVal = data.amount_unit || getDefaultBottleUnit();
    return `
        <div class="form-group">
            <label>Type</label>
            <div class="btn-group">
                <button type="button" class="btn btn-option ${data.feeding_type === 'breast_left' ? 'selected' : ''}" data-value="breast_left" data-field="edit-feeding-type">🤱 ${escapeHtml(names.left)}</button>
                <button type="button" class="btn btn-option ${data.feeding_type === 'breast_right' ? 'selected' : ''}" data-value="breast_right" data-field="edit-feeding-type">🤱 ${escapeHtml(names.right)}</button>
                <button type="button" class="btn btn-option ${isBottle ? 'selected' : ''}" data-value="bottle" data-field="edit-feeding-type">🍼 Bottle</button>
            </div>
            <input type="hidden" id="edit-feeding-type" value="${data.feeding_type}">
        </div>
        <div class="form-group" id="edit-duration-group" ${isBottle ? 'style="display:none"' : ''}>
            <label for="edit-duration">Duration (minutes)</label>
            <input type="number" id="edit-duration" min="1" max="120" value="${data.duration_minutes || ''}">
        </div>
        <div class="form-group" id="edit-oz-group" ${isBottle ? '' : 'style="display:none"'}>
            <label for="edit-amount">Amount</label>
            <div class="input-group">
                <input type="number" id="edit-amount" min="0.01" step="0.01" value="${data.amount || ''}">
                <select id="edit-amount-unit">
                    <option value="oz" ${bottleUnitVal === 'oz' ? 'selected' : ''}>oz</option>
                    <option value="mL" ${bottleUnitVal === 'mL' ? 'selected' : ''}>mL</option>
                </select>
            </div>
        </div>
        <div class="form-group" id="edit-bottle-type-group" ${isBottle ? '' : 'style="display:none"'}>
            <label for="edit-bottle-type">Bottle Type</label>
            <select id="edit-bottle-type">
                <option value="breastmilk" ${bottleTypeVal === 'breastmilk' ? 'selected' : ''}>Breastmilk</option>
                <option value="formula" ${bottleTypeVal === 'formula' ? 'selected' : ''}>Formula</option>
            </select>
        </div>
        <div class="form-group">
            <label for="edit-timestamp">Time</label>
            <input type="datetime-local" id="edit-timestamp" value="${toLocalDatetime(data.timestamp)}">
        </div>
        <div class="form-group">
            <label for="edit-notes">Notes</label>
            <textarea id="edit-notes" rows="2">${escapeHtml(data.notes || '')}</textarea>
        </div>
    `;
}

function buildMedicationEditFields(data) {
    const units = ['mL', 'tsp(s)', 'tbsp(s)', 'drop(s)', 'spray(s)', 'tablet(s)', 'unit(s)'];
    const unitOptions = units.map(u =>
        `<option value="${u}" ${data.dosage_unit === u ? 'selected' : ''}>${u}</option>`
    ).join('');
    return `
        <div class="form-group">
            <label for="edit-med-name">Medication Name</label>
            <input type="text" id="edit-med-name" value="${escapeAttr(data.medication_name)}" required>
        </div>
        <div class="form-group">
            <label>Dosage</label>
            <div class="input-group">
                <input type="number" id="edit-med-dosage-qty" step="0.01" min="0.01" value="${data.dosage_quantity}" required>
                <select id="edit-med-dosage-unit" required>
                    ${unitOptions}
                </select>
            </div>
        </div>
        <div class="form-group">
            <label for="edit-timestamp">Time</label>
            <input type="datetime-local" id="edit-timestamp" value="${toLocalDatetime(data.timestamp)}">
        </div>
        <div class="form-group">
            <label for="edit-notes">Notes</label>
            <textarea id="edit-notes" rows="2">${escapeHtml(data.notes || '')}</textarea>
        </div>
    `;
}

function buildTemperatureEditFields(data) {
    const tempF = Math.round((data.temperature_celsius * 9 / 5 + 32) * 10) / 10;
    return `
        <div class="form-group">
            <label for="edit-temp-value">Temperature</label>
            <div class="input-group">
                <input type="number" id="edit-temp-value" step="0.1" value="${tempF}" required>
                <select id="edit-temp-unit">
                    <option value="f">°F</option>
                    <option value="c">°C</option>
                </select>
            </div>
        </div>
        <div class="form-group">
            <label for="edit-temp-location">Location</label>
            <select id="edit-temp-location">
                <option value="">Select...</option>
                <option value="rectal" ${data.location === 'rectal' ? 'selected' : ''}>Rectal</option>
                <option value="oral" ${data.location === 'oral' ? 'selected' : ''}>Oral</option>
                <option value="axillary" ${data.location === 'axillary' ? 'selected' : ''}>Underarm</option>
                <option value="temporal" ${data.location === 'temporal' ? 'selected' : ''}>Forehead</option>
            </select>
        </div>
        <div class="form-group">
            <label for="edit-timestamp">Time</label>
            <input type="datetime-local" id="edit-timestamp" value="${toLocalDatetime(data.timestamp)}">
        </div>
        <div class="form-group">
            <label for="edit-notes">Notes</label>
            <textarea id="edit-notes" rows="2">${escapeHtml(data.notes || '')}</textarea>
        </div>
    `;
}

function buildEditBody(type) {
    const timestamp = document.getElementById('edit-timestamp').value;
    const notes = document.getElementById('edit-notes').value;

    const body = {};
    const originalTimestamp = document.getElementById('edit-form').dataset.originalTimestamp;
    if (timestamp && timestamp !== originalTimestamp) {
        body.timestamp = new Date(timestamp).toISOString();
    }
    body.notes = notes;

    // Absent when no profiles exist; an empty value means Unassigned, which
    // must be sent as an explicit null rather than omitted.
    const childEl = document.getElementById('edit-child');
    if (childEl) body.child_id = childEl.value ? parseInt(childEl.value, 10) : null;

    switch (type) {
        case 'diaper':
            body.type = document.getElementById('edit-diaper-type').value;
            break;
        case 'feeding': {
            body.feeding_type = document.getElementById('edit-feeding-type').value;
            if (body.feeding_type === 'bottle') {
                const amount = document.getElementById('edit-amount').value;
                const amountUnit = document.getElementById('edit-amount-unit').value;
                if (amount) {
                    if (!validateBottleAmountUnit(amount, amountUnit)) return null;
                    body.amount = parseFloat(amount);
                    body.amount_unit = amountUnit;
                }
                const btEl = document.getElementById('edit-bottle-type');
                if (btEl) body.bottle_type = btEl.value;
            } else {
                const dur = document.getElementById('edit-duration').value;
                if (dur) body.duration_minutes = parseInt(dur);
            }
            break;
        }
        case 'medication':
            body.medication_name = document.getElementById('edit-med-name').value;
            body.dosage_quantity = parseFloat(parseFloat(document.getElementById('edit-med-dosage-qty').value).toFixed(2));
            body.dosage_unit = document.getElementById('edit-med-dosage-unit').value;
            break;
        case 'temperature': {
            let tempValue = parseFloat(document.getElementById('edit-temp-value').value);
            const unit = document.getElementById('edit-temp-unit').value;
            if (unit === 'f') tempValue = (tempValue - 32) * 5 / 9;
            body.temperature_celsius = Math.round(tempValue * 10) / 10;
            const loc = document.getElementById('edit-temp-location').value;
            if (loc) body.location = loc;
            break;
        }
    }
    return body;
}

function initEditOptionButtons() {
    document.querySelectorAll('#edit-form-fields .btn-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const field = btn.dataset.field;
            const value = btn.dataset.value;
            btn.closest('.btn-group').querySelectorAll('.btn-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            document.getElementById(field).value = value;

            // Toggle duration vs amount/bottle-type for feeding edits
            if (field === 'edit-feeding-type') {
                const durGroup = document.getElementById('edit-duration-group');
                const ozGroup = document.getElementById('edit-oz-group');
                const btGroup = document.getElementById('edit-bottle-type-group');
                if (durGroup && ozGroup) {
                    durGroup.style.display = value === 'bottle' ? 'none' : '';
                    ozGroup.style.display = value === 'bottle' ? '' : 'none';
                }
                if (btGroup) btGroup.style.display = value === 'bottle' ? '' : 'none';
            }
        });
    });
}

function initEditForm() {
    document.getElementById('edit-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const type = form.dataset.editType;
        const id = form.dataset.editId;
        const endpoints = {
            diaper: `/api/diapers/${id}`,
            feeding: `/api/feedings/${id}`,
            medication: `/api/medications/${id}`,
            temperature: `/api/temperatures/${id}`,
        };
        try {
            const leftIdEl = document.getElementById('edit-left-id');
            const rightIdEl = document.getElementById('edit-right-id');
            if (type === 'feeding' && leftIdEl && rightIdEl) {
                const timestamp = document.getElementById('edit-timestamp').value;
                const notes = document.getElementById('edit-notes').value;
                const originalTimestamp = form.dataset.originalTimestamp;
                const baseBody = { notes };
                if (timestamp && timestamp !== originalTimestamp) {
                    baseBody.timestamp = new Date(timestamp).toISOString();
                }
                // This branch hand-builds its bodies instead of going through
                // buildEditBody, so the Child select — which is rendered for
                // paired feeds too — has to be read here as well. The router
                // keys off model_fields_set, so omitting child_id is a no-op
                // and the reassignment would silently do nothing.
                const pairedChildEl = document.getElementById('edit-child');
                if (pairedChildEl) {
                    baseBody.child_id = pairedChildEl.value
                        ? parseInt(pairedChildEl.value, 10)
                        : null;
                }
                const leftDur = document.getElementById('edit-left-duration').value;
                const rightDur = document.getElementById('edit-right-duration').value;
                const leftBody = { ...baseBody };
                if (leftDur) leftBody.duration_minutes = parseInt(leftDur);
                const rightBody = { ...baseBody };
                if (rightDur) rightBody.duration_minutes = parseInt(rightDur);
                await Promise.all([
                    api.put(`/api/feedings/${leftIdEl.value}`, leftBody),
                    api.put(`/api/feedings/${rightIdEl.value}`, rightBody),
                ]);
            } else {
                const body = buildEditBody(type);
                if (!body) return;
                await api.put(endpoints[type], body);
            }
            closeModal('edit-modal');
            showToast('Updated!');
            reloadAfterLogChange();
        } catch (err) {
            showToast('Error: ' + err.message);
        }
    });

    document.getElementById('edit-delete-btn').addEventListener('click', async () => {
        const form = document.getElementById('edit-form');
        const type = form.dataset.editType;
        const id = form.dataset.editId;
        const leftIdEl = document.getElementById('edit-left-id');
        const rightIdEl = document.getElementById('edit-right-id');
        const isBoth = type === 'feeding' && leftIdEl && rightIdEl;
        const msg = isBoth ? 'Delete both breast feeding records?' : 'Delete this entry?';
        if (!confirm(msg)) return;
        const endpoints = {
            diaper: `/api/diapers/${id}`,
            feeding: `/api/feedings/${id}`,
            medication: `/api/medications/${id}`,
            temperature: `/api/temperatures/${id}`,
        };
        try {
            if (isBoth) {
                await Promise.all([
                    api.del(`/api/feedings/${leftIdEl.value}`),
                    api.del(`/api/feedings/${rightIdEl.value}`),
                ]);
            } else {
                await api.del(endpoints[type]);
            }
            closeModal('edit-modal');
            showToast('Deleted!');
            reloadAfterLogChange();
        } catch (err) {
            showToast('Error: ' + err.message);
        }
    });
}

/* ===== Calendar Day View ===== */
let currentDate = new Date();
// The calendar day the UI was last rendered against. The auto-refresh compares
// it to the real clock to notice midnight passing on a page left open.
let lastKnownToday = new Date();

function toDateString(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
}

function formatDateLabel(d) {
    const now = new Date();
    if (isSameDay(d, now)) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (isSameDay(d, yesterday)) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function updateCalendarUI() {
    const isToday = isSameDay(currentDate, new Date());
    document.getElementById('cal-date-label').textContent = formatDateLabel(currentDate);
    document.getElementById('cal-next').disabled = isToday;
    const pill = document.getElementById('cal-today-pill');
    pill.classList.toggle('hidden', isToday);
}

/**
 * Periodic refresh that survives midnight.
 *
 * ``currentDate`` is fixed when the page loads, so on a page left open
 * overnight a plain ``loadDashboard()`` keeps requesting yesterday while the
 * heading still reads "Today" — and both escape hatches are unavailable,
 * because ``cal-next`` was disabled and the jump-to-today pill hidden back
 * when the two dates did agree. Overnight use is exactly when this app is
 * open, so follow the day forward instead.
 */
function refreshDashboard() {
    const now = new Date();
    if (!isSameDay(now, lastKnownToday)) {
        // Only follow the rollover if the user was actually on "today";
        // someone reviewing an earlier day should stay where they are.
        if (isSameDay(currentDate, lastKnownToday)) currentDate = now;
        lastKnownToday = now;
        updateCalendarUI();
    }
    loadDashboard();
}

function prevDay() {
    currentDate.setDate(currentDate.getDate() - 1);
    updateCalendarUI();
    loadDashboard();
}

function nextDay() {
    if (isSameDay(currentDate, new Date())) return;
    currentDate.setDate(currentDate.getDate() + 1);
    updateCalendarUI();
    loadDashboard();
}

function goToToday() {
    currentDate = new Date();
    updateCalendarUI();
    loadDashboard();
}

function initCalendar() {
    document.getElementById('cal-prev').addEventListener('click', prevDay);
    document.getElementById('cal-next').addEventListener('click', nextDay);
    document.getElementById('cal-today-pill').addEventListener('click', goToToday);

    // Date picker — hidden <input type="date"> triggered by tapping the date label
    const picker = document.getElementById('cal-date-picker');
    document.getElementById('cal-date-btn').addEventListener('click', () => {
        picker.value = toDateString(currentDate);
        picker.showPicker();
    });
    picker.addEventListener('change', () => {
        if (!picker.value) return;
        // Parse as local date
        const [y, m, d] = picker.value.split('-').map(Number);
        currentDate = new Date(y, m - 1, d);
        updateCalendarUI();
        loadDashboard();
    });

    updateCalendarUI();
}

async function loadDayActivities() {
    const timeline = document.getElementById('timeline');
    try {
        const dateStr = toDateString(currentDate);
        const activities = await api.get(`/api/activities?date=${dateStr}${childQuery()}`);
        if (activities.length === 0) {
            timeline.innerHTML = '<p class="empty-state">No entries for this day.</p>';
            return;
        }
        timeline.innerHTML = activities.map(a => {
            const secondaryArg = a.secondary_id != null ? `, ${a.secondary_id}` : '';
            return `
            <div class="timeline-item" onclick="openEditModal('${a.type}', ${a.id}${secondaryArg})">
                <span class="timeline-emoji">${a.emoji || ''}</span>
                <span class="timeline-label">${escapeHtml(getActivityLabel(a))}</span>
                ${a.detail ? `<span class="timeline-detail">${escapeHtml(a.detail)}</span>` : ''}
                <span class="timeline-time">${formatTime(a.timestamp)}</span>
                ${a.notes ? `<div class="timeline-notes">${escapeHtml(a.notes)}</div>` : ''}
            </div>
        `;
        }).join('');
    } catch (err) {
        console.error('Failed to load day activities:', err);
        timeline.innerHTML = '<p class="empty-state">Failed to load activities.</p>';
    }
}

/* ===== Dashboard Loading ===== */
function formatTime(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function timeAgo(isoStr) {
    if (!isoStr) return '';
    const diff = Date.now() - new Date(isoStr).getTime();
    if (diff < 0) return formatTime(isoStr); // future timestamp
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
    return formatTime(isoStr);
}

async function loadDashboard() {
    try {
        const dateStr = toDateString(currentDate);
        const data = await api.get(`/api/dashboard?date=${dateStr}${childQuery()}`);

        // Summary card titles reflect the displayed day
        const isToday = isSameDay(currentDate, new Date());
        document.getElementById('diaper-title').textContent = isToday ? 'Diapers Today' : 'Diapers';
        document.getElementById('feeding-title').textContent = isToday ? 'Feedings Today' : 'Feedings';
        document.getElementById('med-title').textContent = isToday ? 'Meds Today' : 'Meds';

        // Summary cards
        document.getElementById('diaper-count').textContent = data.diaper_stats.today;
        document.getElementById('feeding-count').textContent = data.feeding_stats.today;
        document.getElementById('med-count').textContent = data.medication_count_today;

        document.getElementById('last-diaper').textContent =
            data.last_diaper ? `Last: ${timeAgo(data.last_diaper.timestamp)}` : 'No records';
        document.getElementById('last-feeding').textContent =
            data.last_feeding ? `Last: ${timeAgo(data.last_feeding.timestamp)}` : 'No records';
        document.getElementById('last-temp').textContent =
            data.last_temperature ? `${data.last_temperature.temperature_celsius}°C` : 'No readings';

        // Refresh the calendar day view
        loadDayActivities();
    } catch (err) {
        console.error('Failed to load dashboard:', err);
    }
}

function getActivityLabel(a) {
    if (a.type === 'feeding') {
        const names = getBreastNames();
        if (a.subtype === 'breast_left') return `${names.left} Breast`;
        if (a.subtype === 'breast_right') return `${names.right} Breast`;
    }
    return a.label || a.summary;
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ===== Settings Modal ===== */
function initSettings() {
    document.getElementById('settings-btn').addEventListener('click', () => {
        const names = getBreastNames();
        document.getElementById('settings-left-name').value = names.left;
        document.getElementById('settings-right-name').value = names.right;
        document.getElementById('settings-bottle-type').value = getDefaultBottleType();
        document.getElementById('settings-bottle-unit').value = getDefaultBottleUnit();
        updateBottleUnitLabels();
        renderChildList();
        document.getElementById('child-new-name').value = '';
        openModal('settings-modal');
    });

    document.getElementById('settings-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const leftName = document.getElementById('settings-left-name').value.trim() || DEFAULT_LEFT_NAME;
        const rightName = document.getElementById('settings-right-name').value.trim() || DEFAULT_RIGHT_NAME;
        const bottleType = document.getElementById('settings-bottle-type').value;
        const bottleUnit = document.getElementById('settings-bottle-unit').value;
        localStorage.setItem(BREAST_LEFT_KEY, leftName);
        localStorage.setItem(BREAST_RIGHT_KEY, rightName);
        localStorage.setItem(BOTTLE_TYPE_KEY, bottleType);
        localStorage.setItem(BOTTLE_UNIT_KEY, bottleUnit);
        closeModal('settings-modal');
        updateBreastLabels();
        updateBottleTypeLabels();
        updateBottleUnitLabels();
        if (getTimerState()) showTimerUI();
        showToast('Settings saved!');
    });
}

/* ===== Export Modal ===== */
const EXPORT_ALL_CHILDREN = 'all';

/** Export defaults to the child on screen, with an explicit all-children option. */
function renderExportChildOptions() {
    const group = document.getElementById('export-child-group');
    const select = document.getElementById('export-child');
    group.classList.toggle('hidden', !hasProfiles());
    if (!hasProfiles()) {
        select.innerHTML = '';
        return;
    }
    select.innerHTML = childOptionsHtml()
        + (unassignedCount > 0 ? `<option value="${UNASSIGNED_VIEW}">Unassigned logs</option>` : '')
        + `<option value="${EXPORT_ALL_CHILDREN}">All children</option>`;
    select.value = selectedChild === null ? EXPORT_ALL_CHILDREN : String(selectedChild);
}

function initExport() {
    document.getElementById('export-btn').addEventListener('click', () => {
        renderExportChildOptions();
        openModal('export-modal');
    });

    document.getElementById('export-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const fmt = document.getElementById('export-format').value || 'csv';
        const start = document.getElementById('export-start-date').value;
        const end = document.getElementById('export-end-date').value;

        let url = `/api/export?format=${encodeURIComponent(fmt)}`;
        if (start) url += `&start_date=${encodeURIComponent(start + 'T00:00:00')}`;
        // end_date is an exclusive bound, so send the following midnight rather
        // than 23:59:59 — the latter silently dropped anything logged in the
        // final second of the chosen day.
        if (end) {
            const endExclusive = new Date(end + 'T00:00:00');
            endExclusive.setDate(endExclusive.getDate() + 1);
            url += `&end_date=${encodeURIComponent(toDateString(endExclusive) + 'T00:00:00')}`;
        }

        const childEl = document.getElementById('export-child');
        if (hasProfiles() && childEl.value !== EXPORT_ALL_CHILDREN) {
            url += childEl.value === UNASSIGNED_VIEW
                ? '&unassigned=true'
                : `&child_id=${encodeURIComponent(childEl.value)}`;
        }

        window.location.href = url;
        closeModal('export-modal');
    });
}

/* ===== Event Listeners ===== */
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initOptionButtons();
    initTabs();
    initTimer();
    initFeedingForm();
    initForms();
    initMedAutocomplete();
    initEditForm();
    initCalendar();
    initSettings();
    initExport();
    initChildProfiles();
    updateBreastLabels();
    updateBottleTypeLabels();
    updateBottleUnitLabels();
    // Resolves the selected child before the first dashboard fetch, so the
    // counts are never briefly wrong for a multi-child install.
    loadChildren().then(() => {
        renderChildList();
        loadDashboard();
    });

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // Quick action buttons → open modals
    document.querySelectorAll('[data-modal]').forEach(btn => {
        btn.addEventListener('click', () => openModal(btn.dataset.modal));
    });

    // Close modal via backdrop or cancel button.  Static backdrops opt out:
    // dismissing a two-step confirmation by clicking away would strand a
    // half-created profile.
    document.querySelectorAll('.modal-backdrop:not(.modal-backdrop-static)').forEach(el => {
        el.addEventListener('click', closeAllModals);
    });
    document.querySelectorAll('.modal-close').forEach(el => {
        el.addEventListener('click', () => {
            const modal = el.closest('.modal');
            if (modal) closeModal(modal.id);
        });
    });

    // Auto-refresh dashboard every 60 seconds
    setInterval(refreshDashboard, 60000);
});
