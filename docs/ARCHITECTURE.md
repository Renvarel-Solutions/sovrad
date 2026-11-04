# Sovrad architecture

Developer reference for the local foundation, reviewed 2026-11-02 (package 0.1.0).
The browser provides the synthetic calculator workflow and AI budget panel.

React/Vite defaults to 127.0.0.1:5173 and proxies `/api` to Fastify on
127.0.0.1:4317. `WEB_PORT` and `API_PORT` configure these together.
`server.ts` enforces host, browser-origin, fetch-site and local-action-header
checks with a 16 KiB body cap. This loopback boundary provides no remote-user
authentication; local OS users are trusted. Do not expose or forward the ports.

## Storage and revisions

`Storage` uses Better-SQLite3 for projects, workflows, proposals, revision
snapshots, audit events, daily AI attempts, spending reservations, implementation
tasks/events and import snapshots/quarantine metadata. `data-directory.ts`
validates private locations outside source, including existing junction ancestors.
SQLite data and backups are plaintext protected by the local OS account.

`migrate` checks `user_version` before startup writes. Older existing databases
receive a consistent SQLite backup under the private `backups` directory before
migration, WAL setup, bootstrap or seeding. Schema versions newer than supported
are rejected, and initialization errors close the database handle. Existing
daily attempts, history and spending are preserved through supported upgrades.
Backups contain private data and must stay outside the public source tree.

Approval uses one immediate transaction for revision validation, the new
snapshot, current workflow, proposal status and audit event. Stale or resolved
proposals cannot overwrite a newer workflow. Rejection records an audit event
without advancing the revision. Workflow GET includes revision history.

## AI boundary

`ai.ts` requires backend configuration and per-request consent. Only the selected
step title, purpose, rules and correction are sent. `createPrivateAIClient`
restricts transport to the OpenAI Responses and input-token-count POST endpoints,
rebuilds outgoing headers, refuses redirects and disables SDK logs/retries.
Provider exceptions are neither logged nor returned. The transport override is
an in-process test seam, not an HTTP option.

`ai-budget.ts` is the policy source for the pinned model, token caps and local
$5 lifetime budget. Accounting uses conservative input/output rates rather than
an exact invoice. Daily attempts are reserved before provider access; spending
is reserved before drafting and settled from validated usage. Pending or unknown
charges retain their reservation and pause further drafts across restarts.
Provider project hard-limit confirmation is also required; the flag records
operator confirmation and does not verify the provider's configuration.

Structured output is validated, checked for credential-like content and bound
to the still-current revision before saving a draft. Manual proposals and
synthetic snapshot capture also use private-content filtering. The heuristic
cannot catch every secret or PII; users must review selected content.

## Implementation and import boundaries

`implementation-routes.ts` exposes task status, create/list/get, events,
exact-manifest approval, start and cancel. `ImplementationStore` permits only
an approved current synthetic calculator specification. Creation prepares a
private Git fixture and trusted acceptance file. Its manifest binds specification
digest/receipt, repository identity, base commit, allowed files and test digest.
Approval/start recheck those bindings. Start always returns blocked because
`isolationPreflight` is deliberately false; no coding process is launched.
Restart marks stored running tasks interrupted and revokes their approval.

The runner package includes a verified-worktree helper and a protocol client
whose callable methods are limited to initialization and permission-profile
listing. It declines approval requests. Its diagnostic probe uses an empty
configuration and does not sign in or start a coding turn. Worktree identity
checks do not supply native filesystem, credential or network isolation.

`import-routes.ts` exposes status/list/get and a submission route that returns
blocked before reading source. `ImportStore.capture` is an internal helper for
bounded, explicitly selected committed regular UTF-8 files in synthetic tests.
It records source commit/blob/hash provenance and read-only, non-executable
snapshots. Credential-like blobs retain quarantine metadata without their content.
This helper is not an enabled private-project import workflow.

## Publication and verification

Only app source and fictional examples belong in the public repository.
Runtime records, source snapshots, backups, logs, screenshots and exports stay
outside the publication file set. The public scanner checks disk and staged
content; manual review is still required. Browser tests run on separate scratch
ports 5175/4319 with a temporary synthetic database and no live AI credentials.
See [PROJECT-STATE.md](PROJECT-STATE.md) for dated evidence and
[RUNNER-PLAN.md](RUNNER-PLAN.md) for the remaining execution gates.
