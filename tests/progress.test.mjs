import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateProgressStages,
  calculateProgressSnapshot
} from '../packages/shared/src/progress.ts';

const REG_ORDER = [
  'STARTED',
  'CHANNELS_PENDING',
  'CONSENT_PENDING',
  'PHONE_PENDING',
  'REGISTERED',
  'MINI_APP_PENDING',
  'COMPLETE'
];

function stage(id, weight, options = {}) {
  return {
    id,
    weight,
    isActive: true,
    isVisible: true,
    completionType: 'MANUAL',
    prerequisiteIds: [],
    ...options
  };
}

test('arbitrary positive point totals are accepted', () => {
  const result = validateProgressStages([
    stage('a', 400),
    stage('b', 600, { prerequisiteIds: ['a'] })
  ], REG_ORDER);

  assert.deepEqual(result, { ok: true, totalWeight: 1000 });

  const second = validateProgressStages([
    stage('a', 40),
    stage('b', 50)
  ], REG_ORDER);

  assert.deepEqual(second, { ok: true, totalWeight: 90 });
});

test('empty active stages are rejected', () => {
  const result = validateProgressStages([
    stage('a', 100, { isActive: false })
  ], REG_ORDER);

  assert.equal(result.ok, false);
  assert.equal(result.error, 'progress_stages_required');
});

test('total points cannot exceed one billion', () => {
  const stages = Array.from(
    { length: 1001 },
    (_, index) => stage('s' + index, 1_000_000)
  );

  const result = validateProgressStages(stages, REG_ORDER);

  assert.equal(result.error, 'invalid_progress_points');
  assert.equal(result.totalWeight, 1_001_000_000);
});

test('invalid individual weights are rejected', () => {
  for (const weight of [-1, 0, 1_000_001, 10.5]) {
    const result = validateProgressStages([
      stage('a', weight),
      stage('b', 10)
    ], REG_ORDER);

    assert.equal(result.ok, false, `weight ${weight}`);
    assert.equal(result.error, 'invalid_progress_points');
  }
});

test('unsupported completion type is rejected', () => {
  const result = validateProgressStages([
    stage('a', 10, { completionType: 'CLIENT_CLICK' })
  ], REG_ORDER);

  assert.equal(result.error, 'invalid_progress_completion_type');
});

test('academy lesson completion requires a lesson id', () => {
  const valid = validateProgressStages([
    stage('a', 10, {
      completionType: 'ACADEMY_LESSON',
      completionConfig: { lessonId: 'lesson-1' }
    })
  ], REG_ORDER);

  const invalid = validateProgressStages([
    stage('a', 10, {
      completionType: 'ACADEMY_LESSON',
      completionConfig: {}
    })
  ], REG_ORDER);

  assert.equal(valid.ok, true);
  assert.equal(invalid.error, 'invalid_academy_lesson_config');
});

test('an academy lesson cannot complete multiple active stages', () => {
  const result = validateProgressStages([
    stage('a', 10, {
      completionType: 'ACADEMY_LESSON',
      completionConfig: { lessonId: 'lesson-1' }
    }),
    stage('b', 20, {
      completionType: 'ACADEMY_LESSON',
      completionConfig: { lessonId: 'lesson-1' }
    })
  ], REG_ORDER);

  assert.equal(result.error, 'duplicate_academy_lesson_config');
});

test('registration stage requires a valid target', () => {
  const valid = validateProgressStages([
    stage('a', 100, {
      completionType: 'REGISTRATION_STAGE',
      completionConfig: { targetStage: 'REGISTERED' }
    })
  ], REG_ORDER);

  const invalid = validateProgressStages([
    stage('a', 100, {
      completionType: 'REGISTRATION_STAGE',
      completionConfig: { targetStage: 'UNKNOWN' }
    })
  ], REG_ORDER);

  assert.equal(valid.ok, true);
  assert.equal(invalid.error, 'invalid_registration_stage_config');
});

test('missing, duplicate and self prerequisites are rejected', () => {
  const cases = [
    [stage('a', 100, { prerequisiteIds: ['missing'] })],
    [
      stage('a', 50),
      stage('b', 50, { prerequisiteIds: ['a', 'a'] })
    ],
    [stage('a', 100, { prerequisiteIds: ['a'] })]
  ];

  for (const stages of cases) {
    assert.equal(
      validateProgressStages(stages, REG_ORDER).error,
      'invalid_progress_prerequisites'
    );
  }
});

test('inactive prerequisite is rejected', () => {
  const result = validateProgressStages([
    stage('a', 50, { isActive: false }),
    stage('b', 100, { prerequisiteIds: ['a'] })
  ], REG_ORDER);

  assert.equal(result.error, 'invalid_progress_prerequisites');
});

test('dependency cycles are rejected', () => {
  const result = validateProgressStages([
    stage('a', 50, { prerequisiteIds: ['b'] }),
    stage('b', 50, { prerequisiteIds: ['a'] })
  ], REG_ORDER);

  assert.equal(result.error, 'progress_prerequisite_cycle');
});

test('longer valid dependency chains are accepted', () => {
  const result = validateProgressStages([
    stage('a', 30),
    stage('b', 30, { prerequisiteIds: ['a'] }),
    stage('c', 40, { prerequisiteIds: ['b'] })
  ], REG_ORDER);

  assert.equal(result.ok, true);
});

