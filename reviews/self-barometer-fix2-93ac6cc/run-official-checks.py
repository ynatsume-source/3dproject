#!/usr/bin/env python3
"""Run the changed process's official regression, typecheck and build stages."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('source', type=Path)
    p.add_argument('output', type=Path)
    a = p.parse_args()
    source, output = a.source.resolve(), a.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    def run(item):
        name, cmd = item
        r = subprocess.run(cmd, cwd=source, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        (output / (name + '.log')).write_text(r.stdout)
        row = {'name': name, 'command': cmd, 'cwd': str(source), 'exitCode': r.returncode, 'lastLines': r.stdout.splitlines()[-5:]}
        print(json.dumps(row), flush=True)
        return row
    initial = [('science-barometer-pot-check', ['node', '--import', 'tsx', '--import', './scripts/node-assets.mjs', 'scripts/science-barometer-pot-check.ts']),
               ('typecheck', ['npm', 'run', 'typecheck'])]
    with ThreadPoolExecutor(max_workers=2) as pool:
        rows = list(pool.map(run, initial))
    # Execute the package.json build stages directly. The tsx CLI's IPC socket is
    # unavailable in this sandbox; node's loader runs the identical TS scripts.
    for item in [('build-vite', ['node', 'node_modules/vite/bin/vite.js', 'build']),
                 ('build-og', ['node', '--import', 'tsx', '--import', './scripts/node-assets.mjs', 'scripts/og-pages.ts']),
                 ('build-journal', ['node', '--import', 'tsx', '--import', './scripts/node-assets.mjs', 'scripts/journal-pages.ts'])]:
        row = run(item)
        rows.append(row)
        if row['exitCode']:
            break
    (output / 'verification.json').write_text(json.dumps(rows, indent=2) + '\n')
    return int(any(r['exitCode'] != 0 for r in rows))

if __name__ == '__main__':
    raise SystemExit(main())
