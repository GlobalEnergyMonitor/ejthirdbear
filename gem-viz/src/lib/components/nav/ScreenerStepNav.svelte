<script>
  /**
   * ScreenerStepNav - Step navigation for the Asset-Class Screener
   * Shared component to eliminate duplication across screener pages.
   */

  import { buildScreenerUrl } from '$lib/screener-url';

  /**
   * @type {{
   *   currentStep: number,
   *   classesParam?: string,
   *   ownersParam?: string,
   *   isEmbed?: boolean,
   *   onStepClick?: (stepNum: number) => void
   * }}
   */
  let { currentStep = 1, classesParam = '', ownersParam = '', isEmbed = false, onStepClick = undefined } = $props();

  const steps = [
    { num: 1, label: 'Asset Classes', path: 'screener' },
    { num: 2, label: 'Find Owners', path: 'screener/owners' },
    { num: 3, label: 'Results', path: 'screener/results' },
    { num: 4, label: 'Visualize', path: 'screener/visualize' },
  ];

  function getStepUrl(step) {
    const url = buildScreenerUrl(step.path, {
      classes: classesParam || undefined,
      owners: step.num >= 3 ? ownersParam || undefined : undefined,
    });
    return isEmbed ? url + (url.includes('?') ? '&' : '?') + 'embed=true' : url;
  }

  function isCompleted(stepNum) {
    return stepNum < currentStep;
  }

  function isActive(stepNum) {
    return stepNum === currentStep;
  }

  // Step 4 is reachable from Step 3 when owners are selected
  function isClickable(stepNum) {
    if (isCompleted(stepNum)) return true;
    if (stepNum === 4 && currentStep === 3 && ownersParam) return true;
    return false;
  }
</script>

<nav class="step-nav">
  {#each steps as step, i}
    {#if i > 0}
      <div class="step-line" class:completed={isCompleted(step.num)}>
        <div class="step-line-fill"></div>
      </div>
    {/if}
    {#if isCompleted(step.num)}
      {#if onStepClick}
        <button class="step completed" style="--step-delay: {i * 0.05}s" onclick={() => onStepClick(step.num)}>
          <span class="step-num">
            <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </span>
          <span class="step-label">{step.label}</span>
        </button>
      {:else}
        <a href={getStepUrl(step)} class="step completed" style="--step-delay: {i * 0.05}s">
          <span class="step-num">
            <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </span>
          <span class="step-label">{step.label}</span>
        </a>
      {/if}
    {:else if isClickable(step.num)}
      {#if onStepClick}
        <button class="step reachable" style="--step-delay: {i * 0.05}s" onclick={() => onStepClick(step.num)}>
          <span class="step-num">{step.num}</span>
          <span class="step-label">{step.label}</span>
        </button>
      {:else}
        <a href={getStepUrl(step)} class="step reachable" style="--step-delay: {i * 0.05}s">
          <span class="step-num">{step.num}</span>
          <span class="step-label">{step.label}</span>
        </a>
      {/if}
    {:else}
      <div class="step" class:active={isActive(step.num)} style="--step-delay: {i * 0.05}s">
        <span class="step-num">{step.num}</span>
        <span class="step-label">{step.label}</span>
      </div>
    {/if}
  {/each}
</nav>

<style>
  .step-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    margin-bottom: var(--space-8);
    padding-bottom: var(--space-6);
    border-bottom: var(--border-width) solid var(--color-border);
  }

  .step {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    opacity: 0.5;
    text-decoration: none;
    color: inherit;
    background: none;
    border: none;
    cursor: pointer;
    font: inherit;
    transition: opacity var(--duration-slow) var(--ease-in-out-quad);
  }

  .step.active,
  .step.completed {
    opacity: 1;
  }

  a.step:hover {
    opacity: 0.85;
  }

  .step.reachable {
    opacity: 0.7;
  }

  .step.reachable .step-num {
    border-style: dashed;
  }

  .step-num {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 2px solid var(--color-accent);
    border-radius: var(--radius-full);
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--color-accent);
    transition:
      background-color var(--duration-slow) var(--ease-in-out-quad),
      border-color var(--duration-slow) var(--ease-in-out-quad),
      color var(--duration-slow) var(--ease-in-out-quad);
  }

  .step.active .step-num {
    background: var(--color-accent);
    color: var(--color-white);
  }

  .step.completed .step-num {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-white);
  }

  .check-icon {
    width: 14px;
    height: 14px;
    stroke-linecap: round;
    stroke-linejoin: round;
    animation: checkDraw 0.4s var(--ease-in-out-quad) forwards;
  }

  .step-label {
    font-size: var(--font-size-md);
    font-weight: 500;
    color: var(--color-text-primary);
    opacity: 0.65;
    transition: opacity 0.2s ease;
  }

  .step.active .step-label {
    opacity: 1;
    color: var(--color-accent);
  }

  .step.completed .step-label {
    opacity: 1;
  }

  .step-line {
    width: 40px;
    height: 2px;
    background: var(--color-gray-200);
    position: relative;
    overflow: hidden;
  }

  .step-line-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 0;
    background: var(--color-accent);
    transition: width var(--duration-slower) var(--ease-in-out-quad);
  }

  .step-line.completed .step-line-fill {
    width: 100%;
  }

  /* Animations */
  @keyframes checkDraw {
    from {
      stroke-dasharray: 24;
      stroke-dashoffset: 24;
    }
    to {
      stroke-dasharray: 24;
      stroke-dashoffset: 0;
    }
  }

  /* Mobile */
  @media (max-width: 768px) {
    .step-nav {
      gap: 0;
      margin-bottom: var(--space-4);
      padding-bottom: var(--space-4);
    }
    .step {
      padding: var(--space-2) var(--space-2);
      min-height: 44px;
    }
    .step-label {
      font-size: var(--font-size-xs);
    }
    .step-num {
      width: 24px;
      height: 24px;
      font-size: var(--font-size-sm);
    }
    .step-line {
      width: 20px;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .step-line-fill,
    .check-icon {
      animation: none;
      transition: none;
    }
  }
</style>
