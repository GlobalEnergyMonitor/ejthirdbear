/**
 * Animation Utilities (anime.js v4)
 *
 * Reusable animation presets for smooth, eased motion throughout the app.
 * Uses stagger for list animations and spring physics for interactive elements.
 */

import { animate, stagger, spring } from 'animejs';

// ---------------------------------------------------------------------------
// Spring Presets
// ---------------------------------------------------------------------------
export const springs = {
  // Snappy, responsive - good for buttons, toggles
  snappy: spring({ stiffness: 300, damping: 20 }),
  // Bouncy - good for attention-grabbing elements
  bouncy: spring({ stiffness: 200, damping: 10 }),
  // Gentle - good for larger elements, panels
  gentle: spring({ stiffness: 120, damping: 14 }),
  // Smooth - good for page transitions
  smooth: spring({ stiffness: 100, damping: 20 }),
};

// ---------------------------------------------------------------------------
// Easing Presets (anime.js v4 naming)
// ---------------------------------------------------------------------------
export const easings = {
  // Smooth deceleration - most common
  out: 'out(3)',
  outQuint: 'outQuint',
  // Smooth acceleration + deceleration
  inOut: 'inOutQuad',
  inOutCubic: 'inOutCubic',
  // Elastic bounce
  outElastic: 'outElastic(1, 0.5)',
  // Back overshoot
  outBack: 'outBack',
};

// ---------------------------------------------------------------------------
// Staggered List Animations
// ---------------------------------------------------------------------------

/**
 * Animate list items appearing with stagger
 * Great for search results, card grids, table rows
 */
export function staggerIn(
  selector: string | Element[],
  options: {
    delay?: number;
    duration?: number;
    staggerDelay?: number;
    from?: 'first' | 'last' | 'center' | number;
    distance?: number;
  } = {}
) {
  const { delay = 0, duration = 400, staggerDelay = 50, from = 'first', distance = 20 } = options;

  return animate(selector, {
    opacity: [0, 1],
    translateY: [distance, 0],
    delay: stagger(staggerDelay, { start: delay, from }),
    duration,
    ease: 'out(3)',
  });
}

/**
 * Animate list items disappearing with stagger
 */
export function staggerOut(
  selector: string | Element[],
  options: {
    duration?: number;
    staggerDelay?: number;
    from?: 'first' | 'last' | 'center' | number;
  } = {}
) {
  const { duration = 300, staggerDelay = 30, from = 'first' } = options;

  return animate(selector, {
    opacity: [1, 0],
    translateY: [0, -10],
    delay: stagger(staggerDelay, { from }),
    duration,
    ease: 'in(2)',
  });
}

/**
 * Scale in from center with stagger - good for grid items
 */
export function staggerScaleIn(
  selector: string | Element[],
  options: {
    delay?: number;
    duration?: number;
    staggerDelay?: number;
    grid?: [number, number];
  } = {}
) {
  const { delay = 0, duration = 500, staggerDelay = 40, grid } = options;

  const staggerOpts: { start: number; from: string; grid?: [number, number] } = {
    start: delay,
    from: 'center',
  };
  if (grid) staggerOpts.grid = grid;

  return animate(selector, {
    opacity: [0, 1],
    scale: [0.8, 1],
    // @ts-expect-error - anime.js stagger type mismatch
    delay: stagger(staggerDelay, staggerOpts),
    duration,
    ease: 'out(3)',
  });
}

// ---------------------------------------------------------------------------
// Panel / Modal Animations
// ---------------------------------------------------------------------------

/**
 * Slide panel in from edge
 */
export function slideIn(
  selector: string | Element,
  direction: 'up' | 'down' | 'left' | 'right' = 'up',
  options: { duration?: number; distance?: number } = {}
) {
  const { duration = 400, distance = 30 } = options;

  const transforms: Record<string, [number, number]> = {
    up: [distance, 0],
    down: [-distance, 0],
    left: [distance, 0],
    right: [-distance, 0],
  };

  const prop = direction === 'up' || direction === 'down' ? 'translateY' : 'translateX';

  return animate(selector, {
    opacity: [0, 1],
    [prop]: transforms[direction],
    duration,
    ease: 'out(3)',
  });
}

/**
 * Modal/overlay fade in with scale
 */
export function modalIn(selector: string | Element, options: { duration?: number } = {}) {
  const { duration = 300 } = options;

  return animate(selector, {
    opacity: [0, 1],
    scale: [0.95, 1],
    duration,
    ease: 'out(3)',
  });
}

/**
 * Modal/overlay fade out
 */
export function modalOut(selector: string | Element, options: { duration?: number } = {}) {
  const { duration = 200 } = options;

  return animate(selector, {
    opacity: [1, 0],
    scale: [1, 0.95],
    duration,
    ease: 'in(2)',
  });
}

// ---------------------------------------------------------------------------
// Micro-interactions
// ---------------------------------------------------------------------------

/**
 * Subtle pulse for attention
 */
export function pulse(selector: string | Element, options: { scale?: number } = {}) {
  const { scale = 1.05 } = options;

  return animate(selector, {
    scale: [1, scale, 1],
    duration: 300,
    ease: 'inOutQuad',
  });
}

/**
 * Shake for error/invalid state
 */
export function shake(selector: string | Element) {
  return animate(selector, {
    translateX: [0, -8, 8, -6, 6, -3, 3, 0],
    duration: 400,
    ease: 'out(2)',
  });
}

/**
 * Spring pop - good for buttons, icons on click
 */
