import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createMockAudcore } from "./support/mock-audcore.mjs";

class Element {
    constructor() {
      this.children = [];
      this.attributes = {};
      this.events = {};
      this.style = { setProperty(name, value) { this[name] = value; } };
    }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    insertBefore(node, before) {
      if (node.parent) node.remove();
      node.parent = this;
      const index = before ? this.children.indexOf(before) : -1;
      this.children.splice(index < 0 ? this.children.length : index, 0, node);
    }
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    toggleAttribute(name, enabled) { if (enabled) this.setAttribute(name, ""); else this.removeAttribute(name); }
    get parentElement() { return this.parent; }
    closest(selector) {
      const attribute = selector.match(/^\[([\w-]+)\]$/)?.[1];
      if (!attribute) return null;
      if (this.getAttribute(attribute) !== null) return this;
      return this.parent?.closest(selector) ?? null;
    }
    focus() { if (globalThis.document) globalThis.document.activeElement = this; }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(type, handler) { this.events[type] = handler; }
    getBoundingClientRect() { return { left: 12, bottom: 34 }; }
}

// Exercise the actual page module without starting or controlling a GUI.

test("rack channels use the native palette and route title and performance actions to the host", async () => {
  const names = ["skin-root", "channels", "system-menu", "add-channel", "channel-list", "transport", "settings", "audio-status", "status", "toolbar", "window-drag", "window-minimize", "window-maximize", "window-close"];
  const nodes = Object.fromEntries(names.map(name => [name, new Element()]));
  const events = {};
  const windowEvents = {};
  const document = {
    hidden: false,
    documentElement: new Element(),
    getElementById: id => nodes[id],
    createElement: () => new Element(),
    addEventListener(type, handler) { events[type] = handler; },
    removeEventListener() {}
  };
  const channels = [
    { id: 7, color: null, rack: [], sends: [] },
    { id: 2, color: "#123456", rack: [], sends: [] }
  ];
  const mock = createMockAudcore({ graph: { chains: channels }, channels });
  let opened = 0;
  const settings = [];
  const host = {
    ...mock,
    menu: { ...mock.menu, async openChannelSettings(...args) { settings.push(args); } },
    performance: { async open() { opened++; } }
  };
  document.documentElement.setAttribute("data-skin", "rack");
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  try {
    globalThis.window = { audcore: host, addEventListener(type, handler) { windowEvents[type] = handler; }, removeEventListener() {} };
    globalThis.document = document;
    await import("../web/page.mjs?rack-color-and-performance-test");
    const title = nodes.channels.children[0].children.at(-1);
    assert.equal(title.type, "button");
    assert.equal(title.getAttribute("draggable"), "true");
    title.events.click();
    assert.deepEqual(settings, [[7, { chain_uuid: null, source_uuid: null }]]);
    windowEvents.keydown({ ctrlKey: true });
    assert.equal(nodes["skin-root"].getAttribute("data-adjust-modifier"), "");
    windowEvents.blur();
    assert.equal(nodes["skin-root"].getAttribute("data-adjust-modifier"), null);
    const colors = () => nodes.channels.children.map(node => node.style["--channel-color"]);
    assert.deepEqual(colors(), ["#f3ad50", "#123456"]);
    const updated = [channels[0], { ...channels[1], color: null }];
    mock.fixture.patch({ graph: { chains: updated }, channels: updated });
    assert.deepEqual(colors(), ["#f3ad50", "#33d69a"]);
    mock.fixture.patch({ channels: [updated[0], { ...updated[1], displayColor: "#123abc" }] });
    assert.deepEqual(colors(), ["#f3ad50", "#123abc"]);

    let prevented = 0;
    const event = { code: "Backquote", preventDefault() { prevented++; } };
    events.keydown({ ...event, ctrlKey: true });
    events.keydown({ ...event, isComposing: true });
    events.keydown(event);
    events.keydown({ ...event, repeat: true });
    assert.equal(opened, 1);
    assert.equal(prevented, 2);
  } finally { mock.close(); globalThis.window = previousWindow; globalThis.document = previousDocument; }
});

