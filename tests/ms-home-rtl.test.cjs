const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/ms-home.js'), 'utf8');
const instrumented = source.replace(/\}\)\(\);\s*$/, 'globalThis.rtl = { detectRtlScrollType, getLogicalScrollLeft, setLogicalScrollLeft, bindTouchRail }; })();');

for (const mode of ['negative', 'reverse', 'default']) {
  test(`RTL ${mode}: stable detection, caching and LTR advance`, () => {
    let probes = 0;
    let removed = 0;
    const document = {
      readyState: 'complete',
      querySelectorAll: () => [],
      addEventListener() {},
      body: { appendChild() { probes++; } },
      createElement() {
        let value = mode === 'default' ? 4 : 0;
        return {
          style: {},
          appendChild() {},
          remove() { removed++; },
          get scrollLeft() { return value; },
          set scrollLeft(next) { value = mode === 'negative' ? Math.min(0, next) : next; },
        };
      },
    };
    const context = { document, Element: class {} };
    vm.runInNewContext(instrumented, context);
    const rtl = context.rtl;
    assert.equal(rtl.detectRtlScrollType(), mode);
    assert.equal(rtl.detectRtlScrollType(), mode);
    assert.equal(probes, 1);
    assert.equal(removed, 1);

    const rail = { scrollWidth: 752, clientWidth: 390, scrollLeft: 0 };
    rtl.setLogicalScrollLeft(rail, mode, 0);
    const before = rtl.getLogicalScrollLeft(rail, mode);
    rtl.setLogicalScrollLeft(rail, mode, before + 140);
    assert.equal(rtl.getLogicalScrollLeft(rail, mode), 140);
    rtl.setLogicalScrollLeft(rail, mode, 1000);
    assert.equal(rtl.getLogicalScrollLeft(rail, mode), 362);
    rtl.setLogicalScrollLeft(rail, mode, -50);
    assert.equal(rtl.getLogicalScrollLeft(rail, mode), 0);
  });
}

for (const selector of ['.ms-best__viewport', '.ms-featured__products-viewport', '.ms-offers__viewport', '.ms-videos__viewport']) {
  test(`${selector}: mobile gestures are left to native momentum scrolling`, () => {
    const handlers = {};
    const rail = {
      scrollLeft: 0, scrollWidth: 1200, clientWidth: 390,
      classList: { add() {}, remove() {} },
      matches: selectors => selectors.includes(selector),
      addEventListener: (name, handler) => { handlers[name] = handler; },
    };
    const document = {
      readyState: 'complete', querySelectorAll: () => [], addEventListener() {},
      body: { appendChild() {} },
      createElement: () => ({ style: {}, appendChild() {}, remove() {}, scrollLeft: 0 }),
    };
    const context = { document, Element: class {}, window: { matchMedia: () => ({ matches: true }) }, performance: { now: () => 1000 } };
    vm.runInNewContext(instrumented, context);
    context.rtl.bindTouchRail(rail);
    let prevented = false;
    const event = x => ({ touches: [{ clientX: x, clientY: 40 }], cancelable: true, preventDefault() { prevented = true; } });
    handlers.touchstart(event(50));
    handlers.touchmove(event(170));
    handlers.touchend();
    assert.equal(prevented, false);
    assert.equal(rail.scrollLeft, 0, 'JavaScript must not overwrite native scroll position');
    assert.doesNotMatch(source, /PAGE_THRESHOLD|bindFeaturedPager|component\?\.showPage/);
  });
}
