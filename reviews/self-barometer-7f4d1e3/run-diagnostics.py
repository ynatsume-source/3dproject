#!/usr/bin/env python3
"""Run copies of the review diagnostics, keeping the bundled witnesses unchanged."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", type=Path, help="Isolated 7f4d1e3 source with dependencies")
    parser.add_argument("parent", type=Path, help="Isolated dcdcf55 source with dependencies")
    parser.add_argument("output", type=Path, help="New directory for copied scripts and results")
    parser.add_argument("--only", choices=["bounds", "intervals", "vessel", "mass", "physics", "host"])
    args = parser.parse_args()
    target, parent, output = (p.resolve() for p in (args.target, args.parent, args.output))
    bundle = Path(__file__).resolve().parent
    if output.exists():
        parser.error("Output must be a new directory; bundled evidence is never overwritten.")
    if output == bundle or output in [target, parent]:
        parser.error("Choose a separate output directory.")
    for directory in (target, parent):
        if not (directory / "src/science/step/vessel.ts").is_file():
            parser.error(f"Source missing in {directory}")
    loader = target / "node_modules/tsx/dist/loader.mjs"
    assets = target / "scripts/node-assets.mjs"
    if not loader.is_file() or not assets.is_file():
        parser.error("Target requires its existing tsx dependency and scripts/node-assets.mjs.")
    output.mkdir(parents=True)
    rows = []
    names = [args.only] if args.only else ["bounds", "intervals", "vessel", "mass", "physics", "host"]
    for name in names:
        dest = output / name
        dest.mkdir()
        script = dest / "repro.mjs"
        shutil.copyfile(bundle / name / "repro.mjs", script)
        result = dest / "result.json"
        command = ["node", "--import", str(loader), "--import", str(assets), str(script), str(target)]
        if name == "vessel":
            command.extend([str(parent), str(result)])
        elif name != "bounds":
            command.append(str(result))
        with (dest / "stdout.log").open("w") as stdout, (dest / "stderr.log").open("w") as stderr:
            proc = subprocess.run(command, cwd=target, stdout=stdout, stderr=stderr)
        if name == "bounds":
            shutil.copyfile(dest / "stdout.log", result)
        rows.append({"name": name, "command": command, "cwd": str(target), "exitCode": proc.returncode,
                     "resultExists": result.is_file(), "exitZeroDoesNotMeanNoFindings": True})
        print(f"{name}: exit {proc.returncode}, result {result}", flush=True)
    (output / "commands.json").write_text(json.dumps(rows, indent=2) + "\n")
    return 1 if any(row["exitCode"] != 0 or not row["resultExists"] for row in rows) else 0


if __name__ == "__main__":
    raise SystemExit(main())
