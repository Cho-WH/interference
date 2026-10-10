import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFrameCadence } from '../src/runtime/frame-cadence';

test('sampling is capped at 60 or 30 Hz independently of display refresh rate', () => {
  for (const refreshRate of [60, 120, 144]) for (const steady of [true, false]) {
    const cadence = createFrameCadence();
    let count = 0;
    for (let i = 0; i < refreshRate * 3; i++) if (cadence.shouldSample(i * 1000 / refreshRate, steady)) count++;
    assert.equal(count, (steady ? 60 : 30) * 3);
  }
});

test('cadence switches rate, skips missed draws, and resets without catch-up bursts', () => {
  const cadence = createFrameCadence();
  assert.equal(cadence.shouldSample(0, true), true);
  assert.equal(cadence.shouldSample(16.7, false), false);
  assert.equal(cadence.shouldSample(33.3, false), true);
  assert.equal(cadence.shouldSample(50, true), true);
  assert.equal(cadence.shouldSample(1050, false), true);
  assert.equal(cadence.shouldSample(1051, false), false);
  cadence.reset();
  assert.equal(cadence.shouldSample(1052, false), true);
});

