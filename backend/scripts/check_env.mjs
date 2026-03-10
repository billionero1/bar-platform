import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

import { validateRuntimeEnv } from '../utils/envPolicy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { env: '.env' };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--env') {
      args.env = argv[i + 1] || '.env';
      i += 1;
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
  console.log('Usage: node scripts/check_env.mjs [--env <path>]');
}

function resolveEnvPath(rawPath) {
  if (!rawPath) return path.join(backendDir, '.env');
  if (path.isAbsolute(rawPath)) return rawPath;
  return path.join(backendDir, rawPath);
}

const args = parseArgs(process.argv);
if (args.help) {
  printUsage();
  process.exit(0);
}

const envPath = resolveEnvPath(args.env);
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: false });
} else {
  console.warn(`[env:check] file not found: ${envPath} (using current process env only)`);
}

const report = validateRuntimeEnv(process.env);
if (report.warnings.length) {
  console.warn('[env:check] warnings:');
  for (const warning of report.warnings) {
    console.warn(`- ${warning}`);
  }
}

if (report.errors.length) {
  console.error('[env:check] errors:');
  for (const error of report.errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`[env:check] OK (${report.isProd ? 'production' : 'non-production'} mode)`);
