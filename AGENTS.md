# Coding-agent instructions (mandatory)

Read `README.md`, `docs/PROJECT-STATE.md`, `docs/ARCHITECTURE.md`, `SECURITY.md`, and the relevant tests before coding.

## Boundaries

1. This repository is **PUBLIC**. NEVER add real project source, client or customer names/data, access tokens, chat identifiers, private requirements, workflow exports, logs, database files, or screenshots from user projects. Use fictional demonstration data only.
2. All user-generated project content must reside in an explicitly chosen private data directory outside the repository. Do not accidentally serialize private state into source-controlled configuration or fixtures.
3. Preserve public app source versus private connected project boundaries. The browser must never see `OPENAI_API_KEY` or local Codex credentials.
4. Do not add remote repository connections, shell execution, tool access, Codex runs, cloud deployments, or network forwarding without a separately approved implementation plan and tests.
5. Never enable production source editing, commits, pushes, merges, database migration, remote-resource changes, or deployments based solely on a workflow approval.
6. Proposed rules and AI suggestions are **untrusted input**. Validate before storage and recheck revision at approval time. Approved specifications must remain traceable.
7. Maintain server-side local origin/host checks, request body size caps and explicit user consent for OpenAI requests. Do not add third-party telemetry without explicit consent.
8. Do not modify another repository or read other directories as part of a routine test. Do not run public-PR code with credentials.
9. On Windows, use an isolated project checkout; never execute Codex in an unrestricted user-home context.
10. Uncertainty is a blocker, not a reason to silently infer requirements.

## Workflow

- Inspect branch, HEAD, uncommitted changes, test status and scope before starting.
- Small isolated commits after checks, with a test for every approval/authorization behavior.
- Explain all files changed, tests run and not run, and blockers. Never claim a build was verified if dependencies were unavailable.
- Keep implementation and deployment gates separate. Do not silently expand scope.
