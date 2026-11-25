/**
 * Core parsing logic and state types for the HTTP Header Parser tool.
 * All functions are pure so they can run in the browser, in Node, and in tests.
 */

export type HeaderCategory = 'caching' | 'security' | 'cors' | 'content' | 'cookies' | 'other';

export interface HistoryEntry {
  /** Short human readable description of the saved parse. */
  text: string;
  /** ISO timestamp when the entry was saved. */
  createdAt: string;
}

export interface ToolState {
  /** Raw HTTP response / curl -i / wget -S text to parse. */
  input: string;
  /** Saved parse summaries, newest first. */
  history: HistoryEntry[];
}

export const DEFAULT_STATE: ToolState = {
  input: '',
  history: [],
};

export const MAX_HISTORY = 20;

export interface ParsedHeader {
  name: string;
  value: string;
  category: HeaderCategory;
  /** Inline explanation of what the header does. */
  description: string;
  /** Optional security-relevant note. */
  securityNote?: string;
}

export interface CookieAttributeFlags {
  secure: boolean;
  httpOnly: boolean;
  /** SameSite value as written (case preserved) or null when absent. */
  sameSite: string | null;
  /** Partitioned flag (CHIPS). */
  partitioned: boolean;
}

export interface CookieAnalysis {
  name: string;
  value: string;
  raw: string;
  flags: CookieAttributeFlags;
  /** Actionable attribute issues. */
  warnings: string[];
}

export interface SecurityCheck {
  /** Canonical header name checked. */
  header: string;
  /** Human label. */
  label: string;
  present: boolean;
  /** Suggestion to use when missing. */
  suggestion: string;
}

export interface ParsedResponse {
  /** The original status line, when present. */
  statusLine: string | null;
  protocol: string | null;
  statusCode: number | null;
  statusText: string | null;
  /** Friendly explanation of the status code. */
  statusDescription: string;
  headers: ParsedHeader[];
  /** Lowercase name -> joined values (comma-joined for duplicates). */
  headerMap: Record<string, string>;
  cookies: CookieAnalysis[];
  securityChecks: SecurityCheck[];
  /** True when at least one header or a status line was recognized. */
  isValid: boolean;
  /** Non-fatal notes about the input, e.g. wrapped lines or weird syntax. */
  notes: string[];
}

export const STATUS_DESCRIPTIONS: Record<number, string> = {
  100: 'Continue — interim response asking the client to send the request body.',
  101: 'Switching Protocols — server agreed to upgrade (e.g. to WebSocket).',
  200: 'OK — the request succeeded.',
  201: 'Created — a new resource was created.',
  202: 'Accepted — request accepted for processing, not yet complete.',
  204: 'No Content — success with an empty body.',
  206: 'Partial Content — range request satisfied.',
  301: 'Moved Permanently — resource has a new permanent URL.',
  302: 'Found — temporary redirect.',
  303: 'See Other — fetch the resource with GET at another URL.',
  304: 'Not Modified — cached copy is still fresh.',
  307: 'Temporary Redirect — same method at another URL.',
  308: 'Permanent Redirect — permanent, same method at another URL.',
  400: 'Bad Request — malformed request syntax.',
  401: 'Unauthorized — authentication is required.',
  403: 'Forbidden — authenticated but not allowed.',
  404: 'Not Found — no resource at this URL.',
  405: 'Method Not Allowed.',
  408: 'Request Timeout.',
  409: 'Conflict — request conflicts with resource state.',
  410: 'Gone — resource permanently removed.',
  413: 'Payload Too Large.',
  415: 'Unsupported Media Type.',
  418: "I'm a teapot — RFC 2324 joke status.",
  429: 'Too Many Requests — rate limited.',
  500: 'Internal Server Error.',
  501: 'Not Implemented.',
  502: 'Bad Gateway.',
  503: 'Service Unavailable — temporary overload or maintenance.',
  504: 'Gateway Timeout.',
};

const FALLBACK_STATUS =
  'Non-standard or unknown status code — see the statusText for the server explanation.';

export function statusDescriptionFor(code: number | null): string {
  if (code === null) return 'No status line detected.';
  return STATUS_DESCRIPTIONS[code] ?? FALLBACK_STATUS;
}

