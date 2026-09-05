const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../sections/ms-offers.liquid'), 'utf8');
const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];

class Element extends EventTarget {
  constructor() {
    super();
    this.attributes = new Map();
    this.dataset = {};
    this.hidden = false;
    this.classes = new Set();
    this.classList = { toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name) };
  }
  getAttribute(name) { return this.attributes.get(name); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  focus(options) { this.focusOptions = options; }
}

function fixture() {
  let Component;
  vm.runInNewContext(script, {
    HTMLElement: Element,
    AbortController,
    customElements: { get() {}, define(name, constructor) { Component = constructor; } },
  });
  const component = new Component();
  const tabs = [1, 2, 3].map(index => {
    const tab = new Element();
    tab.dataset.msOffersTab = String(index);
    tab.setAttribute('aria-selected', String(index === 3));
    return tab;
  });
  const panels = [1, 2, 3].map(index => {
    const panel = new Element();
    panel.dataset.msOffersPanel = String(index);
    panel.products = index === 2 ? [] : [`collection-${index}-product`];
    return panel;
  });
  const viewport = { scrollLeft: 0 };
  component.querySelector = () => viewport;
  component.querySelectorAll = selector => selector === '[data-ms-offers-tab]' ? tabs : panels;
  component.connectedCallback();
  return { component, tabs, panels, viewport };
}

test('initial selection preserves tab 3 and hides the other collections', () => {
  const { tabs, panels } = fixture();
  assert.deepEqual(panels.map(panel => panel.hidden), [true, true, false]);
  assert.deepEqual(tabs.map(tab => tab.tabIndex), [-1, -1, 0]);
});

test('clicking each tab swaps only its products without navigation or replacing the rail', () => {
  const { component, tabs, panels, viewport } = fixture();
  const originalProducts = panels.map(panel => panel.products);
  tabs.forEach((tab, index) => {
    viewport.scrollLeft = -256;
    tab.dispatchEvent(new Event('click'));
    assert.equal(panels[index].hidden, false);
    assert.equal(panels.filter(panel => !panel.hidden).length, 1);
    assert.equal(tab.getAttribute('aria-selected'), 'true');
    assert.equal(tab.classes.has('is-active'), true);
    assert.equal(viewport.scrollLeft, 0);
    assert.equal(component.viewport, viewport);
    panels.forEach((panel, panelIndex) => assert.equal(panel.products, originalProducts[panelIndex]));
  });
});

test('an empty collection remains selected instead of exposing another collection', () => {
  const { component, panels } = fixture();
  component.activate('2');
  assert.equal(panels[1].hidden, false);
  assert.deepEqual(panels[1].products, []);
  assert.equal(panels[0].hidden, true);
  assert.equal(panels[2].hidden, true);
});

test('keyboard navigation follows visual order, wraps, and keeps page scroll unchanged', () => {
  const { tabs, panels } = fixture();
  const key = (index, value, expected) => {
    const event = new Event('keydown', { cancelable: true });
    event.key = value;
    tabs[index].dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(panels[expected].hidden, false);
    assert.equal(tabs[expected].focusOptions.preventScroll, true);
  };
  key(2, 'ArrowRight', 0);
  key(0, 'ArrowLeft', 2);
  key(2, 'Home', 0);
  key(0, 'End', 2);
});

test('unknown tabs do not change the current panel', () => {
  const { component, panels } = fixture();
  component.activate('missing');
  assert.deepEqual(panels.map(panel => panel.hidden), [true, true, false]);
});

test('multiple Offers sections keep independent selection', () => {
  const first = fixture();
  const second = fixture();
  first.component.activate('1');
  assert.equal(first.panels[0].hidden, false);
  assert.equal(second.panels[2].hidden, false);
});

test('theme editor reconnection cleans up listeners and does not duplicate them', () => {
  const { component, tabs } = fixture();
  let calls = 0;
  const activate = component.activate.bind(component);
  component.activate = (...args) => { calls++; activate(...args); };
  component.connectedCallback();
  tabs[0].dispatchEvent(new Event('click'));
  assert.equal(calls, 1);
  component.disconnectedCallback();
  tabs[1].dispatchEvent(new Event('click'));
  assert.equal(calls, 1);
  component.connectedCallback();
  assert.equal(calls, 2);
  tabs[1].dispatchEvent(new Event('click'));
  assert.equal(calls, 3);
});

test('collection settings, legacy links, empty state and unique product forms are present', () => {
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*?){% endschema %}/)[1]);
  for (const index of [1, 2, 3]) {
    assert.equal(schema.settings.find(setting => setting.id === `tab_${index}_collection`).type, 'collection');
    assert.equal(schema.settings.find(setting => setting.id === `tab_${index}_link`).type, 'url');
  }
  assert.ok(schema.settings.find(setting => setting.id === 'empty_label'));
  assert.match(source, /collections\[legacy_handle\]/);
  assert.match(source, /for product in tab_collection\.products limit: 7/);
  assert.match(source, /append: section\.id \| append: '-' \| append: tab_index \| append: '-' \| append: product\.id/);
  const tablist = source.split('class="ms-offers__tabs"')[1].split('class="ms-offers__viewport')[0];
  assert.doesNotMatch(tablist, /<a\s|href=/);
  assert.match(tablist, /type="button"/);
});
