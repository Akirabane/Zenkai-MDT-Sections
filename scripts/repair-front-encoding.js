const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const TARGET_EXTENSIONS = new Set(['.html', '.css', '.js']);
const DIRECTORIES = [
  ROOT_DIR,
  path.join(ROOT_DIR, 'CSS'),
  path.join(ROOT_DIR, 'JS')
];

const suspiciousFragments = ['\u00C3', '\u00C2', '\u00E2', '\u00F0'];
const directReplacements = new Map([
  ['\u00C3\u00A0', '\u00E0'],
  ['\u00C3\u00A2', '\u00E2'],
  ['\u00C3\u00A7', '\u00E7'],
  ['\u00C3\u00A8', '\u00E8'],
  ['\u00C3\u00A9', '\u00E9'],
  ['\u00C3\u00AA', '\u00EA'],
  ['\u00C3\u00AB', '\u00EB'],
  ['\u00C3\u00AE', '\u00EE'],
  ['\u00C3\u00AF', '\u00EF'],
  ['\u00C3\u00B4', '\u00F4'],
  ['\u00C3\u00B6', '\u00F6'],
  ['\u00C3\u00B9', '\u00F9'],
  ['\u00C3\u00BB', '\u00FB'],
  ['\u00C3\u00BC', '\u00FC'],
  ['\u00C3\u20B0', '\u00C8'],
  ['\u00C3\u2030', '\u00C9'],
  ['\u00C3\u201D', '\u00D4'],
  ['\u00C3\u00B4', '\u00F4'],
  ['\u00E2\u20AC\u201D', '\u2014'],
  ['\u00E2\u20AC\u201C', '\u2013'],
  ['\u00E2\u20AC\u00A6', '\u2026'],
  ['\u00E2\u20AC\u2122', '\u2019'],
  ['\u00E2\u20AC\u0153', '\u201C'],
  ['\u00E2\u20AC\u009D', '\u201D'],
  ['\u00E2\u2020\u201D', '\u2194']
]);

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

function suspiciousScore(text) {
  return suspiciousFragments.reduce((total, fragment) => total + (text.split(fragment).length - 1), 0);
}

function repairToken(token) {
  if (!suspiciousFragments.some((fragment) => token.includes(fragment))) {
    return token;
  }

  const decoded = Buffer.from(token, 'latin1').toString('utf8');
  if (decoded.includes('\uFFFD')) {
    return token;
  }

  return suspiciousScore(decoded) < suspiciousScore(token) ? decoded : token;
}

function repairContent(content) {
  let repaired = content;

  for (const [from, to] of directReplacements.entries()) {
    repaired = repaired.split(from).join(to);
  }

  return repaired
    .split(/\r?\n/)
    .map((line) => {
      if (!suspiciousFragments.some((fragment) => line.includes(fragment))) {
        return line;
      }

      const decodedLine = Buffer.from(line, 'latin1').toString('utf8');
      if (!decodedLine.includes('\uFFFD') && suspiciousScore(decodedLine) < suspiciousScore(line)) {
        return decodedLine;
      }

      return line.replace(/[^\s<>{}"']+/g, repairToken);
    })
    .join('\n');
}

let changed = 0;
for (const absolutePath of listTargets()) {
  const relativePath = path.relative(ROOT_DIR, absolutePath);
  const original = fs.readFileSync(absolutePath, 'utf8');
  const repaired = repairContent(original);
  if (repaired !== original) {
    fs.writeFileSync(absolutePath, repaired, 'utf8');
    changed += 1;
    console.log(`[repair-front-encoding] updated ${relativePath}`);
  }
}

console.log(`[repair-front-encoding] done (${changed} file(s) changed)`);
