#!/usr/bin/env python3
"""Static checks for a design catalog. This is not a process/world simulator."""

import argparse
from collections import Counter
import json
from pathlib import Path
import re


ELEMENTS = set("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og".split())
KINDS = {"physical", "chemical", "assembly", "energy", "measurement"}
ENERGY_MODES = {"manual-work", "ambient-exchange", "controlled-heat", "reaction-heat", "mechanical-generation", "measurement"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def unique_object(pairs):
    out = {}
    for key, value in pairs:
        require(key not in out, f"Duplicate JSON key: {key}")
        out[key] = value
    return out


def formula_counts(formula):
    """Neutral formulas with integer subscripts and parentheses; no hydrates/ions."""
    require(isinstance(formula, str) and formula, "Empty/non-string formula")
    tokens = re.findall(r"[A-Z][a-z]?|[0-9]+|[()]", formula)
    require("".join(tokens) == formula, f"Unsupported formula syntax: {formula}")
    stack = [Counter()]
    i = 0
    while i < len(tokens):
        token = tokens[i]
        if token == "(":
            stack.append(Counter())
            i += 1
            continue
        if token == ")":
            require(len(stack) > 1, f"Unmatched parentheses: {formula}")
            group = stack.pop()
            require(bool(group), f"Empty group: {formula}")
        else:
            require(token in ELEMENTS, f"Unknown element/token {token}: {formula}")
            group = Counter({token: 1})
        i += 1
        multiplier = 1
        if i < len(tokens) and tokens[i].isdigit():
            multiplier = int(tokens[i])
            require(multiplier > 0, f"Nonpositive subscript: {formula}")
            i += 1
        for element, count in group.items():
            stack[-1][element] += count * multiplier
    require(len(stack) == 1 and bool(stack[0]), f"Unclosed/empty formula: {formula}")
    return stack[0]


def indexed(rows, label):
    require(isinstance(rows, list) and rows, f"Missing {label}")
    out = {}
    for row in rows:
        require(isinstance(row, dict), f"Non-object in {label}")
        identity = row.get("id")
        require(isinstance(identity, str) and re.fullmatch(r"[a-z][a-z0-9_-]*", identity), f"Invalid ID in {label}: {identity}")
        require(identity not in out, f"Duplicate {label} ID: {identity}")
        require(isinstance(row.get("label"), str) and row["label"], f"Missing label: {identity}")
        require(isinstance(row.get("note"), str) and row["note"], f"Missing design note: {identity}")
        out[identity] = row
    return out


def refs(row, field, known):
    values = row.get(field)
    require(isinstance(values, list), f"Missing list {field}: {row['id']}")
    require(all(isinstance(v, str) for v in values), f"Non-string {field}: {row['id']}")
    require(len(values) == len(set(values)), f"Duplicate {field}: {row['id']}")
    require(set(values) <= set(known), f"Unknown {field} in {row['id']}: {set(values) - set(known)}")


def validate(data):
    require(data.get("schemaVersion") == 1, "Unsupported schemaVersion")
    require(data.get("status") == "design-draft", "Catalog must remain a design draft")
    require(data.get("externalSourcesVerified") is False, "Sources were not externally verified this turn")
    materials = indexed(data.get("materials"), "materials")
    caps = indexed(data.get("capabilities"), "capabilities")
    processes = indexed(data.get("processes"), "processes")
    milestones = indexed(data.get("milestones"), "milestones")
    for row in materials.values():
        require(row.get("origin") in {"local-candidate", "import-or-recovery", "processed"}, f"Invalid material origin: {row['id']}")
        require(isinstance(row.get("category"), str) and row["category"], f"Missing category: {row['id']}")
        if "formula" in row:
            formula_counts(row["formula"])
    for row in caps.values():
        require(row.get("origin") in {"bootstrap", "derived", "external-advanced"}, f"Invalid capability origin: {row['id']}")
    equation_count = 0
    for row in processes.values():
        require(row.get("kind") in KINDS, f"Invalid kind: {row['id']}")
        require(row.get("stage") in {f"S{i}" for i in range(8)}, f"Invalid stage: {row['id']}")
        require(row.get("readiness") == "concept-only", f"Uncalibrated process is not executable: {row['id']}")
        require(row.get("evidenceStatus") == "reference-check-pending", f"Unsupported evidence claim: {row['id']}")
        require(row.get("scope") in {"raw-world", "test-fixture"}, f"Missing scope: {row['id']}")
        energy = row.get("energyModel")
        require(isinstance(energy, dict) and energy.get("mode") in ENERGY_MODES, f"Invalid energy model: {row['id']}")
        require(energy.get("requiresRunAccounting") is True and energy.get("calibrated") is False, f"Uncalibrated energy must require run accounting: {row['id']}")
        require(isinstance(energy.get("supply"), str) and energy["supply"], f"Missing energy source: {row['id']}")
        for field in ("inputs", "outputs"):
            refs(row, field, materials)
        for field in ("requires", "enables"):
            refs(row, field, caps)
        if row["scope"] == "test-fixture":
            require(all(v.startswith("fixture_") for v in row["enables"] + row["outputs"]), f"Fixture leaks world capability/material: {row['id']}")
        else:
            require(not any(v.startswith("fixture_") for v in row["requires"] + row["inputs"]), f"Raw route depends on fixture: {row['id']}")
            require(not any(materials[v]["origin"] == "import-or-recovery" for v in row["inputs"]), f"Raw route takes external finished components: {row['id']}")
        if "equation" in row:
            require(row["kind"] == "chemical", f"Equation on nonchemical process: {row['id']}")
            totals = []
            for side in ("reactants", "products"):
                terms = row["equation"].get(side)
                require(isinstance(terms, list) and terms, f"Empty reaction side: {row['id']}")
                total = Counter()
                for term in terms:
                    coefficient = term.get("coefficient")
                    require(type(coefficient) is int and coefficient > 0, f"Invalid coefficient: {row['id']}")
                    for element, count in formula_counts(term.get("formula")).items():
                        total[element] += count * coefficient
                totals.append(total)
            require(totals[0] == totals[1], f"Unbalanced equation: {row['id']}")
            equation_count += 1
    for row in milestones.values():
        refs(row, "requires", caps)

    # Optimistic type-dependency closure ONLY: no quantities, capacities or time.
    # Every candidate local resource and bootstrap capability is assumed supplied
    # in this fictional fixture. No such presence is asserted for the real island.
    available_materials = {k for k, v in materials.items() if v["origin"] == "local-candidate"}
    available_caps = {k for k, v in caps.items() if v["origin"] == "bootstrap"}
    reached = set()
    changed = True
    while changed:
        changed = False
        for identity, row in processes.items():
            if identity not in reached and set(row["inputs"]) <= available_materials and set(row["requires"]) <= available_caps:
                reached.add(identity)
                available_materials.update(row["outputs"])
                available_caps.update(row["enables"])
                changed = True
    produced = {v for row in processes.values() for v in row["outputs"]}
    enabled = {v for row in processes.values() for v in row["enables"]}
    missing_material_producers = [k for k, v in materials.items() if v["origin"] == "processed" and k not in produced]
    missing_capability_producers = [k for k, v in caps.items() if v["origin"] == "derived" and k not in enabled]
    require(not missing_material_producers, f"Processed materials without producer: {missing_material_producers}")
    require(not missing_capability_producers, f"Derived capabilities without producer: {missing_capability_producers}")
    return {
        "static_checks_passed": True,
        "counts": {"materials": len(materials), "capabilities": len(caps), "processes": len(processes), "milestones": len(milestones), "balanced_equations": equation_count},
        "kinds": dict(sorted(Counter(v["kind"] for v in processes.values()).items())),
        "stages": dict(sorted(Counter(v["stage"] for v in processes.values()).items())),
        "scopes": dict(sorted(Counter(v["scope"] for v in processes.values()).items())),
        "external_sources_verified": False,
        "executable_processes": 0,
        "optimistic_dependency_fixture": {
            "assumption": "All candidate raw types and bootstrap capabilities supplied; non-consuming type closure only; not island availability or physical feasibility.",
            "reachable_process_count": len(reached),
            "blocked_process_ids": sorted(set(processes) - reached),
            "milestone_missing_capabilities": {k: sorted(set(v["requires"]) - available_caps) for k, v in milestones.items()},
        },
    }


def write_index(data, path):
    materials = {v["id"]: v["label"] for v in data["materials"]}
    caps = {v["id"]: v["label"] for v in data["capabilities"]}

    def cell(value):
        return value.replace("|", "／").replace("\n", " ")

    def labels(ids, lookup):
        return "、".join(lookup[v] for v in ids) or "—"

    lines = [
        "# 科学工程の候補カタログ", "",
        f"{len(data['processes'])}工程。全件 `concept-only / reference-check-pending`。**実行可能なレシピではなく、科学モデルを作るための依存関係の草案。**", "",
        "[設計本文](../SCIENCE_AND_CIVILIZATION.md) / [照合待ちの根拠](../SCIENCE_EVIDENCE.md) / [元データ](process-catalog.json)", "",
        "入力・出力は種類の依存で、量・配合・時間・エネルギー収支は未定義。energyModelは各回の供給と消費の記録を必須にするための分類で、まだ未校正。測定対象や設備を入力に挙げても、その都度消費する意味ではない。能力は常設の解禁フラグではなく実在設備・実施済み評価から判定する。", "",
        "`local-candidate` は現地存在未確認。`bootstrap` は初期条件候補で、工具や知識の出所を採択前に確認する。`external-advanced` は本カタログ外の未成立能力であり、原料自作の目標を既製部品で代替する意味ではない。高度工程には後続の研究・モデル実装が必要。", "",
        "数量・エネルギーを消費しない静的到達検査は、不足依存を探す楽観的な診断。到達できても現実の製造可能性は証明しない。`test-fixture` の工程は開発用の対照試験で、原料自作による世界の達成に含めない。", "",
    ]
    for stage in sorted({v["stage"] for v in data["processes"]}):
        lines += [f"## {stage}", "", "| ID・工程 | 分類・範囲 | 入力の種類 | 出力の種類 | 必要能力 | 得る能力・確認結果 | 熱・仕事・電気 | 未確認条件・意味 |", "|---|---|---|---|---|---|---|---|"]
        for row in data["processes"]:
            if row["stage"] == stage:
                values = [f"`{row['id']}` {row['label']}", f"{row['kind']} / {row['scope']}", labels(row["inputs"], materials), labels(row["outputs"], materials), labels(row["requires"], caps), labels(row["enables"], caps), row["energyModel"]["supply"], row["note"]]
                lines.append("| " + " | ".join(cell(v) for v in values) + " |")
        lines.append("")
    lines += ["## カタログ外に残る能力", "", "無料の初期能力として与えず、原料・工程・設備・評価器を調べてから追加する。", ""]
    for row in data["capabilities"]:
        if row["origin"] == "external-advanced":
            lines.append(f"- `{row['id']}` {row['label']}：{row['note']}")
    lines += ["", "この一覧は `python docs/proposals/creative-world/science/validate_catalog.py --write-index` でJSONから生成する。", ""]
    path.write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("catalog", nargs="?", type=Path, default=Path(__file__).with_name("process-catalog.json"))
    parser.add_argument("--write-index", action="store_true")
    args = parser.parse_args()
    try:
        data = json.loads(args.catalog.read_text(encoding="utf-8"), object_pairs_hook=unique_object)
        result = validate(data)
        if args.write_index:
            write_index(data, args.catalog.with_name("PROCESS_CATALOG.md"))
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (ValueError, KeyError, TypeError, OSError) as error:
        print(json.dumps({"static_checks_passed": False, "error": str(error)}, ensure_ascii=False))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
