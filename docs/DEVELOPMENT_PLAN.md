# Touch Website Studio — Development Plan

> Status: First APK build authorized 2026-11-01/02 (see WEBSITE_STUDIO_BUILD_BRIEF.md). Anything beyond that brief remains unapproved.

## Source of truth and working rules
- GitHub repository is the source of truth.
- Verify repo, default branch, active working branch and workflow before edits.
- Develop on a feature/development branch. Do not merge to main, release publicly, or modify other repositories without approval.
- Use GitHub Actions to build/test and inspect actual results. Do not claim an APK is ready without verified success.
- Protect existing working behavior; prefer small, reviewable changes.
- Do not invent requirements or interpret brainstormed ideas as approved decisions.

## Feasibility audit
| Question | Evidence needed | Result |
|---|---|---|
| Existing reusable code | Repo paths and versions | Pending |
| Platform constraints | Android/API/device tests | Pending |
| Dependencies/licenses | License review | Pending |
| Performance | Device benchmarks | Pending |
| Security/privacy | Threat and data-flow review | Pending |

## Proposed architecture
- Components and boundaries: [pending]
- Shared modules and adapters: [pending]
- Data model, storage, migration: [pending]
- Offline/network strategy: [pending]
- Permissions/security: [pending]
- Build and CI workflows: [pending]

## Milestones (first build status; see docs/knowledge/reports/ for evidence)
- [x] Phase 1 core: dashboard, editor, templates, save/reopen, export, Netlify attempt, versions, ZIP round trip, CI (implemented; verification status in the work report)
- [ ] Phase 2: real-device tests, budget-phone performance, accessibility audit, live Netlify verification, import of arbitrary HTML sites
- [ ] Phase 3: release readiness (signing, privacy review, crash handling) — not authorized

## Original milestone template
### Phase 0 — Audit and design
- [ ] Review approved requirements and existing code
- [ ] Document risks, dependencies, unknowns
- [ ] Obtain approval for architecture and MVP

### Phase 1 — Minimal working application
- [ ] [Approved tasks only]
- [ ] Unit/integration tests
- [ ] Verified CI build and test APK

### Phase 2 — Usability and reliability
- [ ] [Approved tasks only]
- [ ] Real-device tests, failure recovery, accessibility

### Phase 3 — Release readiness
- [ ] [Approved tasks only]
- [ ] Privacy, licenses, crash handling, versioning, rollback

## Definition of done
- Approved acceptance criteria pass.
- Tests and GitHub Actions are green.
- APK artifact or private release is verified.
- Known limitations and manual testing recorded.
- No unapproved merges/releases.

## Risks and open questions
- [Risk, impact, mitigation]

## Approval
- **Development authorized:** Yes, first debug APK only (no release, no merge to main without owner approval)
- **Approved scope / date:** WEBSITE_STUDIO_BUILD_BRIEF.md, approved by owner 2026-11-01; build started 2026-11-02

## Knowledge retention (template-wide requirement)
- [ ] Before each authorized assignment, review relevant docs/knowledge/ references.
- [ ] After each substantial assignment or batch, write a dated Markdown report using docs/knowledge/WORK_REPORT_TEMPLATE.md.
- [ ] Include user punch lists, fixes, actual CI/test evidence, and outstanding issues.
- [ ] Promote verified reusable lessons/patterns to shared project knowledge files.
- [ ] Propose cross-project lessons for owner review; do not edit other repositories without approval.

## Component reuse gate
- [ ] Before implementing, search the studio registry and inspect relevant source.
- [ ] Prefer verified compatible reusable components; document exceptions.
- [ ] After testing, propose additions/updates to the registry with source paths and evidence.
- [ ] Obtain explicit approval for cross-repository extraction or modifications.
