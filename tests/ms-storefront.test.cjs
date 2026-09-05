const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const css = read('assets/ms-storefront.css');
const colors = read('snippets/ms-storefront-colors.liquid');

test('shared theme loads brand styles only outside the homepage', () => {
  const layout = read('layout/theme.liquid');
  assert.match(layout, /unless request.page_type == 'index'[\s\S]*?render 'ms-storefront-colors'[\s\S]*?'ms-storefront.css'[\s\S]*?endunless/);
  assert.ok(layout.indexOf("'ms-global-font.css'") < layout.indexOf("'ms-storefront.css'"));
});

test('password layout also loads the shared font and palette', () => {
  const layout = read('layout/password.liquid');
  for (const asset of ['ms-global-font.css', 'ms-storefront-colors', 'ms-storefront.css']) {
    assert.ok(layout.includes(asset));
  }
});

test('every style rule is scoped away from the homepage', () => {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of clean.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1].trim();
    if (selector.startsWith('@media')) continue;
    assert.ok(selector.startsWith('body:not(.hdt-page-type-index)'), selector);
  }
});

test('palette keeps existing light text schemes readable', () => {
  assert.match(colors, /for scheme in settings.color_schemes/);
  assert.match(colors, /scheme.settings.text \| color_brightness/);
  assert.match(colors, /if text_brightness > 186/);
  assert.match(colors, /--ms-page-heading: #fff/);
  assert.match(colors, /--ms-page-heading: #1f423d/);
  assert.match(colors, /:where\(\[color-scheme=/);
});

test('buttons use brand tokens without changing layouts or busy behavior', () => {
  assert.match(css, /--hdt-btn-bg: 27 77 46/);
  assert.match(css, /--hdt-btn-hover-bg: 20 60 36/);
  assert.match(css, /--color-accent: var\(--hdt-link-color\)/);
  assert.match(css, /\.shopify-payment-button__button--unbranded/);
  assert.doesNotMatch(css, /!important|pointer-events:|display:|position:|\.shopify-payment-button__button--branded/);
});

test('header and footer use matching font sizes with responsive headings', () => {
  assert.match(css, /\.hdt-header-menu-mobile \.hdt-menu-link \{\s*font-size: 14px/);
  assert.match(css, /\.hdt-footer-heading-text \{\s*color: #fff;\s*font-size: 14px/);
  assert.match(css, /\.hdt-menu-list a \{[^}]*font-size: 13px/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*font-size: 22px/);
});
