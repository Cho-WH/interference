import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createComparisonTransition } from '../src/runtime/comparison-transition';

test('paths arrive before guides appear; guides leave before paths fold', () => {
  const transition = createComparisonTransition();
  transition.setOpen(true, 0);
  const midway = transition.step(700, false);
  assert.equal(midway.progress, .5);
  assert.equal(midway.guideOpacity, 0);
  assert.equal(midway.visible, true);
  const arrived = transition.step(1400, false);
  assert.equal(arrived.progress, 1);
  transition.step(1800, false);
  transition.setOpen(false, 1800);
  const fading = transition.step(1890, false);
  assert.equal(fading.progress, 1);
  assert.equal(fading.guideOpacity, .5);
  const cleared = transition.step(1980, false);
  assert.equal(cleared.progress, 1);
  assert.equal(cleared.guideOpacity, 0);
  const folding = transition.step(2530, false);
  assert.equal(folding.progress, .5);
  const closed = transition.step(3080, false);
  assert.equal(closed.visible, false);
  assert.equal(closed.active, false);
});

test('reversing, suspending and reduced motion preserve a continuous view timeline', () => {
  const transition = createComparisonTransition();
  transition.setOpen(true, 0);
  const partial = transition.step(500, false);
  transition.setOpen(false, 500);
  assert.equal(transition.step(500, false).progress, partial.progress);
  transition.suspend();
  assert.equal(transition.step(10000, false).progress, partial.progress);
  assert.ok(transition.step(10100, false).progress < partial.progress);
  const closed = transition.step(10100, true);
  assert.equal(closed.visible, false);
  transition.setOpen(true, 10100);
  const opened = transition.step(10100, true);
  assert.equal(opened.progress, 1);
  assert.equal(opened.guideOpacity, 1);
  assert.equal(opened.active, false);
});
