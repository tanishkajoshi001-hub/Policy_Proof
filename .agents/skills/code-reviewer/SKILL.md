---
name: code-reviewer
description: >-
  Automated code review and pull request analysis skill. Scans code diffs and repositories
  for security issues, performance bottlenecks, syntax hygiene, hardcoded credentials,
  and architecture compliance using the pr_analyzer.py helper script.
---

# Code Reviewer Skill

This skill enables AI agents and developers to perform deep, automated code reviews and PR analysis.

## Overview

The `code-reviewer` skill combines deterministic static checks (via `scripts/pr_analyzer.py`) with semantic reasoning to deliver actionable, high-signal reviews.

## Usage

### 1. Running the PR Analyzer CLI
Run the bundled analyzer script on any repository or subproject:

```bash
# Analyze current directory
python .agent/skills/code-reviewer/scripts/pr_analyzer.py .

# Analyze specific project path
python .agent/skills/code-reviewer/scripts/pr_analyzer.py c:/rehab-buddy/Rehab_Buddy

# Output JSON for agent consumption
python .agent/skills/code-reviewer/scripts/pr_analyzer.py . --json

# Analyze only git staged changes or specific branch diff
python .agent/skills/code-reviewer/scripts/pr_analyzer.py . --staged
python .agent/skills/code-reviewer/scripts/pr_analyzer.py . --base main
```

## What the Analyzer Checks
1. **Security & Secrets**: Detects exposed API keys, private keys, auth tokens, and unsecured endpoints.
2. **Hygiene & Anti-Patterns**: Flags leftover debugging statements (`console.log`, `debugger`, `print`), `TODO`/`FIXME` debt, and overly large files.
3. **Domain Compliance (RehabBuddy)**: Enforces privacy rules (no camera frames leaked across network) and safety gates (pain rating threshold enforcement).
4. **Git Delta Metrics**: Calculates lines added/deleted, file complexity risk, and outputs a readiness verdict (Approve / Request Changes / Comment).