const HEADER_DESCRIPTIONS: Record<string, { description: string; securityNote?: string }> = {
  age: { description: 'Seconds the response has been cached by a proxy or CDN.' },
  'cache-control': {
    description:
      'Caching directives for requests/responses (max-age, no-store, stale-while-revalidate…).',
  },
  'clear-site-data': { description: 'Requests the browser to delete stored site data.' },
  'cdn-cache-control': { description: 'Caching directives targeted specifically at CDNs.' },
  expires: { description: 'Legacy absolute date after which the response expires.' },
  'strict-transport-security': {
    description: 'Tells the browser to only use HTTPS for this domain for max-age seconds.',
    securityNote: 'Consider includeSubDomains and preload for full coverage.',
  },
  'content-security-policy': {
    description:
      'Restricts sources for scripts, styles, frames and other resources to mitigate XSS/injection.',
    securityNote: "Avoid 'unsafe-inline' and 'unsafe-eval' in production policies.",
  },
  'content-security-policy-report-only': {
    description: 'Evaluates the policy but only reports violations without enforcing it.',
  },
  'x-content-type-options': {
    description: 'Set to nosniff to stop MIME sniffing — browsers honor the declared type.',
    securityNote: 'Prevents attack payloads disguised as images or CSS.',
  },
  'referrer-policy': {
    description: 'Controls how much referrer information is sent to other origins.',
    securityNote: 'strict-origin-when-cross-origin is the recommended default.',
  },
  'x-frame-options': {
    description: 'Legacy frame embedding control: DENY or SAMEORIGIN.',
    securityNote: 'Superseded by CSP frame-ancestors, but still useful for old browsers.',
  },
  'permissions-policy': {
    description: 'Whitelists powerful browser features (camera, geolocation…) per origin.',
  },
  'cross-origin-opener-policy': {
    description: 'Isolates the browsing context to mitigate cross-window attacks.',
  },
  'cross-origin-embedder-policy': {
    description: 'Controls whether cross-origin resources load without CORP headers.',
  },
  'cross-origin-resource-policy': {
    description: 'Blocks other origins from embedding this resource.',
  },
  'x-xss-protection': {
    description: 'Legacy XSS auditor flag — obsolete in modern browsers.',
    securityNote: 'Remove it; it can even introduce vulnerabilities. Use CSP instead.',
  },
  'x-permitted-cross-domain-policies': {
    description: 'Limits Adobe Flash/Acrobat cross-domain policy files (legacy).',
  },
  'expect-ct': {
    description: 'Legacy Certificate Transparency enforcement header (retired).',
  },
  'access-control-allow-origin': {
    description: 'Which origins may read the response across origins (* or a specific origin).',
  },
  'access-control-allow-methods': {
    description: 'Methods allowed in preflight cross-origin requests.',
  },
  'access-control-allow-headers': {
    description: 'Request headers allowed in cross-origin requests.',
  },
  'access-control-expose-headers': {
    description: 'Response headers the browser exposes to cross-origin JavaScript.',
  },
  'access-control-allow-credentials': {
    description: 'When true, browsers expose the response to credentialed cross-origin requests.',
    securityNote: 'Never combine true with a wildcard origin — browsers reject it.',
  },
  'access-control-max-age': { description: 'How long preflight results may be cached.' },
  'timing-allow-origin': { description: 'Origins allowed to read resource timing details.' },
  'content-type': { description: 'Media type and charset of the response body.' },
  'content-length': { description: 'Size of the response body in bytes.' },
  'content-encoding': { description: 'Body compression (gzip, br, zstd…).' },
  'content-language': { description: 'Language the response content is intended for.' },
  'content-location': { description: 'Where the returned representation came from.' },
  'content-disposition': { description: 'Inline display or attachment download hint.' },
  'content-range': { description: 'Which byte range this partial response contains.' },
  'last-modified': { description: 'Modification date used for cache validation.' },
  etag: { description: 'Version identifier for conditional requests (If-None-Match).' },
  vary: { description: 'Request headers affecting cache key selection.' },
  location: { description: 'Redirect target URL (3xx) or created resource URL (201).' },
  'accept-ranges': { description: 'Whether range requests (byte serving) are supported.' },
  date: { description: 'Time the response was generated by the origin.' },
  server: {
    description: 'Software the origin server runs.',
    securityNote: 'Long-lived detailed versions leak fingerprinting information.',
  },
  'server-timing': { description: 'Server-side timing metrics for diagnostics.' },
  'set-cookie': {
    description: 'Instructs the browser to store a cookie.',
    securityNote: 'Flags matter: Secure, HttpOnly and SameSite protect cookies.',
  },
  'x-request-id': { description: 'Request correlation identifier for tracing.' },
  via: { description: 'Proxies/hops the response traversed.' },
  'alt-svc': { description: 'Advertises alternate protocol endpoints (e.g. HTTP/3).' },
  connection: { description: 'Hop-by-hop connection options (legacy).' },
  'keep-alive': { description: 'Persistent connection tuning (legacy).' },
  'transfer-encoding': { description: 'Transfer framing, usually chunked.' },
  'x-powered-by': {
    description: 'Framework/runtime banner set by the backend.',
    securityNote: 'Exposes internal stack details; consider removing it.',
  },
  'x-dns-prefetch-control': { description: 'Controls DNS prefetching of links.' },
  'x-download-options': { description: 'Legacy IE download protection (noopen).' },
  'report-to': { description: 'Reporting endpoint configuration for browser reports.' },
  'reporting-endpoints': { description: 'Named reporting endpoints for CSP/other reports.' },
  nel: { description: 'Network Error Logging policy.' },
  'origin-agent-cluster': { description: 'Requests an origin-keyed agent cluster.' },
  'proxy-authenticate': { description: 'Challenge for proxy authentication (407).' },
  'www-authenticate': { description: 'Authentication challenge (401).' },
  'retry-after': { description: 'When to retry (seconds or HTTP-date), used with 503/429.' },
  warning: { description: 'Deprecated warnings about the response.' },
  forwarded: { description: 'Standard proxy chain information header.' },
  'x-ratelimit-limit': { description: 'Request quota per window.' },
  'x-ratelimit-remaining': { description: 'Requests remaining in the current window.' },
  'x-ratelimit-reset': { description: 'When the rate limit window resets.' },
  'request-id': { description: 'Request correlation identifier.' },
  traceparent: { description: 'W3C distributed tracing context.' },
};

