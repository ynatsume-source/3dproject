// Isolated scheduling experiment on top of PR12. Never imported by resident/UI production code.
import { advance, startRun, toClock, toReal, type Ledger } from '../process-runner';
import type { EnvironmentSample, OperatorAction } from '../science-contract';
import { createHuskPrototype, HUSK_PROTOTYPE, type HuskAssumptions } from '../../science/prototypes/coconut-husk';

export interface WorkPlan {
  inspectionAfterIslandMs: number; // planning reminder, never a scientific completion criterion
  recoveryWorkWorldMs: number;    // explicit uncalibrated fixture work budget
  maxBoutWorldMs: number;         // scheduling granularity, not a kinetic acceleration
}
interface Job {
  id: string; runId: string; startIsland: number; workedWorldMs: number;
  plan: WorkPlan; assumptions: HuskAssumptions;
  lease: null | { actor: string; fromWorld: number; creditedThroughWorld: number; untilWorld: number };
  phase: 'soaking' | 'checking' | 'working' | 'settling' | 'recovered' | 'stopped';
  stopReason: string | null; recoveryAt: number | null; recoveryActor: string | null; outputLotIds: string[];
  result: 'fiber-fixture' | 'husk-returned' | null;
  dataStatus: 'unobserved' | 'available' | 'incomplete';
  looks: OperatorAction[];
}
export interface CordSession {
  schema: 'cord-workflow/1'; sequence: number; nowWorld: number;
  ledger: Ledger; jobs: Record<string, Job>;
  memory: { actor: string; job: string; atWorld: number; text: string }[];
}
export type CordCommand = { sequence: number } & (
  | { type: 'start'; job: string; actor: string; lots: string[]; equipment: string; plan: WorkPlan; assumptions: HuskAssumptions }
  | { type: 'tick'; atWorld: number }
  | { type: 'begin' | 'interrupt' | 'look' | 'cancel'; job: string; actor: string }
);
const integer = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const active = (j: Job) => !['recovered','stopped'].includes(j.phase);
const note = (s: CordSession, j: Job, actor: string, text: string) => s.memory.push({ actor,job:j.id,atWorld:s.nowWorld,text });
function valid(s: CordSession) {
  if (s.schema !== 'cord-workflow/1' || !integer(s.sequence) || !integer(s.nowWorld) || !s.ledger || !s.jobs || !Array.isArray(s.memory)) throw Error('invalid workflow save');
  for (const [id,j] of Object.entries(s.jobs)) {
    if (id !== j.id || !s.ledger.runs[j.runId] || !integer(j.startIsland) || !integer(j.workedWorldMs)
      || !j.plan || ![j.plan.inspectionAfterIslandMs,j.plan.recoveryWorkWorldMs,j.plan.maxBoutWorldMs].every(n=>integer(n)&&n>0)
      || j.workedWorldMs>j.plan.recoveryWorkWorldMs || !Array.isArray(j.looks) || !Array.isArray(j.outputLotIds)
      || !['soaking','checking','working','settling','recovered','stopped'].includes(j.phase)
      || (j.recoveryAt!==null&&(!integer(j.recoveryAt)||typeof j.recoveryActor!=='string'))
      || !['unobserved','available','incomplete'].includes(j.dataStatus) || (j.phase==='working'&&!j.lease) || ![null,'fiber-fixture','husk-returned'].includes(j.result)) throw Error('invalid job save');
    if (j.lease && (!active(j) || j.phase!=='working' || !j.lease.actor || !integer(j.lease.fromWorld)
      || !integer(j.lease.creditedThroughWorld) || !integer(j.lease.untilWorld)
      || j.lease.fromWorld>j.lease.creditedThroughWorld || j.lease.creditedThroughWorld>s.nowWorld
      || j.lease.untilWorld<j.lease.creditedThroughWorld)) throw Error('invalid work lease');
  }
  const actors=Object.values(s.jobs).flatMap(j=>j.lease?[j.lease.actor]:[]);
  if(new Set(actors).size!==actors.length)throw Error('duplicate actor lease');
}
export function newCordSession(ledger: Ledger, nowWorld: number): CordSession {
  const s: CordSession={schema:'cord-workflow/1',sequence:0,nowWorld,ledger:structuredClone(ledger),jobs:{},memory:[]};valid(s);return s;
}
function drive(s: CordSession, atWorld: number, weather: (islandAt:number)=>EnvironmentSample) {
  if(!integer(atWorld)||atWorld<s.nowWorld||atWorld-s.nowWorld>86_400_000)throw Error('invalid world interval');
  for(const j of Object.values(s.jobs)) {
    if(!active(j))continue;
    const lease=j.lease;
    if(lease) {
      const end=Math.min(atWorld,lease.untilWorld);
      j.workedWorldMs+=end-lease.creditedThroughWorld;lease.creditedThroughWorld=end;
      if(end===lease.untilWorld) {
        j.lease=null;j.phase='checking';j.stopReason=null;
        if(j.workedWorldMs===j.plan.recoveryWorkWorldMs) {
          j.recoveryAt=toClock('island',end);j.recoveryActor=lease.actor;j.phase='settling';
          s.memory.push({actor:lease.actor,job:j.id,atWorld:end,text:'回収の手作業を終えた。結果はまだ確認していない。'});
        }
      }
    }
    const actions=[...new Map(j.looks.map(a=>[a.at,a])).values(),...(j.recoveryAt===null?[]:[{at:j.recoveryAt,residentId:j.recoveryActor!,action:'recover_fixture'}])];
    // Each cell receives its own forcing. Views never call this or the science core.
    const results: ReturnType<typeof advance> = [];
    for(let batch=0;batch<100;batch++) {
      const part=advance(s.ledger,j.runId,createHuskPrototype(j.assumptions),{realNow:atWorld,environment:at=>{
        const e=weather(at);
        const known=['live','record','simulation'].includes(e.source)&&Number.isFinite(e.airTempC)&&integer(e.effectiveAt)&&e.effectiveAt<=at;
        if(!known)j.dataStatus='incomplete';else if(j.dataStatus==='unobserved')j.dataStatus='available';
        return e;
      },actions,maxMs:30_000});
      results.push(...part);if(part.length<400||part.some(r=>!r.ok))break;
    }
    const target=toClock('island',atWorld);
    if(['starting','running','needs-input'].includes(s.ledger.runs[j.runId].status) && s.ledger.runs[j.runId].lastTo<target-target%30_000)throw Error('catch-up bound exceeded');
    if(results.some(r=>!r.ok))throw Error('science commit refused');
    for(const r of results) {
      j.outputLotIds.push(...(r.produced??[]).map(l=>l.lotId));
      if(r.produced?.some(l=>l.materialId==='plant_fiber'))j.result='fiber-fixture';
      else if(r.produced?.some(l=>l.materialId==='coconut_husk'))j.result='husk-returned';
      for(const o of r.observations??[]) {
        for(const observer of j.looks.filter(a=>a.at===o.at))
          if(o.text)s.memory.push({actor:observer.residentId,job:j.id,atWorld:toReal('island',o.at),text:o.text});
      }
    }
    const run=s.ledger.runs[j.runId];
    j.looks=j.looks.filter(a=>a.at>=run.lastTo);
    if(run.status==='completed') {j.phase='recovered';j.lease=null;j.stopReason=null;}
    else if(['failed','stopped'].includes(run.status)) {j.phase='stopped';j.lease=null;j.stopReason='工程を停止した';}
    else if(j.phase==='soaking' && run.lastTo-j.startIsland>=j.plan.inspectionAfterIslandMs)j.phase='checking';
  }
  s.nowWorld=atWorld;
  s.memory.sort((a,b)=>a.atWorld-b.atWorld||a.job.localeCompare(b.job)||a.actor.localeCompare(b.actor));
}
/** Atomic single-writer command: a rejected command changes neither ledger nor memory.
 * Sequence is a compare-and-swap token and durable replay guard, not a bounded receipt cache. */