export function springPop(selector: string | Element) {
  return animate(selector, {
    scale: [1, 0.9, 1.05, 1],
    duration: 400,
    ease: springs.snappy,
  });
}

/**
 * Highlight flash - draws attention to an element
 */
export function flash(selector: string | Element, color = 'rgba(255, 200, 0, 0.3)') {
  return animate(selector, {
    backgroundColor: [color, 'transparent'],
    duration: 600,
    ease: 'out(3)',
  });
}

// ---------------------------------------------------------------------------
// Number / Counter Animations
// ---------------------------------------------------------------------------

/**
 * Animate a number counter
 */
export function countUp(
  target: { value: number },
  endValue: number,
  options: { duration?: number; onUpdate?: (_value: number) => void } = {}
) {
  const { duration = 1000, onUpdate } = options;

  return animate(target, {
    value: [0, endValue],
    duration,
    ease: 'out(3)',
    onUpdate: () => {
      if (onUpdate) onUpdate(Math.round(target.value));
    },
  });
}

// ---------------------------------------------------------------------------
// SVG Path Animations
// ---------------------------------------------------------------------------

/**
 * Draw SVG path (line drawing effect)
 */
export function drawPath(selector: string | SVGPathElement, options: { duration?: number } = {}) {
  const { duration = 1500 } = options;

  const path =
    typeof selector === 'string' ? (document.querySelector(selector) as SVGPathElement) : selector;

  if (!path) return null;

  const length = path.getTotalLength();

  return animate(path, {
    strokeDashoffset: [length, 0],
    strokeDasharray: length,
    duration,
    ease: 'inOutQuad',
  });
}

/**
 * Morph between SVG paths (same number of points)
 */
export function morphPath(
  selector: string | SVGPathElement,
  toPath: string,
  options: { duration?: number } = {}
) {
  const { duration = 600 } = options;

  return animate(selector, {
    d: toPath,
    duration,
    ease: springs.gentle,
  });
}

// ---------------------------------------------------------------------------
// Progress / Loading Animations
// ---------------------------------------------------------------------------

/**
 * Animate progress bar
 */
export function animateProgress(
  selector: string | Element,
  percentage: number,
  options: { duration?: number } = {}
) {
  const { duration = 800 } = options;

  return animate(selector, {
    width: `${percentage}%`,
    duration,
    ease: 'out(3)',
  });
}

/**
 * Spinning loader
 */
export function spin(selector: string | Element) {
  return animate(selector, {
    rotate: 360,
    duration: 1000,
    ease: 'linear',
    loop: true,
  });
}

// ---------------------------------------------------------------------------
// Ripple Effect (for click feedback)
// ---------------------------------------------------------------------------

/**
 * Create material-style ripple effect at click point
 */
export function createRipple(
  container: Element,
  event: MouseEvent,
  options: { color?: string; duration?: number } = {}
) {
  const { color = 'rgba(0, 0, 0, 0.1)', duration = 600 } = options;

  const rect = container.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = event.clientX - rect.left - size / 2;
  const y = event.clientY - rect.top - size / 2;

  const ripple = document.createElement('span');
  ripple.style.cssText = `
    position: absolute;
    width: ${size}px;
    height: ${size}px;
    left: ${x}px;
    top: ${y}px;
    background: ${color};
    border-radius: 50%;
    transform: scale(0);
    pointer-events: none;
  `;

  container.appendChild(ripple);

  animate(ripple, {
    scale: [0, 2],
    opacity: [1, 0],
    duration,
    ease: 'out(3)',
    onComplete: () => ripple.remove(),
  });
}

// ---------------------------------------------------------------------------
// Svelte Action for Auto-Animation
// ---------------------------------------------------------------------------

/**
 * Svelte action: animate element on mount
 * Usage: <div use:animateOnMount={{ type: 'slideIn', direction: 'up' }}>
 */
export function animateOnMount(
  node: Element,
  params: {
    type?: 'fadeIn' | 'slideIn' | 'scaleIn';
    direction?: 'up' | 'down' | 'left' | 'right';
    delay?: number;
    duration?: number;
  } = {}
) {
  const { type = 'fadeIn', direction = 'up', delay = 0, duration = 400 } = params;

  // Set initial state
  node.setAttribute('style', 'opacity: 0;');

  // Animate after a tick
  setTimeout(() => {
    if (type === 'slideIn') {
      slideIn(node, direction, { duration });
    } else if (type === 'scaleIn') {
      animate(node, {
        opacity: [0, 1],
        scale: [0.9, 1],
        delay,
        duration,
        ease: 'out(3)',
      });
    } else {
      animate(node, {
        opacity: [0, 1],
        delay,
        duration,
        ease: 'out(3)',
      });
    }
  }, 10);

  return {
    destroy() {
      // Cleanup if needed
    },
  };
}

// ---------------------------------------------------------------------------
// Stagger utility for Svelte {#each} blocks
// ---------------------------------------------------------------------------

/**
 * Get delay for staggered animations in {#each} blocks
 * Usage: style:animation-delay="{getStaggerDelay(i)}ms"
 */
export function getStaggerDelay(index: number, baseDelay = 50): number {
  return index * baseDelay;
}

/**
 * Get eased delay for more natural stagger timing
 */
export function getEasedStaggerDelay(index: number, total: number, maxDelay = 400): number {
  const t = index / Math.max(total - 1, 1);
  // Ease out quad
  const eased = 1 - (1 - t) * (1 - t);
  return Math.round(eased * maxDelay);
}