const CATEGORY_BY_HEADER: Record<string, HeaderCategory> = {
  age: 'caching',
  'cache-control': 'caching',
  'clear-site-data': 'caching',
  'cdn-cache-control': 'caching',
  expires: 'caching',
  's-maxage': 'caching',
  etag: 'caching',
  'if-none-match': 'caching',
  'last-modified': 'caching',
  'if-modified-since': 'caching',
  'strict-transport-security': 'security',
  'content-security-policy': 'security',
  'content-security-policy-report-only': 'security',
  'x-content-type-options': 'security',
  'referrer-policy': 'security',
  'x-frame-options': 'security',
  'permissions-policy': 'security',
  'cross-origin-opener-policy': 'security',
  'cross-origin-embedder-policy': 'security',
  'cross-origin-resource-policy': 'security',
  'x-xss-protection': 'security',
  'x-permitted-cross-domain-policies': 'security',
  'expect-ct': 'security',
  'access-control-allow-origin': 'cors',
  'access-control-allow-methods': 'cors',
  'access-control-allow-headers': 'cors',
  'access-control-expose-headers': 'cors',
  'access-control-allow-credentials': 'cors',
  'access-control-max-age': 'cors',
  'timing-allow-origin': 'cors',
  'content-type': 'content',
  'content-length': 'content',
  'content-encoding': 'content',
  'content-language': 'content',
  'content-location': 'content',
  'content-disposition': 'content',
  'content-range': 'content',
  'accept-ranges': 'content',
  'transfer-encoding': 'content',
  'content-md5': 'content',
  digest: 'content',
  'want-digest': 'content',
  'set-cookie': 'cookies',
  cookie: 'cookies',
  date: 'other',
  location: 'other',
  server: 'other',
  'server-timing': 'other',
  connection: 'other',
  'keep-alive': 'other',
  'alt-svc': 'other',
  via: 'other',
  warning: 'other',
  'x-request-id': 'other',
  'retry-after': 'other',
};

