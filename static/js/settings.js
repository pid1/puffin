/*
 * The /settings page.
 *
 * Loads after common.js, which supplies the API client, toasts, theme, modal
 * plumbing, and the whole child-profile subsystem (including the Children
 * section's add/rename/delete).
 *
 * Two save models coexist here, deliberately:
 *   - Children are server-backed and apply immediately.
 *   - Breast names and feeding defaults are per-device preferences held in
 *     localStorage, and only persist when Save is pressed.
 * Save therefore tracks only the second group.
 */

/* ===== Preferences form ===== */

// The deferred fields. Editing any of these arms Save; the Children controls
// deliberately do not, since they have already persisted on their own.
const PREF_FIELD_IDS = [
    'settings-left-name',
    'settings-right-name',
    'settings-bottle-type',
    'settings-bottle-unit',
];

function setSaveEnabled(enabled) {
    document.getElementById('settings-save-btn').disabled = !enabled;
}

/** Fills the preference inputs from localStorage. */
function hydrateSettingsForm() {
    const names = getBreastNames();
    document.getElementById('settings-left-name').value = names.left;
    document.getElementById('settings-right-name').value = names.right;
    document.getElementById('settings-bottle-type').value = getDefaultBottleType();
    document.getElementById('settings-bottle-unit').value = getDefaultBottleUnit();
}

function savePreferences() {
    const leftName = document.getElementById('settings-left-name').value.trim() || DEFAULT_LEFT_NAME;
    const rightName = document.getElementById('settings-right-name').value.trim() || DEFAULT_RIGHT_NAME;
    const bottleType = document.getElementById('settings-bottle-type').value;
    const bottleUnit = document.getElementById('settings-bottle-unit').value;
    localStorage.setItem(BREAST_LEFT_KEY, leftName);
    localStorage.setItem(BREAST_RIGHT_KEY, rightName);
    localStorage.setItem(BOTTLE_TYPE_KEY, bottleType);
    localStorage.setItem(BOTTLE_UNIT_KEY, bottleUnit);

    // An empty name falls back to the default, so reflect what was actually
    // stored rather than leaving the blank box the user typed.
    hydrateSettingsForm();
    // Nothing left unsaved. The dashboard picks these up on its next load.
    setSaveEnabled(false);
    showToast('Settings saved!');
}

function initSettingsForm() {
    hydrateSettingsForm();
    setSaveEnabled(false);

    for (const id of PREF_FIELD_IDS) {
        const el = document.getElementById(id);
        // `input` covers typing in the text fields; `change` covers the selects.
        el.addEventListener('input', () => setSaveEnabled(true));
        el.addEventListener('change', () => setSaveEnabled(true));
    }

    document.getElementById('settings-form').addEventListener('submit', (e) => {
        e.preventDefault();
        savePreferences();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initSettingsForm();
    initChildSettings();

    loadChildren().then(renderChildList);

    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // The only modal on this page is the two-step child confirmation, whose
    // backdrop is static by design; its buttons wire themselves in
    // showChildConfirm. Nothing else here opens a modal.
});
