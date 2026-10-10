import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClock } from '../src/runtime/clock';

test('rate changes preserve elapsed time, pause and reset retain the selected rate', () => {
  const clock = createClock();
  clock.tick(0);
  assert.equal(clock.setRate(.25, 1000).timeSeconds, 1);
  assert.equal(clock.tick(3000).timeSeconds, 1.5);
  assert.equal(clock.setRate(2, 5000).timeSeconds, 2);
  assert.equal(clock.setPlaying(false, 6000).timeSeconds, 4);
  assert.equal(clock.setRate(.5, 8000).timeSeconds, 4);
  assert.equal(clock.setPlaying(true, 10000).timeSeconds, 4);
  assert.equal(clock.tick(12000).timeSeconds, 5);
  clock.reset(13000);
  assert.equal(clock.tick(15000).timeSeconds, 1);
});

test('invalid rates do not mutate time or the previous playback rate', () => {
  const clock = createClock();
  clock.tick(0);
  for (const rate of [0, -1, NaN, Infinity]) assert.throws(() => clock.setRate(rate, 1000), RangeError);
  assert.equal(clock.getFrame().timeSeconds, 0);
  assert.equal(clock.tick(2000).timeSeconds, 2);
});
