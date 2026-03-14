const fs     = require('fs');
const semver = process.env.SEMVER;
const pubkey = process.env.PUBKEY || '';

if (!semver) { console.error('SEMVER not set'); process.exit(1); }

// tauri.conf.json
const confPath = 'src-tauri/tauri.conf.json';
const c = JSON.parse(fs.readFileSync(confPath, 'utf8'));
c.version = semver;
if (pubkey && c.plugins && c.plugins.updater) {
  c.plugins.updater.pubkey = pubkey;
} else if (!pubkey && c.plugins && c.plugins.updater) {
  delete c.plugins.updater;
}
fs.writeFileSync(confPath, JSON.stringify(c, null, 2));
console.log('tauri.conf.json version =', semver);

// Cargo.toml
const cargoPath = 'src-tauri/Cargo.toml';
let cargo = fs.readFileSync(cargoPath, 'utf8');
cargo = cargo.replace(/^version = "[^"]+"/m, 'version = "' + semver + '"');
fs.writeFileSync(cargoPath, cargo);
console.log('Cargo.toml version =', semver);
