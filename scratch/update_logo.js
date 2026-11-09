
import fs from 'fs';
import path from 'path';

const dbPath = '/home/hamza/Desktop/bee queen professional/src/db.js';
const base64Path = '/home/hamza/Desktop/bee queen professional/logo_base64.txt';

const base64Content = fs.readFileSync(base64Path, 'utf8').trim();
let dbContent = fs.readFileSync(dbPath, 'utf8');

const regex = /logo:\s*'data:image\/png;base64,[^']+'/m;
const replacement = `logo: 'data:image/png;base64,${base64Content}'`;

dbContent = dbContent.replace(regex, replacement);

fs.writeFileSync(dbPath, dbContent);
console.log('Logo updated in db.js');
