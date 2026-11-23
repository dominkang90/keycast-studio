// Adds new entries to every language file at once.
//   node scripts/i18n-add.cjs <entries.json>
// entries.json: { "<korean>": { "en": "...", "ja": "...", ... }, ... }
// Existing keys are left as they are; a language missing from an entry is skipped (it falls back
// to the Korean text).
const fs = require('fs');
const path = require('path');

const entries = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const dir = path.join(__dirname, '..', 'src', 'i18n');
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
  const code = file.replace(/\.js$/, '');
  const full = path.join(dir, file);
  let text = fs.readFileSync(full, 'utf8');
  const lines = [];
  for (const [ko, byLang] of Object.entries(entries)) {
    if (!byLang[code] || text.includes(`${JSON.stringify(ko)}:`)) continue;
    lines.push(`  ${JSON.stringify(ko)}: ${JSON.stringify(byLang[code])},`);
  }
  if (!lines.length) continue;
  const end = text.lastIndexOf('};');
  text = `${text.slice(0, end)}${lines.join('\n')}\n${text.slice(end)}`;
  fs.writeFileSync(full, text);
  console.log(`${code}: +${lines.length}`);
}
