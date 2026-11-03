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
        | 'invalid_progress_completion_type'
        | 'invalid_registration_stage_config'
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
      stage.weight < 0 ||
      stage.weight > 100
    )
  ) {
    return {
      ok: false,
      error: 'progress_weights_must_equal_100',
      totalWeight
    };
  }

  if (totalWeight !== 100) {
    return {
      ok: false,
      error: 'progress_weights_must_equal_100',
      totalWeight
    };
  }

  const activeIds = new Set(stages.map(stage => stage.id));
  const graph = new Map<string, string[]>();

  for (const stage of stages) {
    if (!['MANUAL', 'REGISTRATION_STAGE'].includes(stage.completionType)) {
      return {
        ok: false,
        error: 'invalid_progress_completion_type',
        stageId: stage.id
      };
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
  completedIds: ReadonlySet<string>
) {
  const totalWeight = stages.reduce(
    (sum, stage) => sum + stage.weight,
    0
  );

  const completedWeight = stages.reduce(
    (sum, stage) =>
      sum + (completedIds.has(stage.id) ? stage.weight : 0),
    0
  );

  const completedStages = stages.filter(
    stage => completedIds.has(stage.id)
  ).length;

  const percentage = totalWeight > 0
    ? Math.round((completedWeight / totalWeight) * 100)
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

      const isCompleted = completedIds.has(stage.id);
      const isLocked =
        !validPrerequisites ||
        prerequisites.some(id => !completedIds.has(id));

      return {
        ...stage,
        isCompleted,
        isLocked: !isCompleted && isLocked,
        status: isCompleted
          ? 'COMPLETED'
          : isLocked
            ? 'LOCKED'
            : 'AVAILABLE'
      };
    });

  const nextStep = visibleStages.find(
    stage => !stage.isCompleted && !stage.isLocked
  ) ?? null;

  return {
    percentage,
    completedWeight,
    totalWeight,
    completedStages,
    totalStages: stages.length,
    isComplete: stages.length > 0 && completedStages === stages.length,
    stages: visibleStages,
    nextStep
  };
}
