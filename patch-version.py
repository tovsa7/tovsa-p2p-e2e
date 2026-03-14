import json, os, re

semver = os.environ['SEMVER']
pubkey = os.environ.get('PUBKEY', '')

# tauri.conf.json
with open('src-tauri/tauri.conf.json') as f:
    c = json.load(f)
c['version'] = semver
if pubkey and c.get('plugins', {}).get('updater'):
    c['plugins']['updater']['pubkey'] = pubkey
elif not pubkey and c.get('plugins', {}).get('updater'):
    del c['plugins']['updater']
with open('src-tauri/tauri.conf.json', 'w') as f:
    json.dump(c, f, indent=2)
print('tauri.conf.json version =', semver)

# Cargo.toml
with open('src-tauri/Cargo.toml') as f:
    t = f.read()
t = re.sub(r'^version = "[^"]+"', 'version = "' + semver + '"', t, flags=re.MULTILINE)
with open('src-tauri/Cargo.toml', 'w') as f:
    f.write(t)
print('Cargo.toml version =', semver)
