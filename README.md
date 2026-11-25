# HTTP Header Parser

Paste a raw HTTP response (or `curl -i` / `wget -S` output) and get every header parsed, grouped
by category, with explanations of what each header does and security flags highlighted.

**Live:** [http-header-parser.itsjust.tools](https://http-header-parser.itsjust.tools)

## Features

- Parses raw HTTP responses, `curl -i` and `wget -S` output — status line plus every header
- Headers grouped into caching, security, CORS, content, cookies and other
- Inline explanation for every known header, per-header copy buttons
- Detects missing recommended security headers (CSP, HSTS, X-Content-Type-Options,
  Referrer-Policy, X-Frame-Options, Permissions-Policy) with concrete suggestions
- Cookie attribute analysis: Secure, HttpOnly, SameSite, Partitioned, with warnings
- Handles duplicate headers, multi-value `Set-Cookie`, obs-fold continuation lines and
  malformed input without crashing
- Copy all headers as JSON, as a `curl -I` command, or the raw text
- Status line parsing with a friendly description for every common status code
- Shareable state via URL, JSON import/export and image/PDF export
- Dark mode and 100% client-side — no data ever leaves your browser

## Input formats

```http
HTTP/2 200
content-type: text/html; charset=utf-8
set-cookie: sid=abc; HttpOnly; SameSite=Lax
```

Client noise from `curl` (progress lines, notes) and `wget -S` is ignored automatically;
a status line is optional — a bare header list works too.

## Development

```bash
npm ci
npm run dev
npm test -- --coverage
npm run build
```

## Deployment

The main branch deploys automatically. See [GUIDE.md](./GUIDE.md) for the full workflow and
[CHANGELOG.md](./CHANGELOG.md) for release history.

## License

MIT — see [LICENSE](./LICENSE).