const CATEGORY_ORDER: HeaderCategory[] = [
  'caching',
  'security',
  'cors',
  'content',
  'cookies',
  'other',
];

export const CATEGORY_LABELS: Record<HeaderCategory, string> = {
  caching: 'Caching',
  security: 'Security',
  cors: 'CORS',
  content: 'Content',
  cookies: 'Cookies',
  other: 'Other',
};

export const CATEGORY_HINTS: Record<HeaderCategory, string> = {
  caching: 'How proxies, CDNs and browsers may store the response',
  security: 'Security hardening headers',
  cors: 'Cross-origin resource sharing controls',
  content: 'Body type, size and encoding',
  cookies: 'Session/state cookies set by the server',
  other: 'Everything else',
};

function headerInfo(lowerName: string): { category: HeaderCategory; description: string } {
  const known = HEADER_DESCRIPTIONS[lowerName];
  const category: HeaderCategory =
    CATEGORY_BY_HEADER[lowerName] ??
    (lowerName.startsWith('access-control-')
      ? 'cors'
      : lowerName.startsWith('set-cookie') || lowerName === 'cookie2' || lowerName === 'cookie'
        ? 'cookies'
        : 'other');
  return { category, description: known?.description ?? 'Custom or uncommon header.' };
}

export function descriptionFor(name: string): string {
  return headerInfo(name.toLowerCase()).description;
}

export function securityNoteFor(name: string): string | undefined {
  return HEADER_DESCRIPTIONS[name.toLowerCase()]?.securityNote;
}

/** Recommended security headers checked for presence. */
export const SECURITY_CHECKS: Array<{ header: string; label: string; suggestion: string }> = [
  {
    header: 'content-security-policy',
    label: 'Content-Security-Policy',
    suggestion: "Add e.g. default-src 'self'; to restrict what the page can load and mitigate XSS.",
  },
  {
    header: 'strict-transport-security',
    label: 'Strict-Transport-Security',
    suggestion:
      'Add max-age=31536000; includeSubDomains; preload so browsers enforce HTTPS for the site.',
  },
  {
    header: 'x-content-type-options',
    label: 'X-Content-Type-Options',
    suggestion: 'Add nosniff so browsers never MIME-sniff the response into another type.',
  },
  {
    header: 'referrer-policy',
    label: 'Referrer-Policy',
    suggestion: 'Add strict-origin-when-cross-origin to limit referrer leakage.',
  },
  {
    header: 'x-frame-options',
    label: 'X-Frame-Options',
    suggestion:
      'Add DENY or SAMEORIGIN (or CSP frame-ancestors) to control framing by other sites.',
  },
  {
    header: 'permissions-policy',
    label: 'Permissions-Policy',
    suggestion: 'Add camera=(), geolocation=() etc. to restrict powerful browser features.',
  },
];

const CORE_CHECK_HEADERS = new Set([
  'content-security-policy',
  'strict-transport-security',
  'x-content-type-options',
  'referrer-policy',
]);

const STATUS_LINE_RE = /^HTTP\/(\d(?:\.\d)?)\s+(\d{3})\s*(.*)$/i;
const CURL_I_RE = /^\s*(?:curl\s+-[iIsS](?:\s+-[^\s]+)*|wget\s+-S)\b/i;
/** Leading curl/wget noise lines like "HTTP/2 200" already match, but time/size lines do not. */
const IGNORED_CURL_LINE_RE = /^\s*(?:\s*[<>].*|% Total|Dload|Total time|time_total|curl:|Note:)/i;

function joinValues(values: string[]): string {
  return values.join(', ');
}

