<script lang="ts">
  /**
   * WidgetModal — single source of truth for all widget overlays.
   *
   * Used by Portfolio Explorer, ControlChain, and GemScreener step-3 chart.
   * Consistent: 96vw × 96vh, 12px radius, fixed to iframe viewport, translucent
   * backdrop, click-outside + Escape to close, sticky header with title + ✕.
   *
   * Usage:
   *   <WidgetModal {open} {onClose} title="Owners of {name}" label="Control Chain">
   *     {#snippet body()}
   *       <LocationOwnershipView ... />
   *     {/snippet}
   *   </WidgetModal>
   */
  import type { Snippet } from 'svelte';

  /**
   * Portal action: moves the node to a fresh shadow host under document.body so
   * `position: fixed` escapes any transformed ancestor in the host page
   * (Drupal/CMS themes break fixed positioning inside Shadow DOM otherwise).
   * Copies the widget's adopted stylesheets so scoped styles still apply.
   * No-op when the component renders in a normal document (not Shadow DOM).
   */
  function portalToBody(node: HTMLElement) {
    const root = node.getRootNode();
    if (!(root instanceof ShadowRoot)) return { destroy: () => {} };

    const host = document.createElement('div');
    host.setAttribute('data-gem-portal', 'widget-modal');
    document.body.appendChild(host);
    const portalShadow = host.attachShadow({ mode: 'open' });

    // Copy BOTH adopted stylesheets AND inline <style> elements. Svelte may use
    // either depending on how the component chunk was built — missing either
    // one causes the modal to render without its scoped CSS (no radius, no
    // sizing, stretches past viewport).
    if (root.adoptedStyleSheets?.length) {
      portalShadow.adoptedStyleSheets = [...root.adoptedStyleSheets];
    }
    root.querySelectorAll('style').forEach((s) => {
      portalShadow.appendChild(s.cloneNode(true));
    });

    portalShadow.appendChild(node);

    return {
      destroy() {
        host.remove();
      },
    };
  }

  interface Props {
    open: boolean;
    onClose: () => void;
    /** Main title shown in the header (e.g. entity name). */
    title?: string;
    /** Small uppercase label above/before the title (e.g. "Portfolio Explorer"). */
    label?: string;
    /** Modal body content. */
    body?: Snippet;
    /** Optional custom header right — e.g. extra controls alongside the close button. */
    headerRight?: Snippet;
    /** Optional aria-label for the dialog. Defaults to title or "Dialog". */
    ariaLabel?: string;
  }

  let { open, onClose, title, label, body, headerRight, ariaLabel }: Props = $props();

  // Escape key closes the modal globally while open
  $effect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    use:portalToBody
    class="wm-backdrop"
    onclick={onClose}
    role="button"
    tabindex="-1"
    onkeydown={(e) => e.key === 'Escape' && onClose()}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="wm-modal"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title ?? 'Dialog'}
      tabindex="-1"
    >
      <div class="wm-header">
        {#if label}
          <span class="wm-label">{label}</span>
        {/if}
        {#if title}
          <span class="wm-title">{title}</span>
        {/if}
        <div class="wm-header-right">
          {#if headerRight}
            {@render headerRight()}
          {/if}
          <button class="wm-close" onclick={onClose} aria-label="Close">✕</button>
        </div>
      </div>
      <div class="wm-body">
        {#if body}
          {@render body()}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .wm-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    /* Max 32-bit int — outranks any host-page modal (Drupal dialogs, cookie banners, etc.)
       We portal to document.body so this z-index competes in the host's stacking context. */
    z-index: 2147483647;
    display: grid;
    place-items: center;
    padding: 2vh 2vw;
    overflow-y: auto;
  }

  .wm-modal {
    background: var(--color-bg-primary, #ffffff);
    border-radius: 12px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.25);
    width: 96vw;
    max-width: 96vw;
    height: 96vh;
    max-height: 96vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: var(--color-text-primary);
  }

  .wm-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    background: var(--color-bg-primary, #ffffff);
    border-bottom: 1px solid var(--color-border, #e5e7eb);
    flex-shrink: 0;
  }

  .wm-label {
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest, 0.08em);
    color: var(--color-text-tertiary, #9ca3af);
    flex-shrink: 0;
  }

  .wm-title {
    flex: 1;
    font-size: var(--font-size-lg, 18px);
    font-weight: 600;
    color: var(--color-text-primary, #111827);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .wm-header-right {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
    margin-left: auto;
  }

  .wm-close {
    background: none;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: var(--radius-md, 6px);
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary, #6b7280);
    cursor: pointer;
    line-height: 1;
    transition: all 0.15s ease;
  }

  .wm-close:hover {
    background: var(--color-bg-secondary, #f3f4f6);
    color: var(--color-text-primary, #111827);
  }

  .wm-body {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  @media (max-width: 600px) {
    .wm-backdrop {
      padding: 0;
    }
    .wm-modal {
      width: 100vw;
      max-width: 100vw;
      height: 100vh;
      max-height: 100vh;
      border-radius: 0;
    }
    .wm-close {
      min-height: 44px;
      min-width: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
  }
</style>
