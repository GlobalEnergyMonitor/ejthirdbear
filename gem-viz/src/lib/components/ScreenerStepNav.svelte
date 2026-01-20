<script>
  /**
   * ScreenerStepNav - Step navigation for the Asset-Class Screener
   * Shared component to eliminate duplication across screener pages.
   */

  import { link } from '$lib/links';

  /**
   * @type {{
   *   currentStep: number,
   *   classesParam?: string,
   *   ownersParam?: string
   * }}
   */
  let { currentStep = 1, classesParam = '', ownersParam = '' } = $props();

  const steps = [
    { num: 1, label: 'Asset Classes', path: 'screener' },
    { num: 2, label: 'Find Owners', path: 'screener/owners' },
    { num: 3, label: 'Results', path: 'screener/results' },
    { num: 4, label: 'Visualize', path: 'screener/visualize' },
  ];

  function getStepUrl(step) {
    let url = link(step.path);
    const params = [];
    if (classesParam) params.push(`classes=${encodeURIComponent(classesParam)}`);
    if (ownersParam && step.num >= 3) params.push(`owners=${encodeURIComponent(ownersParam)}`);
    if (params.length > 0) url += '?' + params.join('&');
    return url;
  }

  function isCompleted(stepNum) {
    return stepNum < currentStep;
  }

  function isActive(stepNum) {
    return stepNum === currentStep;
  }
</script>

<nav class="step-nav">
  {#each steps as step, i}
    {#if i > 0}
      <div class="step-line" class:completed={isCompleted(step.num)}></div>
    {/if}
    {#if isCompleted(step.num)}
      <a href={getStepUrl(step)} class="step completed">
        <span class="step-num">{step.num}</span>
        <span class="step-label">{step.label}</span>
      </a>
    {:else}
      <div class="step" class:active={isActive(step.num)}>
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
    margin-bottom: 32px;
    padding-bottom: 24px;
    border-bottom: 1px solid #e0e0e0;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    opacity: 0.4;
    text-decoration: none;
    color: inherit;
  }

  .step.active,
  .step.completed {
    opacity: 1;
  }

  a.step:hover {
    opacity: 0.8;
  }

  .step-num {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 2px solid #1a5f7a;
    border-radius: 50%;
    font-size: 13px;
    font-weight: 600;
    color: #1a5f7a;
  }

  .step.active .step-num {
    background: #1a5f7a;
    color: white;
  }

  .step.completed .step-num {
    background: #3a7a8a;
    color: white;
  }

  .step-label {
    font-size: 13px;
    font-weight: 500;
    color: #333;
  }

  .step-line {
    width: 40px;
    height: 2px;
    background: #ddd;
  }

  .step-line.completed {
    background: #1a5f7a;
  }
</style>
