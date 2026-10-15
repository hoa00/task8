import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
export function discoverTests(root, directories, pattern = /\.test\.ts$/) {
  const walk = (directory) =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (['node_modules', 'dist', 'dist-http', '.wrangler'].includes(entry.name)) return [];
      const filename = join(directory, entry.name);
      return entry.isDirectory()
        ? walk(filename)
        : pattern.test(entry.name)
          ? [relative(root, filename)]
          : [];
    });
  return directories.flatMap((directory) => walk(join(root, directory))).sort();
}