test("rack send drag adds only the chosen channel or eligible sidechain", async () => {
  const names = ["skin-root", "channels", "system-menu", "add-channel", "channel-list", "transport", "settings", "audio-status", "status", "toolbar", "window-drag", "window-minimize", "window-maximize", "window-close"];
  const nodes = Object.fromEntries(names.map(name => [name, new Element()]));
  const document = { hidden: false, documentElement: new Element(), getElementById: id => nodes[id], createElement: () => new Element(), addEventListener() {}, removeEventListener() {} };
  document.documentElement.setAttribute("data-skin", "rack");
  const channels = [
    { id: 1, chain_uuid: "source", rack: [{ instance: 10 }], sends: [] },
    { id: 2, rack: [{ instance: 20 }, { instance: 21 }, { instance: 22, offline: true }], sends: [] },
    { id: 3, rack: [{ instance: 30 }], sends: [{ dest: { kind: "sidechain", instance: 10 } }] },
    { id: 4, hidden: true, rack: [], sends: [] }
  ];
  const mock = createMockAudcore({ graph: { chains: channels, output_pairs: [] }, channels, sidechains: [10, 20, 22, 30] });
  const menuCalls = [];
  const host = { ...mock, menu: { ...mock.menu, async openAddSend(...args) { menuCalls.push(args); } } };
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  try {
    globalThis.window = { audcore: host, addEventListener() {}, removeEventListener() {} };
    globalThis.document = document;
    await import("../web/page.mjs?rack-send-drag-test");
    const [source, target, feedback, hidden] = nodes.channels.children;
    const [sidechain, noSidechain, offline] = target.children[1].children;
    const addSend = source.children[2].children.at(-1);
    const mark = node => node.getAttribute("data-send-target");
    const dataTransfer = { setData() {} };
    const start = () => addSend.events.dragstart({ dataTransfer });
    const over = node => {
      let accepted = false;
      nodes.channels.events.dragover({ target: { closest: () => node }, dataTransfer, preventDefault() { accepted = true; } });
      return accepted;
    };
    const drop = node => nodes.channels.events.drop({ target: { closest: () => node }, dataTransfer, preventDefault() {} });
    const sends = () => mock.fixture.snapshot().state.channels[0].sends.map(send => send.dest);
    addSend.events.click();
    assert.deepEqual(menuCalls, [[1, { x: 12, y: 34 }, { chain_uuid: "source", source_uuid: null }]]);
    start();
    assert.equal(dataTransfer.effectAllowed, "link");
    assert.deepEqual([source, target, sidechain, noSidechain, offline, feedback, feedback.children[1].children[0], hidden].map(mark),
      [null, "", "", null, null, null, null, null]);
    assert.equal(over(sidechain), true);
    assert.equal(sidechain.getAttribute("data-send-hover"), "");
    assert.equal(over(noSidechain), false);
    assert.equal(sidechain.getAttribute("data-send-hover"), null);
    drop(noSidechain);
    assert.deepEqual(sends(), []);

    start();
    assert.equal(over(target), true);
    drop(target);
    assert.deepEqual(sends(), [{ kind: "chain", id: 2 }]);
    assert.equal(mark(target), null);
    assert.equal(source.children[2].children.at(-1), addSend);
    start();
    assert.equal(mark(target), null);
    assert.equal(mark(sidechain), "");
    addSend.events.dragend();
    assert.equal(mark(sidechain), null);
    assert.equal(over(sidechain), false);
    start();
    mock.fixture.update("sidechains", []);
    assert.equal(mark(sidechain), null);
    assert.equal(over(sidechain), false);
    mock.fixture.update("effectInfo", { 20: { name: "Compressor", latencySamples: 0, hasSidechain: true, hasEditor: false } });
    const updatedSidechain = target.children[1].children[0];
    assert.equal(mark(updatedSidechain), null);
    mock.fixture.update("sidechains", null);
    assert.equal(mark(updatedSidechain), "");
    mock.fixture.update("sidechains", [20]);
    assert.equal(over(updatedSidechain), true);
    drop(updatedSidechain);
    assert.deepEqual(sends(), [{ kind: "chain", id: 2 }, { kind: "sidechain", instance: 20 }]);
    assert.equal(updatedSidechain.getAttribute("data-send-hover"), null);
    assert.equal(menuCalls.length, 1);
  } finally { mock.close(); globalThis.window = previousWindow; globalThis.document = previousDocument; }
});
