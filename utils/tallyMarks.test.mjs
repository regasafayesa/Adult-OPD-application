import assert from 'node:assert/strict';
import test from 'node:test';
import { getTallyGroupSizes, normalizeTallyCount, tallyMarks } from './tallyMarks.mjs';

test('renders the requested tally counts as groups of five and a remainder', () => {
  const expectedGroups = new Map([
    [0, []],
    [1, [1]],
    [3, [3]],
    [4, [4]],
    [5, [5]],
    [6, [5, 1]],
    [7, [5, 2]],
    [9, [5, 4]],
    [10, [5, 5]],
    [15, [5, 5, 5]],
    [25, [5, 5, 5, 5, 5]],
    [100, Array(20).fill(5)],
  ]);

  for (const [count, groups] of expectedGroups) {
    assert.deepEqual(getTallyGroupSizes(count), groups, `count ${count}`);
    assert.equal(
      getTallyGroupSizes(count).reduce((total, groupSize) => total + groupSize, 0),
      count,
      `count ${count} renders the same number of marks`
    );
  }
});

test('uses crossed-four text notation and separates groups for export fallbacks', () => {
  assert.equal(tallyMarks(5), '||||/');
  assert.equal(tallyMarks(7), '||||/ ||');
  assert.equal(tallyMarks(10), '||||/ ||||/');
  assert.equal(tallyMarks(25), '||||/ ||||/ ||||/ ||||/ ||||/');
});

test('treats null, undefined, and invalid counts as zero', () => {
  for (const value of [null, undefined, -1, 1.5, Number.NaN, Infinity, '5']) {
    assert.equal(normalizeTallyCount(value), 0);
    assert.deepEqual(getTallyGroupSizes(value), []);
    assert.equal(tallyMarks(value), '');
  }
});
