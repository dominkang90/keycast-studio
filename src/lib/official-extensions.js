// The official extension packs from the repository's extensions/ folder, bundled with the app so
// they can be installed without a download. Add a pack by adding a folder there (see
// docs/EXTENSIONS.md); the unit tests check that every pack is valid.
const files = import.meta.glob('../../extensions/*/extension.json', { eager: true, import: 'default' });

/** [{ folder, json }], the starter pack first, then by name. */
export const OFFICIAL_EXTENSIONS = Object.entries(files)
  .map(([file, json]) => ({ folder: file.split('/').slice(-2, -1)[0], json }))
  .sort((a, b) => (a.folder === 'starter' ? -1 : b.folder === 'starter' ? 1 : String(a.json.name).localeCompare(String(b.json.name))));
