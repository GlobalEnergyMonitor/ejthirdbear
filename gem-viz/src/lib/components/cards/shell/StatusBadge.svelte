<script lang="ts">
  import type { StatusGroup } from './card-types';

  let {
    label,
    group,
  }: {
    label: string;
    group: StatusGroup;
  } = $props();
</script>

<span class="status-badge badge-{group}">{label}</span>

<style>
  .status-badge {
    display: inline-block;
    padding: 0.28rem 0.65rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .badge-operating {
    background: #7f142a;
    color: #fff;
  }
  .badge-planned {
    background: #ca4a50;
    color: #fff;
  }
  .badge-retired {
    background: #e0e0e0;
    color: #444;
  }
  .badge-cancelled {
    background: #e0e0e0;
    color: #444;
  }
</style>
