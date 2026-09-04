#!/usr/bin/env python3
"""Validate every SKILL.md in the Sundara Command suite.

Checks that each skill is loadable by Claude Code AND publishable under the Agent Skills
spec, which accepts only six frontmatter keys. Any other key makes packaging fail with a
hard error, so we catch it here instead of at publish time.

Usage:
    python scripts/validate_skills.py
    python scripts/validate_skills.py --strict     # warnings become failures
    python scripts/validate_skills.py --skills-dir path/to/skills
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# Agent Skills spec (https://agentskills.io). Anything outside this set breaks packaging.
SPEC_SAFE_KEYS = {
    "allowed-tools",
    "compatibility",
    "description",
    "license",
    "metadata",
    "name",
}

MAX_SKILL_LINES = 150
# Claude Code truncates description + when_to_use at 1536 chars in the skill listing.
MAX_DESCRIPTION_CHARS = 1536
MIN_DESCRIPTION_CHARS = 60

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SKILLS_DIR = REPO_ROOT / ".claude" / "skills"


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, skill: str, msg: str) -> None:
        self.errors.append(f"{skill}: {msg}")

    def warn(self, skill: str, msg: str) -> None:
        self.warnings.append(f"{skill}: {msg}")


def split_frontmatter(text: str) -> tuple[str | None, str]:
    """Return (frontmatter_block, body).

    Claude Code reads frontmatter only when the opening '---' is the file's very first
    line; otherwise the whole file is treated as content. We mirror that rule exactly.
    """
    if not text.startswith("---"):
        return None, text
    lines = text.splitlines()
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            return "\n".join(lines[1:i]), "\n".join(lines[i + 1 :])
    return None, text


def parse_top_level_keys(frontmatter: str) -> dict[str, str]:
    """Extract top-level 'key: value' pairs.

    Deliberately dependency-free: PyYAML may not be installed on a hackathon machine at
    2 a.m., and this validator must never be the thing that is broken. Nested mapping
    values (e.g. under 'metadata') are captured as a marker rather than parsed.
    """
    keys: dict[str, str] = {}
    current: str | None = None
    for raw in frontmatter.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        if raw[0] not in (" ", "\t"):  # top-level entry
            match = re.match(r"^([A-Za-z0-9_-]+)\s*:\s*(.*)$", raw)
            if match:
                current = match.group(1)
                keys[current] = match.group(2).strip()
        elif current is not None:
            keys[current] = (keys[current] + " <nested>").strip()
    return keys


def referenced_paths(body: str) -> set[str]:
    """Find references/… paths mentioned anywhere in the skill body."""
    found = set()
    for pattern in (r"`(references/[^`]+\.md)`", r"\((references/[^)]+\.md)\)", r"(?<![\w/`(])(references/[\w./-]+\.md)"):
        found.update(re.findall(pattern, body))
    return found


def validate_skill(skill_dir: Path, report: Report) -> None:
    name = skill_dir.name
    skill_file = skill_dir / "SKILL.md"

    if not skill_file.is_file():
        report.error(name, "missing SKILL.md")
        return

    text = skill_file.read_text(encoding="utf-8")
    frontmatter, body = split_frontmatter(text)

    if frontmatter is None:
        report.error(name, "no YAML frontmatter (opening '---' must be the first line)")
        return

    keys = parse_top_level_keys(frontmatter)

    # 1. Spec-safe keys only.
    for key in sorted(set(keys) - SPEC_SAFE_KEYS):
        report.error(
            name,
            f"frontmatter key '{key}' is not in the Agent Skills spec "
            f"(allowed: {', '.join(sorted(SPEC_SAFE_KEYS))}) - packaging will hard-fail",
        )

    # 2. name matches directory, so /command and display label agree.
    declared = keys.get("name", "")
    if not declared:
        report.warn(name, "no 'name' field; display label falls back to the directory name")
    elif declared != name:
        report.error(name, f"frontmatter name '{declared}' does not match directory '{name}'")

    # 3. Description present and usefully sized.
    description = keys.get("description", "")
    if not description:
        report.error(name, "no 'description' - Claude cannot tell when to load this skill")
    else:
        if len(description) > MAX_DESCRIPTION_CHARS:
            report.error(
                name,
                f"description is {len(description)} chars, over the {MAX_DESCRIPTION_CHARS} "
                "listing cap - the tail will be truncated",
            )
        elif len(description) < MIN_DESCRIPTION_CHARS:
            report.warn(name, f"description is only {len(description)} chars; add trigger conditions")
        if "use when" not in description.lower():
            report.warn(name, "description has no 'Use when ...' trigger clause")

    # 4. Progressive disclosure: the body loads in full on every invocation.
    line_count = len(text.splitlines())
    if line_count > MAX_SKILL_LINES:
        report.error(
            name,
            f"SKILL.md is {line_count} lines, over the {MAX_SKILL_LINES}-line rule - "
            "move depth into references/",
        )

    # 5. Every referenced file exists. A dangling pointer fails silently at 3 a.m.
    for rel in sorted(referenced_paths(body)):
        if not (skill_dir / rel).is_file():
            report.error(name, f"references a missing file: {rel}")

    # 6. Reference files that nothing points to are unreachable.
    ref_dir = skill_dir / "references"
    if ref_dir.is_dir():
        pointed_to = {Path(p).name for p in referenced_paths(body)}
        for ref_file in sorted(ref_dir.glob("*.md")):
            if ref_file.name not in pointed_to:
                report.warn(name, f"references/{ref_file.name} is never linked from SKILL.md")


def validate_cross_links(skills_dir: Path, skill_names: set[str], report: Report) -> None:
    """Catch /sundara-* links pointing at skills that do not exist."""
    for skill_dir in sorted(p for p in skills_dir.iterdir() if p.is_dir()):
        for md in [skill_dir / "SKILL.md", *sorted((skill_dir / "references").glob("*.md"))]:
            if not md.is_file():
                continue
            for link in set(re.findall(r"/(sundara-[a-z0-9-]+)", md.read_text(encoding="utf-8"))):
                if link not in skill_names:
                    rel = md.relative_to(skills_dir)
                    report.error(skill_dir.name, f"{rel} links to /{link}, which does not exist")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--skills-dir", type=Path, default=DEFAULT_SKILLS_DIR)
    parser.add_argument("--strict", action="store_true", help="treat warnings as failures")
    args = parser.parse_args()

    skills_dir: Path = args.skills_dir
    if not skills_dir.is_dir():
        print(f"ERROR: skills directory not found: {skills_dir}", file=sys.stderr)
        return 2

    skill_dirs = sorted(p for p in skills_dir.iterdir() if p.is_dir() and not p.name.startswith("."))
    if not skill_dirs:
        print(f"ERROR: no skills found in {skills_dir}", file=sys.stderr)
        return 2

    report = Report()
    for skill_dir in skill_dirs:
        validate_skill(skill_dir, report)
    validate_cross_links(skills_dir, {p.name for p in skill_dirs}, report)

    print(f"Validated {len(skill_dirs)} skill(s) in {skills_dir}\n")
    for skill_dir in skill_dirs:
        prefix = skill_dir.name + ":"
        failed = any(e.startswith(prefix) for e in report.errors)
        flagged = any(w.startswith(prefix) for w in report.warnings)
        mark = "FAIL" if failed else ("WARN" if flagged else "ok  ")
        print(f"  [{mark}] {skill_dir.name}")

    if report.warnings:
        print(f"\n{len(report.warnings)} warning(s):")
        for w in report.warnings:
            print(f"  - {w}")

    if report.errors:
        print(f"\n{len(report.errors)} error(s):")
        for e in report.errors:
            print(f"  - {e}")
        return 1

    if args.strict and report.warnings:
        print("\nFAILED: --strict is set and warnings are present.")
        return 1

    print("\nAll skills valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
