<script>
  /**
   * AddToCartButton - Reusable button for adding items to investigation cart
   *
   * Supports both assets (G-prefix) and entities (E-prefix).
   * Shows different states: default (add), in-cart (checkmark).
   * Variants: default (full button), icon (compact), minimal (text link)
   */

  import { investigationCart, detectType } from '$lib/investigationCart';

  // Props
  let {
    id,
    name,
    type = null, // Auto-detect from ID if not provided
    tracker = null,
    metadata = null,
    variant = 'default', // 'default' | 'icon' | 'minimal'
    size = 'medium', // 'small' | 'medium' | 'large'
    disabled = false,
  } = $props();

  // Derive type from ID if not provided
  const itemType = $derived(type || detectType(id));

  // Check if item is in cart (reactive)
  const inCart = $derived($investigationCart.some((item) => item.id === id));

  // Handle click
  function handleClick(e) {
    e.preventDefault();
    e.stopPropagation();

    if (disabled) return;

    investigationCart.toggle({
      id,
      name,
      type: itemType,
      tracker,
      metadata,
    });
  }

  // Button text based on state
  const buttonText = $derived.by(() => {
    if (variant === 'icon') {
      return inCart ? '-' : '+';
    }
    if (variant === 'minimal') {
      return inCart ? 'Remove' : 'Add';
    }
    return inCart ? 'In Cart' : 'Add to Cart';
  });

  // Aria label for accessibility
  const ariaLabel = $derived(
    inCart ? `Remove ${name} from investigation` : `Add ${name} to investigation`
  );

  // Build class list from global button classes
  const buttonClass = $derived.by(() => {
    const classes = ['btn'];

    // Variant
    if (variant === 'icon') classes.push('btn-icon');
    if (variant === 'minimal') classes.push('btn-link');

    // Size
    if (size === 'small') classes.push('btn-sm');
    if (size === 'large') classes.push('btn-lg');

    // Active state (in cart)
    if (inCart) classes.push('active');

    return classes.join(' ');
  });
</script>

<button
  class={buttonClass}
  onclick={handleClick}
  aria-label={ariaLabel}
  title={ariaLabel}
  {disabled}
>
  {#if inCart}
    <span class="check">✓</span>
  {/if}
  {buttonText}
</button>

<style>
  .check {
    margin-right: 4px;
    display: inline-block;
    animation: check-pop 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes check-pop {
    0% {
      transform: scale(0);
      opacity: 0;
    }
    60% {
      transform: scale(1.3);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  .btn {
    transition:
      background 80ms ease,
      border-color 80ms ease,
      transform 80ms ease;
  }

  .btn:active {
    transform: scale(0.97);
  }

  .btn.active {
    background: #333;
    color: #fff;
    border-color: #333;
  }

  .btn-icon.active {
    background: #333;
    color: #fff;
  }
</style>
