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

/* ===== Bottle Type ===== */
const BOTTLE_TYPE_KEY = 'puffin-bottle-type-default';
const DEFAULT_BOTTLE_TYPE = 'breastmilk';

function getDefaultBottleType() {
    return localStorage.getItem(BOTTLE_TYPE_KEY) || DEFAULT_BOTTLE_TYPE;
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
        document.getElementById('feeding-bottle-oz-timer').classList.add('hidden');
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
    const state = {
        active: true,
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
        loadDashboard();
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
        const feedings = await api.get('/api/feedings?limit=20');
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
    const bottleOzTimerGroup = document.getElementById('feeding-bottle-oz-timer');
    const bottleOzTimerInput = document.getElementById('feeding-bottle-oz-timer-input');
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
            // Bottle: hide timer toggle, show ounces, require a value, set button to Save
            if (timerToggleRow) timerToggleRow.classList.add('hidden');
            bottleOzTimerGroup.classList.remove('hidden');
            saveBtn.textContent = 'Save';
            const hasOz = !!bottleOzTimerInput.value;
            saveBtn.disabled = !hasOz;
        } else {
            // Breast: show timer toggle, hide ounces, enable Start
            if (timerToggleRow) timerToggleRow.classList.remove('hidden');
            bottleOzTimerGroup.classList.add('hidden');
            saveBtn.textContent = 'Start';
            saveBtn.disabled = false;
        }
    }

    function updateManualBtnState() {
        const l = document.getElementById('feeding-left-duration').value;
        const r = document.getElementById('feeding-right-duration').value;
        const b = document.getElementById('feeding-bottle-oz').value;
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

    // Recompute when ounces entered in timer mode
    bottleOzTimerInput.addEventListener('input', updateTimerBtnState);

    // Manual mode: enable save when any field is entered
    ['feeding-left-duration', 'feeding-right-duration', 'feeding-bottle-oz'].forEach(id => {
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
            await api.post('/api/diapers', { type, notes, timestamp });
            closeModal('diaper-modal');
            showToast('Diaper change logged!');
            loadDashboard();
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
                const oz = document.getElementById('feeding-bottle-oz-timer-input').value;
                if (!oz) { showToast('Please enter ounces'); return; }
                const bottleType = document.getElementById('feeding-bottle-type-timer-select').value;
                saveBtn.disabled = true;
                try {
                    await api.post('/api/feedings', {
                        feeding_type: 'bottle',
                        amount_oz: parseFloat(oz),
                        bottle_type: bottleType,
                        notes,
                        timestamp,
                    });
                    closeModal('feeding-modal');
                    showToast('Feeding logged!');
                    loadDashboard();
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
        const bottleOz = document.getElementById('feeding-bottle-oz').value;

        if (!leftDur && !rightDur && !bottleOz) {
            showToast('Please enter at least one value');
            return;
        }

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
                };
                if (manualSessionId) body.session_id = manualSessionId;
                promises.push(api.post('/api/feedings', body));
                notesAttached = true;
            }
            if (bottleOz) {
                const bottleType = document.getElementById('feeding-bottle-type-manual-select').value;
                promises.push(api.post('/api/feedings', {
                    feeding_type: 'bottle',
                    amount_oz: parseFloat(bottleOz),
                    bottle_type: bottleType,
                    notes: notesAttached ? undefined : notes,
                    timestamp,
                }));
            }
            await Promise.all(promises);
            closeModal('feeding-modal');
            showToast('Feeding logged!');
            loadDashboard();
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
            await api.post('/api/medications', { medication_name: name, dosage_quantity, dosage_unit, notes, timestamp });
            closeModal('health-modal');
            showToast('Medication logged!');
            loadDashboard();
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
            });
            closeModal('health-modal');
            showToast('Temperature logged!');
            loadDashboard();
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
    switch (type) {
        case 'diaper': return buildDiaperEditFields(data);
        case 'feeding': return buildFeedingEditFields(data, secondaryData);
        case 'medication': return buildMedicationEditFields(data);
        case 'temperature': return buildTemperatureEditFields(data);
    }
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
            <label for="edit-amount-oz">Amount (oz)</label>
            <input type="number" id="edit-amount-oz" min="0.01" max="12.00" step="0.01" value="${data.amount_oz || ''}">
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

    switch (type) {
        case 'diaper':
            body.type = document.getElementById('edit-diaper-type').value;
            break;
        case 'feeding': {
            body.feeding_type = document.getElementById('edit-feeding-type').value;
            if (body.feeding_type === 'bottle') {
                const oz = document.getElementById('edit-amount-oz').value;
                if (oz) body.amount_oz = parseFloat(oz);
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

            // Toggle duration vs ounces/bottle-type for feeding edits
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
                await api.put(endpoints[type], buildEditBody(type));
            }
            closeModal('edit-modal');
            showToast('Updated!');
            loadDashboard();
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
            loadDashboard();
        } catch (err) {
            showToast('Error: ' + err.message);
        }
    });
}

/* ===== Calendar Day View ===== */
let currentDate = new Date();

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
        const activities = await api.get(`/api/activities?date=${dateStr}`);
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
        const data = await api.get(`/api/dashboard?date=${dateStr}`);

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
        openModal('settings-modal');
    });

    document.getElementById('settings-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const leftName = document.getElementById('settings-left-name').value.trim() || DEFAULT_LEFT_NAME;
        const rightName = document.getElementById('settings-right-name').value.trim() || DEFAULT_RIGHT_NAME;
        const bottleType = document.getElementById('settings-bottle-type').value;
        localStorage.setItem(BREAST_LEFT_KEY, leftName);
        localStorage.setItem(BREAST_RIGHT_KEY, rightName);
        localStorage.setItem(BOTTLE_TYPE_KEY, bottleType);
        closeModal('settings-modal');
        updateBreastLabels();
        updateBottleTypeLabels();
        if (getTimerState()) showTimerUI();
        showToast('Settings saved!');
    });
}

/* ===== Export Modal ===== */
function initExport() {
    document.getElementById('export-btn').addEventListener('click', () => {
        openModal('export-modal');
    });

    document.getElementById('export-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const fmt = document.getElementById('export-format').value || 'csv';
        const start = document.getElementById('export-start-date').value;
        const end = document.getElementById('export-end-date').value;

        let url = `/api/export?format=${encodeURIComponent(fmt)}`;
        if (start) url += `&start_date=${encodeURIComponent(start + 'T00:00:00')}`;
        if (end) url += `&end_date=${encodeURIComponent(end + 'T23:59:59')}`;

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
    updateBreastLabels();
    updateBottleTypeLabels();
    loadDashboard();

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // Quick action buttons → open modals
    document.querySelectorAll('[data-modal]').forEach(btn => {
        btn.addEventListener('click', () => openModal(btn.dataset.modal));
    });

    // Close modal via backdrop or cancel button
    document.querySelectorAll('.modal-backdrop').forEach(el => {
        el.addEventListener('click', closeAllModals);
    });
    document.querySelectorAll('.modal-close').forEach(el => {
        el.addEventListener('click', () => {
            const modal = el.closest('.modal');
            if (modal) closeModal(modal.id);
        });
    });

    // Auto-refresh dashboard every 60 seconds
    setInterval(loadDashboard, 60000);
});
