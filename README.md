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
Stop the demo before browser tests; the suite refuses occupied ports and uses a
temporary synthetic database outside the repository.

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

AI is off by default. Configure a dedicated restricted key and account budget
controls outside source, then set process environment variables in PowerShell:

```powershell
$env:SOVRAD_AI_ENABLED = 'true'
$env:OPENAI_API_KEY = '<restricted-key>'
$env:OPENAI_MODEL = '<model-available-to-your-account>'
npm run dev
```

The example environment file documents settings; the app does not load it
automatically. Never put keys in browser settings, VITE variables, source files
or commits.

Each request needs explicit UI consent. Only the selected step's title,
purpose, current rules and requested correction are sent. Consent resets when
the selected step or revision changes. Credential-like content is refused.
The backend uses the Responses API with structured output, store:false,
a 1,500 output-token cap, a 20-second timeout and no automatic retries.
A durable limit of ten attempts per UTC day includes failed provider requests.
This is a request limit, not a monthly dollar limit. Configure billing controls
in the provider account separately.

Validated AI output is saved only as a draft. It cannot approve a requirement
or execute code. Automated tests use synthetic keys and a local fake transport;
a passing test does not establish live model access or billing configuration.

## Controlled implementation roadmap

Codex execution is disabled and has no HTTP execution endpoint. A workflow
approval grants no permission to modify code, commit, merge or deploy.
The separately gated runner plan is in [docs/RUNNER-PLAN.md](docs/RUNNER-PLAN.md).
Its future execution must use an isolated worktree, exact approved revision,
approved repository commit and enforced sandbox/command approvals.

External repository import is also disabled. Real pilots remain private and
require a separately approved read-only import plan.

## Structure and quality

- apps/web: React, React Flow, inspector and proposal review.
- apps/api: local Fastify API, SQLite history and opt-in AI drafting.
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
