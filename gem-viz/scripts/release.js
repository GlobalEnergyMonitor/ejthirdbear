#!/usr/bin/env node

/**
 * Release script for version bumping and changelog management
 *
 * Usage:
 *   npm run release -- patch   (0.1.0 -> 0.1.1)
 *   npm run release -- minor   (0.1.0 -> 0.2.0)
 *   npm run release -- major   (0.1.0 -> 1.0.0)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

function bumpVersion(currentVersion, type) {
  const [major, minor, patch] = currentVersion.split('.').map(Number);

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Invalid bump type: ${type}`);
  }
}

async function main() {
  const bumpType = process.argv[2] || 'patch';

  if (!['major', 'minor', 'patch'].includes(bumpType)) {
    console.error('❌ Invalid bump type. Use: major, minor, or patch');
    process.exit(1);
  }

  // Load package.json
  const packageJsonPath = path.join(rootDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const currentVersion = packageJson.version;
  const newVersion = bumpVersion(currentVersion, bumpType);

  console.log('\n📦 GEM Viz Release');
  console.log('==================\n');
  console.log(`Current version: ${currentVersion}`);
  console.log(`New version: ${newVersion}`);
  console.log(`Bump type: ${bumpType}\n`);

  const confirm = await question('Continue with release? (y/n) ');

  if (confirm.toLowerCase() !== 'y') {
    console.log('❌ Release cancelled');
    rl.close();
    process.exit(0);
  }

  try {
    // Update package.json
    packageJson.version = newVersion;
    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2) + '\n'
    );
    console.log('✓ Updated package.json');

    // Update layout.svelte with new version
    const layoutPath = path.join(rootDir, 'src', 'routes', '+layout.svelte');
    let layoutContent = fs.readFileSync(layoutPath, 'utf-8');
    layoutContent = layoutContent.replace(
      /const appVersion = '[^']+';/,
      `const appVersion = '${newVersion}';`
    );
    fs.writeFileSync(layoutPath, layoutContent);
    console.log('✓ Updated layout.svelte');

    // Update CHANGELOG.md
    const changelogPath = path.join(rootDir, 'CHANGELOG.md');
    const today = new Date().toISOString().split('T')[0];
    let changelog = fs.readFileSync(changelogPath, 'utf-8');

    changelog = changelog.replace(
      '## [Unreleased]',
      `## [Unreleased]\n\n## [${newVersion}] - ${today}`
    );

    // Update links section
    const linkPattern = /\[unreleased\]: .+\/compare\/v[\d.]+\.\.\.HEAD/;
    const newUnreleasedLink = `[unreleased]: https://github.com/yourusername/gem-viz/compare/v${newVersion}...HEAD`;
    changelog = changelog.replace(linkPattern, newUnreleasedLink);

    // Add new version link
    changelog = changelog.replace(
      newUnreleasedLink,
      `${newUnreleasedLink}\n[${newVersion}]: https://github.com/yourusername/gem-viz/releases/tag/v${newVersion}`
    );

    fs.writeFileSync(changelogPath, changelog);
    console.log('✓ Updated CHANGELOG.md');

    // Git commit
    console.log('\n📝 Creating git commit...');
    execSync(`git add package.json src/routes/+layout.svelte CHANGELOG.md`, { stdio: 'inherit' });
    execSync(`git commit -m "Release v${newVersion}"`, { stdio: 'inherit' });
    execSync(`git tag -a v${newVersion} -m "Release v${newVersion}"`, { stdio: 'inherit' });

    console.log('\n✅ Release v' + newVersion + ' created successfully!\n');
    console.log('Next steps:');
    console.log('  1. Review the changes: git show');
    console.log('  2. Push to remote: git push && git push --tags');
    console.log('  3. Deploy: npm run deploy\n');

  } catch (error) {
    console.error('\n❌ Release failed:', error.message);
    process.exit(1);
  }

  rl.close();
}

main();
