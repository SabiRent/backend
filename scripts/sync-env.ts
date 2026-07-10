import fs from 'node:fs';
import path from 'node:path';

const ENV_FILE = path.resolve('.env');
const ENV_EXAMPLE_FILE = path.resolve('.env.example');

if (!fs.existsSync(ENV_FILE)) {
  console.error(`${ENV_FILE} does not exist.`);
  process.exit(1);
}

const input = fs.readFileSync(ENV_FILE, 'utf8');
const lines = input.split(/\r?\n/);

const output = lines.map((line) => {
  if (line.trim() === '') return '';
  if (line.trim().startsWith('#')) return line;

  const key = line.split('=')[0];
  return `${key}=`;
});

fs.writeFileSync(ENV_EXAMPLE_FILE, output.join('\n'), 'utf8');
console.warn(`Sync complete. Check the ${ENV_EXAMPLE_FILE} file.`);
