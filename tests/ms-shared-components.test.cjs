const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const json = name => JSON.parse(read(name).replace(/^\/\*[\s\S]*?\*\//, ''));

test('one shared header and footer surround the content on all theme pages', () => {
  const layout = read('layout/theme.liquid');
  assert.equal((layout.match(/sections 'ms-header-group'/g) || []).length, 1);
  assert.equal((layout.match(/sections 'ms-footer-group'/g) || []).length, 1);
  assert.ok(layout.indexOf("sections 'ms-header-group'") < layout.indexOf('<main'));
  assert.ok(layout.indexOf("sections 'ms-footer-group'") > layout.indexOf('</main>'));
  assert.doesNotMatch(layout, /sections '(?:header|footer)-group'/);
  assert.match(layout, /class="ms-storefront hdt-page-type-/);
  const home = json('templates/index.json');
  assert.ok(Object.values(home.sections).every(section => !['ms-header', 'ms-footer', 'ms-announcement'].includes(section.type)));
  assert.ok(home.order.every(id => home.sections[id]));
});

test('shared groups keep the homepage settings and valid section types', () => {
  const header = json('sections/ms-header-group.json');
  const footer = json('sections/ms-footer-group.json');
  assert.equal(header.type, 'header');
  assert.equal(footer.type, 'footer');
  assert.deepEqual(header.order, ['ms_announcement', 'ms_header']);
  assert.equal(header.sections.ms_header.settings.search_placeholder, 'البحث');
  assert.match(footer.sections.ms_footer.settings.description, /محاشي طازجة/);
  for (const group of [header, footer]) {
    for (const id of group.order) assert.ok(fs.existsSync(path.join(__dirname, '../sections', group.sections[id].type + '.liquid')));
  }
});

test('every legacy grid/list card entry point delegates to the shared card', () => {
  const files = fs.readdirSync(path.join(__dirname, '../snippets')).filter(name => /^card-product(\d+|-list|-discount\d+|-placeholder|-list-placeholder)\.liquid$/.test(name));
  assert.equal(files.length, 18);
  for (const file of files) {
    assert.match(read('snippets/' + file), /^\{%- if request.page_type != 'index' -%\}\s*\{%- render 'ms-theme-product-card'/);
  }
  const adapter = read('snippets/ms-theme-product-card.liquid');
  assert.match(adapter, /hdt-card-product \{\{ class \}\}/);
  assert.match(adapter, /render 'ms-product-card'/);
  assert.match(adapter, /choose_options: true/);
});

test('shared cards retain form, sold-out and variant-selection behavior', () => {
  const card = read('snippets/ms-product-card.liquid');
  assert.match(card, /form 'product', card_product, id: card_form_id/);
  assert.match(card, /<wrapp-hdt-pr-frm/);
  assert.match(card, /name="id" value="\{\{ card_variant.id \}\}"/);
  assert.match(card, /card_product.has_only_default_variant == false/);
  assert.match(card, /products.product.choose_options/);
  assert.match(card, /unless card_variant.available %}disabled/);
});

test('shared responsiveness is no longer homepage-only', () => {
  const css = read('assets/ms-home.css');
  assert.match(css, /\.ms-storefront \.ms-footer__top/);
  assert.match(css, /\.ms-storefront \.ms-header__bar/);
  assert.match(css, /\.ms-storefront \.ms-product-card__body/);
  assert.match(read('assets/ms-shared-components.css'), /\.ms-theme-card > \.ms-product-card \{\s*width: 100%/);
});
