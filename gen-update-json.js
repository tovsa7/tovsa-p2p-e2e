const u = {
  version:  process.env.VERSION,
  notes:    'Tovsa ' + process.env.TAG,
  pub_date: process.env.BUILD_DATE,
  platforms: {
    'windows-x86_64': { url: process.env.WIN_URL, signature: process.env.WIN_SIG || '' },
    'darwin-x86_64':  { url: process.env.MAC_URL, signature: process.env.MAC_SIG || '' },
    'darwin-aarch64': { url: process.env.MAC_URL, signature: process.env.MAC_SIG || '' },
    'linux-x86_64':   { url: process.env.LIN_URL, signature: process.env.LIN_SIG || '' },
  }
};
process.stdout.write(JSON.stringify(u, null, 2) + '\n');