export function analyzeSetCookie(raw: string): CookieAnalysis {
  const eq = raw.indexOf('=');
  const firstSemi = raw.indexOf(';');
  const nameEnd = eq === -1 ? (firstSemi === -1 ? raw.length : firstSemi) : eq;
  const name = raw.slice(0, nameEnd).trim();
  let value = '';
  if (eq !== -1 && (firstSemi === -1 || eq < firstSemi)) {
    value = raw.slice(eq + 1, firstSemi === -1 ? undefined : firstSemi).trim();
  }
  const attributes = raw
    .slice(firstSemi === -1 ? raw.length : firstSemi + 1)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

  const flags: CookieAttributeFlags = {
    secure: false,
    httpOnly: false,
    sameSite: null,
    partitioned: false,
  };
  for (const attr of attributes) {
    const attrLower = attr.toLowerCase();
    if (attrLower === 'secure') flags.secure = true;
    else if (attrLower === 'httponly') flags.httpOnly = true;
    else if (attrLower === 'partitioned') flags.partitioned = true;
    else if (attrLower.startsWith('samesite')) {
      const sep = attr.indexOf('=');
      flags.sameSite = sep === -1 ? '' : attr.slice(sep + 1).trim();
    }
  }

  const warnings: string[] = [];
  if (!flags.secure) {
    warnings.push('Missing Secure — the cookie can be sent over plaintext HTTP.');
  }
  if (!flags.httpOnly) {
    warnings.push('Missing HttpOnly — JavaScript can read the cookie (XSS exfiltration risk).');
  }
  if (flags.sameSite === null) {
    warnings.push('Missing SameSite — browsers default to Lax; set it explicitly.');
  } else if (flags.sameSite.toLowerCase() === 'none' && !flags.secure) {
    warnings.push('SameSite=None requires the Secure attribute — the browser will reject it.');
  }
  return { name: name || '(unnamed)', value, raw, flags, warnings };
}

export interface RawHeaderParse {
  headers: Array<{ name: string; value: string }>;
  statusLine: string | null;
  protocol: string | null;
  statusCode: number | null;
  statusText: string | null;
  notes: string[];
  sawHeaderValue: boolean;
}

/**
 * Split the raw text into a status line (if present) and raw header pairs,
 * handling duplicate headers, multi-value Set-Cookie and obs-fold lines.
 */
export function splitRawResponse(raw: string): RawHeaderParse {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headers: Array<{ name: string; value: string }> = [];
  const notes: RawHeaderParse['notes'] = [];
  let statusLine: string | null = null;
  let protocol: string | null = null;
  let statusCode: number | null = null;
  let statusText: string | null = null;
  let sawHeaderValue = false;
  let inBody = false;
  let bodyStarted = false;

  for (const [i, originalLine] of lines.entries()) {
    const line = originalLine;
    if (inBody) continue;
    if (line.trim() === '') {
      if (bodyStarted && sawHeaderValue) inBody = true;
      else if (bodyStarted) inBody = true;
      continue;
    }
    if (statusLine === null) {
      if (CURL_I_RE.test(line) || IGNORED_CURL_LINE_RE.test(line)) {
        notes.push(`Ignored client output line ${i + 1}: "${line.trim().slice(0, 60)}"`);
        continue;
      }
      const m = STATUS_LINE_RE.exec(line);
      if (m) {
        statusLine = line.trim();
        protocol = `HTTP/${m[1] ?? ''}`;
        statusCode = Number(m[2] ?? 0);
        statusText = m[3]?.trim() || null;
      } else {
        // No status line: treat the first non-empty line as the start of headers.
        bodyStarted = true;
      }
    }
    if (statusLine !== null && bodyStarted === false) {
      // Skip the status line itself now that headers begin.
      bodyStarted = true;
      continue;
    }
    // obs-fold continuation
    if (sawHeaderValue && /^\s+/.test(line)) {
      const last = headers[headers.length - 1];
      if (last) {
        last.value = `${last.value} ${line.trim()}`.trim();
        notes.push(`Folded continuation line ${i + 1} into previous header.`);
        continue;
      }
    }
    const colon = line.indexOf(':');
    if (colon <= 0) {
      notes.push(`Unrecognized line ${i + 1}: "${line.trim().slice(0, 60)}"`);
      bodyStarted = true;
      continue;
    }
    const name = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (!name || /[\s]/.test(name)) {
      notes.push(`Malformed header name on line ${i + 1}: "${name.slice(0, 40)}"`);
      continue;
    }
    sawHeaderValue = true;
    bodyStarted = true;
    headers.push({ name, value });
  }

  return { headers, statusLine, protocol, statusCode, statusText, notes, sawHeaderValue };
}

