/*
 * Shared runtime for every Puffin page.
 *
 * Loaded before the page-specific script (app.js on the dashboard,
 * settings.js on /settings), so anything both pages need lives here: the API
 * client, toasts, theme, modal plumbing, the stored preferences, and the whole
 * child-profile subsystem.
 *
 * These are plain <script> files, not modules, so top-level declarations here
 * are visible to the page script that loads after them.
 *
 * Functions that touch page-specific DOM (the dashboard switcher, the settings
 * child list) no-op when their element is absent rather than throwing, because
 * the child subsystem genuinely runs on both pages and each page only owns
 * part of the markup.
 */

/* ===== Escaping ===== */
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
    if (!el) return;
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

function getBreastNames() {
    return {
        left: localStorage.getItem(BREAST_LEFT_KEY) || DEFAULT_LEFT_NAME,
        right: localStorage.getItem(BREAST_RIGHT_KEY) || DEFAULT_RIGHT_NAME,
    };
}

/* ===== Quick Add Visibility (per child, per device) ===== */
// Which quick add buttons -- and their matching summary cards -- a child shows
// on the dashboard. One entry per dashboard quick action; the single source of
// truth shared by the dashboard (which shows/hides buttons and cards from it)
// and the settings checkboxes (one toggle per entry). `key` is what gets
// stored; `modal`/`cardClass` are how the dashboard finds the markup.
const QUICK_ADD_TYPES = [
    { key: 'diaper',  label: 'Diaper',  modal: 'diaper-modal',  cardClass: 'card-diaper' },
    { key: 'feeding', label: 'Feeding', modal: 'feeding-modal', cardClass: 'card-feeding' },
    { key: 'health',  label: 'Health',  modal: 'health-modal',  cardClass: 'card-health' },
];
const QUICK_ADD_KEYS = QUICK_ADD_TYPES.map(t => t.key);
const QUICK_ADD_KEY_PREFIX = 'puffin-quick-add-';

function quickAddStorageKey(childId) {
    return `${QUICK_ADD_KEY_PREFIX}${childId}`;
}

/**
 * The quick add types enabled for a child, as an array of keys in registry
 * order.
 *
 * Visibility is per device, stored in localStorage keyed by child id. A
 * missing, unparseable, non-array, or empty value all mean "everything
 * enabled" -- so existing children, and every install that upgrades, see no
 * change until something is explicitly turned off. Only a concrete child is
 * ever filtered: the whole-install and unassigned views pass childId null and
 * always get the full set.
 */
function getEnabledQuickAddTypes(childId) {
    if (typeof childId !== 'number') return [...QUICK_ADD_KEYS];
    const raw = localStorage.getItem(quickAddStorageKey(childId));
    if (!raw) return [...QUICK_ADD_KEYS];
    let stored;
    try {
        stored = JSON.parse(raw);
    } catch (err) {
        console.error('Discarding corrupt quick-add visibility:', err);
        return [...QUICK_ADD_KEYS];
    }
    if (!Array.isArray(stored)) return [...QUICK_ADD_KEYS];
    // Filter through the registry so order is stable and any unknown key (a
    // type since renamed or removed) can't drive the UI. An empty result --
    // nothing recognised -- falls back to all-on rather than an empty dashboard.
    const enabled = QUICK_ADD_KEYS.filter(k => stored.includes(k));
    return enabled.length ? enabled : [...QUICK_ADD_KEYS];
}

function setEnabledQuickAddTypes(childId, keys) {
    const enabled = QUICK_ADD_KEYS.filter(k => keys.includes(k));
    // Never persist an empty set. The settings UI already blocks unchecking the
    // last type, but a stray empty write would read back as "all enabled" and
    // silently re-enable everything on the next load, so refuse it here too.
    if (!enabled.length) return;
    localStorage.setItem(quickAddStorageKey(childId), JSON.stringify(enabled));
}

