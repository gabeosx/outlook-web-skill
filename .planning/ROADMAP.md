# Roadmap: Outlook Web Skill

## Milestones

- ✅ **v1.0 MVP** — Phases 0–6 (shipped 2026-04-15) — see `.planning/milestones/v1.0-ROADMAP.md`

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 0–6) — SHIPPED 2026-04-15</summary>

- [x] Phase 0: Accessibility Research (1/1 plans) — completed 2026-04-10
- [x] Phase 1: Auth Scaffold + CLI Skeleton (3/3 plans) — completed 2026-04-10
- [x] Phase 2: Search Operation (2/2 plans) — completed 2026-04-10
- [x] Phase 3: Read Operation (2/2 plans) — completed 2026-04-11
- [x] Phase 4: Daily Digest Operation (2/2 plans) — completed 2026-04-12
- [x] Phase 5: Skill Packaging (2/2 plans) — completed 2026-04-12
- [x] Phase 6: Calendar Capabilities (4/4 plans) — completed 2026-04-15

Full phase details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

## v1.1 Phases

- [ ] Phase 1: Folder Navigation (`--folder` flag for search) — planned

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 0. Accessibility Research | v1.0 | 1/1 | Complete | 2026-04-10 |
| 1. Auth Scaffold + CLI Skeleton | v1.0 | 3/3 | Complete | 2026-04-10 |
| 2. Search Operation | v1.0 | 2/2 | Complete | 2026-04-10 |
| 3. Read Operation | v1.0 | 2/2 | Complete | 2026-04-11 |
| 4. Daily Digest Operation | v1.0 | 2/2 | Complete | 2026-04-12 |
| 5. Skill Packaging | v1.0 | 2/2 | Complete | 2026-04-12 |
| 6. Calendar Capabilities | v1.0 | 4/4 | Complete | 2026-04-15 |

### Phase 1: Folder Navigation (`--folder` flag for search)

**Goal:** Add `--folder <name>` flag to `search` (and `digest`) that navigates to the target folder via treeitem click before running the search batch, scoping results to that folder. Enables finding sent replies, drafts, and any non-inbox mail.
**Depends on:** None
**Plans:** 2 plans

Plans:
- [x] 01-01-PLAN.md — Create folder normalization module + add --folder to search
- [x] 01-02-PLAN.md — Add --folder to digest + update README.md and SKILL.md
