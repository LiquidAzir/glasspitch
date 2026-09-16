// Release only the playable app; fixtures and development tools stay private.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = fs.realpathSync(path.resolve(__dirname, '..'));
const output = path.resolve(root, 'dist');
const files = ['index.html', 'styles.css', 'design.css', 'art.js', 'app.js', 'three.module.js', 'favicon.png', 'favicon-32.png', 'apple-touch-icon.png', 'icon-512.png', 'manifest.webmanifest'];
const sources = new Map(files.map(name => {
  const raw = fs.readFileSync(path.join(root, name));
  return [name, /\.(html|css|js|webmanifest)$/.test(name) ? Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n')) : raw];
}));
const digest = crypto.createHash('sha256');
for (const [name, data] of sources) digest.update(name).update(data);
digest.update(fs.readFileSync(__filename, 'utf8').replace(/\r\n/g, '\n'));
const version = digest.digest('hex').slice(0, 16);
// Validate the sole build-owned deletion target before replacing it.
if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('Invalid output directory');
if (fs.existsSync(output)) {
  if (fs.lstatSync(output).isSymbolicLink() || fs.realpathSync(output) !== output) throw new Error('Unsafe output directory');
  fs.rmSync(output, {recursive:true});
}
fs.mkdirSync(output);
const manifest = {version, files:{}};
const escapeRE = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const [name, original] of sources) {
  let data = original;
  if (/\.(html|css|js|webmanifest)$/.test(name) && name !== 'three.module.js') {
    let text = data.toString('utf8');
    for (const asset of files.filter(file => file !== 'index.html')) {
      const relative = path.posix.relative(path.posix.dirname(name), asset);
      for (const reference of new Set([relative, './' + relative])) {
        // Replace old version queries too, including the dynamically imported Three module.
        const pattern = new RegExp('(["\x27])' + escapeRE(reference) + '(?:\\?v=[^"\x27]*)?\\1', 'g');
        text = text.replace(pattern, (_, quote) => quote + reference + '?v=' + version + quote);
      }
    }
    data = Buffer.from(text);
  }
  fs.writeFileSync(path.join(output, name), data);
  manifest.files[name] = {bytes:data.length, sha256:crypto.createHash('sha256').update(data).digest('hex')};
}
fs.writeFileSync(path.join(output, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built ${files.length} game files; release ${version}`);
