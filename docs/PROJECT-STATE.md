# Sovrad project state

Observed on 2026-11-01, on Windows with Node 24.20.0 and npm 11.19.0.

## Verified locally

- Supplied starter ZIP and Stage 0 handoff inspected; their claims were not used
  as proof of a working application.
- Source moved into the owner's Renvarel Products/Sovrad folder with SHA-256
  verification; the previous source folder was left empty.
- Dependencies installed and package-lock.json generated; clean npm ci passed.
- npm test: 22 passed, zero failed/skipped (7 core, 13 API/storage/path, 2 scanner).
- npm run check: API/web typechecks and Vite production build passed.
- npm run test:e2e: 3 passed in installed Chrome on Windows. The suite checks
  selectable nodes, proposals, approval/rejection, a stopped API followed by
  a different API PID, persisted rules, narrow layout and consent reset.
- Six deliberate guard regressions each caused exactly one expected failing
  test. Original source bytes were restored; the complete suite passed again.
- Public-file scanner passed against working and staged content. Runtime data,
  generated screenshots, logs, test results and dependencies are excluded.
- npm audit completed successfully: zero known vulnerabilities at verification
  time. Earlier advisory-service connection resets were resolved.

## Public preview

The owner approved creation and publication of
https://github.com/Renvarel-Solutions/sovrad as a public Apache-2.0 preview.
The dedicated repository was created; private vulnerability reporting, secret
scanning and secret-scanning push protection were enabled before the first push.
Auto-merge is disabled. Main-branch review/CI protections are part of the
publication gate and are verified separately through repository settings.

Hosted Windows/Linux CI results are available in the repository's Actions tab.
Local passes above never substitute for hosted results. This dated record
documents the initial local baseline, not future commits' verification state.

## Implementation results

- Correct React Flow import and Sovrad product branding.
- Explicit/default data paths validated, including existing junctions.
- Approval, snapshots, current workflow and audit share one SQLite transaction.
- Durable AI quota counts ten attempts per UTC day, including provider failures.
- AI requires explicit consent and sends minimal selected data. It validates
  structured output, rechecks revision and applies output/time limits with no retries.
- AI tests use a fake provider transport. No live OpenAI request was made.

## Remaining product gates

- Live AI needs a dedicated restricted key, chosen model and provider billing
  controls. Never send a key through an issue or chat.
- Codex runner is not implemented or enabled. Review RUNNER-PLAN.md separately.
  Workflow approval does not authorize code execution, commit, merge or deployment.
- External project import and the first private read-only isolated pilot are not
  implemented. No other repository or production environment was changed.

The preview is verified for the synthetic calculator scope. These results do
not certify production readiness, live AI access or runner isolation.
