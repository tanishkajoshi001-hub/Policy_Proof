#!/usr/bin/env python3
"""
PR & Codebase Analyzer (pr_analyzer.py)
Automated static analysis and code review helper for git repositories and projects.
Runs 100% locally with zero external dependencies and zero cost.
"""

import os
import sys
import re
import json
import argparse
import subprocess
from pathlib import Path
from typing import Dict, List, Any, Optional

# Severity constants
CRITICAL = "CRITICAL"
WARNING = "WARNING"
INFO = "INFO"

# Common patterns for secrets and sensitive material
SECRET_PATTERNS = [
    (r'(?i)(?:api_key|apikey|secret|token|password|auth_token)\s*[:=]\s*["\']([a-zA-Z0-9_\-]{16,})["\']', "Potential hardcoded secret or API token"),
    (r'(?i)ghp_[a-zA-Z0-9]{36}', "GitHub Personal Access Token"),
    (r'(?i)sk-[a-zA-Z0-9]{32,}', "Potential OpenAI/LLM API Secret Key"),
    (r'-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----', "Unencrypted Private Key"),
    (r'(?i)AIza[0-9A-Za-z-_]{35}', "Google API Key"),
]

# Patterns for code hygiene
HYGIENE_PATTERNS = [
    (r'\bconsole\.log\(', "Debug logging (console.log) left in code", [".ts", ".tsx", ".js", ".jsx"]),
    (r'\bdebugger;', "Debugger breakpoint left in code", [".ts", ".tsx", ".js", ".jsx"]),
    (r'\bTODO\b|\bFIXME\b', "Unresolved TODO / FIXME comment", [".ts", ".tsx", ".js", ".jsx", ".py", ".md"]),
    (r'http://[a-zA-Z0-9]', "Insecure HTTP connection found (prefer HTTPS)", [".ts", ".tsx", ".js", ".jsx", ".html"]),
]

# Domain specific rules (e.g. RehabBuddy privacy & safety)
REHAB_BUDDY_RULES = [
    (r'(?i)fetch\([^\)]*(?:upload|stream|raw|video|frame)', "POTENTIAL PRIVACY VIOLATION: Raw video/frame upload detected. MediaPipe inference must remain on-device."),
]

IGNORE_DIRS = {
    ".git", "node_modules", "dist", "build", ".next", ".cache",
    "venv", ".venv", "env", "__pycache__", ".agent", ".agents"
}

IGNORE_EXTENSIONS = {
    ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg",
    ".woff", ".woff2", ".ttf", ".eot", ".mp3", ".wav", ".mp4",
    ".zip", ".tar", ".gz", ".lock"
}


def run_git_command(args: List[str], cwd: Path) -> Optional[str]:
    """Runs a git command safely and returns standard output if successful."""
    try:
        res = subprocess.run(
            ["git"] + args,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False
        )
        if res.returncode == 0:
            return res.stdout.strip()
    except Exception:
        pass
    return None


def get_changed_files_git(project_path: Path, base_ref: Optional[str] = None, staged_only: bool = False) -> List[Path]:
    """Retrieves list of changed files from git if in a git repository."""
    changed = set()
    
    if staged_only:
        diff_output = run_git_command(["diff", "--name-only", "--cached"], project_path)
    elif base_ref:
        diff_output = run_git_command(["diff", "--name-only", base_ref], project_path)
    else:
        # Check both unstaged and uncommitted staged
        diff_output = run_git_command(["diff", "--name-only", "HEAD"], project_path)
        if not diff_output:
            # Check untracked files
            untracked = run_git_command(["ls-files", "--others", "--exclude-standard"], project_path)
            if untracked:
                diff_output = untracked

    if diff_output:
        for line in diff_output.splitlines():
            line = line.strip()
            if line:
                full_path = project_path / line
                if full_path.exists() and full_path.is_file():
                    changed.add(full_path)
                    
    return list(changed)


def scan_file(file_path: Path) -> List[Dict[str, Any]]:
    """Analyzes a single file for security, hygiene, and logic warnings."""
    findings = []
    
    if file_path.suffix.lower() in IGNORE_EXTENSIONS:
        return findings

    try:
        content = file_path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return [{
            "file": str(file_path),
            "line": 0,
            "severity": WARNING,
            "rule": "FILE_READ_ERROR",
            "message": f"Could not read file: {e}"
        }]

    lines = content.splitlines()

    # Rule 1: File size / Line count warning
    if len(lines) > 800 and file_path.suffix not in [".md", ".json"]:
        findings.append({
            "file": str(file_path),
            "line": len(lines),
            "severity": WARNING,
            "rule": "FILE_TOO_LONG",
            "message": f"File exceeds 800 lines ({len(lines)} lines). Consider breaking down into modular submodules."
        })

    for idx, line in enumerate(lines, start=1):
        # Check Secrets
        for pattern, desc in SECRET_PATTERNS:
            if re.search(pattern, line):
                findings.append({
                    "file": str(file_path),
                    "line": idx,
                    "severity": CRITICAL,
                    "rule": "SECURITY_EXPOSED_SECRET",
                    "message": f"{desc} in line: {line.strip()[:60]}..."
                })

        # Check Hygiene Patterns
        for pattern, desc, valid_exts in HYGIENE_PATTERNS:
            if file_path.suffix.lower() in valid_exts:
                if re.search(pattern, line):
                    sev = INFO if "TODO" in desc else WARNING
                    findings.append({
                        "file": str(file_path),
                        "line": idx,
                        "severity": sev,
                        "rule": "CODE_HYGIENE",
                        "message": f"{desc} -> {line.strip()[:70]}"
                    })

        # Check Domain / Privacy Rules
        for pattern, desc in REHAB_BUDDY_RULES:
            if re.search(pattern, line):
                findings.append({
                    "file": str(file_path),
                    "line": idx,
                    "severity": CRITICAL,
                    "rule": "DOMAIN_SAFETY_VIOLATION",
                    "message": desc
                })

    return findings


