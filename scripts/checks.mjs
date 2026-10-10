// Headless checks only. Browser/GLSL/HUD checks remain separate manual checks.
// Examples:
//   node scripts/checks.mjs fast
//   node scripts/checks.mjs slow --shard 1/4
//   node scripts/checks.mjs all --only worlds,science-integration --out /tmp/checks
//   node scripts/checks.mjs --list
import { spawn } from 'node:child_process';
import { appendFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checks } from './check-manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function validateManifest(directory = path.join(root, 'scripts'), manifest = checks) {
  const actual = (await readdir(directory)).filter((file) => file.endsWith('-check.ts')).sort();
  const files = manifest.map((check) => path.basename(check.file));
  const duplicates = [...new Set(files.filter((file, i) => files.indexOf(file) !== i))];
  const missing = actual.filter((file) => !files.includes(file));
  const stale = files.filter((file) => !actual.includes(file));
  const invalid = manifest.filter((check) => !['fast', 'slow'].includes(check.group)
    || !['assertion', 'diagnostic'].includes(check.kind)
    || !Number.isFinite(check.timeoutSeconds) || check.timeoutSeconds <= 0
    || check.file !== `scripts/${check.name}-check.ts`);
  if (duplicates.length || missing.length || stale.length || invalid.length) {
    throw new Error(`Invalid check manifest: ${JSON.stringify({ duplicates, missing, stale, invalid: invalid.map((check) => check.name) })}`);
  }
}

function options(args) {
  const opts = { group: 'fast', only: null, shard: null, list: false, out: null };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['fast', 'slow', 'all'].includes(arg)) opts.group = arg;
    else if (arg === '--list') opts.list = true;
    else if (['--only', '--shard', '--out'].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      opts[arg.slice(2)] = value;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (opts.only) {
    opts.only = opts.only.split(',');
    const unknown = opts.only.filter((name) => !checks.some((check) => check.name === name));
    if (unknown.length) throw new Error(`Unknown checks: ${unknown.join(', ')}`);
  }
  if (opts.shard) {
    const match = /^(\d+)\/(\d+)$/.exec(opts.shard);
    if (!match || +match[1] < 1 || +match[1] > +match[2]) throw new Error('Shard must be N/TOTAL, with 1 <= N <= TOTAL');
    opts.shard = { index: +match[1], count: +match[2] };
  }
  return opts;
}

export function selectChecks(opts, manifest = checks) {
  let selected = manifest.filter((check) => opts.group === 'all' || check.group === opts.group);
  if (opts.only) {
    const wrongGroup = opts.only.filter((name) => !selected.some((check) => check.name === name));
    if (wrongGroup.length) throw new Error(`Checks outside ${opts.group}: ${wrongGroup.join(', ')}`);
    selected = selected.filter((check) => opts.only.includes(check.name));
  }
  if (opts.shard) selected = selected.filter((_, i) => i % opts.shard.count === opts.shard.index - 1);
  return selected;
}

