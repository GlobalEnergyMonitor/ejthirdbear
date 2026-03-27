const rawSkillFiles = import.meta.glob('./*.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

function fileName(path: string) {
  return path.split('/').pop() || path;
}

export const SKILLS_PROMPT = Object.entries(rawSkillFiles)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, contents]) => `FILE: ${fileName(path)}\n${contents.trim()}`)
  .join('\n\n');
