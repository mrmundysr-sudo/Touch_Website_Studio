# Branch Status and Development Handoff

> This file is a handoff guide, not the source of truth. Verify every branch, PR, commit, and CI result against GitHub before acting. Never infer that the default branch or most recent branch contains the newest app code.

## Current handoff (verified 2026-11-02 UTC)
- Default branch: `main` @ `32a69fd` (docs-only template; no app source, no workflows, no APKs, no other branches or PRs existed at start)
- Active development branch: `claude/touch-website-studio-first-build` (NOT merged; no PR opened)
- App source commit with a green build: `7e3118c` (CI run 3, success: JS tests, 25 JVM tests, assembleDebug, aapt2 package check)
- CI run: https://github.com/mrmundysr-sudo/Touch_Website_Studio/actions/runs/41379784549 · artifact `Touch-Website-Studio-debug-3` (retention 14 days)
- Earlier failed runs (history): run 1 (SDK setup action), run 2 (my verify step); both fixed.
- Local build of the same source: sha256 `b97d51ea368d828678339a08220d217d54a82ab6d88b817300ce8ce2df4e2804`, debug-signed, minSdk 24.
- Recommended starting ref for next task: this branch's HEAD.
- Not verified: live Netlify, on-device behavior (see docs/knowledge/reports/2026-11-02-first-build.md).

## Mandatory session startup
1. Confirm exact repository and default branch with GitHub.
2. Read this file, `CLAUDE.md`, the development plan, decision log, and relevant work reports.
3. Enumerate remote branches and open PRs. Fetch remote refs; a docs-only checkout does **not** prove the app source is missing.
4. Locate app source, build workflow, and recent successful APK artifacts. Check branch relationships, commit ancestry, and unmerged changes.
5. Compare this handoff against live GitHub data. If stale or ambiguous, report the conflict and choose no branch until it is resolved.
6. Select an appropriate verified base; create an isolated task branch. Do not overwrite existing development work.
7. Before coding, report chosen repository, base branch, commit SHA, and rationale.

## Mandatory task completion
- Record development branch and HEAD SHA; base branch; PR link if any.
- Record workflow name, run URL, conclusion, and artifact link **only after verification**.
- Summarize changes, tests actually executed, known limitations, and next task.
- Update this handoff in the task branch or an approved documentation branch; avoid overwriting concurrent edits.
- A successful build is not proof that its branch contains the latest changes.
- Never automatically merge, reset, force-push, delete branches, or release.

## Future automation contract
A reusable workflow may produce **read-only** branch/build status as a CI artifact after a completed successful APK build. Prefer this to auto-committing status changes to `main`. Include repository, source ref, SHA, run ID/URL, conclusion, timestamp, and APK artifact name. Treat the result as a historical build record, not as the authoritative active development branch. Do not install a workflow until its permissions, existing build triggers, and artifact names are inspected and verified.
