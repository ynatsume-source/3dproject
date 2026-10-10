#!/usr/bin/env python3
"""Run unchanged witnesses from this bundle in a new output directory."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

JOBS = [('bounds', 'five-mm', True), ('bounds', 'fine-mark', True), ('bounds', 'focused', True), ('bounds', 'gap-partitions', True), ('intervals', 'scan-local', False)]

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('target', type=Path)
    p.add_argument('output', type=Path)
    a = p.parse_args()
    target, output = a.target.resolve(), a.output.resolve()
    bundle = Path(__file__).resolve().parent
    if output.exists() or output in [target, bundle]:
        p.error('Choose a new separate output directory.')
    loader, assets = target / 'node_modules/tsx/dist/loader.mjs', target / 'scripts/node-assets.mjs'
    if not loader.is_file() or not assets.is_file():
        p.error('Target checkout needs dependencies and scripts/node-assets.mjs.')
    output.mkdir(parents=True)
    rows = []
    for group, name, stdout_json in JOBS:
        dest = output / group
        dest.mkdir(exist_ok=True)
        original, script = bundle / group / (name + '.mjs'), dest / (name + '.mjs')
        shutil.copyfile(original, script)
        result = dest / (name + '-result.json')
        cmd = ['node', '--import', str(loader), '--import', str(assets), str(script), str(target)]
        if not stdout_json:
            cmd.append(str(result))
        with (dest / (name + '.stdout.log')).open('w') as stdout, (dest / (name + '.stderr.log')).open('w') as stderr:
            r = subprocess.run(cmd, cwd=target, stdout=stdout, stderr=stderr)
        if stdout_json:
            shutil.copyfile(dest / (name + '.stdout.log'), result)
        rows.append({'group': group, 'name': name, 'command': cmd, 'cwd': str(target), 'exitCode': r.returncode,
                     'scriptSha256': hashlib.sha256(script.read_bytes()).hexdigest(), 'resultExists': result.is_file(), 'exitZeroDoesNotMeanNoFindings': True})
        print(f'{group}/{name}: exit {r.returncode}', flush=True)
    (output / 'commands.json').write_text(json.dumps(rows, indent=2) + '\n')
    return int(any(x['exitCode'] or not x['resultExists'] for x in rows))

if __name__ == '__main__':
    raise SystemExit(main())
