import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_ROOT = String(process.env.STORAGE_ROOT || path.join(__dirname, '../storage')).trim();
const LEGACY_UPLOADS_ROOT = path.join(__dirname, '../uploads');

function ensureDirSync(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeSegment(value, fallback) {
  const cleaned = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

export function ensureStorageReady() {
  ensureDirSync(STORAGE_ROOT);
  ensureDirSync(path.join(STORAGE_ROOT, 'cocktails'));
}

export function cocktailKeyFromFilename(filename) {
  const base = safeSegment(filename, `photo_${Date.now()}.jpg`);
  return `cocktails/${base}`;
}

export function randomCocktailKey(originalName) {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
  const token = `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  return `cocktails/${token}${safeExt}`;
}

function resolvePathInRoot(rootPath, objectKey) {
  const normalizedKey = String(objectKey || '')
    .replace(/^\/+/, '')
    .replace(/\.\./g, '');
  if (!normalizedKey) return null;
  return path.join(rootPath, normalizedKey);
}

export async function putObject(objectKey, buffer) {
  ensureStorageReady();
  const filePath = resolvePathInRoot(STORAGE_ROOT, objectKey);
  if (!filePath) throw new Error('invalid_storage_key');
  ensureDirSync(path.dirname(filePath));
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}

export async function deleteObject(objectKey) {
  const currentPath = resolvePathInRoot(STORAGE_ROOT, objectKey);
  if (currentPath) {
    await fs.promises.unlink(currentPath).catch(() => {});
  }

  const legacyPath = resolvePathInRoot(LEGACY_UPLOADS_ROOT, objectKey);
  if (legacyPath) {
    await fs.promises.unlink(legacyPath).catch(() => {});
  }
}

async function exists(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveObjectPath(objectKey) {
  const key = String(objectKey || '').trim();
  if (!key) return null;

  const currentPath = resolvePathInRoot(STORAGE_ROOT, key);
  if (currentPath && await exists(currentPath)) return currentPath;

  const legacyPath = resolvePathInRoot(LEGACY_UPLOADS_ROOT, key);
  if (legacyPath && await exists(legacyPath)) return legacyPath;

  return null;
}

export function buildCocktailPhotoUrl(cocktailId, hasPhoto) {
  if (!hasPhoto) return null;
  return `/v1/cocktails/${cocktailId}/photo`;
}
