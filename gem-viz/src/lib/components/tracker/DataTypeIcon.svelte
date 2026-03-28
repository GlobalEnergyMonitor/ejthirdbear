<script lang="ts">
  /**
   * DataTypeIcon
   * Small icon indicating a field's data_type from the catalog API.
   * Used in FieldGuide field bubbles.
   */
  import Hash from 'lucide-svelte/icons/hash';
  import Tag from 'lucide-svelte/icons/tag';
  import Type from 'lucide-svelte/icons/type';
  import ToggleLeft from 'lucide-svelte/icons/toggle-left';
  import Calendar from 'lucide-svelte/icons/calendar';
  import Link from 'lucide-svelte/icons/link';
  import Binary from 'lucide-svelte/icons/binary';

  let { dataType = '', dataSubType = '', size = 10 } = $props();

  interface IconConfig {
    component: any;
    label: string;
  }

  const icon = $derived.by((): IconConfig => {
    const t = (dataType || '').toLowerCase();
    const s = (dataSubType || '').toLowerCase();

    if (t === 'numeric') return { component: Hash, label: 'Numeric' };
    if (t === 'text' && s === 'categorical') return { component: Tag, label: 'Categorical' };
    if (t === 'text' && s === 'url') return { component: Link, label: 'URL' };
    if (t === 'text' && s === 'structured') return { component: Binary, label: 'ID / Structured' };
    if (t === 'text') return { component: Type, label: 'Text' };
    if (t === 'boolean') return { component: ToggleLeft, label: 'Boolean' };
    if (t === 'date') return { component: Calendar, label: 'Date' };
    return { component: Type, label: dataType || 'Unknown' };
  });
</script>

<span class="data-type-icon" title="{icon.label} field" aria-label="{icon.label} field">
  <svelte:component this={icon.component} {size} strokeWidth={2} />
</span>

<style>
  .data-type-icon {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    opacity: 0.75;
    vertical-align: middle;
  }
</style>
