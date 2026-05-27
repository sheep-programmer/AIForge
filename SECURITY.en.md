# Security policy

## Reporting a vulnerability

Email security@aiforge.invalid (replace with your contact) with:
- A description of the issue
- Steps to reproduce
- Impact assessment

We'll respond within 72 hours. Please don't open a public issue for security reports.

## Threat model

AIForge is designed to run on a trusted server. The intended deployment is:
- Bind to `127.0.0.1` or a private network
- Behind a reverse proxy (nginx / caddy) with TLS
- Optional `AIFORGE_API_KEY` for write operations
- Public-internet exposure is **not** a supported configuration without your own auth layer

## What we promise

- `SKILL.md` content is treated as **untrusted text** — never executed
- Ingestion clones to a sandboxed temp dir, reads `SKILL.md` files only, then deletes
- The remote skill-finder is **off by default** and requires explicit admin approval to add anything
- The plugin sends only the user's prompt to the server — never source code, never file contents

## What we don't (yet) promise

- Full input sanitization on `SKILL.md` body — embeddings are computed over raw markdown
- Rate limiting on the recommend endpoint (add at your reverse proxy)
- Multi-tenant isolation — AIForge is single-tenant by design

## Dependencies

We update `sentence-transformers`, `fastapi`, `sqlalchemy`, and `sqlite-vss` on Anthropic / OSS advisory.
