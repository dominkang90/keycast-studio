// Builds src/i18n/<lang>.js from a plain translation list.
//   node scripts/i18n-build.cjs <lang> <lines.txt> [order.json]
// lines.txt has one translation per line, in the order of the entries in src/i18n/en.js
// (write "\n" for a line break). order.json, if given, is that list as [[korean, english], ...];
// otherwise it is read from en.js. Checks the count and that every {0} placeholder is kept.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const [, , lang, linesFile, orderFile] = process.argv;
if (!lang || !linesFile) {
  console.error('usage: node scripts/i18n-build.cjs <lang> <lines.txt> [order.json]');
  process.exit(1);
}
const NAMES = {
  ja: 'Japanese', 'zh-CN': 'Simplified Chinese', 'zh-TW': 'Traditional Chinese', es: 'Spanish', fr: 'French',
  de: 'German', it: 'Italian', nl: 'Dutch', 'pt-BR': 'Brazilian Portuguese', ru: 'Russian',
};

(async () => {
  const order = orderFile
    ? JSON.parse(fs.readFileSync(orderFile, 'utf8'))
    : Object.entries((await import(pathToFileURL(path.join(__dirname, '..', 'src', 'i18n', 'en.js')).href)).default);
  const lines = fs.readFileSync(linesFile, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  if (lines.length !== order.length) {
    console.error(`${lang}: ${lines.length} lines, expected ${order.length}`);
    process.exit(1);
  }
  const problems = [];
  const out = order.map(([ko, en], i) => {
    const text = lines[i].replace(/\\n/g, '\n');
    const need = (en.match(/\{\d+\}/g) || []).sort().join();
    const have = (text.match(/\{\d+\}/g) || []).sort().join();
    if (need !== have) problems.push(`line ${i + 1}: "${en}" -> "${text}" (placeholders ${need || '-'} vs ${have || '-'})`);
    if (!text.trim() && en.trim()) problems.push(`line ${i + 1}: empty`);
    return [ko, text];
  });
  if (problems.length) {
    console.error(`${lang}:\n${problems.join('\n')}`);
    process.exit(1);
  }
  const body = out.map(([ko, text]) => `  ${JSON.stringify(ko)}: ${JSON.stringify(text)},`).join('\n');
  const file = path.join(__dirname, '..', 'src', 'i18n', `${lang}.js`);
  fs.writeFileSync(file, `// ${NAMES[lang] || lang} interface text. Keys are the Korean text in the code; see en.js.
// Machine-assisted translation: corrections from native speakers are very welcome.
export default {
${body}
};
`);
  console.log(`${lang}: ${out.length} entries written to src/i18n/${lang}.js`);
})();
