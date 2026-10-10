#!/usr/bin/env python3
"""Copy diagnostics to a new output directory; never replace published witnesses."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('target', type=Path)
    p.add_argument('parent', type=Path)
    p.add_argument('output', type=Path)
    p.add_argument('--only', choices=['vessel', 'intervals', 'bounds'])
    a = p.parse_args()
    target, parent, output = (x.resolve() for x in [a.target, a.parent, a.output])
    bundle = Path(__file__).resolve().parent
    if output.exists() or output in [target, parent, bundle]:
        p.error('Choose a new, separate output directory.')
    loader, assets = target / 'node_modules/tsx/dist/loader.mjs', target / 'scripts/node-assets.mjs'
    if not loader.is_file() or not assets.is_file():
        p.error('Target source requires dependencies and scripts/node-assets.mjs.')
    jobs = {
        'vessel': [('original-repro', True, False), ('legacy-compatibility', True, False), ('fix-check', False, False)],
        'intervals': [('repro', False, False), ('scan-local', False, False), ('subsecond-peak', False, False)],
        'bounds': [('repro', False, True), ('focused', False, True), ('fine-mark', False, True), ('five-mm', False, True), ('gap-partitions', False, True)],
    }
    output.mkdir(parents=True)
    rows = []
    for group, entries in jobs.items():
        if a.only and group != a.only:
            continue
        dest = output / group
        dest.mkdir()
        for name, needs_parent, stdout_result in entries:
            script = dest / (name + '.mjs')
            shutil.copyfile(bundle / group / (name + '.mjs'), script)
            result = dest / (name + '.result.json')
            command = ['node', '--import', str(loader), '--import', str(assets), str(script), str(target)]
            if needs_parent:
                command.append(str(parent))
            if not stdout_result:
                command.append(str(result))
            with (dest / (name + '.stdout.log')).open('w') as stdout, (dest / (name + '.stderr.log')).open('w') as stderr:
                r = subprocess.run(command, cwd=target, stdout=stdout, stderr=stderr)
            if stdout_result:
                shutil.copyfile(dest / (name + '.stdout.log'), result)
            rows.append({'group': group, 'name': name, 'command': command, 'exitCode': r.returncode, 'resultExists': result.is_file(), 'exitZeroDoesNotMeanNoFindings': True})
            print(f'{group}/{name}: exit {r.returncode}', flush=True)
    (output / 'commands.json').write_text(json.dumps(rows, indent=2) + '\n')
    return int(any(x['exitCode'] or not x['resultExists'] for x in rows))

if __name__ == '__main__':
    raise SystemExit(main())
