/* ===== API Client ===== */
const api = {
    async request(method, url, body = null) {
        const opts = { method, headers: { 'Content-Type': 'application/json' } };
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
    }
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
    // Reset forms inside the modal
    const forms = document.getElementById(id).querySelectorAll('form');
    forms.forEach(f => f.reset());
    // Clear selected buttons
    document.getElementById(id).querySelectorAll('.btn-option.selected').forEach(b => b.classList.remove('selected'));
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
    if (!state || !state.active) return;

    const current = state.segments[state.segments.length - 1];
    const now = new Date().toISOString();
    current.endTime = now;

    const newSide = current.side === 'breast_left' ? 'breast_right' : 'breast_left';
    state.segments.push({ side: newSide, startTime: now, endTime: null });

    localStorage.setItem(TIMER_KEY, JSON.stringify(state));
    showTimerUI();

    const sideLabel = newSide === 'breast_left' ? 'Left' : 'Right';
    showToast(`Switched to ${sideLabel}`);
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
    const canSwitch = currentSide === 'breast_left' || currentSide === 'breast_right';

    const sideLabels = {
        breast_left: 'Left Breast',
        breast_right: 'Right Breast',
        breast_both: 'Both Breasts',
        bottle: 'Bottle',
    };
    document.getElementById('timer-side').textContent = sideLabels[currentSide] || currentSide;

    // Show/hide switch button
    const switchBtn = document.getElementById('timer-switch-btn');
    if (canSwitch) {
        switchBtn.classList.remove('hidden');
        const otherLabel = currentSide === 'breast_left' ? 'Right' : 'Left';
        switchBtn.textContent = `Switch to ${otherLabel}`;
    } else {
        switchBtn.classList.add('hidden');
    }

    // Reset end/confirm UI
    document.getElementById('timer-end-btn').classList.remove('hidden');
    document.getElementById('timer-confirm-btn').classList.add('hidden');
    document.getElementById('timer-cancel-btn').classList.add('hidden');

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
        if (canSwitch) {
            const bt = getBreastTimes(state.segments);
            breastTimesEl.innerHTML =
                `<span class="${currentSide === 'breast_left' ? 'active-breast' : ''}">L: ${formatDurationShort(bt.breast_left)}</span>` +
                `<span class="breast-sep">•</span>` +
                `<span class="${currentSide === 'breast_right' ? 'active-breast' : ''}">R: ${formatDurationShort(bt.breast_right)}</span>`;
            breastTimesEl.classList.remove('hidden');
        } else {
            breastTimesEl.classList.add('hidden');
        }
    }

    updateDisplay();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateDisplay, 1000);
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

    try {
        // Save one entry per breast used
        const promises = [];
        for (const [side, totalMs] of Object.entries(totals)) {
            if (totalMs < 1000) continue; // Skip segments shorter than 1s
            const durationMinutes = Math.max(1, Math.round(totalMs / 60000));
            promises.push(api.post('/api/feedings', {
                timestamp: starts[side],
                feeding_type: side,
                duration_minutes: durationMinutes,
            }));
        }
        await Promise.all(promises);

        localStorage.removeItem(TIMER_KEY);
        showTimerUI();

        // Build toast message
        const sides = Object.entries(totals).filter(([, ms]) => ms >= 1000);
        const sideLabels = { breast_left: 'Left', breast_right: 'Right', breast_both: 'Both' };
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
        showToast('Error saving feeding: ' + e.message);
    }
}

function initTimer() {
    showTimerUI();

    document.getElementById('timer-switch-btn').addEventListener('click', switchBreast);

    document.getElementById('timer-end-btn').addEventListener('click', () => {
        // Two-step confirmation — hide switch too
        document.getElementById('timer-end-btn').classList.add('hidden');
        document.getElementById('timer-switch-btn').classList.add('hidden');
        document.getElementById('timer-confirm-btn').classList.remove('hidden');
        document.getElementById('timer-cancel-btn').classList.remove('hidden');
    });

    document.getElementById('timer-confirm-btn').addEventListener('click', () => {
        endTimer();
    });

    document.getElementById('timer-cancel-btn').addEventListener('click', () => {
        document.getElementById('timer-end-btn').classList.remove('hidden');
        // Re-show switch button if applicable
        const state = getTimerState();
        if (state) {
            const currentSide = state.segments[state.segments.length - 1].side;
            if (currentSide === 'breast_left' || currentSide === 'breast_right') {
                document.getElementById('timer-switch-btn').classList.remove('hidden');
            }
        }
        document.getElementById('timer-confirm-btn').classList.add('hidden');
        document.getElementById('timer-cancel-btn').classList.add('hidden');
    });
}