def analyze_repository(project_path: Path, base_ref: Optional[str] = None, staged_only: bool = False, full_scan: bool = False) -> Dict[str, Any]:
    """Runs a complete PR analysis on the repository or target path."""
    project_path = project_path.resolve()
    if not project_path.exists():
        raise FileNotFoundError(f"Target path does not exist: {project_path}")

    # Determine files to scan
    files_to_scan = []
    
    if not full_scan:
        files_to_scan = get_changed_files_git(project_path, base_ref, staged_only)

    if not files_to_scan:
        # Fall back to scanning all project files (skipping ignored directories)
        for root, dirs, files in os.walk(project_path):
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
            for f in files:
                f_path = Path(root) / f
                if f_path.suffix.lower() not in IGNORE_EXTENSIONS:
                    files_to_scan.append(f_path)

    all_findings: List[Dict[str, Any]] = []
    for f in files_to_scan:
        all_findings.extend(scan_file(f))

    critical_count = sum(1 for f in all_findings if f["severity"] == CRITICAL)
    warning_count = sum(1 for f in all_findings if f["severity"] == WARNING)
    info_count = sum(1 for f in all_findings if f["severity"] == INFO)

    # Calculate overall risk score (0 to 100)
    risk_score = min(100, (critical_count * 30) + (warning_count * 5) + (info_count * 1))
    
    if critical_count > 0:
        verdict = "REQUEST_CHANGES (Critical issues found)"
    elif warning_count > 5:
        verdict = "COMMENT (Multiple warnings need attention)"
    else:
        verdict = "APPROVE (Code passes automated quality checks)"

    return {
        "projectPath": str(project_path),
        "totalFilesScanned": len(files_to_scan),
        "riskScore": risk_score,
        "verdict": verdict,
        "summary": {
            "critical": critical_count,
            "warning": warning_count,
            "info": info_count
        },
        "findings": all_findings
    }


def format_report_markdown(result: Dict[str, Any]) -> str:
    """Formats the analysis output as clean, GitHub-flavored markdown."""
    report = []
    report.append(f"# 🔍 Pull Request & Code Review Report")
    report.append(f"**Target**: `{result['projectPath']}`  ")
    report.append(f"**Verdict**: **{result['verdict']}** | **Risk Score**: {result['riskScore']}/100\n")
    report.append(f"### Metrics Summary")
    report.append(f"- 📁 **Files Scanned**: {result['totalFilesScanned']}")
    report.append(f"- 🔴 **Critical**: {result['summary']['critical']}")
    report.append(f"- 🟡 **Warnings**: {result['summary']['warning']}")
    report.append(f"- ℹ️ **Info**: {result['summary']['info']}\n")

    if not result["findings"]:
        report.append("🎉 **No issues found!** All scanned files conform to quality and security rules.\n")
    else:
        report.append("### Detailed Findings\n")
        report.append("| Severity | File | Line | Rule | Message |")
        report.append("|:---|:---|:---:|:---|:---|")
        for f in result["findings"]:
            rel_file = os.path.relpath(f["file"], result["projectPath"])
            icon = "🔴" if f["severity"] == CRITICAL else ("🟡" if f["severity"] == WARNING else "ℹ️")
            report.append(f"| {icon} {f['severity']} | `{rel_file}` | {f['line']} | `{f['rule']}` | {f['message']} |")

    return "\n".join(report)


def main():
    parser = argparse.ArgumentParser(description="PR & Codebase Static Analysis Tool")
    parser.add_argument("project_path", nargs="?", default=".", help="Path to project or repository directory")
    parser.add_argument("--base", dest="base_ref", default=None, help="Base git branch or commit hash to diff against")
    parser.add_argument("--staged", action="store_true", help="Analyze only git staged changes")
    parser.add_argument("--full", action="store_true", help="Force a full scan of all repository files")
    parser.add_argument("--json", action="store_true", help="Output raw JSON instead of markdown")

    args = parser.parse_args()
    target_path = Path(args.project_path)

    try:
        results = analyze_repository(
            project_path=target_path,
            base_ref=args.base_ref,
            staged_only=args.staged,
            full_scan=args.full
        )

        if args.json:
            print(json.dumps(results, indent=2))
        else:
            print(format_report_markdown(results))

        # Exit code 1 if critical issues found
        if results["summary"]["critical"] > 0:
            sys.exit(1)
        sys.exit(0)

    except Exception as e:
        print(f"Error during analysis: {e}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
