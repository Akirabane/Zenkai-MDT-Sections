const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const TARGET_EXTENSIONS = new Set(['.html', '.css', '.js']);
const DIRECTORIES = [
  ROOT_DIR,
  path.join(ROOT_DIR, 'CSS'),
  path.join(ROOT_DIR, 'JS')
];

function listTargets() {
  const targets = [];

  for (const directory of DIRECTORIES) {
    if (!fs.existsSync(directory)) continue;

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!TARGET_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      targets.push(path.join(directory, entry.name));
    }
  }

  return targets;
}

function countOccurrences(text, fragment) {
  return text.split(fragment).length - 1;
}

const suspiciousPatterns = [
  '\u00C3',
  '\u00F0',
  '\u00E2\u20AC',
  '\u00E2\u2020',
  '\uFFFD'
];

let hasIssue = false;

for (const absolutePath of listTargets()) {
  const relativePath = path.relative(ROOT_DIR, absolutePath);
  const text = fs.readFileSync(absolutePath, 'utf8');
  const matchedPatterns = suspiciousPatterns
    .filter((pattern) => text.includes(pattern))
    .map((pattern) => `${pattern} x${countOccurrences(text, pattern)}`);
  const hasControlChars = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text);

  if (matchedPatterns.length || hasControlChars) {
    hasIssue = true;
    console.error(`[front-encoding] ${relativePath}`);
    if (matchedPatterns.length) {
      console.error(`  patterns: ${matchedPatterns.join(', ')}`);
    }
    if (hasControlChars) {
      console.error('  patterns: control chars found');
    }
  }
}

if (hasIssue) {
  process.exitCode = 1;
} else {
  console.log('[front-encoding] OK');
}
