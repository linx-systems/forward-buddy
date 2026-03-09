import { promises as fs } from 'node:fs';
import path from 'node:path';

const projectDir = process.cwd();
const rootDir = path.join(projectDir, 'src');
const distDir = path.join(projectDir, 'dist');
const managedRoots = [
  'manifest.json',
  'background',
  'lib',
  'popup',
  'options',
  'messageDisplay',
  'icons',
  '_locales',
];

const codeRoots = ['background', 'lib', 'popup', 'options', 'messageDisplay'];
const staticRootRules = new Map([
  ['popup', new Set(['.html', '.css'])],
  ['options', new Set(['.html', '.css'])],
  ['messageDisplay', new Set(['.html', '.css'])],
  ['icons', null],
  ['_locales', null],
]);

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(relativePath) {
  const fullPath = path.join(rootDir, relativePath);
  if (!(await pathExists(fullPath))) return [];

  const entries = await fs.readdir(fullPath, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const childRelativePath = path.posix.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      return listFiles(childRelativePath);
    }
    return [childRelativePath];
  }));

  return files.flat();
}

async function copyFile(relativePath) {
  const sourcePath = path.join(rootDir, relativePath);
  const destinationPath = path.join(distDir, relativePath);
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
}

async function removeIfEmpty(directoryPath) {
  if (!(await pathExists(directoryPath))) return;
  const entries = await fs.readdir(directoryPath);
  if (entries.length === 0) {
    await fs.rmdir(directoryPath);
  }
}

async function prunePath(relativePath, expectedPaths) {
  const targetPath = path.join(distDir, relativePath);
  if (!(await pathExists(targetPath))) return;

  const stats = await fs.stat(targetPath);
  if (stats.isFile()) {
    if (!expectedPaths.has(relativePath)) {
      await fs.unlink(targetPath);
    }
    return;
  }

  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    await prunePath(path.posix.join(relativePath, entry.name), expectedPaths);
  }
  await removeIfEmpty(targetPath);
}

function isManagedStaticFile(relativePath, allowedExtensions) {
  if (allowedExtensions === null) return true;
  return allowedExtensions.has(path.extname(relativePath));
}

async function main() {
  await fs.mkdir(distDir, { recursive: true });

  const expectedPaths = new Set();

  for (const codeRoot of codeRoots) {
    const sourceFiles = await listFiles(codeRoot);
    for (const sourceFile of sourceFiles) {
      if (!sourceFile.endsWith('.ts')) continue;
      expectedPaths.add(sourceFile.replace(/\.ts$/, '.js'));
    }
  }

  expectedPaths.add('manifest.json');
  await copyFile('manifest.json');

  for (const [staticRoot, allowedExtensions] of staticRootRules) {
    const sourceFiles = await listFiles(staticRoot);
    for (const sourceFile of sourceFiles) {
      if (!isManagedStaticFile(sourceFile, allowedExtensions)) continue;
      expectedPaths.add(sourceFile);
      await copyFile(sourceFile);
    }
  }

  for (const managedRoot of managedRoots) {
    await prunePath(managedRoot, expectedPaths);
  }
}

await main();
