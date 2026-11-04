# Security and privacy

This is a local preview, not an authenticated multi-user or remotely exposed
service. Bind only to loopback. Do not forward its ports or attach production
credentials. Local OS users are trusted.

## Report a vulnerability

Do not post credentials, customer information or exploitable private details in
public issues. Use private vulnerability reporting at https://github.com/Renvarel-Solutions/sovrad/security/advisories/new.

## Boundaries

- Public source contains application code and synthetic examples only.
- User projects, records, exports, private checkouts and backups stay outside source.
- SQLite storage is local plaintext; the OS account protects access.
- API keys and Codex credentials must never reach the browser or Git history.
- Host/origin/fetch-site checks, a local-action header and a 16 KiB body limit
  protect the loopback API. No remote authentication is implemented.
- AI needs backend opt-in and explicit request consent, has a durable request
  quota and a durable conservative $5 lifetime budget, validates output, rechecks
  revision and can create drafts only. Pending/unknown charges pause new calls.
- Credential-pattern filtering is heuristic and cannot identify every secret or PII.
  Review the selected material before granting AI consent.
- store:false is a request setting; it does not establish zero retention under
  every provider policy.
- Implementation task routes exist, but start is blocked by the native-isolation
  gate. Import submission is blocked before source is read. Neither approval can
  enable coding, merge or deployment.
- A genuine Git worktree separates checkouts; it does not establish native
  isolation from credentials, unrelated files, the control API or the network.
- The diagnostic protocol probe initializes an empty configuration only. It does
  not prove sign-in, model access or a secure coding sandbox.
- Public contribution tests must never receive maintainer or production secrets.

The publication scanner is a guardrail, not a confidentiality classifier.
Review the complete file set and staged content before any public push.

Use `scripts/start-private-ai.ps1` for hidden key entry after confirming the
dedicated provider project's enforced hard limit. Never place a key literal in
commands, environment files or browser settings. The local budget estimates
spending; provider billing controls remain an independent requirement.
