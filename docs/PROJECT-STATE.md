# Sovrad project state

Foundation status reviewed 2026-11-02 (package 0.1.0).
This record distinguishes source capability from executed verification.

## Current product scope

The shipped interface is the synthetic calculator workflow, proposal review and
local AI budget panel. Manual approval updates a specification revision, not
implementation code. Multi-project dashboards, annotations and an owner decision
center are not implemented.

The backend includes revision-safe history, durable daily attempts and $5 local
lifetime spending accounting, supported-schema backup/migration, synthetic task
manifests, task approval/cancel/events and blocked start. Import status/list/get
and blocked submission routes exist; capture helpers are exercised internally
with synthetic repositories. Native coding and real private-project import
remain disabled.

## Verification record

- The full local suite passed 68 tests (7 core, 50 API, 8 runner and 3 scanner),
  with zero failures or skips.
- `npm run check` passed API/runner/web typechecks and the Vite production build.
- `npm run public-check` passed against 66 source files before this doc update;
  repeat publication review against the final file set before pushing.
- Source-security review cleared the controlled provider-transport and
  private-content-filter fixes after 13 focused security tests passed.
- Four deliberate decoder regressions produced failures; exact source bytes were
  restored and all four decoder checks passed again.
- Fourteen focused migration/recovery checks passed, covering supported-version
  preservation, backup ordering, newer-schema rejection, failed initialization
  cleanup and retained crash/unknown reservations.
- Ten focused text-fidelity checks passed after four specific BOM/multibyte
  failures were observed before the fix, covering committed UTF-8 snapshot
  fidelity and protocol decoding across byte boundaries.
- A diagnostic-only installed Codex `0.166.0-alpha.5.1` initialization succeeded
  with an empty configuration and `codingEnabled: false`. This did not establish
  sign-in, model access or native isolation.
- In the prior browser run, all three original calculator journeys passed in
  16 seconds on scratch ports 5175/4319, including a real API-process restart
  with persisted revisions,
  the 390 px layout and consent reset. No page errors were observed.
- An occupied scratch API port caused the expected refusal with exit code 1;
  the test harness did not stop the existing listener.
- Clean exact-HEAD verification remains pending; the earlier browser receipt
  does not establish verification of the final source revision.
- Existing main CI was green at `c3e6bd9`. The new foundation has not yet been
  committed, pushed or verified by hosted CI; that earlier result does not cover it.
- No live OpenAI call was made and no dedicated key was loaded for this work.

## Remaining gates

Live drafting requires a dedicated backend key, confirmed enforced provider
project hard limit and explicit consent for each request. Local cost accounting
is conservative and does not establish exact billing. Credential/PII filtering
is heuristic. SQLite remains local plaintext under OS-account trust.

Coding requires adversarial native-isolation proof and a successful bounded
synthetic run; a worktree or diagnostic handshake cannot supply that proof.
Actual private imports require their own read-only pilot gate. Source review,
coding, merge and deployment permissions remain separate. See
[RUNNER-PLAN.md](RUNNER-PLAN.md) and [SECURITY.md](../SECURITY.md).