test('progress percentage and completed weight are calculated correctly', () => {
  const result = calculateProgressSnapshot([
    stage('a', 40),
    stage('b', 60)
  ], new Set(['a']));

  assert.equal(result.percentage, 40);
  assert.equal(result.completedWeight, 40);
  assert.equal(result.totalWeight, 100);
  assert.equal(result.completedStages, 1);
  assert.equal(result.totalStages, 2);
  assert.equal(result.isComplete, false);
});

test('prerequisites lock stages until completed', () => {
  const result = calculateProgressSnapshot([
    stage('a', 50),
    stage('b', 50, { prerequisiteIds: ['a'] })
  ], new Set());

  assert.equal(result.stages[0].status, 'AVAILABLE');
  assert.equal(result.stages[1].status, 'LOCKED');
  assert.equal(result.nextStep.id, 'a');
});

test('next step moves forward after prerequisite completion', () => {
  const result = calculateProgressSnapshot([
    stage('a', 50),
    stage('b', 50, { prerequisiteIds: ['a'] })
  ], new Set(['a']));

  assert.equal(result.stages[0].status, 'COMPLETED');
  assert.equal(result.stages[1].status, 'AVAILABLE');
  assert.equal(result.nextStep.id, 'b');
});

test('hidden stages affect progress but are not exposed', () => {
  const result = calculateProgressSnapshot([
    stage('a', 50),
    stage('b', 50, { isVisible: false })
  ], new Set(['b']));

  assert.equal(result.percentage, 50);
  assert.equal(result.totalStages, 2);
  assert.equal(result.stages.length, 1);
  assert.equal(result.stages[0].id, 'a');
});

test('100 percent completion is detected', () => {
  const result = calculateProgressSnapshot([
    stage('a', 40),
    stage('b', 60)
  ], new Set(['a', 'b']));

  assert.equal(result.percentage, 100);
  assert.equal(result.isComplete, true);
  assert.equal(result.nextStep, null);
});

test('invalid prerequisite data keeps a stage locked', () => {
  const result = calculateProgressSnapshot([
    stage('a', 100, { prerequisiteIds: 'invalid' })
  ], new Set());

  assert.equal(result.stages[0].status, 'LOCKED');
  assert.equal(result.nextStep, null);
});

test('partial stage progress contributes proportionally to weighted path progress', () => {
  const result = calculateProgressSnapshot([
    stage('a', 40),
    stage('b', 60)
  ], new Set(), new Map([
    ['a', 50],
    ['b', 25]
  ]));

  assert.equal(result.completedWeight, 35);
  assert.equal(result.percentage, 35);
  assert.equal(result.completedStages, 0);
  assert.equal(result.isComplete, false);
});

test('a partially completed stage is in progress but does not unlock dependents', () => {
  const result = calculateProgressSnapshot([
    stage('a', 50),
    stage('b', 50, { prerequisiteIds: ['a'] })
  ], new Set(), new Map([
    ['a', 99]
  ]));

  assert.equal(result.stages[0].status, 'IN_PROGRESS');
  assert.equal(result.stages[0].isCompleted, false);
  assert.equal(result.stages[1].status, 'LOCKED');
  assert.equal(result.stages[1].isLocked, true);
  assert.equal(result.nextStep.id, 'a');
});

test('100 percent partial progress completes a stage and unlocks its dependent', () => {
  const result = calculateProgressSnapshot([
    stage('a', 50),
    stage('b', 50, { prerequisiteIds: ['a'] })
  ], new Set(), new Map([
    ['a', 100]
  ]));

  assert.equal(result.stages[0].status, 'COMPLETED');
  assert.equal(result.stages[0].isCompleted, true);
  assert.equal(result.stages[1].status, 'AVAILABLE');
  assert.equal(result.nextStep.id, 'b');
  assert.equal(result.completedStages, 1);
});

test('progress values are bounded to zero through one hundred', () => {
  const result = calculateProgressSnapshot([
    stage('a', 50),
    stage('b', 50)
  ], new Set(), new Map([
    ['a', 150],
    ['b', -20]
  ]));

  assert.equal(result.stages[0].progressPct, 100);
  assert.equal(result.stages[0].isCompleted, true);
  assert.equal(result.stages[1].progressPct, 0);
  assert.equal(result.percentage, 50);
});

test('invalid progress values are treated as zero', () => {
  const result = calculateProgressSnapshot([
    stage('a', 100)
  ], new Set(), new Map([
    ['a', Number.NaN]
  ]));

  assert.equal(result.percentage, 0);
  assert.equal(result.stages[0].progressPct, 0);
  assert.equal(result.stages[0].status, 'AVAILABLE');
});

test('completed ids remain backward compatible and override partial values', () => {
  const result = calculateProgressSnapshot([
    stage('a', 40),
    stage('b', 60)
  ], new Set(['a']), new Map([
    ['a', 10],
    ['b', 50]
  ]));

  assert.equal(result.percentage, 70);
  assert.equal(result.completedWeight, 70);
  assert.equal(result.completedStages, 1);
  assert.equal(result.stages[0].progressPct, 100);
});
