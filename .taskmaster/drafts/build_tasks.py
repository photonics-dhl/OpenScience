# -*- coding: utf-8 -*-
"""Merge 6 phase fragments (.taskmaster/drafts/phase-*.json) into .taskmaster/tasks/tasks.json.

Numbering (per task-4 brief):
  Top task ids: Phase 0->1, 1A->2, 1B->3, 1C->4, 1D->5, 1E->6
  Subtask ids:  "<parentId>.<seq>" (task-master style), e.g. P1A-3 -> "2.3"
  Top task dependencies: previous phase top id (Phase 0: none)
  Subtask dependencies: localId rewritten via the same mapping
Self-checks: no dependency cycle (topological sort), no dangling refs,
every subtask details contains "验收:".
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DRAFTS = ROOT / ".taskmaster" / "drafts"
OUT = ROOT / ".taskmaster" / "tasks" / "tasks.json"

PHASE_ORDER = ["0", "1A", "1B", "1C", "1D", "1E"]


def load_fragments():
    frags = []
    for phase in PHASE_ORDER:
        p = DRAFTS / f"phase-{phase}.json"
        data = json.loads(p.read_text(encoding="utf-8"))
        assert data["phase"] == phase, f"{p.name}: phase field mismatch"
        frags.append(data)
    return frags


def build_id_map(frags):
    """localId -> task-master id. P0->'1', P0-1->'1.1', P1A-9->'2.9', ..."""
    mapping = {}
    for top_idx, frag in enumerate(frags, start=1):
        top = frag["topTask"]
        top_local = top["localId"]
        assert top_local == f"P{frag['phase']}", f"unexpected topTask localId {top_local}"
        assert top_local not in mapping, f"duplicate localId {top_local}"
        mapping[top_local] = str(top_idx)
        for seq, sub in enumerate(top["subtasks"], start=1):
            sub_local = sub["localId"]
            assert sub_local not in mapping, f"duplicate localId {sub_local}"
            mapping[sub_local] = f"{top_idx}.{seq}"
    return mapping


def rewrite_deps(deps, mapping, owner):
    out = []
    for d in deps:
        assert d in mapping, f"{owner}: dangling dependency reference {d!r}"
        mapped = mapping[d]
        assert mapped != owner, f"{owner}: self dependency"
        out.append(mapped)
    return out


def check_acyclic(nodes_deps):
    """Kahn topological sort over {node_id: [dep_ids]}. Raises on cycle."""
    indeg = {n: 0 for n in nodes_deps}
    children = {n: [] for n in nodes_deps}
    for n, deps in nodes_deps.items():
        for d in deps:
            assert d in nodes_deps, f"dangling ref {d} from {n}"
            indeg[n] += 1
            children[d].append(n)
    queue = [n for n, deg in indeg.items() if deg == 0]
    seen = 0
    while queue:
        n = queue.pop()
        seen += 1
        for c in children[n]:
            indeg[c] -= 1
            if indeg[c] == 0:
                queue.append(c)
    assert seen == len(nodes_deps), (
        f"dependency cycle detected: {len(nodes_deps) - seen} node(s) unreachable"
    )


def main():
    frags = load_fragments()
    mapping = build_id_map(frags)

    # Preserve metadata structure from existing tasks.json sample.
    existing = json.loads(OUT.read_text(encoding="utf-8"))
    old_meta = existing.get("master", {}).get("metadata", {})
    now_dt = datetime.now(timezone.utc)
    now = now_dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now_dt.microsecond // 1000:03d}Z"
    metadata = {
        "created": now,
        "updated": now,
        "description": old_meta.get("description", "Tasks for master context"),
    }

    tasks = []
    graph = {}
    for top_idx, frag in enumerate(frags, start=1):
        top = frag["topTask"]
        top_id = str(top_idx)
        top_deps = [] if top_idx == 1 else [str(top_idx - 1)]
        graph[top_id] = top_deps

        subtasks = []
        for seq, sub in enumerate(top["subtasks"], start=1):
            sub_id = f"{top_idx}.{seq}"
            assert "验收:" in sub["details"], (
                f"{sub['localId']}: details missing '验收:'"
            )
            deps = rewrite_deps(sub.get("dependencies", []), mapping, sub_id)
            graph[sub_id] = deps
            subtasks.append({
                "id": sub_id,
                "title": sub["title"],
                "description": sub["description"],
                "status": "pending",
                "dependencies": deps,
                "priority": sub.get("priority", "medium"),
                "details": sub["details"],
                "testStrategy": sub.get("testStrategy", ""),
            })

        tasks.append({
            "id": top_id,
            "title": top["title"],
            "description": top["description"],
            "status": "pending",
            "dependencies": top_deps,
            "priority": top.get("priority", "high"),
            "details": "",
            "testStrategy": "",
            "subtasks": subtasks,
        })

    check_acyclic(graph)

    total_subs = sum(len(t["subtasks"]) for t in tasks)
    assert len(tasks) == 6, f"expected 6 top tasks, got {len(tasks)}"
    assert 36 <= total_subs <= 60, f"subtask count {total_subs} out of expected range 36-60"
    assert all(t["status"] == "pending" for t in tasks)
    assert all(s["status"] == "pending" for t in tasks for s in t["subtasks"])

    out_doc = {"master": {"tasks": tasks, "metadata": metadata}}
    OUT.write_text(
        json.dumps(out_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"OK: wrote {OUT} with {len(tasks)} top tasks, {total_subs} subtasks, "
          f"{len(graph)} nodes, acyclic, no dangling refs")


if __name__ == "__main__":
    sys.exit(main())
