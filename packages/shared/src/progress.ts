export type ProgressStageInput = {
  id: string;
  weight: number;
  isActive: boolean;
  isVisible: boolean;
  completionType: string;
  completionConfig?: unknown;
  prerequisiteIds?: unknown;
};

export type ProgressValidationResult =
  | { ok: true; totalWeight: number }
  | {
      ok: false;
      error:
        | 'progress_stages_required'
        | 'progress_weights_must_equal_100'
        | 'invalid_progress_points'
        | 'invalid_progress_completion_type'
        | 'invalid_registration_stage_config'
        | 'invalid_academy_lesson_config'
        | 'duplicate_academy_lesson_config'
        | 'invalid_progress_prerequisites'
        | 'progress_prerequisite_cycle';
      stageId?: string;
      totalWeight?: number;
    };

export function validateProgressStages(
  allStages: ProgressStageInput[],
  registrationOrder: readonly string[]
): ProgressValidationResult {
  const stages = allStages.filter(stage => stage.isActive);

  if (stages.length === 0) {
    return { ok: false, error: 'progress_stages_required' };
  }

  const totalWeight = stages.reduce((sum, stage) => sum + stage.weight, 0);

  if (
    stages.some(stage =>
      !Number.isInteger(stage.weight) ||
      stage.weight < 1 ||
      stage.weight > 1_000_000
    ) ||
    totalWeight > 1_000_000_000
  ) {
    return {
      ok: false,
      error: 'invalid_progress_points',
      totalWeight
    };
  }

  const activeIds = new Set(stages.map(stage => stage.id));
  const graph = new Map<string, string[]>();
  const academyLessonIds = new Set<string>();

  for (const stage of stages) {
    if (!['MANUAL', 'REGISTRATION_STAGE', 'ACADEMY_LESSON'].includes(stage.completionType)) {
      return {
        ok: false,
        error: 'invalid_progress_completion_type',
        stageId: stage.id
      };
    }

    if (stage.completionType === 'ACADEMY_LESSON') {
      const config = stage.completionConfig;
      const lessonId =
        config &&
        typeof config === 'object' &&
        !Array.isArray(config)
          ? (config as Record<string, unknown>).lessonId
          : undefined;

      if (typeof lessonId !== 'string' || !lessonId.trim()) {
        return {
          ok: false,
          error: 'invalid_academy_lesson_config',
          stageId: stage.id
        };
      }

      if (academyLessonIds.has(lessonId)) {
        return {
          ok: false,
          error: 'duplicate_academy_lesson_config',
          stageId: stage.id
        };
      }

      academyLessonIds.add(lessonId);
    }

    if (stage.completionType === 'REGISTRATION_STAGE') {
      const config = stage.completionConfig;
      const target =
        config &&
        typeof config === 'object' &&
        !Array.isArray(config)
          ? (config as Record<string, unknown>).targetStage
          : undefined;

      if (
        typeof target !== 'string' ||
        !registrationOrder.includes(target)
      ) {
        return {
          ok: false,
          error: 'invalid_registration_stage_config',
          stageId: stage.id
        };
      }
    }

    const raw = stage.prerequisiteIds ?? [];

    if (
      !Array.isArray(raw) ||
      raw.some((id: unknown) => typeof id !== 'string')
    ) {
      return {
        ok: false,
        error: 'invalid_progress_prerequisites',
        stageId: stage.id
      };
    }

    const prerequisites = raw as string[];

    if (
      new Set(prerequisites).size !== prerequisites.length ||
      prerequisites.some(id => !activeIds.has(id) || id === stage.id)
    ) {
      return {
        ok: false,
        error: 'invalid_progress_prerequisites',
        stageId: stage.id
      };
    }

    graph.set(stage.id, prerequisites);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const hasCycle = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;

    visiting.add(id);

    for (const prerequisiteId of graph.get(id) ?? []) {
      if (hasCycle(prerequisiteId)) return true;
    }

    visiting.delete(id);
    visited.add(id);
    return false;
  };

  for (const stage of stages) {
    if (hasCycle(stage.id)) {
      return {
        ok: false,
        error: 'progress_prerequisite_cycle',
        stageId: stage.id
      };
    }
  }

  return { ok: true, totalWeight };
}

export type ProgressSnapshotStage = {
  id: string;
  isVisible: boolean;
  weight: number;
  prerequisiteIds?: unknown;
};

export function calculateProgressSnapshot(
  stages: ProgressSnapshotStage[],
  completedIds: ReadonlySet<string>,
  progressPctByStage: ReadonlyMap<string, number> = new Map()
) {
  const getProgressPct = (stageId: string): number => {
    if (completedIds.has(stageId)) return 100;

    const raw = progressPctByStage.get(stageId);
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;

    return Math.max(0, Math.min(100, raw));
  };

  const totalWeight = stages.reduce(
    (sum, stage) => sum + stage.weight,
    0
  );

  const progressWeight = stages.reduce(
    (sum, stage) =>
      sum + stage.weight * getProgressPct(stage.id) / 100,
    0
  );

  const completedStages = stages.filter(
    stage => getProgressPct(stage.id) >= 100
  ).length;

  const percentage = totalWeight > 0
    ? Math.round((progressWeight / totalWeight) * 100)
    : 0;

  const visibleStages = stages
    .filter(stage => stage.isVisible)
    .map(stage => {
      const raw = stage.prerequisiteIds ?? [];

      const validPrerequisites =
        Array.isArray(raw) &&
        raw.every((id: unknown) => typeof id === 'string');

      const prerequisites = validPrerequisites
        ? raw as string[]
        : [];

      const progressPct = getProgressPct(stage.id);
      const isCompleted = progressPct >= 100;
      const isLocked =
        !validPrerequisites ||
        prerequisites.some(id => getProgressPct(id) < 100);

      return {
        ...stage,
        progressPct,
        isCompleted,
        isLocked: !isCompleted && isLocked,
        status: isCompleted
          ? 'COMPLETED'
          : isLocked
            ? 'LOCKED'
            : progressPct > 0
              ? 'IN_PROGRESS'
              : 'AVAILABLE'
      };
    });

  const nextStep = visibleStages.find(
    stage => !stage.isCompleted && !stage.isLocked
  ) ?? null;

  return {
    percentage,
    completedWeight: progressWeight,
    totalWeight,
    completedStages,
    totalStages: stages.length,
    isComplete: stages.length > 0 && completedStages === stages.length,
    stages: visibleStages,
    nextStep
  };
}
