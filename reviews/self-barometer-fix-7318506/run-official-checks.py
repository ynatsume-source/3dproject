#!/usr/bin/env python3
"""Run affected official checks in an isolated detached source; retain complete logs."""
import argparse
import concurrent.futures
import json
from pathlib import Path
import subprocess

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('source', type=Path)
    p.add_argument('output', type=Path)
    a = p.parse_args()
    source, out = a.source.resolve(), a.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    names = ['science-barometer-pot-check', 'science-vessel-check', 'science-barometer-check', 'science-fired-pot-assembly-check', 'science-review-regressions', 'science-step-check']
    cmds = [(name, ['node', '--import', 'tsx', '--import', './scripts/node-assets.mjs', 'scripts/' + name + '.ts']) for name in names]
    cmds += [('typecheck', ['npm', 'run', 'typecheck'])]
    def run(item):
        name, cmd = item
        r = subprocess.run(cmd, cwd=source, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        (out / (name + '.log')).write_text(r.stdout)
        row = {'name': name, 'command': cmd, 'exitCode': r.returncode, 'lastLines': r.stdout.splitlines()[-5:]}
        print(json.dumps(row), flush=True)
        return row
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        rows = list(pool.map(run, cmds))
    build = run(('build', ['npm', 'run', 'build']))
    rows.append(build)
    # The tsx CLI opens an IPC socket unavailable in this sandbox. Execute the same
    # TypeScript stages via the loader if Vite finished and this is the only block.
    build_text = (out / 'build.log').read_text()
    if build['exitCode'] and 'built in' in build_text and 'listen EPERM' in build_text and '/tsx-' in build_text:
        build['environmentOnlyFailure'] = 'tsx CLI IPC socket unavailable; Vite succeeded'
        for name, script in [('build-og-loader', 'og-pages'), ('build-journal-loader', 'journal-pages')]:
            rows.append(run((name, ['node', '--import', 'tsx', '--import', './scripts/node-assets.mjs', 'scripts/' + script + '.ts'])))
    (out / 'verification.json').write_text(json.dumps(rows, indent=2) + '\n')
    return int(any(r['exitCode'] != 0 and not r.get('environmentOnlyFailure') for r in rows))

if __name__ == '__main__':
    raise SystemExit(main())
