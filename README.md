# Sovrad by Renvarel

**See the plan. Approve the change.**

A local visual workspace for reviewing requirements, proposing rule changes and
approving exact specification revisions. Apache-2.0. Early local preview.

## Run on Windows

Use Node.js 24, npm and Git. Open PowerShell in this source folder:

```powershell
npm ci
npm test
npm run check
npm run test:e2e
npm run dev
```

Open http://127.0.0.1:5173. The API binds to 127.0.0.1:4317.
Browser tests use installed Google Chrome on Windows; on Linux or CI first run
`npx playwright install chromium --with-deps`.
Browser tests use separate scratch ports 5175 (web) and 4319 (API), refuse
occupied scratch ports and use a temporary synthetic database outside source.

## Try the calculator workflow

Select one of the five steps. Read its purpose, rules and error behavior.
Describe a correction, edit the proposed rules, then save it for review.
Inspect the proposal and approve or reject it. Approval advances the revision;
rejection preserves the existing rules. A stale proposal cannot replace a newer
revision. Restart the API and reload to see the same saved rules and decisions.

This example edits the calculator's specification. It does not generate or run
calculator implementation code.

## Private storage

The Windows default is
`%LOCALAPPDATA%/Renvarel/Sovrad/sovrad.sqlite` plus SQLite journal files.
On other platforms the default is under `~/.local/share/Renvarel/Sovrad`.
Set `SOVRAD_DATA_DIR` to choose an absolute private directory outside
the source checkout and its ancestors. Existing junctions are resolved before
validation. Store user projects, exports, backups and repository copies outside
the public source. SQLite records are local plaintext protected by the user's
operating-system account; this preview does not implement encryption or cloud sync.

Only synthetic examples belong in this repository. The app has no automatic
export-to-GitHub path. `npm run public-check` checks the publication
file list, filenames and obvious credentials, including staged Git content.
It is a heuristic; manually review everything before publishing.

## Optional OpenAI drafting

AI is off by default. Before enabling it, configure a dedicated backend key and
an enforced $5 hard limit for its provider project. In a fresh PowerShell window
with no existing API key, run:

```powershell
./scripts/start-private-ai.ps1 -HardLimitConfirmed
```

The script reads the key through a hidden prompt, starts only the API and removes
its process environment settings when it exits. Start the web separately with
`npm run dev:web`. Do not put a key literal in a command, browser setting,
environment file, VITE variable, source file or commit. `.env.example` documents
settings; the app does not load it automatically. Backend configuration requires
`SOVRAD_AI_ENABLED=true` and `SOVRAD_AI_HARD_LIMIT_CONFIRMED=true` with the key.

Each request needs explicit UI consent. Only the selected step's title,
purpose, current rules and requested correction are sent. Consent resets when
the selected step or revision changes. Credential-like content is refused.
The backend pins `gpt-5.6-terra`, reasoning effort `none`, structured output and
`store:false`. It caps input at 8,192 tokens and output at 1,500 tokens, with a
20-second timeout and no automatic retries. It counts input tokens before drafting.
A durable limit of ten attempts per UTC day includes failed provider requests.
The local lifetime budget is $5 per database, using conservative accounting of
$2.50 per million input tokens and $12 per million output tokens. This is local
accounting, not an exact provider invoice or a replacement for provider controls.
Pending or unknown charges pause further drafting across restarts; do not clear
the database to bypass this pause. The budget panel shows the local status.

Validated AI output is saved only as a draft. It cannot approve a requirement
or execute code. Automated tests use synthetic keys and a local fake transport;
a passing test does not establish live model access or billing configuration.

## Controlled implementation roadmap

Codex coding is disabled. Backend task creation, exact-manifest approval,
cancellation and event routes exist; starting an approved task returns a blocked
result without launching coding. Creating a task prepares a synthetic Git
calculator fixture in private storage. A workflow approval grants no permission
to modify code, commit, merge or deploy.
The separately gated runner plan is in [docs/RUNNER-PLAN.md](docs/RUNNER-PLAN.md).
Its future execution must use an isolated worktree, exact approved revision,
approved repository commit and enforced sandbox/command approvals.

External repository import is also disabled: its HTTP submission route refuses
capture. Internal snapshot helpers are tested with synthetic repositories; this
does not establish a private-project import. The shipped UI remains the calculator
workflow and budget panel; multi-project dashboards, annotations and an owner
decision center are not implemented.

## Structure and quality

- apps/web: React, React Flow, inspector and proposal review.
- apps/api: local Fastify API, SQLite history and opt-in AI drafting.
- apps/runner: task manifests, synthetic repository checks and a diagnostic-only
  protocol client; native coding remains blocked.
- packages/core: workflow model and revision-safe approval logic.
- tests/e2e: real-browser approval and API-process restart checks.
- scripts: publication scanner and its regression tests.
- docs: architecture, runner gates and observed verification status.

[Current evidence](docs/PROJECT-STATE.md) records executed checks and remaining
gates. CI configuration runs installation, tests, typechecks, build, public-file
checks and browser tests on Windows and Linux. CI execution on GitHub is a
separate gate and is not implied by a local pass.

## Contributing and license

Read [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Licensed under Apache-2.0;
dependencies retain their respective licenses.