/** Parse a raw HTTP response (or curl -i / wget -S output) into structured data. Never throws. */
export function parseHttpResponse(raw: string): ParsedResponse {
  const empty: ParsedResponse = {
    statusLine: null,
    protocol: null,
    statusCode: null,
    statusText: null,
    statusDescription: statusDescriptionFor(null),
    headers: [],
    headerMap: {},
    cookies: [],
    securityChecks: SECURITY_CHECKS.map((c) => ({ ...c, present: false })),
    isValid: false,
    notes: [],
  };
  if (typeof raw !== 'string' || raw.trim() === '') return empty;

  let parsed: RawHeaderParse;
  try {
    parsed = splitRawResponse(raw);
  } catch {
    return EMPTY_PARSED;
  }

  const headers: ParsedHeader[] = [];
  const headerMap: Record<string, string> = {};
  const multi: Record<string, string[]> = {};
  for (const { name, value } of parsed.headers) {
    const lower = name.toLowerCase();
    headers.push({
      name,
      value,
      category: headerInfo(lower).category,
      description: headerInfo(lower).description,
      securityNote: HEADER_DESCRIPTIONS[lower]?.securityNote,
    });
    if (multi[lower]) {
      multi[lower].push(value);
    } else {
      multi[lower] = [value];
    }
    headerMap[lower] = joinValues(multi[lower]);
  }

  const cookies = parsed.headers
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => analyzeSetCookie(h.value));

  const presentHeads = new Set(Object.keys(headerMap));
  const allChecks = SECURITY_CHECKS.map((c) => ({
    ...c,
    present: presentHeads.has(c.header),
  }));
  const securityChecks = allChecks
    .filter((c) => CORE_CHECK_HEADERS.has(c.header))
    .concat(allChecks.filter((c) => !CORE_CHECK_HEADERS.has(c.header)));

  const isValid = parsed.statusLine !== null || headers.length > 0;

  return {
    statusLine: parsed.statusLine,
    protocol: parsed.protocol,
    statusCode: parsed.statusCode,
    statusText: parsed.statusText,
    statusDescription: statusDescriptionFor(parsed.statusCode),
    headers,
    headerMap,
    cookies,
    securityChecks,
    isValid,
    notes: parsed.notes,
  };
}

const EMPTY_PARSED: ParsedResponse = parseHttpResponse('');

/** Compact summary used by the status bar and copy actions. */
export function summaryText(parsed: ParsedResponse): string {
  if (!parsed.isValid) return 'No response parsed yet';
  const status = parsed.statusLine ?? 'headers only';
  const missing = parsed.securityChecks.filter((c) => !c.present).length;
  return `${status} — ${parsed.headers.length} headers, ${parsed.cookies.length} cookies, ${missing} missing security`;
}

/** Build a history-entry text for the current parse. */
export function historyText(parsed: ParsedResponse): string {
  return summaryText(parsed);
}

export function isState(value: unknown): value is ToolState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<ToolState>;
  return typeof v.input === 'string';
}

/** Group parsed headers by category in display order. */
export function groupByCategory(
  headers: ParsedHeader[]
): Array<{ category: HeaderCategory; headers: ParsedHeader[] }> {
  const map = new Map<HeaderCategory, ParsedHeader[]>();
  for (const header of headers) {
    const list = map.get(header.category);
    if (list) list.push(header);
    else map.set(header.category, [header]);
  }
  return CATEGORY_ORDER.filter((c) => map.has(c)).map((category) => ({
    category,
    headers: map.get(category) as ParsedHeader[],
  }));
}

/** Build a curl -I command from the parsed response. */
export function curlCommand(parsed: ParsedResponse, url = 'https://example.com'): string {
  return `curl -I ${url}`;
}

const HEADERS_BLOCK_RE = /^(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS) \S+ HTTP\/[\d.]+$/i;

/**
 * Try to extract the target URL from a curl/wget command line in the input,
 * for use in copy-as-curl output. Returns null when no URL is present.
 */
export function extractUrlFromInput(raw: string): string | null {
  if (!raw) return null;
  for (const line of raw.replace(/\r\n/g, '\n').split('\n')) {
    if (!CURL_I_RE.test(line)) continue;
    const match = line.match(/https?:\/\/[^\s'"]+/i);
    if (match) return match[0];
  }
  return null;
}

export { HEADERS_BLOCK_RE };
