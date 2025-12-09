<script>
  import { colors } from '$lib/ownership-theme';

  // Props
  let {
    startX = 0,
    startY = 0,
    endX = 100,
    endY = 100,
    pathType = 'subsidiary', // 'subsidiary' | 'bracket' | 'direct'
    strokeColor = colors.navy,
    strokeWidth = 1,
    curvature = 1, // 0-1, how curved the path is
  } = $props();

  // Generate subsidiary path (vertical then horizontal with bezier curve)
  function subsidiaryPath(startPnt, height, width, crvPct = 1) {
    const lnPtn = [startPnt[0], startPnt[1] + height * crvPct * 0.4];
    const ctlPt1 = [startPnt[0], startPnt[1] + height * crvPct];
    const ctlPt2 = [startPnt[0] + width * crvPct, startPnt[1] + height];
    const endPnt = [startPnt[0] + width, startPnt[1] + height];

    return `M ${startPnt[0]} ${startPnt[1]} L ${lnPtn[0]} ${lnPtn[1]} C ${ctlPt1[0]} ${ctlPt1[1]}, ${ctlPt2[0]} ${ctlPt2[1]}, ${endPnt[0]} ${endPnt[1]}`;
  }

  // Generate bracket path (connects a line end to multiple items)
  function bracketPath(lineEndPnt, height, width, crvPct = 0.7) {
    const startPnt = [lineEndPnt[0] + width, lineEndPnt[1] - height / 2];
    const endPnt = [lineEndPnt[0] + width, lineEndPnt[1] + height / 2];
    const topCtlPt = [lineEndPnt[0] + width * (1 - crvPct), lineEndPnt[1] - height / 2];
    const midCtlPt = [lineEndPnt[0] + width * crvPct, lineEndPnt[1]];
    const bottomCtlPt = [lineEndPnt[0] + width * (1 - crvPct), lineEndPnt[1] + height / 2];

    return `M ${startPnt[0]} ${startPnt[1]} C ${topCtlPt[0]} ${topCtlPt[1]}, ${midCtlPt[0]} ${midCtlPt[1]}, ${lineEndPnt[0]} ${lineEndPnt[1]} C ${midCtlPt[0]} ${midCtlPt[1]}, ${bottomCtlPt[0]} ${bottomCtlPt[1]}, ${endPnt[0]} ${endPnt[1]}`;
  }

  // Generate direct path (simple bezier from start to end)
  function directPath(start, end, curve = 0.5) {
    const midY = start[1] + (end[1] - start[1]) * 0.5;
    const ctrlX1 = start[0];
    const ctrlY1 = start[1] + (midY - start[1]) * curve;
    const ctrlX2 = end[0];
    const ctrlY2 = end[1] - (end[1] - midY) * curve;

    return `M ${start[0]} ${start[1]} C ${ctrlX1} ${ctrlY1}, ${ctrlX2} ${ctrlY2}, ${end[0]} ${end[1]}`;
  }

  // Calculate path based on type
  let pathD = $derived(() => {
    const dx = endX - startX;
    const dy = endY - startY;

    switch (pathType) {
      case 'subsidiary':
        return subsidiaryPath([startX, startY], dy, dx, curvature);
      case 'bracket':
        return bracketPath([startX, startY], dy, dx, curvature);
      case 'direct':
      default:
        return directPath([startX, startY], [endX, endY], curvature);
    }
  });
</script>

<path
  d={pathD()}
  fill="none"
  stroke={strokeColor}
  stroke-width={strokeWidth}
  class="ownership-path"
/>

<style>
  .ownership-path {
    pointer-events: none;
  }
</style>
