---
name: sundara-skill-creator
description: Authoring conventions for skills in the Sundara Command suite. Use when creating a new skill, editing an existing SKILL.md, adding a reference document, or when a skill has grown too long and needs splitting. Covers spec-safe YAML frontmatter (portable to the Agent Skills spec and publishable as a marketplace plugin), progressive disclosure, the 150-line rule, naming, and validation via scripts/validate_skills.py.
license: MIT
metadata:
  suite: sundara-command
  role: meta
---

# Sundara Skill Creator

Conventions for authoring skills in this suite. Follow them so every skill stays loadable,
cheap in context, and publishable to the marketplace mirror without repackaging.

## Frontmatter must be spec-safe

Claude Code accepts about twenty frontmatter fields. The [Agent Skills spec](https://agentskills.io)
— which governs whether this suite can be published as a plugin — accepts only six:

```
allowed-tools, compatibility, description, license, metadata, name
```

**Use only those six.** Any other field (`when_to_use`, `argument-hint`, `context`, `model`,
`disable-model-invocation`, …) causes packaging to fail with a hard error, not a warning:

```
Unexpected key(s) in SKILL.md frontmatter: argument-hint.
Allowed properties are: allowed-tools, compatibility, description, license, metadata, name
```

Canonical shape for this suite:

```yaml
---
name: sundara-<topic>
description: <what it does> Use when <trigger 1>, <trigger 2>, <trigger 3>. <what it covers>
license: MIT
metadata:
  suite: sundara-command
  role: phase | technical | governance | demo | meta | hub
---
```

## Writing the description

The description is the *only* part loaded into context before the skill is invoked. It is how
Claude decides whether to load the skill at all, so it must carry the triggers.

- **Put the key use case first.** `description` is truncated at 1,536 characters in the listing.
- **Name concrete trigger conditions**, not a topic. "Use when building the ranking, uncertainty,
  or calibration layer" beats "About the triage engine."
- Write it in third person, describing the skill — not as an instruction to Claude.
- Include the vocabulary someone would actually type: model names, screen names, the phase number.

Weak: `description: Triage engine documentation.`
Strong: `description: Ranking policy, risk models, uncertainty, calibration, and OOD detection for Sundara Command. Use when building or defending the patient ranking, when a judge asks why one patient outranks another, when implementing SHAP explanations, or when handling low-confidence or unfamiliar patients.`

## Progressive disclosure — the 150-line rule

**SKILL.md stays under 150 lines.** Depth goes in `references/`.

The body of a SKILL.md loads in full whenever the skill is invoked. Reference files do not — they
load only when Claude reads them. So a 1,200-line SKILL.md costs its full weight on every
invocation, while the same content split across `references/` costs nothing until needed.

```
sundara-<topic>/
├── SKILL.md              ≤150 lines: what this is, when to use it,
│                         the decision rules, and a table pointing to references
└── references/
    ├── <specific-topic>.md    unbounded depth
    └── <specific-topic>.md
```

SKILL.md should contain: the purpose, the non-negotiable rules, and **a table telling Claude which
reference to open for which question.** That routing table is the most valuable thing in the file.

## Naming

- Directory name is the command. `sundara-demo/` → `/sundara-demo`. For project skills the
  frontmatter `name` sets only the display label, so **keep them identical** to avoid confusion.
- Lowercase, hyphen-separated, `sundara-` prefixed.
- Name by *job*, not by artifact: `sundara-governance`, not `sundara-governance-docs`.

## Content rules for this suite

1. **Never restate a case number.** Link to `sundara-command/references/case-facts.md`. One source
   of numeric truth; no exceptions.
2. **Every claim about the outside world carries a citation.** The case explicitly requires
   mitigations for failure modes "found in research, not one you invented for convenience." An
   uncited claim is worse than no claim under judge questioning.
3. **State the decision, then the reasoning.** Skills are read under time pressure at 3 a.m.
4. **Tables over prose** for anything comparative or routed.
5. **Tie back to the theme.** If a skill does not serve "AI makes the first move," justify it or
   cut it.

## Adding a skill

1. `mkdir .claude/skills/sundara-<topic>/references`
2. Write `SKILL.md` with spec-safe frontmatter and a routing table.
3. Write reference docs for the depth.
4. Register it in the routing table in `sundara-command/SKILL.md` — **an unregistered skill is
   effectively invisible.**
5. `python scripts/validate_skills.py`
6. `python scripts/build_marketplace.py` to regenerate the mirror.

## Validation

```bash
python scripts/validate_skills.py           # check all skills
python scripts/validate_skills.py --strict   # warnings become failures
```

It checks: frontmatter parses · only spec-safe keys · `name` matches directory · description
present and within budget · SKILL.md ≤150 lines · referenced `references/` files exist ·
no broken intra-suite skill links.

The referenced-file check matters most: a SKILL.md routing table that points at a file which was
renamed or never written sends Claude looking for guidance that does not exist, and it fails
silently at the worst possible moment.

## The marketplace mirror is generated, never edited

Canonical content lives in `.claude/skills/`. `scripts/build_marketplace.py` generates
`skills/clinical-ai-hackathon/` and `.claude-plugin/marketplace.json` from it.

**Never hand-edit the mirror** — it is overwritten on every build. Edit the canonical skill and
rebuild.