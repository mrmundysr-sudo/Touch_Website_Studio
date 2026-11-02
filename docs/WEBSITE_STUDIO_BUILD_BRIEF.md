# Touch Website Studio — Authorized first-build brief
Status: User approved initial APK development on 2026-11-01. Follow CLAUDE.md and studio rules. Do not merge to main without approval.

## Product
Local-first Android website creator, editor, ongoing maintenance manager, and publisher. User owns hosting, domain, content. AI is optional and provider-agnostic; no mandatory API costs.

## Essential complete workflow
Create from template -> edit text/images/sections -> save -> close/reopen -> quick edit -> preview -> export deployable site -> connect own Netlify account -> publish -> edit again -> republish to SAME site/URL.

## First APK
- My Websites dashboard: new, reopen, rename, duplicate, local save, published URL, unsaved/unpublished changes.
- Two responsive starter templates: small business and personal/family. One shared editable schema.
- Working visual editor: tap-to-edit text, photo replacement, color/theme and section controls; smooth one-finger image pan/zoom consistent with Touch gesture standard.
- Project package ZIP round-trip separate from deployable HTML/CSS/JS/assets ZIP.
- Real Netlify API integration: secure user-supplied credentials for development, never hardcode or commit secrets; site creation, ZIP deployment, status polling, saved site ID, repeat deployment to same site; explicit preview and approval before live changes; truthful failure states and manual export fallback. Never claim verified live publishing without actual authorized test.
- Local version snapshots, restore, safe update handling; save is NOT publish.
- Optional share-sheet AI handoff architecture, not required for normal maintenance.
- GitHub Actions debug APK, tests, build evidence, screenshots if possible.

## Priorities
1. Compiling APK and CI workflow early
2. Persisted project dashboard and editor with first template
3. Export and re-open/edit workflow
4. Real Netlify publish and update attempt
5. Second template, ZIP import, polish

## Non-negotiables
No fake controls or fake success. No automatic publishing. Preserve unknown imported code or flag unsupported editing. Test budget-phone performance. Keep GitHub source of truth. Work on claude/touch-website-studio-first-build. No destructive operations or merges without approval. Record branch, SHA, CI status, verified versus unverified behavior, and next steps.

Read docs/PRODUCT_VISION.md, docs/DECISIONS.md, docs/DEVELOPMENT_PLAN.md, docs/COMPONENT_REGISTRY.md, docs/BRANCH_STATUS.md and CLAUDE.md before coding. Replace template placeholders with this project's approved decisions as you work, preserving decision history.