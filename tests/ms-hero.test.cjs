const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../sections/ms-hero.liquid'), 'utf8');
const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];

class Element {
  constructor() {
    this.listeners = new Map();
    this.attributes = new Map();
    this.classList = { toggle() {}, remove() {} };
    this.style = {};
    this.dataset = {};
  }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  fire(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name); }
  closest(selector) { return selector === '[data-ms-hero-dot]' && this.isDot ? this : null; }
  setPointerCapture(id) { this.captured = id; }
  hasPointerCapture(id) { return this.captured === id; }
  releasePointerCapture() { this.captured = null; }
}

function fixture() {
  let Component;
  vm.runInNewContext(script, {
    HTMLElement: Element,
    AbortController,
    customElements: { get() {}, define(name, constructor) { Component = constructor; } },
    document: new Element(),
    window: { matchMedia: () => ({ matches: false }), clearInterval() {} },
    requestAnimationFrame: callback => callback(),
    performance: { now: () => 1000 },
  });
  const hero = new Component();
  const track = new Element();
  const dots = [0, 1].map(index => {
    const dot = new Element();
    dot.isDot = true;
    dot.dataset.msHeroDot = String(index);
    return dot;
  });
  const slides = [0, 1].map(() => {
    const slide = new Element();
    slide.link = {};
    slide.querySelector = () => slide.link;
    return slide;
  });
  hero.querySelector = () => track;
  hero.querySelectorAll = selector => selector === '[data-ms-hero-slide]' ? slides : dots;
  hero.connectedCallback();
  return { hero, track, dots, slides };
}

for (const pointerType of ['mouse', 'touch', 'pen']) {
  test(`${pointerType}: dots retain their click target and select the requested slide`, () => {
    const { hero, track, dots, slides } = fixture();
    const pointer = { target: dots[1], isPrimary: true, pointerType, button: 0, pointerId: 1, clientX: 100, clientY: 100 };
    hero.fire('pointerdown', pointer);
    assert.equal(hero.captured, undefined, 'A dot must not be captured by its parent');
    assert.equal(hero.pointerStartX, null);
    hero.fire('pointerup', pointer);
    dots[1].fire('click');
    assert.equal(hero.currentIndex, 1);
    assert.equal(track.style.transform, 'translate3d(100%, 0, 0)');
    assert.equal(dots[1].getAttribute('aria-selected'), 'true');
    assert.equal(slides[1].getAttribute('aria-hidden'), 'false');
    assert.equal(slides[0].link.tabIndex, -1);
    dots[0].fire('click');
    assert.equal(hero.currentIndex, 0);
  });
}

test('LTR banner swipes still advance, with the resulting click suppressed', () => {
  const { hero } = fixture();
  const target = new Element();
  const pointer = { target, isPrimary: true, pointerType: 'touch', button: 0, pointerId: 2, clientX: 50, clientY: 100 };
  hero.fire('pointerdown', pointer);
  assert.equal(hero.captured, 2);
  hero.fire('pointerup', { ...pointer, clientX: 150 });
  assert.equal(hero.currentIndex, 1);
  assert.equal(hero.pointerStartX, null);
  let prevented = false;
  hero.fire('click', { preventDefault() { prevented = true; }, stopPropagation() {} });
  assert.equal(prevented, true);
});

test('vertical gestures do not change slides and keyboard navigation still works', () => {
  const { hero } = fixture();
  const pointer = { target: new Element(), isPrimary: true, pointerType: 'touch', button: 0, pointerId: 3, clientX: 50, clientY: 100 };
  hero.fire('pointerdown', pointer);
  hero.fire('pointerup', { ...pointer, clientX: 100, clientY: 200 });
  assert.equal(hero.currentIndex, 0);
  hero.fire('keydown', { key: 'ArrowRight', preventDefault() {} });
  assert.equal(hero.currentIndex, 1);
  hero.fire('keydown', { key: 'ArrowLeft', preventDefault() {} });
  assert.equal(hero.currentIndex, 0);
});
