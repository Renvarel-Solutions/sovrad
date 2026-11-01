# Sovrad architecture

React/Vite on 127.0.0.1:5173 proxies /api to Fastify on 127.0.0.1:4317.
Host, browser-origin, fetch-site and action-header checks protect the local API.
No remote access, coding-agent execution or private repository import is enabled.

## Storage and revisions

Better-SQLite3 stores projects, current workflows, proposals, audit events,
immutable-by-API workflow snapshots and daily AI attempt counters.
Storage lives outside the public checkout. Absolute paths and existing
junction ancestors are validated for both defaults and explicit constructor paths.
The database basename is sovrad.sqlite. No legacy private database is imported.

Proposal approval uses an immediate SQLite transaction containing the revision
check, new snapshot, current-workflow update, proposal status and audit event.
A stale or resolved proposal cannot overwrite a newer workflow.
Rejection records its audit event without advancing the specification revision.
The workflow GET response includes revision snapshots for review tools.

## AI boundary

Only the selected step's minimal fields are transmitted after per-request consent.
The API key stays on the backend. Structured output is checked against local
validation and the base revision is checked again after the provider returns.
A separate SQLite counter reserves each attempt before network use.
The provider transport is replaceable only by in-process tests, not HTTP input.
Provider error details are neither logged nor returned.

## Public/private boundary

This repository distributes application source and synthetic examples only.
Runtime records, imported code, logs, screenshots and exports are outside
the publication file set. The scanner checks disk and staged content but cannot
recognize every confidential document; final manual review remains required.
Local operating-system users are trusted; this is not a multi-user service.
