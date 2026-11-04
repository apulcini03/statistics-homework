import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const file of ['index.html', ...Array.from({ length: 5 }, (_, i) => `homework-0${i + 1}/index.html`)]) {
  test(`${file}: local references, unique IDs and label targets`, () => {
    const html = readFileSync(path.join(root, file), 'utf8');
    const ids = [], labels = [], references = [];
    for (const tag of html.matchAll(/<([a-z][a-z0-9-]*)\b[^>]*>/gi)) {
      const attributes = Object.fromEntries(Array.from(tag[0].matchAll(/\b(id|href|src|for)="([^"]*)"/g),
        match => [match[1], match[2]]));
      if (attributes.id) ids.push(attributes.id);
      if (tag[1] === 'label' && attributes.for) labels.push(attributes.for);
      if (['a', 'link', 'script'].includes(tag[1])) {
        const ref = attributes.href || attributes.src;
        if (ref) references.push(ref);
      }
    }
    assert.equal(new Set(ids).size, ids.length);
    for (const label of labels) assert.ok(ids.includes(label), `Missing label target ${label}`);
    for (const ref of references) {
      if (/^(https?:|mailto:|#)/.test(ref)) continue;
      assert.ok(existsSync(path.resolve(root, path.dirname(file), ref.split('#')[0])), ref);
    }
  });
}

for (const file of ['js/main.js', ...Array.from({ length: 5 }, (_, i) => `homework-0${i + 1}/script.js`)]) {
  test(`${file}: JavaScript syntax`, () => {
    assert.doesNotThrow(() => new vm.Script(readFileSync(path.join(root, file), 'utf8'), { filename: file }));
  });
}
