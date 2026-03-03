<script>
	import DebugPanel from './DebugPanel.svelte';
	import { getApiLog, getApiLogCount, clearApiLog } from '$lib/api-log.svelte';
	import { Copy, Trash2 } from 'lucide-svelte';

	const calls = $derived(getApiLog());
	const count = $derived(getApiLogCount());
	const totalTime = $derived(calls.reduce((sum, c) => sum + c.durationMs, 0));

	let copied = $state(false);

	function copyAll() {
		const text = calls
			.map((c) => `${c.method} ${c.url} → ${c.status ?? 'ERR'} (${c.durationMs.toFixed(0)}ms)${c.reason ? ` [${c.reason}]` : ''}`)
			.join('\n');
		navigator.clipboard.writeText(text);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

{#if count > 0}
	<DebugPanel title="API Calls ({count})" time={totalTime} open={true}>
		<div class="log-toolbar">
			<button class="copy-btn" onclick={copyAll}>
				<Copy size={12} />
				{copied ? 'Copied!' : 'Copy all'}
			</button>
			<button class="copy-btn" onclick={clearApiLog}>
				<Trash2 size={12} />
				Clear
			</button>
		</div>
		<div class="call-list">
			{#each calls as call, i (call.timestamp.getTime() + '-' + i)}
				<div class="call-row" class:call-error={call.error}>
					<span class="call-method">{call.method}</span>
					<a class="call-url" href={call.url} target="_blank" rel="noopener" title={call.url}>{call.url}</a>
					<span class="call-status" class:status-ok={call.status && call.status < 400} class:status-err={!call.status || call.status >= 400}>
						{call.status ?? 'ERR'}
					</span>
					<span class="call-time">{call.durationMs.toFixed(0)}ms</span>
					{#if call.reason}<span class="call-reason">{call.reason}</span>{/if}
				</div>
			{/each}
		</div>
	</DebugPanel>
{/if}

<style>
	.log-toolbar {
		display: flex;
		gap: var(--space-2, 8px);
		margin-bottom: var(--space-3, 12px);
	}

	.call-list {
		display: flex;
		flex-direction: column;
		gap: 1px;
		font-family: var(--font-family-mono, monospace);
		font-size: var(--font-size-xs, 11px);
		background: #1e1e1e;
		border-radius: var(--radius-sm, 2px);
		max-height: 300px;
		overflow-y: auto;
	}

	.call-row {
		display: grid;
		grid-template-columns: 40px 1fr 40px 52px auto;
		gap: var(--space-2, 8px);
		padding: var(--space-1, 4px) var(--space-2, 8px);
		background: #252526;
		align-items: center;
	}

	.call-row:hover {
		background: #2a2d2e;
	}

	.call-row.call-error {
		background: #3a1d1d;
	}

	.call-method {
		color: #569cd6;
		font-weight: 600;
	}

	.call-url {
		color: #d4d4d4;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		cursor: pointer;
		user-select: all;
		text-decoration: none;
	}

	.call-url:hover {
		color: #569cd6;
		text-decoration: underline;
	}

	.call-status {
		text-align: right;
		font-weight: 600;
	}

	.status-ok {
		color: #4ec9b0;
	}

	.status-err {
		color: #f44747;
	}

	.call-time {
		text-align: right;
		color: #808080;
	}

	.call-reason {
		color: #6a9955;
		font-style: italic;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
