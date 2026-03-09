import fs from 'fs';

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const now = new Date();
const day = String(now.getDate()).padStart(2, '0');
const month = String(now.getMonth() + 1).padStart(2, '0');
const year = now.getFullYear();

pkg.buildDate = `${day}/${month}/${year}`;

fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log(`Updated buildDate to ${pkg.buildDate}`);
