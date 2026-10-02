// The study belongs to the world. The model/UI and optional language model only read it.
export type StudyAction = 'observe' | 'draw' | 'explore' | 'rest' | 'share';
export type StudyFocus = 'patterns' | 'brightness' | 'horizon';
export interface StudyPlace { id: string; name: string; x: number; z: number; openSky: boolean }
export interface StudyCompanion { id: string; name: string; x: number; z: number }
export interface StudyWorld {
  atMs: number; lat: number; lon: number; battery: number; position: [number, number];
  cloud: number | null; cloudSource: 'live' | 'simulation' | 'unknown';
  places: StudyPlace[]; companions: StudyCompanion[]; offline: boolean;
}
export interface StudyOption { id: string; action: StudyAction; label: string; targetId: string; x: number; z: number }
export interface StudyProposal { optionId: string; reason: string; focus: StudyFocus; question: string; caption?: string }
export interface StudyIntent extends StudyProposal {
  id: string; action: StudyAction; targetId: string; x: number; z: number;
  startedAt: number; source: 'rules' | 'ai'; duration: number;
}
export interface StudyObservation {
  id: string; atMs: number; lat: number; lon: number; starIds: string[];
  placeId: string; placeName: string; cloud: number; cloudSource: StudyWorld['cloudSource'];
  offline: boolean; focus: StudyFocus;
}
export interface StudyWork {
  id: string; title: string; question: string; focus: StudyFocus; createdAt: number;
  updatedAt: number; completedAt?: number; observationIds: string[];
  revisions: number; caption: string; sharedWith: string[];
}
export interface StudyMemory {
  id: string; atMs: number; kind: 'observation' | 'drawing' | 'exploration' | 'rest' | 'sharing' | 'interrupted' | 'failed';
  text: string; relatedId?: string; offline: boolean;
}
export interface StudyDecision {
  atMs: number; intentId: string; action: StudyAction; reason: string;
  source: 'rules' | 'ai'; outcome: 'started' | 'completed' | 'interrupted' | 'failed';
}
export interface StudyState {
  version: 1; sequence: number; interest: Record<StudyFocus, number>;
  memories: StudyMemory[]; observations: StudyObservation[]; works: StudyWork[];
  decisions: StudyDecision[]; active: StudyIntent | null; lastDecisionAt: number;
  lastAiAt: number; aiEnabled: boolean; lastIssue: string;
}
export interface StudyBrainInput {
  profile: string; world: StudyWorld; options: StudyOption[];
  interests: StudyState['interest']; memories: StudyMemory[]; work: StudyWork | null;
}
export type StudyBrain = (input: StudyBrainInput, signal: AbortSignal) => Promise<unknown>;
export interface StudyCompletion { success: boolean; text: string; work?: StudyWork; observation?: StudyObservation }
