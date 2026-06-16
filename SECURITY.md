# Security Policy

## Supported Versions

We release security updates for the latest minor version only. Older versions
are not maintained.

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| 0.1.x   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it privately:

1. **GitHub Security Advisories** (preferred):
   https://github.com/Zhi-Chao-PAN/launchlens-research-studio/security/advisories/new

2. **Email**: Create a private security advisory on GitHub (see link above) and
   mention the maintainers.

Please **do not** open a public issue for security vulnerabilities. Public
disclosure before a fix is available puts all users at risk.

When reporting, please include:

- A clear description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)
- Your name/handle for credit (optional)

We aim to acknowledge reports within **48 hours** and provide an initial
assessment within **5 business days**.

## Security Model

This is a **research/demo application**:

- The mock provider is fully deterministic and runs locally — no external
  LLM or search APIs are called by default
- Sessions are stored in-memory only; data is lost on server restart
- No user accounts or authentication
- No persistent database (localStorage is client-side only)
- The "API" is intended for local development and demo purposes

When you wire in a real LLM/search provider, additional security
considerations apply (API key management, prompt injection, PII handling,
etc.) — see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Known Security Considerations

- **localStorage data is not encrypted** — do not put secrets in the
  share URL hash (`#share:...`). The hash is only an opaque session id.
- **Share URLs** can leak session data to anyone with the link. Treat them
  like shared documents.
- **Server-side sessions** are not isolated between users in this demo. If
  you deploy publicly, add authentication and per-user session storage.
- **Mock outputs** contain example URLs (`https://example.com/...`) — do not
  mistake them for real research.

## Hardening for Production Deployment

If you fork this project for production use, please address:

1. **Authentication** — add an auth layer (NextAuth, Clerk, etc.)
2. **Session isolation** — store sessions per-user (database, not memory)
3. **Rate limiting** — add per-IP/per-user rate limits on API routes
4. **CSP headers** — set a strict Content-Security-Policy
5. **HTTPS** — enforce TLS for all traffic
6. **API key management** — use a secrets manager, never commit keys
7. **Input sanitization** — strip HTML/JS from query inputs
8. **Audit logging** — track who started which research and when
9. **Data retention** — define and enforce session TTL
10. **Dependency updates** — keep Next.js, React, and other deps up to date

## Dependency Security

We use GitHub Dependabot and CodeQL to monitor dependencies for known
vulnerabilities. See `.github/workflows/codeql.yml`.

To check locally:

```bash
npm audit
npm audit fix
```

## Acknowledgments

We thank the security researchers and community members who responsibly
disclose vulnerabilities.
