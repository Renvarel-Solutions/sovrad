# Security and privacy

This is a local preview, not an authenticated multi-user or remotely exposed
service. Bind only to loopback. Do not forward its ports or attach production
credentials. Local OS users are trusted.

## Report a vulnerability

Do not post credentials, customer information or exploitable private details in
public issues. Use private vulnerability reporting at https://github.com/Renvarel-Solutions/sovrad/security/advisories/new. The private reporting channel is enabled for this preview.

## Boundaries

- Public source contains application code and synthetic examples only.
- User projects, records, exports, private checkouts and backups stay outside source.
- SQLite storage is local plaintext; the OS account protects access.
- API keys and Codex credentials must never reach the browser or Git history.
- Host/origin/fetch-site checks, a local-action header and a 16 KiB body limit
  protect the loopback API. No remote authentication is implemented.
- AI needs backend opt-in and explicit request consent, has a durable request
  quota, validates output, rechecks revision and can create drafts only.
- Credential-pattern filtering is heuristic and cannot identify all sensitive data.
  Review the selected material before granting AI consent.
- store:false is a request setting; it does not establish zero retention under
  every provider policy.
- No source editing, shell execution, agent launching or deployment route exists.
- Public contribution tests must never receive maintainer or production secrets.

The publication scanner is a guardrail, not a confidentiality classifier.
Review the complete file set and staged content before any public push.
