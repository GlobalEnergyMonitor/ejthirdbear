// Browser build shim for child_process imports pulled in by transitive deps.
export function spawn() {
  throw new Error('child_process.spawn is not available in the browser build');
}

export default { spawn };
