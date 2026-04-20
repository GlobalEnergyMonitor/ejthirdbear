export type NativeNodeClickStamp = { id: string; at: number } | null;

const DEFAULT_NATIVE_CLICK_SETTLE_MS = 50;
const DEFAULT_BACKGROUND_CLICK_SUPPRESSION_MS = 120;

export function shouldTreatPointerReleaseAsNodeClick(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  threshold: number
): boolean {
  return Math.abs(endX - startX) < threshold && Math.abs(endY - startY) < threshold;
}

export function shouldUseFallbackNodeClick(
  nodeId: string,
  now: number,
  lastNativeClick: NativeNodeClickStamp,
  nativeClickSettleMs = DEFAULT_NATIVE_CLICK_SETTLE_MS
): boolean {
  return !(
    lastNativeClick &&
    lastNativeClick.id === nodeId &&
    now - lastNativeClick.at < nativeClickSettleMs
  );
}

export function backgroundClickSuppressionDeadline(
  now: number,
  suppressionMs = DEFAULT_BACKGROUND_CLICK_SUPPRESSION_MS
): number {
  return now + suppressionMs;
}

export function shouldIgnoreBackgroundClick(now: number, suppressUntil: number): boolean {
  return now < suppressUntil;
}
