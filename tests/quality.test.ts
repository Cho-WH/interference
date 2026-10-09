import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFieldQuality } from '../src/runtime/field-quality';

test('quality ignores isolated stalls, reduces sustained overload and restores slowly', () => {
  const q = createFieldQuality();
  for (let i = 0; i < 30; i++) q.observe(3, 16.7, 60);
  const initial = q.scale();
  q.observe(90, 90, 60);
  for (let i = 0; i < 20; i++) q.observe(3, 16.7, 60);
  assert.equal(q.scale(), initial);
  for (let i = 0; i < 80; i++) q.observe(30, 50, 60);
  assert.equal(q.scale(), .5); assert.equal(q.fps(true, false), 30);
  for (let i = 0; i < 40; i++) q.observe(3, 33.3, 30);
  assert.equal(q.fps(true, false), 30);
  for (let i = 0; i < 130; i++) q.observe(3, 33.3, 30);
  assert.equal(q.fps(true, false), 60);
  q.reset(); assert.equal(q.scale(), 1);
  assert.equal(q.fps(false, false), 30); assert.equal(q.fps(false, true), 60);
});

test('CPU path drawing pressure lowers cadence without blurring an inexpensive GPU field', () => {
  const q = createFieldQuality();
  for (let i = 0; i < 40; i++) q.observe(1, 33.3, 60, 12);
  assert.equal(q.fps(true, false), 30); assert.equal(q.scale(), 1);
  for (let i = 0; i < 180; i++) q.observe(1, 33.3, 30, 12);
  assert.equal(q.fps(true, false), 30);
  for (let i = 0; i < 160; i++) q.observe(1, 33.3, 30, 2);
  assert.equal(q.fps(true, false), 60);
});

test('severe CPU fallback load has a bounded detail floor and a 15 Hz target', () => {
  const q = createFieldQuality();
  for (let i = 0; i < 100; i++) q.observe(80, 90, 30);
  assert.equal(q.scale(), .5); assert.equal(q.fps(false, false), 15);
});