function clearQuickAddTypes(childId) {
    localStorage.removeItem(quickAddStorageKey(childId));
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

/**
 * What to re-render after child data changes, beyond the pieces both pages
 * share. The dashboard refreshes its export options and timeline; the settings
 * page has neither and leaves this as the no-op.
 */
let onChildDataChanged = () => {};

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

function selectedChildName() {
    const match = childProfiles.find(c => c.id === selectedChild);
    return match ? match.name : null;
}

/* --- Dashboard-owned child chrome (absent on /settings) --- */

function renderChildSwitcher() {
    const section = document.getElementById('child-switcher-section');
    const select = document.getElementById('child-switcher');
    if (!section || !select) return;
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

function renderChildHeader() {
    const title = document.getElementById('child-log-title');
    const bar = document.getElementById('unassigned-bar');
    if (!title || !bar) return;
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
    onChildDataChanged();
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
    // The profile already exists server-side, so a failure here must still
    // fall through to showing it -- otherwise the new child never appears, no
    // error is raised, and the user retries into a duplicate.  The migration
    // offer isn't lost: it can be made later from "Unassigned logs".
    if (isFirstProfile) {
        try {
            const { count } = await api.get('/api/children/unassigned');
            if (count > 0) {
                offerMigration(created, count);
                return;
            }
        } catch (err) {
            console.error('Failed to check for unassigned logs:', err);
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

/* --- Settings: the Children section (absent on the dashboard) --- */

function renderChildList() {
    const container = document.getElementById('child-list');
    if (!container) return;
    if (!hasProfiles()) {
        container.innerHTML = '<p class="empty-state">No children yet.</p>';
        return;
    }
    container.innerHTML = childProfiles.map(c => `
        <div class="child-row" data-child-row="${c.id}">
            <span class="child-row-name">${escapeHtml(c.name)}</span>
            <button type="button" class="btn btn-sm btn-secondary" data-child-rename="${c.id}">Rename</button>
            <button type="button" class="btn btn-sm btn-danger" data-child-delete="${c.id}">Delete</button>
            ${quickAddTogglesHtml(c.id)}
        </div>`).join('');
}

/**
 * The per-child quick add checkboxes, rendered under the name/actions row.
 * Labels match the dashboard buttons exactly, so no heading is needed. The one
 * still-checked box is disabled when it's the last one, so the dashboard can
 * never be emptied of every quick action.
 */
function quickAddTogglesHtml(childId) {
    const enabled = getEnabledQuickAddTypes(childId);
    const toggles = QUICK_ADD_TYPES.map(t => {
        const checked = enabled.includes(t.key);
        const locked = checked && enabled.length === 1;
        return `<label class="quick-add-toggle">
            <input type="checkbox" data-quick-add="${childId}" value="${t.key}"
                   ${checked ? 'checked' : ''}${locked ? ' disabled' : ''}>
            ${t.label}
        </label>`;
    }).join('');
    return `<div class="quick-add-toggles" data-quick-add-row="${childId}">${toggles}</div>`;
}

/**
 * Persist a quick add toggle the instant it changes -- no Save press, matching
 * the surrounding add/rename/delete controls. Keeps the "at least one enabled"
 * rule enforced by disabling whichever box is the last one still checked.
 */
function persistQuickAddToggle(childId, changedBox) {
    const boxes = [...document.querySelectorAll(`[data-quick-add="${childId}"]`)];
    const checked = boxes.filter(b => b.checked);
    if (checked.length === 0) {
        // The last box is normally disabled, so reaching zero shouldn't happen;
        // restore it rather than persist an empty (which reads back as all-on).
        changedBox.checked = true;
        showToast('At least one type must be enabled');
        return;
    }
    setEnabledQuickAddTypes(childId, checked.map(b => b.value));
    boxes.forEach(b => { b.disabled = b.checked && checked.length === 1; });
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
                // The child's per-device visibility prefs die with the profile,
                // so a recycled id can't inherit a deleted child's toggles.
                clearQuickAddTypes(childId);
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

/** Wires the Children section. Only the settings page has this markup. */
function initChildSettings() {
    document.getElementById('child-add-btn').addEventListener('click', addChild);
    document.getElementById('child-new-name').addEventListener('keydown', (e) => {
        // The Children section lives inside the settings form; Enter here must
        // add a child, not submit (and save) the whole settings form.
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

    // Quick add checkboxes autosave on toggle. They fire `change`, which the
    // click handler above never sees; and they deliberately stay out of the
    // Save-armed preferences, since they persist on their own like the rest of
    // the Children section.
    document.getElementById('child-list').addEventListener('change', (e) => {
        const box = e.target;
        if (box.matches && box.matches('input[data-quick-add]')) {
            persistQuickAddToggle(parseInt(box.dataset.quickAdd, 10), box);
        }
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
    if (!btn) return;
    const theme = document.documentElement.getAttribute('data-theme');
    const isDark = theme === 'dark' ||
        (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    btn.textContent = isDark ? '☀️' : '🌙';
}

/* ===== Modals ===== */
// The generic open/close both pages need. The dashboard's modals also prime
// and reset their own contents; it registers that through these hooks rather
// than teaching the shared layer about feeding, diaper, and health markup that
// only exists on one page.
let onModalOpen = () => {};
let onModalClose = () => {};

function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
    onModalOpen(id);
}

function closeModal(id) {
    const modal = document.getElementById(id);
    modal.classList.add('hidden');
    // Reset forms inside the modal
    modal.querySelectorAll('form').forEach(f => {
        f.reset();
        f.querySelectorAll('button[type="submit"]').forEach(btn => { btn.disabled = false; });
    });
    // Clear selected buttons
    modal.querySelectorAll('.btn-option.selected').forEach(b => b.classList.remove('selected'));
    onModalClose(id);
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}
