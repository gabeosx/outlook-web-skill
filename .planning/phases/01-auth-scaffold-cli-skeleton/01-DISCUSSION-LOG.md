# Phase 1: Auth Scaffold + CLI Skeleton - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in 01-CONTEXT.md — this log preserves the discussion.

**Date:** 2026-04-10
**Phase:** 01-auth-scaffold-cli-skeleton
**Mode:** discuss
**Areas discussed:** Configuration loading

## Gray Areas Presented

| Area | Selected? |
|------|-----------|
| Configuration loading | Yes |
| Code structure | No |
| npm / package.json | No |
| Action policy file layout | No |

## Decisions Made

### Configuration loading
| Question | Options Presented | User Choice |
|----------|-------------------|-------------|
| How should outlook.js load OUTLOOK_BASE_URL, OUTLOOK_BROWSER_PATH, and OUTLOOK_BROWSER_PROFILE? | Env vars only / Local .env file + env var override / JSON config file | **Env vars only** |

**Rationale:** Config file support deferred to v2 per AUTH-06. Env vars are the natural interface for a CLI skill invoked by a calling agent.

## Unselected Areas → Claude's Discretion

- **Code structure** — monolithic vs. lib/ modules
- **npm/package.json** — package management approach
- **Action policy file layout** — one vs. two policy files

## No Corrections Made

All assumptions confirmed by user selection.
