# Sovrad work plan

## Completed locally

- Inspect the starter and handoff; reproduce the original baseline.
- Move to the owner's Renvarel Products/Sovrad directory with content verification.
- Install dependencies, lock versions and verify a clean installation.
- Fix and test UI import, private storage, revision snapshots and AI controls.
- Verify 22 unit/integration/scanner tests, 3 browser tests and typechecks/build.
- Prove six guard tests fail under deliberate regressions, restore source bytes.
- Prepare public-source security/contribution files and Windows/Linux CI.

## Outward-facing approval gate

The proposed repository is Renvarel-Solutions/sovrad, public, Apache-2.0.
Only reviewed application source, synthetic fixtures, tests and documentation may
be published. No real project source/data, local records, logs or secrets belong
in its history. Repository creation, first push and protections received owner
approval. The npm advisory audit completed with zero known vulnerabilities.

## Later separately gated work

See docs/RUNNER-PLAN.md before implementing any coding runner. Bind execution to
an approved snapshot, exact repository commit and an isolated worktree with
enforced approvals. Commit/merge/deployment are independent permissions.

External project import begins with a private, isolated read-only pilot after
an approved import design. Other projects and live environments stay untouched.
