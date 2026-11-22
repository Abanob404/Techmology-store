'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const util = require('../server/missing-image-utils');

test('detects no image, placeholders, default image, and keeps real URLs', () => {
  for (const image of [undefined, null, '', '  ', '/assets/no-image.svg', 'https://placehold.co/200x200', 'https://x/img/No+Image.png', '/custom-default.webp']) {
    assert.equal(util.isMissingProductImage(image, '/custom-default.webp'), true, `Expected missing: ${image}`);
  }
  for (const image of ['https://res.cloudinary.com/demo/image/upload/v1/real.webp', '/products/camera.webp']) {
    assert.equal(util.isMissingProductImage(image, '/custom-default.webp'), false);
  }
});

test('MongoDB filter selects placeholders and custom default without selecting unrelated images', () => {
  const filter = util.buildMissingProductImageFilter('https://cdn.example/default.webp');
  assert.equal(filter.$or.length, 4);
  assert.equal(filter.$or.at(-1).image, 'https://cdn.example/default.webp');
  assert.equal(filter.$or[2].image.$regex.test(' /assets/no-image.svg'), true);
  assert.equal(filter.$or[2].image.$regex.test('https://cdn.example/camera.webp'), false);
  assert.equal(util.buildMissingProductImageFilter('').$or.length, 3);
});

test('search escapes regex control characters before building Mongo query', () => {
  const malicious = 'a.*(b)[x]?+$';
  const escaped = util.escapeMongoRegex(malicious);
  assert.equal(new RegExp(escaped, 'i').test(malicious), true);
  assert.equal(new RegExp(escaped, 'i').test('aaaaab'), false);
});

test('page numbers are bounded and safe', () => {
  assert.equal(util.pageNumber('3'),3);
  assert.equal(util.pageNumber(-5),1);
  assert.equal(util.pageNumber('xxx'),1);
  assert.equal(util.pageNumber('99999',1,40),40);
  assert.equal(util.pageNumber('1.5'),1);
});

test('admin quick image endpoint only changes image fields, never product price and stock', () => {
  const source=fs.readFileSync(path.join(__dirname,'..','server','index.js'),'utf8');
  const start=source.indexOf("app.put('/api/admin/products/:id/missing-image'");
  const end=source.indexOf("app.get('/api/admin/media'",start);
  assert.ok(start>0 && end>start);
  const endpoint=source.slice(start,end);
  assert.match(endpoint,/requirePermission\('edit_product'\)/);
  assert.match(endpoint,/validateImageFiles/);
  assert.match(endpoint,/cloudinary\.uploader\.upload/);
  assert.match(endpoint,/buildMissingProductImageFilter/);
  assert.match(endpoint,/\$set:\s*\{\s*image:\s*uploaded\.secure_url,\s*imagePublicId:/);
  assert.doesNotMatch(endpoint,/\$set:\s*\{[^}]*\b(?:price|stockQuantity|sku|title)\s*:/);
});
