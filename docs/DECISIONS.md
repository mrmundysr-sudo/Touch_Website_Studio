# Touch Website Studio — Approved Decision Log
2026-11-01; append new decisions rather than silently rewriting history.

- DEC-001 Approved: Android-first, local-first website studio.
- DEC-002 Approved: Creation AND ongoing editing/maintenance are equal core purposes.
- DEC-003 Approved: Customer owns website, hosting account, domain and files; no studio-hosted customer sites.
- DEC-004 Approved: Two polished starter templates for first build, shared editing engine.
- DEC-005 Approved: Visual quick edits without AI; optional provider-agnostic AI ZIP/share-sheet workflow.
- DEC-006 Approved: Editable project ZIP distinct from deployable website ZIP.
- DEC-007 Approved: Netlify as first one-button publishing target; real integration attempt in initial APK, honest verification status.
- DEC-008 Approved: Save and Publish separate; explicit approval, snapshots and rollback.
- DEC-009 Approved: Prioritize a working APK and CI evidence; develop on separate branch, no merge without approval.
- DEC-010 Approved: Use Mundy-App-Template rules and Touch-Modules component discovery.
- DEC-011 Directional: Bundle with Touch subscription family; final price/payment structure not finalized.

Technical design choices not listed here remain open and must be justified/tested.

## 2026-11-02 — First-build implementation decisions (made by Claude within the authorized brief; owner may override)
- DEC-012 Technical: Native Android shell (Java, no AndroidX, minSdk 24) hosting an offline HTML/JS UI in a WebView, with a small promise-style native bridge. Chosen for fastest working APK, one shared site renderer for editor/preview/export, and low dependency count. Tradeoff: WebView performance on very low-end phones is untested.
- DEC-013 Technical: One shared project schema (`site`, `theme`, `sections[]`, `publish`); the two templates (business, family) differ only in starting content and theme. Section types: hero, text, cards, gallery, contact.
- DEC-014 Technical: Netlify uses a user-supplied personal access token, stored encrypted with a non-exportable Android Keystore key; never written to projects, ZIPs, logs or the repo. Publishing uses plain (production) ZIP deploys to a saved site ID; "preview" is an in-app local preview plus an explicit approval checkbox, not a Netlify draft deploy.
- DEC-015 Technical: Change detection by content hash (site+theme+sections). Snapshots are taken on save when content changed (max 25). Restore snapshots the current state first and never touches photos or the publish link.
- DEC-016 Technical: Project ZIP import always creates a NEW project and resets the publish link; unknown JSON fields and unknown section types are preserved and flagged, never dropped. Importing arbitrary third-party HTML sites is NOT in the first build (**Proposed** for later).
- DEC-017 Process: CI is a self-contained workflow (`.github/workflows/build-apk.yml`) building a debug APK on `claude/**` pushes. The shared hub workflow was not used because the hub repository is outside this session's access.
