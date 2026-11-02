# Controlled Codex runner — foundation and remaining gates

Developer gate reference, reviewed 2026-11-02 (package 0.1.0).
Native coding and HTTP import remain disabled; no approval bypasses this gate.

## Foundation present

- Synthetic calculator task creation prepares a private Git repository and
  trusted acceptance file after checking an approved current specification.
- A manifest binds the specification revision/digest/approval receipt,
  repository identity, base commit, allowed files and acceptance digest.
- Task approval is distinct from specification approval and checks the exact
  manifest digest. Start revalidates bindings, then returns blocked without coding.
  Cancellation revokes approval; restart interrupts stored running tasks.
- Repository helpers validate clean Git identity and prepare a genuine detached
  worktree. A worktree is not proof of native isolation.
- The diagnostic protocol client allows initialization and permission-profile
  listing only and declines command/file/permission approval requests. The
  empty-configuration probe is pinned to Codex `0.166.0-alpha.5.1`.
- Import status/list/get routes and an internal synthetic snapshot helper exist.
  HTTP import submission refuses capture before reading source.

## Required before any coding turn

1. Implement and test a native boundary that denies unrelated credential reads,
   original-checkout writes, control-API access and unapproved network access.
   Workspace-write settings and separate worktrees alone do not prove this.
2. Enforce the exact approved repository, commit, revision and manifest immediately
   before launch. Refuse path/junction escapes, dirty or swapped repositories,
   stale/replayed/revoked approvals and unapproved execution configuration.
3. Demonstrate supported sandbox and interactive approval handling on Windows.
   Unsupported capabilities must keep execution disabled. The diagnostic
   handshake establishes neither sign-in/model access nor these capabilities.
4. Prove a valid synthetic calculator coding run, its bounded write set,
   independent acceptance tests and private diff/evidence capture. An interrupted
   run remains unverified and requires fresh implementation approval.
5. Review results before separately permitting a private read-only pilot. Imports
   must remain explicit, bounded, provenance-preserving and non-executable; no
   production credentials or automatic repository discovery belong in that pilot.

Specification approval, coding permission, source review, commit/push, merge,
database changes and deployment remain independent gates. An implementation
receipt cannot authorize downstream actions. No secure native coding run or
actual private-project import is claimed by this foundation.
