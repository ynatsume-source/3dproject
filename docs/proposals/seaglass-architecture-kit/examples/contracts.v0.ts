/**
 * Seaglass design examples, v0.1 — NOT connected to the application.
 * Type definitions only. They do not implement validation, persistence,
 * authentication, a world loop, or an API provider.
 * Numbers crossing a runtime boundary must be validated there.
 */
export type WorldId = string;
export type RegionId = string;
export type EntityId = string;
export type DefinitionId = string;
export type EventId = string;

export interface LocalPosition {
  readonly regionId: RegionId;
  /** Proposed local coordinates in metres; confirm axes before migration. */
  readonly xM: number;
  readonly yM: number;
  readonly zM: number;
}

export interface WorldHeader {
  readonly schemaVersion: number;
  readonly contentVersion: string;
  readonly generatorVersion: string;
  readonly worldId: WorldId;
  readonly seed: string;
  readonly tick: number;
  readonly worldTimeUtcMs: number;
  readonly lastEventSequence: number;
  readonly savedAtRealUtcMs: number;
}

export interface Memory {
  readonly id: string;
  readonly ownerId: EntityId;
  readonly kind: 'experience' | 'interpretation' | 'belief';
  readonly worldTimeUtcMs: number;
  readonly sourceEventIds: readonly EventId[];
  readonly relatedEntityIds: readonly EntityId[];
  readonly text: string;
  readonly visibility: 'private' | 'public';
  /** Application validation constrains this to 0..1. */
  readonly importance: number;
}

export type ResidentAction =
  | { readonly type: 'moveTo'; readonly destination: LocalPosition }
  | { readonly type: 'observe'; readonly targetId: EntityId; readonly durationSeconds: number }
  | { readonly type: 'rest'; readonly durationSeconds: number }
  | { readonly type: 'speak'; readonly text: string; readonly recipientId: EntityId | null };

export interface PerceivedEntity {
  readonly id: EntityId;
  readonly definitionId: DefinitionId;
  readonly position: LocalPosition;
  readonly observedFacts: readonly string[];
}

export interface BrainContext {
  readonly contractVersion: 1;
  readonly worldId: WorldId;
  readonly actorId: EntityId;
  readonly observedAtTick: number;
  readonly worldTimeUtcMs: number;
  /** Changes when this resident's plan is replaced, NOT on every world tick. */
  readonly planRevision: number;
  readonly personality: Readonly<Record<string, number>>;
  readonly needs: Readonly<Record<string, number>>;
  readonly currentGoal: string;
  readonly perceivedEntities: readonly PerceivedEntity[];
  readonly relevantMemories: readonly Memory[];
  readonly allowedActions: readonly ResidentAction['type'][];
}

export interface DecisionProposal {
  readonly contractVersion: 1;
  readonly decisionId: string;
  readonly actorId: EntityId;
  readonly observedAtTick: number;
  readonly expectedPlanRevision: number;
  readonly action: ResidentAction;
}

export interface DecisionRequest {
  readonly context: BrainContext;
  /** Assigned by the host, not trusted when echoed by a model. */
  readonly deadlineRealUtcMs: number;
}

export type DecisionResult =
  | { readonly status: 'proposal'; readonly proposal: DecisionProposal }
  | { readonly status: 'unavailable'; readonly reason: 'timeout' | 'budget' | 'provider' | 'cancelled' };

export interface BrainProvider {
  readonly providerId: string;
  readonly modelId: string;
  readonly promptVersion: string;
  plan(request: DecisionRequest): Promise<DecisionResult>;
}

export type DecisionApplication =
  | { readonly status: 'applied'; readonly decisionId: string; readonly appliedAtTick: number }
  | { readonly status: 'rejected'; readonly decisionId: string;
      readonly reason: 'expired' | 'stale-plan' | 'forbidden' | 'invalid' | 'unreachable' | 'missing-target' | 'duplicate' };

export interface ResidentState {
  readonly entityId: EntityId;
  readonly definitionId: DefinitionId;
  readonly displayName: string;
  readonly position: LocalPosition;
  readonly personality: Readonly<Record<string, number>>;
  readonly needs: Readonly<Record<string, number>>;
  readonly goal: string;
  readonly planRevision: number;
  readonly activeAction: ResidentAction | null;
  readonly actionStartedAtTick: number | null;
  readonly memoryIds: readonly string[];
}

export interface WorldEvent {
  readonly id: EventId;
  readonly worldId: WorldId;
  readonly sequence: number;
  readonly tick: number;
  readonly worldTimeUtcMs: number;
  readonly kind: 'action-completed' | 'observation-recorded' | 'region-entered';
  readonly actorId: EntityId;
  readonly relatedEntityIds: readonly EntityId[];
  readonly regionId: RegionId;
}

/** Minimal resident experiment, not a complete ecological world snapshot. */
export interface ResidentExperimentSnapshot {
  readonly scope: 'resident-experiment-v1';
  readonly header: WorldHeader;
  readonly residents: readonly ResidentState[];
  readonly memories: readonly Memory[];
  readonly recentEvents: readonly WorldEvent[];
  readonly rngStates: Readonly<Record<string, string>>;
}

export type LoadResult<T> =
  | { readonly status: 'found'; readonly snapshot: T }
  | { readonly status: 'missing' }
  | { readonly status: 'unsupported-version'; readonly foundVersion: number }
  | { readonly status: 'error'; readonly message: string };

export type SaveResult =
  | { readonly status: 'saved' }
  | { readonly status: 'conflict' }
  | { readonly status: 'error'; readonly message: string };

/** The adapter must validate values at runtime and handle partial failure safely. */
export interface SnapshotStore<T> {
  load(worldId: WorldId): Promise<LoadResult<T>>;
  save(worldId: WorldId, snapshot: T): Promise<SaveResult>;
}