export function applyCordCommand(state: CordSession, cmd: CordCommand, weather: (at:number)=>EnvironmentSample): CordSession {
  valid(state);
  if(!['start','tick','begin','interrupt','look','cancel'].includes(cmd.type))throw Error('unknown workflow command');
  if(!integer(cmd.sequence)||cmd.sequence!==state.sequence+1)throw Error('stale or duplicate command');
  const s=structuredClone(state);
  if(cmd.type==='tick')drive(s,cmd.atWorld,weather);
  else if(cmd.type==='start') {
    if(Object.values(s.jobs).some(j=>j.lease?.actor===cmd.actor))throw Error('actor busy');
    if(!cmd.job || !cmd.actor || Object.hasOwn(s.jobs,cmd.job) || new Set(cmd.lots).size!==cmd.lots.length)throw Error('invalid job identity');
    const started=startRun(s.ledger,{processId:HUSK_PROTOTYPE,processVersion:'0.0.1',catalogVersion:'civ-sci-test-2',contract:'0.2.1',clock:'island',lotIds:cmd.lots,equipmentIds:[cmd.equipment],operator:cmd.actor},s.nowWorld);
    if(!started.run)throw Error(started.why);
    const j:Job={id:cmd.job,runId:started.run.runId,startIsland:started.run.lastTo,workedWorldMs:0,
      plan:structuredClone(cmd.plan),assumptions:structuredClone(cmd.assumptions),lease:null,phase:'soaking',stopReason:null,recoveryAt:null,recoveryActor:null,result:null,dataStatus:'unobserved',outputLotIds:[],looks:[]};
    Object.defineProperty(s.jobs,cmd.job,{value:j,writable:true,enumerable:true,configurable:true});
    note(s,j,cmd.actor,'殻と水を容器に置いた。別の仕事へ移れる。');
  } else {
    const j=Object.hasOwn(s.jobs,cmd.job)?s.jobs[cmd.job]:undefined;
    if(!j||!active(j)||!cmd.actor)throw Error('job unavailable');
    if(cmd.type==='begin') {
      if(j.phase!=='checking'||j.lease||Object.values(s.jobs).some(x=>x.lease?.actor===cmd.actor))throw Error('work or actor unavailable');
      const duration=Math.min(j.plan.maxBoutWorldMs,j.plan.recoveryWorkWorldMs-j.workedWorldMs);
      j.lease={actor:cmd.actor,fromWorld:s.nowWorld,creditedThroughWorld:s.nowWorld,untilWorld:s.nowWorld+duration};
      j.phase='working';j.stopReason=null;note(s,j,cmd.actor,'回収の手作業を始めた。');
    } else if(cmd.type==='interrupt') {
      if(j.lease?.actor!==cmd.actor)throw Error('not this actor’s work');
      j.lease=null;j.phase='checking';j.stopReason='手作業を中断';note(s,j,cmd.actor,'手を止めた。続きは残してある。');
    } else if(cmd.type==='look') {
      // Observation only when the existing science step actually executes this action.
      const at=Math.max(toClock('island',s.nowWorld),s.ledger.runs[j.runId].lastTo);
      if(!j.looks.some(a=>a.at===at&&a.residentId===cmd.actor))j.looks.push({at,residentId:cmd.actor,action:'look'});
    } else {
      if(j.phase==='settling')throw Error('recovery already queued; await settlement');
      // Core owns stopping settlement; never delete or return lots in the controller.
      const results=advance(s.ledger,j.runId,createHuskPrototype(j.assumptions),{realNow:s.nowWorld,environment:weather,stop:'operator'});
      if(!results.length||results.some(r=>!r.ok))throw Error('cannot stop run');
      j.outputLotIds.push(...results.flatMap(r=>(r.produced??[]).map(l=>l.lotId)));
      j.lease=null;j.phase='stopped';j.stopReason='取りやめ';note(s,j,cmd.actor,'作業を取りやめた。');
    }
  }
  s.sequence=cmd.sequence;valid(s);return s;
}
/** Resume explicitly: no offline hand work is credited. Unknown passive forcing marks history incomplete. */
export function restoreCordSession(json: string, atWorld: number): CordSession {
  const s=JSON.parse(json) as CordSession;valid(s);
  for(const j of Object.values(s.jobs)) {
    j.looks=[]; // Unexecuted observation requests do not become sightings while residents are offline.
    if(j.lease) {j.lease=null;j.phase='checking';j.stopReason='再開待ち';}
  }
  drive(s,atWorld,at=>({sampleId:'env:offline',source:'unknown',effectiveAt:at}));
  // Invalidate any command prepared against the pre-restart snapshot.
  s.sequence++;valid(s);return s;
}
/** Value-only projection: no senses, options, clock reads, physics, memory writes or hidden state. */
export function projectCordWorkflow(s: CordSession) {
  return Object.values(s.jobs).map(j=>({id:j.id,phase:j.phase,actor:j.lease?.actor??null,
    current:({soaking:'浸して待つ',checking:'取り出して確かめる',working:'回収の手作業',settling:'回収結果の反映待ち',recovered:'回収済み・縄は未完成',stopped:'停止'} as const)[j.phase],
    estimate:j.phase==='soaking'?{kind:'確認予定まで（試験計画・完了保証なし）',clock:'island',remainingMs:Math.max(0,j.plan.inspectionAfterIslandMs-(s.ledger.runs[j.runId].lastTo-j.startIsland))}
      :{kind:'残りの手作業（未校正の試験量）',clock:'world',remainingMs:Math.max(0,j.plan.recoveryWorkWorldMs-j.workedWorldMs)},
    dataStatus:j.dataStatus,stopReason:j.stopReason??(j.dataStatus==='incomplete'?'環境記録が不足（完了保証なし）':null),next:j.phase==='recovered'?(j.result==='fiber-fixture'?'試験繊維を回収。乾燥・撚りは未実装':'殻が未分離で戻った。条件を見直す'):j.phase==='stopped'?'残った材料を確認して計画し直す':'待機中は別の暮らしへ／手作業は小分けで再開',
    settledLots:j.outputLotIds.slice(),prototype:true,
  }));
}
export function cordResidentMemory(s: CordSession, actor: string) {return s.memory.filter(m=>m.actor===actor).map(m=>({...m}));}
