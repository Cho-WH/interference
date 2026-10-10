import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAppSession } from '../src/app/session';

test('partial startup cleans up every acquired resource once, despite a cleanup failure', () => {
  const session = createAppSession(), released: number[] = [];
  session.onDispose(() => released.push(1));
  session.onDispose(() => { released.push(2); throw new Error('cleanup fixture'); });
  session.onDispose(() => released.push(3));
  session.dispose(); session.dispose();
  assert.deepEqual(released, [3, 2, 1]);
  assert.equal(session.events()[0].error?.message, 'cleanup fixture');
});

test('diagnostics stay bounded and retain the cause when experiment inspection fails', () => {
  const session = createAppSession();
  for (let i = 0; i < 50; i++) session.record(`recovery-${i}`);
  session.describeWith(() => { throw new Error('snapshot fixture'); });
  assert.equal(session.snapshot(), undefined);
  assert.equal(session.events().length, 30);
  assert.equal(session.events().at(-1)?.error?.message, 'snapshot fixture');
});
