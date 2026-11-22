'use strict';

// Keep the admin upload queue consistent with the storefront's placeholder rules.
const PLACEHOLDER_PATTERN = /placehold\.co|no-image|No\+Image/i;
const EMPTY_OR_PLACEHOLDER_REGEX = /^\s*$|placehold\.co|no-image|No\+Image/i;

function isMissingProductImage(url, fallbackUrl = '') {
  const image = String(url ?? '').trim();
  const fallback = String(fallbackUrl ?? '').trim();
  return !image || PLACEHOLDER_PATTERN.test(image) || Boolean(fallback && image === fallback);
}

function buildMissingProductImageFilter(fallbackUrl = '') {
  const missing = [
    { image: { $exists: false } },
    { image: null },
    { image: { $regex: EMPTY_OR_PLACEHOLDER_REGEX } }
  ];
  if (String(fallbackUrl ?? '').trim()) missing.push({ image: String(fallbackUrl).trim() });
  return { $or: missing };
}

function escapeMongoRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pageNumber(value, fallback = 1, max = 100000) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(max, parsed) : fallback;
}

module.exports = { isMissingProductImage, buildMissingProductImageFilter, escapeMongoRegex, pageNumber };
