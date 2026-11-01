# Controlled Codex runner — proposed next stage

Status: NOT IMPLEMENTED. No execution endpoint, SDK launch or runner credentials
are enabled by this preview. Review and approve this plan before implementation.

1. Register an explicitly allowlisted local repository in private storage.
   Real-project registration begins read-only, without provider or deployment keys.
2. Freeze an approved specification snapshot and its digest. Bind an implementation
   request to that revision, an allowlisted repository identity and an exact base
   commit. Recheck all three immediately before execution.
3. Require a distinct, one-use implementation approval. A workflow approval alone
   never permits execution. Revocation or revision drift cancels pending requests.
4. Create a separate worktree/branch under private storage. Verify its canonical
   path, Git common-directory identity and base commit. Refuse the original
   checkout, overlapping paths, unapproved repositories and existing dirty worktrees.
5. Enforce the native sandbox and interactive command approvals. Give the runner
   only the approved worktree and minimal credentials. Refuse unsafe full-access
   modes, extra filesystem roots and automatic approval settings.
6. If the chosen SDK cannot surface required approvals on Windows, fail closed.
   Use an approval-capable integration before enabling any real execution.
7. Capture diff, test results, failures and approval receipts in private storage.
   Run tests without production secrets. An interrupted task stays unverified.
8. Present the proposed diff for human review. Commit, push, merge, database
   changes, provider changes and deployment each remain separate permissions.

Acceptance tests must prove a valid isolated synthetic run plus refusal of
unapproved/stale snapshots, swapped repositories, wrong commits, junction
escapes, replayed/revoked approval, unsupported sandbox configuration and
attempts to change the original checkout. No real pilot execution precedes
those tests and explicit approval.

The first real pilot is an isolated private read-only project. No live
repository, provider environment or delivery channel changes are part of import.
