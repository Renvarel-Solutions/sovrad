# Contributing to Sovrad

Use issues and pull requests containing application changes and synthetic
examples only. Do not attach real workflows, project exports, customer data,
credentials, databases, private repository code or agent transcripts.

Use Node 24. Run npm ci, npm test, npm run check, npm run public-check and
npm run test:e2e before proposing a change. On Windows browser tests use Chrome;
on CI install Chromium with Playwright. E2E uses scratch ports 5175 (web) and
4319 (API), refuses occupied ports and does not stop an existing application.

Keep changes focused and include regression tests for approval, revision,
storage and authorization behavior. Explain the actual checks run and any
limitations. Never weaken an access boundary to make a test pass.

Pull requests require maintainer review and passing checks. The publication policy requires protected main with review and CI checks. Contributors do not
receive automatic write or release access. Public PR jobs receive no personal
API keys or production credentials. Do not add pull_request_target workflows
that execute untrusted contributor code.

Contributions are submitted under the Apache-2.0 license covering this project.
