import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    env: '.env',
    out: null,
    inPlace: false,
    backup: true,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--env') {
      args.env = argv[i + 1] || '.env';
      i += 1;
      continue;
    }
    if (token === '--out') {
      args.out = argv[i + 1] || null;
      i += 1;
      continue;
    }
    if (token === '--in-place') {
      args.inPlace = true;
      continue;
    }
    if (token === '--no-backup') {
      args.backup = false;
      continue;
    }
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
  }

  return args;
}

function printUsage() {
  console.log('Usage: node scripts/rotate_secrets.mjs [--env <path>] [--out <path>] [--in-place] [--no-backup]');
}

function resolveEnvPath(rawPath) {
  if (!rawPath) return path.join(backendDir, '.env');
  if (path.isAbsolute(rawPath)) return rawPath;
  return path.join(backendDir, rawPath);
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function replaceEnvValues(fileContent, replacements) {
  const lines = fileContent.split('\n');
  const applied = new Set();

  const nextLines = lines.map((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match) return line;
    const key = match[1];
    if (!(key in replacements)) return line;
    applied.add(key);
    return `${key}=${replacements[key]}`;
  });

  for (const [key, value] of Object.entries(replacements)) {
    if (applied.has(key)) continue;
    nextLines.push(`${key}=${value}`);
  }

  return nextLines.join('\n').replace(/\n*$/, '\n');
}

function mask(value, visible = 4) {
  const str = String(value || '');
  if (str.length <= visible * 2) return '*'.repeat(str.length);
  return `${str.slice(0, visible)}...${str.slice(-visible)}`;
}

function escapeSqlLiteral(value) {
  return String(value || '').replace(/'/g, "''");
}

const args = parseArgs(process.argv);
if (args.help) {
  printUsage();
  process.exit(0);
}

const envPath = resolveEnvPath(args.env);
if (!fs.existsSync(envPath)) {
  console.error(`[secrets:rotate] env file not found: ${envPath}`);
  process.exit(1);
}

const source = fs.readFileSync(envPath, 'utf8');
const pgUserMatch = source.match(/^\s*PGUSER\s*=\s*(.+)\s*$/m);
const pgUser = (pgUserMatch ? pgUserMatch[1] : 'app').trim();

const replacements = {
  PGPASSWORD: randomToken(24),
  JWT_SECRET: randomToken(48),
  CSRF_SECRET: randomToken(48),
  OTP_WEBHOOK_TOKEN: randomToken(32),
};

const rotated = replaceEnvValues(source, replacements);

let targetPath = args.out;
if (args.inPlace) {
  targetPath = envPath;
} else if (!targetPath) {
  targetPath = `${envPath}.rotated`;
}

if (!path.isAbsolute(targetPath)) {
  targetPath = path.join(backendDir, targetPath);
}

if (args.inPlace && args.backup) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${envPath}.bak.${ts}`;
  fs.writeFileSync(backupPath, source, 'utf8');
  console.log(`[secrets:rotate] backup created: ${backupPath}`);
}

fs.writeFileSync(targetPath, rotated, 'utf8');
console.log(`[secrets:rotate] written: ${targetPath}`);
console.log('[secrets:rotate] rotated keys:');
for (const [key, value] of Object.entries(replacements)) {
  console.log(`- ${key}=${mask(value)}`);
}

console.log('\nApply DB password on PostgreSQL before backend restart:');
console.log(`ALTER ROLE "${pgUser}" WITH PASSWORD '${escapeSqlLiteral(replacements.PGPASSWORD)}';`);

