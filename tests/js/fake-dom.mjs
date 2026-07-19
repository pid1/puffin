// A minimal DOM, hand-rolled to keep the test suite dependency-free.
//
// It implements only what the functions under test touch: getElementById
// returning stateful elements, and on those elements classList, textContent,
// innerHTML, value, disabled, and dataset. It is deliberately NOT a general
// DOM -- querySelectorAll and friends return empty defaults. If a newly
// covered function needs more, extend it here rather than reaching for jsdom.

class FakeClassList {
    constructor() {
        this._set = new Set();
    }
    add(...names) {
        names.forEach((n) => this._set.add(n));
    }
    remove(...names) {
        names.forEach((n) => this._set.delete(n));
    }
    contains(name) {
        return this._set.has(name);
    }
    toggle(name, force) {
        const shouldHave = force === undefined ? !this._set.has(name) : force;
        if (shouldHave) this._set.add(name);
        else this._set.delete(name);
        return shouldHave;
    }
    get value() {
        return [...this._set].join(' ');
    }
}

class FakeElement {
    constructor(id = null, tagName = 'DIV') {
        this.id = id;
        this.tagName = tagName;
        this.classList = new FakeClassList();
        this.dataset = {};
        this.style = {};
        this.textContent = '';
        this.innerHTML = '';
        this.value = '';
        this.disabled = false;
        this.children = [];
        this._listeners = [];
        this._removed = false;
    }
    addEventListener(type, fn) {
        this._listeners.push({ type, fn });
    }
    removeEventListener(type, fn) {
        this._listeners = this._listeners.filter((l) => l.type !== type || l.fn !== fn);
    }
    appendChild(child) {
        this.children.push(child);
        return child;
    }
    remove() {
        this._removed = true;
    }
    setAttribute(name, val) {
        if (name === 'class') this.classList = Object.assign(new FakeClassList(), { _set: new Set(String(val).split(/\s+/)) });
        else this[name] = val;
    }
    getAttribute(name) {
        return this[name];
    }
    closest() {
        return null;
    }
    querySelector() {
        return null;
    }
    querySelectorAll() {
        return [];
    }
    // A helper for tests: dispatch a recorded listener.
    _fire(type, event = {}) {
        this._listeners.filter((l) => l.type === type).forEach((l) => l.fn(event));
    }
}

export function createDocument() {
    const byId = new Map();
    const document = {
        // Elements are created on first reference and cached, so state written
        // by the code under test persists across getElementById calls.
        getElementById(id) {
            if (!byId.has(id)) byId.set(id, new FakeElement(id));
            return byId.get(id);
        },
        createElement(tag) {
            return new FakeElement(null, String(tag).toUpperCase());
        },
        addEventListener() {},
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
        },
        _elements: byId, // exposed for assertions
    };
    document.body = new FakeElement('body', 'BODY');
    return document;
}

export { FakeElement };
