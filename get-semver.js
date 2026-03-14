const d = new Date();
const semver = 'SEMVER=1.' + (d.getMonth()+1) + '.' + d.getDate();
process.stdout.write(semver + '\n');
console.error(semver);
