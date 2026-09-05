(() => {
  const DRAG_THRESHOLD = 8;
  const PAGE_THRESHOLD = 42;
  const boundRails = new WeakSet();
  const boundPagers = new WeakSet();
  const railSelector = [
    '.ms-categories__viewport',
    '.ms-best__viewport',
    '.ms-featured__tabs-viewport',
    '.ms-offers__tabs',
    '.ms-offers__viewport',
    '.ms-videos__viewport'
  ].join(',');

  const getTouch = (event) => event.touches[0] || event.changedTouches[0];

  function detectRtlScrollType(rail) {
    const initialScrollLeft = rail.scrollLeft;
    if (initialScrollLeft > 0) return 'default';

    rail.scrollLeft = 1;
    const scrollType = rail.scrollLeft === 0 ? 'negative' : 'reverse';
    rail.scrollLeft = initialScrollLeft;
    return scrollType;
  }

  function getLogicalScrollLeft(rail, scrollType) {
    const maxScrollLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
    if (scrollType === 'negative') return -rail.scrollLeft;
    if (scrollType === 'default') return maxScrollLeft - rail.scrollLeft;
    return rail.scrollLeft;
  }

  function setLogicalScrollLeft(rail, scrollType, value) {
    const maxScrollLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
    const nextValue = Math.max(0, Math.min(value, maxScrollLeft));

    if (scrollType === 'negative') {
      rail.scrollLeft = -nextValue;
    } else if (scrollType === 'default') {
      rail.scrollLeft = maxScrollLeft - nextValue;
    } else {
      rail.scrollLeft = nextValue;
    }
  }

  function bindTouchRail(rail) {
    if (boundRails.has(rail)) return;
    boundRails.add(rail);
    rail.classList.add('ms-touch-scroll-rtl');
    const rtlScrollType = detectRtlScrollType(rail);

    const state = {
      active: false,
      dragging: false,
      startX: 0,
      startY: 0,
      startScrollPosition: 0,
      suppressClickUntil: 0
    };

    const reset = () => {
      state.active = false;
      state.dragging = false;
      rail.classList.remove('is-touch-dragging');
    };

    rail.addEventListener('touchstart', (event) => {
      if (event.touches.length !== 1) return;
      const touch = getTouch(event);
      state.active = true;
      state.dragging = false;
      state.startX = touch.clientX;
      state.startY = touch.clientY;
      state.startScrollPosition = getLogicalScrollLeft(rail, rtlScrollType);
    }, { passive: true });

    rail.addEventListener('touchmove', (event) => {
      if (!state.active || event.touches.length !== 1) return;

      const touch = getTouch(event);
      const distanceX = touch.clientX - state.startX;
      const distanceY = touch.clientY - state.startY;

      if (!state.dragging) {
        if (Math.abs(distanceX) < DRAG_THRESHOLD && Math.abs(distanceY) < DRAG_THRESHOLD) return;
        if (Math.abs(distanceY) >= Math.abs(distanceX)) {
          reset();
          return;
        }
        state.dragging = true;
        rail.classList.add('is-touch-dragging');
      }

      if (event.cancelable) event.preventDefault();
      setLogicalScrollLeft(rail, rtlScrollType, state.startScrollPosition - distanceX);
    }, { passive: false });

    rail.addEventListener('touchend', () => {
      if (state.dragging) state.suppressClickUntil = performance.now() + 350;
      reset();
    }, { passive: true });

    rail.addEventListener('touchcancel', reset, { passive: true });

    rail.addEventListener('click', (event) => {
      if (performance.now() >= state.suppressClickUntil) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  function bindFeaturedPager(viewport) {
    if (boundPagers.has(viewport)) return;
    boundPagers.add(viewport);

    const state = {
      active: false,
      horizontal: false,
      startX: 0,
      startY: 0,
      lastX: 0,
      suppressClickUntil: 0
    };

    const reset = () => {
      state.active = false;
      state.horizontal = false;
      viewport.classList.remove('is-touch-dragging');
    };

    viewport.addEventListener('touchstart', (event) => {
      if (event.touches.length !== 1) return;
      const touch = getTouch(event);
      state.active = true;
      state.horizontal = false;
      state.startX = touch.clientX;
      state.startY = touch.clientY;
      state.lastX = touch.clientX;
    }, { passive: true });

    viewport.addEventListener('touchmove', (event) => {
      if (!state.active || event.touches.length !== 1) return;
      const touch = getTouch(event);
      const distanceX = touch.clientX - state.startX;
      const distanceY = touch.clientY - state.startY;
      state.lastX = touch.clientX;

      if (!state.horizontal) {
        if (Math.abs(distanceX) < DRAG_THRESHOLD && Math.abs(distanceY) < DRAG_THRESHOLD) return;
        if (Math.abs(distanceY) >= Math.abs(distanceX)) {
          reset();
          return;
        }
        state.horizontal = true;
        viewport.classList.add('is-touch-dragging');
      }

      if (event.cancelable) event.preventDefault();
    }, { passive: false });

    viewport.addEventListener('touchend', (event) => {
      if (!state.active) return;
      const touch = getTouch(event);
      const endX = touch?.clientX ?? state.lastX;
      const distanceX = endX - state.startX;
      const wasHorizontal = state.horizontal;

      if (wasHorizontal) {
        state.suppressClickUntil = performance.now() + 350;
        if (Math.abs(distanceX) >= PAGE_THRESHOLD) {
          const component = viewport.closest('ms-featured-products');
          const step = distanceX < 0 ? 1 : -1;
          component?.showPage?.(component.currentPage + step);
        }
      }

      reset();
    }, { passive: true });

    viewport.addEventListener('touchcancel', reset, { passive: true });

    viewport.addEventListener('click', (event) => {
      if (performance.now() >= state.suppressClickUntil) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  function initialize(root = document) {
    if (root instanceof Element && root.matches(railSelector)) bindTouchRail(root);
    root.querySelectorAll?.(railSelector).forEach(bindTouchRail);

    const pagerSelector = '.ms-featured__products-viewport';
    if (root instanceof Element && root.matches(pagerSelector)) bindFeaturedPager(root);
    root.querySelectorAll?.(pagerSelector).forEach(bindFeaturedPager);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initialize(), { once: true });
  } else {
    initialize();
  }

  document.addEventListener('shopify:section:load', (event) => initialize(event.target));
})();