/* ===== Last Feeding Info ===== */
async function loadLastBreastFeeding() {
    const infoEl = document.getElementById('last-feeding-info');
    try {
        const feedings = await api.get('/api/feedings?limit=20');
        const now = Date.now();
        let lastLeft = null, lastRight = null;
        for (const f of feedings) {
            // Skip future-dated entries (e.g. from seed data)
            if (new Date(f.timestamp).getTime() > now) continue;
            if (!lastLeft && f.feeding_type === 'breast_left') lastLeft = f;
            if (!lastRight && f.feeding_type === 'breast_right') lastRight = f;
            if (lastLeft && lastRight) break;
        }

        if (!lastLeft && !lastRight) {
            infoEl.classList.add('hidden');
            return;
        }

        const parts = [];
        if (lastLeft) parts.push(`L: ${lastLeft.duration_minutes || '?'}min`);
        if (lastRight) parts.push(`R: ${lastRight.duration_minutes || '?'}min`);

        const mostRecent = lastLeft && lastRight
            ? (new Date(lastLeft.timestamp) > new Date(lastRight.timestamp) ? lastLeft : lastRight)
            : (lastLeft || lastRight);

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

/* ===== Form Submissions ===== */
function initForms() {
    // Diaper form
    document.getElementById('diaper-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = document.getElementById('diaper-type').value;
        if (!type) { showToast('Please select a diaper type'); return; }
        const notes = document.getElementById('diaper-notes').value || undefined;
        try {
            await api.post('/api/diapers', { type, notes });
            closeModal('diaper-modal');
            showToast('Diaper change logged!');
            loadDashboard();
        } catch (err) {
            showToast('Error: ' + err.message);
        }
    });

    // Feeding form
    document.getElementById('feeding-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const useTimer = document.getElementById('start-timer').checked;
        const notes = document.getElementById('feeding-notes').value || undefined;

        if (useTimer) {
            // Timer mode — bottle becomes a quick log (no timer), breast starts timer
            const feedingType = document.getElementById('feeding-type').value;
            if (!feedingType) { showToast('Please select a feeding type'); return; }

            if (feedingType === 'bottle') {
                const oz = document.getElementById('feeding-bottle-oz-timer-input').value;
                if (!oz) { showToast('Please enter ounces'); return; }
                try {
                    await api.post('/api/feedings', {
                        feeding_type: 'bottle',
                        amount_oz: parseFloat(oz),
                        notes,
                    });
                    closeModal('feeding-modal');
                    showToast('Feeding logged!');
                    loadDashboard();
                } catch (err) {
                    showToast('Error: ' + err.message);
                }
                return;
            }

            // Breast: start timer
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

        try {
            const promises = [];
            let notesAttached = false;
            if (leftDur) {
                promises.push(api.post('/api/feedings', {
                    feeding_type: 'breast_left',
                    duration_minutes: parseInt(leftDur),
                    notes: notesAttached ? undefined : notes,
                }));
                notesAttached = true;
            }
            if (rightDur) {
                promises.push(api.post('/api/feedings', {
                    feeding_type: 'breast_right',
                    duration_minutes: parseInt(rightDur),
                    notes: notesAttached ? undefined : notes,
                }));
                notesAttached = true;
            }
            if (bottleOz) {
                promises.push(api.post('/api/feedings', {
                    feeding_type: 'bottle',
                    amount_oz: parseFloat(bottleOz),
                    notes: notesAttached ? undefined : notes,
                }));
            }
            await Promise.all(promises);
            closeModal('feeding-modal');
            showToast('Feeding logged!');
            loadDashboard();
        } catch (err) {
            showToast('Error: ' + err.message);
        }
    });

    // Medication form
    document.getElementById('medication-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('med-name').value;
        const dosage = document.getElementById('med-dosage').value;
        const notes = document.getElementById('med-notes').value || undefined;
        try {
            await api.post('/api/medications', { medication_name: name, dosage, notes });
            closeModal('health-modal');
            showToast('Medication logged!');
            loadDashboard();
        } catch (err) {
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

        // Convert F to C if needed
        if (unit === 'f') {
            tempValue = (tempValue - 32) * 5 / 9;
        }

        try {
            await api.post('/api/temperatures', {
                temperature_celsius: Math.round(tempValue * 10) / 10,
                location,
                notes,
            });
            closeModal('health-modal');
            showToast('Temperature logged!');
            loadDashboard();
        } catch (err) {
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

async function openEditModal(type, id) {
    const endpoints = {
        diaper: `/api/diapers/${id}`,
        feeding: `/api/feedings/${id}`,
        medication: `/api/medications/${id}`,
        temperature: `/api/temperatures/${id}`,
    };
    try {
        const data = await api.get(endpoints[type]);
        const titles = {
            diaper: 'Edit Diaper Change',
            feeding: 'Edit Feeding',
            medication: 'Edit Medication',
            temperature: 'Edit Temperature',
        };
        document.getElementById('edit-modal-title').textContent = titles[type];
        document.getElementById('edit-form-fields').innerHTML = buildEditFields(type, data);
        document.getElementById('edit-form').dataset.editType = type;
        document.getElementById('edit-form').dataset.editId = id;
        initEditOptionButtons();
        openModal('edit-modal');
    } catch (err) {
        showToast('Error loading record: ' + err.message);
    }
}

function buildEditFields(type, data) {
    switch (type) {
        case 'diaper': return buildDiaperEditFields(data);
        case 'feeding': return buildFeedingEditFields(data);
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

function buildFeedingEditFields(data) {
    const isBottle = data.feeding_type === 'bottle';
    const showBoth = data.feeding_type === 'breast_both';
    return `
        <div class="form-group">
            <label>Type</label>
            <div class="btn-group">
                <button type="button" class="btn btn-option ${data.feeding_type === 'breast_left' ? 'selected' : ''}" data-value="breast_left" data-field="edit-feeding-type">🤱 Left</button>
                <button type="button" class="btn btn-option ${data.feeding_type === 'breast_right' ? 'selected' : ''}" data-value="breast_right" data-field="edit-feeding-type">🤱 Right</button>
                ${showBoth ? '<button type="button" class="btn btn-option selected" data-value="breast_both" data-field="edit-feeding-type">🤱 Both</button>' : ''}
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
            <input type="number" id="edit-amount-oz" min="0.5" max="12" step="0.5" value="${data.amount_oz || ''}">
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
    return `
        <div class="form-group">
            <label for="edit-med-name">Medication Name</label>
            <input type="text" id="edit-med-name" value="${escapeAttr(data.medication_name)}" required>
        </div>
        <div class="form-group">
            <label for="edit-med-dosage">Dosage</label>
            <input type="text" id="edit-med-dosage" value="${escapeAttr(data.dosage)}" required>
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
    if (timestamp) body.timestamp = new Date(timestamp).toISOString();
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
            } else {
                const dur = document.getElementById('edit-duration').value;
                if (dur) body.duration_minutes = parseInt(dur);
            }
            break;
        }
        case 'medication':
            body.medication_name = document.getElementById('edit-med-name').value;
            body.dosage = document.getElementById('edit-med-dosage').value;
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

            // Toggle duration vs ounces for feeding edits
            if (field === 'edit-feeding-type') {
                const durGroup = document.getElementById('edit-duration-group');
                const ozGroup = document.getElementById('edit-oz-group');
                if (durGroup && ozGroup) {
                    durGroup.style.display = value === 'bottle' ? 'none' : '';
                    ozGroup.style.display = value === 'bottle' ? '' : 'none';
                }
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
            await api.put(endpoints[type], buildEditBody(type));
            closeModal('edit-modal');
            showToast('Updated!');
            loadDashboard();
        } catch (err) {
            showToast('Error: ' + err.message);
        }
    });

    document.getElementById('edit-delete-btn').addEventListener('click', async () => {
        if (!confirm('Delete this entry?')) return;
        const form = document.getElementById('edit-form');
        const type = form.dataset.editType;
        const id = form.dataset.editId;
        const endpoints = {
            diaper: `/api/diapers/${id}`,
            feeding: `/api/feedings/${id}`,
            medication: `/api/medications/${id}`,
            temperature: `/api/temperatures/${id}`,
        };
        try {
            await api.del(endpoints[type]);
            closeModal('edit-modal');
            showToast('Deleted!');
            loadDashboard();
        } catch (err) {
            showToast('Error: ' + err.message);
        }
    });
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
        const data = await api.get('/api/dashboard');

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

        // Timeline — grouped by date
        const timeline = document.getElementById('timeline');
        if (data.recent_activities.length === 0) {
            timeline.innerHTML = '<p class="empty-state">No activities yet today.</p>';
            return;
        }

        // Group by date
        const groups = {};
        for (const a of data.recent_activities) {
            const dateKey = new Date(a.timestamp).toLocaleDateString();
            if (!groups[dateKey]) groups[dateKey] = [];
            groups[dateKey].push(a);
        }

        const today = new Date().toLocaleDateString();
        const yesterday = new Date(Date.now() - 86400000).toLocaleDateString();

        let html = '';
        for (const [dateKey, items] of Object.entries(groups)) {
            let label;
            if (dateKey === today) label = 'Today';
            else if (dateKey === yesterday) label = 'Yesterday';
            else {
                const d = new Date(items[0].timestamp);
                label = d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
            }
            html += `<div class="timeline-date">${escapeHtml(label)}</div>`;
            html += items.map(a => `
                <div class="timeline-item" onclick="openEditModal('${a.type}', ${a.id})">
                    <span class="timeline-emoji">${a.emoji || ''}</span>
                    <span class="timeline-label">${escapeHtml(a.label || a.summary)}</span>
                    ${a.detail ? `<span class="timeline-detail">${escapeHtml(a.detail)}</span>` : ''}
                    <span class="timeline-time">${formatTime(a.timestamp)}</span>
                    ${a.notes ? `<div class="timeline-notes">${escapeHtml(a.notes)}</div>` : ''}
                </div>
            `).join('');
        }
        timeline.innerHTML = html;
    } catch (err) {
        console.error('Failed to load dashboard:', err);
    }
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

/* ===== Event Listeners ===== */
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initOptionButtons();
    initTabs();
    initTimer();
    initFeedingForm();
    initForms();
    initEditForm();
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
