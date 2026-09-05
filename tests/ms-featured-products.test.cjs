const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../sections/ms-featured-products.liquid'), 'utf8');
const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];

function element() {
  const attributes = new Map();
  const classes = new Set();
  return {
    hidden: false,
    inert: false,
    classes,
    classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) },
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: (key) => attributes.delete(key),
    getAttribute: (key) => attributes.get(key),
  };
}

function fixture(width, count) {
  let Component;
  const viewport = { width };
  vm.runInNewContext(script, {
    HTMLElement: class {},
    customElements: { get() {}, define(name, constructor) { Component = constructor; } },
    window: { matchMedia: (query) => ({ matches: viewport.width <= Number(query.match(/\d+/)[0]) }) },
  });
  const cards = Array.from({ length: count }, element);
  const panel = { ...element(), querySelectorAll: () => cards };
  const component = new Component();
  const rail = { scrollLeft: -120 };
  component.querySelector = () => rail;
  Object.assign(component, {
    panels: [panel],
    pageButtons: Array.from({ length: 6 }, element),
    previousButton: element(),
    nextButton: element(),
  });
  return { component, cards, viewport, rail };
}

for (const width of [768, 899, 900, 1199, 1200, 1440]) {
  for (const count of [0, 1, 2, 3, 5, 12]) {
    test(`${width}px, ${count} products: all pages are reachable with the correct preview`, () => {
      const { component, cards } = fixture(width, count);
      const size = width <= 899 ? 2 : width <= 1199 ? 3 : 4;
      const pages = Math.max(1, Math.ceil(count / size));
      const reached = new Set();
      for (let page = 0; page < pages; page++) {
        component.showPage(page);
        assert.equal(component.currentPage, page);
        cards.forEach((card, index) => {
          const active = index >= page * size && index < (page + 1) * size;
          const preview = width <= 767 && index === (page + 1) * size;
          assert.equal(card.hidden, !active && !preview);
          assert.equal(card.inert, preview);
          assert.equal(card.getAttribute('aria-hidden'), preview ? 'true' : undefined);
          if (active) reached.add(index);
        });
        assert.equal(component.pageButtons.filter(button => !button.hidden).length, pages);
        assert.equal(component.pageButtons[page].getAttribute('aria-current'), 'true');
        assert.equal(component.nextButton.disabled, pages === 1);
      }
      assert.equal(reached.size, count);
      component.showPage(pages);
      assert.equal(component.currentPage, 0);
      component.showPage(-1);
      assert.equal(component.currentPage, pages - 1);
    });
  }
}

for (const width of [320, 375, 390, 767]) {
  for (const count of [0, 1, 2, 3, 5, 12]) {
    test(`${width}px, ${count} products: mobile exposes the entire continuous rail`, () => {
      const { component, cards } = fixture(width, count);
      component.showPage(3);
      assert.equal(component.currentPage, 0);
      assert.equal(cards.filter(card => !card.hidden && !card.inert).length, count);
      assert.ok(cards.every(card => card.getAttribute('aria-hidden') === undefined));
      assert.ok(component.pageButtons.every(button => button.hidden));
      assert.equal(component.nextButton.disabled, true);
    });
  }
}

test('resizing switches between a continuous rail and desktop pages', () => {
  const { component, cards, viewport } = fixture(375, 12);
  component.showPage(0);
  assert.equal(cards.filter(card => !card.hidden).length, 12);
  viewport.width = 1440;
  component.showPage(0);
  assert.equal(cards.filter(card => !card.hidden).length, 4);
  assert.equal(cards[2].inert, false);
  assert.equal(cards[2].getAttribute('aria-hidden'), undefined);
  viewport.width = 390;
  component.showPage(0);
  assert.equal(cards.filter(card => !card.hidden && !card.inert).length, 12);
});

test('switching collections resets pagination and does not expose the previous panel', () => {
  const { component, rail } = fixture(375, 12);
  const nextCards = Array.from({ length: 5 }, element);
  component.panels[0].dataset = { msFeaturedPanel: 'first' };
  component.panels.push({ ...element(), hidden: true, dataset: { msFeaturedPanel: 'next' }, querySelectorAll: () => nextCards });
  component.tabs = ['first', 'next'].map(id => ({ ...element(), dataset: { msFeaturedTab: id } }));
  component.showPage(3);
  component.activate('next');
  assert.equal(component.currentPage, 0);
  assert.equal(component.panels[0].hidden, true);
  assert.equal(component.panels[1].hidden, false);
  assert.equal(nextCards.filter(card => !card.hidden && !card.inert).length, 5);
  assert.equal(component.pageButtons.filter(button => !button.hidden).length, 0);
  assert.equal(rail.scrollLeft, 0);
  assert.equal(component.panels[1].classes.has('is-entering'), true);
  assert.match(source, /@media \(prefers-reduced-motion: reduce\)/);
});
