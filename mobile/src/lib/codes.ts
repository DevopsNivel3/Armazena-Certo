import type { Product } from '../types';

export function normalizeCode(value: unknown) {
  return Array.from(String(value ?? ''))
    .filter((character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)
    .join('')
    .trim()
    .toLocaleUpperCase('pt-BR');
}

export function codeCandidates(value: unknown) {
  const code = normalizeCode(value);
  const candidates = new Set([code]);
  if (/^\d{12}$/.test(code)) candidates.add(`0${code}`);
  if (/^0\d{12}$/.test(code)) candidates.add(code.slice(1));
  return [...candidates].filter(Boolean);
}

export function productMatches(product: Product, value: unknown) {
  const candidates = codeCandidates(value);
  return [product.barcode, product.sku, product.reference]
    .filter(Boolean)
    .some((candidate) => candidates.includes(normalizeCode(candidate)));
}

export function normalizeUnit(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

export function countMultiplier(product: Product) {
  if (Number.isFinite(product.factor) && product.factor > 0) return product.factor;
  const unit = normalizeUnit(product.unit);
  return unit === 'KG' || unit.startsWith('KG ') || unit.includes('KILO') ? 1000 : 1;
}

export function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function isValidBrDate(value?: string | null) {
  if (!value) return true;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return year >= 1900 && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function formatBrDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function createOperationId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`.slice(0, 64);
}