export async function runCheck(check, directory, outputDirectory) {
  const args = ['--import', 'tsx', '--import', './scripts/node-assets.mjs', check.file];
  const logName = `${check.name}.log`, log = createWriteStream(path.join(outputDirectory, logName));
  const start = performance.now();
  log.write(`$ node ${args.join(' ')}\nTimeout: ${check.timeoutSeconds} s\n\n`);
  return await new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    let timedOut = false, error = null, cancelledSignal = null, forceTimer;
    const kill = (signal) => {
      try { process.platform === 'win32' ? child.kill(signal) : process.kill(-child.pid, signal); } catch { /* already gone */ }
    };
    const timer = setTimeout(() => {
      timedOut = true; log.write(`\nTIMEOUT after ${check.timeoutSeconds} s\n`); kill('SIGTERM');
      forceTimer = setTimeout(() => kill('SIGKILL'), 3000);
    }, check.timeoutSeconds * 1000);
    const cancel = (signal) => {
      if (cancelledSignal) { kill('SIGKILL'); return; }
      cancelledSignal = signal; clearTimeout(timer);
      log.write(`\nCANCELLED by ${signal}\n`); kill('SIGTERM');
      forceTimer = setTimeout(() => kill('SIGKILL'), 3000);
    };
    const interrupt = () => cancel('SIGINT'), terminate = () => cancel('SIGTERM');
    process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
    child.stdout.on('data', (data) => log.write(data));
    child.stderr.on('data', (data) => log.write(data));
    child.on('error', (err) => { error = err.message; log.write(`\nSPAWN ERROR: ${error}\n`); });
    child.on('close', (code, signal) => {
      clearTimeout(timer); clearTimeout(forceTimer);
      process.off('SIGINT', interrupt); process.off('SIGTERM', terminate);
      // The parent may close before descendants with independent stdio. Reap
      // the remaining process group even if they ignored the first SIGTERM.
      if (timedOut || cancelledSignal) kill('SIGKILL');
      const elapsedSeconds = +(performance.now() - start).toFixed(0) / 1000;
      const status = cancelledSignal ? 'cancelled' : timedOut ? 'timed-out' : error ? 'error' : code !== 0 ? 'failed' : check.kind === 'diagnostic' ? 'completed' : 'passed';
      const result = { ...check, status, exitCode: code, signal, cancelledSignal, elapsedSeconds, error, log: logName };
      log.end(`\n${status.toUpperCase()}: exit=${code}, signal=${signal ?? '-'}, ${elapsedSeconds} s\n`, () => resolve(result));
    });
  });
}

function markdown(results, title) {
  const failed = results.filter((result) => !['passed', 'completed'].includes(result.status));
  return `## Headless checks: ${title}\n\n${failed.length ? `${failed.length} failed processes.` : 'All selected processes finished successfully.'} Assertion checks and measurement-only diagnostics are listed separately; inspect diagnostic logs for their measurements and any skipped scenarios.\n\n`
    + '| Check | Kind | Result | Seconds | Log |\n| --- | --- | --- | ---: | --- |\n'
    + results.map((result) => `| ${result.name} | ${result.kind} | ${result.status} | ${result.elapsedSeconds} | ${result.log} |`).join('\n') + '\n';
}

async function main() {
  const opts = options(process.argv.slice(2));
  await validateManifest();
  const selected = selectChecks(opts);
  if (opts.list) {
    console.log(`Manifest valid: ${checks.length} TypeScript checks (${checks.filter((check) => check.group === 'fast').length} fast, ${checks.filter((check) => check.group === 'slow').length} slow). Browser checks are separate.`);
    for (const check of selected) console.log(`${check.group}\t${check.kind}\t${check.timeoutSeconds}s\t${check.file}`);
    return;
  }
  if (!selected.length) throw new Error('No checks selected');
  const title = `${opts.group}${opts.shard ? ` ${opts.shard.index}/${opts.shard.count}` : ''}`;
  const outputDirectory = path.resolve(opts.out ?? path.join(root, 'check-results', title.replaceAll('/', '-').replaceAll(' ', '-')));
  await mkdir(outputDirectory, { recursive: true });
  const results = [];
  for (const check of selected) {
    console.log(`RUN ${check.name} (${check.kind}, timeout ${check.timeoutSeconds}s)`);
    const result = await runCheck(check, root, outputDirectory);
    results.push(result);
    console.log(`${result.status.toUpperCase()} ${check.name}: ${result.elapsedSeconds}s, log ${path.join(outputDirectory, result.log)}`);
    // Keep partial results useful if a job is cancelled before the final check.
    await writeFile(path.join(outputDirectory, 'results.json'), JSON.stringify(results, null, 2) + '\n');
    await writeFile(path.join(outputDirectory, 'summary.md'), markdown(results, title));
    if (result.status === 'cancelled') break;
  }
  const summary = markdown(results, title);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  const failed = results.filter((result) => !['passed', 'completed'].includes(result.status));
  console.log(`Finished ${results.length} checks: ${results.filter((result) => result.status === 'passed').length} assertion passes, ${results.filter((result) => result.status === 'completed').length} diagnostics completed, ${failed.length} failures.`);
  const cancelled = results.find((result) => result.cancelledSignal);
  if (failed.length) process.exitCode = cancelled ? (cancelled.cancelledSignal === 'SIGINT' ? 130 : 143) : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
