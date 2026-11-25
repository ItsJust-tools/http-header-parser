import { describe, it, expect } from 'vitest';
import {
  parseHttpResponse,
  splitRawResponse,
  groupByCategory,
  statusDescriptionFor,
  descriptionFor,
  securityNoteFor,
  curlCommand,
  extractUrlFromInput,
  analyzeSetCookie,
  summaryText,
  historyText,
  isState,
  SECURITY_CHECKS,
  CATEGORY_LABELS,
  DEFAULT_STATE,
  MAX_HISTORY,
  type ParsedResponse,
  type ToolState,
} from '@/tool/types';
import {
  deserializeState,
  serializeState,
  withHistory,
  roundTrips,
  httpHeaderParserTool,
  parseState,
} from '@/tool/tool-definition';

const SAMPLE = [
  'HTTP/1.1 200 OK',
  'Content-Type: text/html; charset=utf-8',
  'Cache-Control: max-age=3600',
  'X-Content-Type-Options: nosniff',
  'Access-Control-Allow-Origin: *',
  'Set-Cookie: sid=abc123; HttpOnly; SameSite=Lax',
  'X-Custom-Thing: hello',
  '',
  '<html>body</html>',
].join('\r\n');

const state = (patch: Partial<ToolState> = {}): ToolState => ({ ...DEFAULT_STATE, ...patch });

function parseOf(input: string): ParsedResponse {
  return parseHttpResponse(input);
}

describe('splitRawResponse / parseHttpResponse — well-formed input', () => {
  it('parses a well-formed raw HTTP response into status line and header list', () => {
    const parsed = parseOf(SAMPLE);
    expect(parsed.isValid).toBe(true);
    expect(parsed.statusLine).toBe('HTTP/1.1 200 OK');
    expect(parsed.protocol).toBe('HTTP/1.1');
    expect(parsed.statusCode).toBe(200);
    expect(parsed.statusText).toBe('OK');
    expect(parsed.statusDescription).toContain('succeeded');
    expect(parsed.headers.map((h) => h.name.toLowerCase())).toEqual([
      'content-type',
      'cache-control',
      'x-content-type-options',
      'access-control-allow-origin',
      'set-cookie',
      'x-custom-thing',
    ]);
    expect(parsed.headerMap['content-type']).toBe('text/html; charset=utf-8');
  });

  it('parses headers-only input without a status line', () => {
    const parsed = parseOf('Content-Type: application/json\nCache-Control: no-store');
    expect(parsed.isValid).toBe(true);
    expect(parsed.statusLine).toBeNull();
    expect(parsed.statusCode).toBeNull();
    expect(parsed.statusDescription).toBe('No status line detected.');
    expect(parsed.headers).toHaveLength(2);
  });

  it('handles HTTP/2 status lines without reason phrase', () => {
    const parsed = parseOf('HTTP/2 404');
    expect(parsed.statusCode).toBe(404);
    expect(parsed.statusText).toBeNull();
    expect(parsed.statusDescription).toContain('no resource');
  });

  it('describes unknown status codes gracefully', () => {
    const parsed = parseOf('HTTP/1.1 599 Mystery');
    expect(parsed.statusDescription).toContain('Non-standard');
    expect(statusDescriptionFor(123)).toContain('Non-standard');
    expect(statusDescriptionFor(null)).toContain('No status line');
  });

  it('classifies headers into the right categories with descriptions', () => {
    const parsed = parseOf(SAMPLE);
    const byName = new Map(parsed.headers.map((h) => [h.name.toLowerCase(), h]));
    expect(byName.get('cache-control')?.category).toBe('caching');
    expect(byName.get('x-content-type-options')?.category).toBe('security');
    expect(byName.get('access-control-allow-origin')?.category).toBe('cors');
    expect(byName.get('content-type')?.category).toBe('content');
    expect(byName.get('set-cookie')?.category).toBe('cookies');
    expect(byName.get('x-custom-thing')?.category).toBe('other');
    expect(descriptionFor('Cache-Control')).toContain('Caching directives');
    expect(descriptionFor('X-Nobody-Knows')).toBe('Custom or uncommon header.');
    expect(securityNoteFor('strict-transport-security')).toBeTruthy();
    expect(securityNoteFor('content-type')).toBeUndefined();
    const groups = groupByCategory(parsed.headers);
    const order = groups.map((g) => g.category);
    expect(order.indexOf('caching')).toBeLessThan(order.indexOf('security'));
    expect(order.indexOf('security')).toBeLessThan(order.indexOf('cors'));
    expect(CATEGORY_LABELS.cookies).toBe('Cookies');
  });

  it('ignores curl -i / wget -S client noise lines', () => {
    const curlInput = [
      "curl -i --http1.1 'https://example.com/'",
      '  % Total    % Received % Xferd',
      'Note: some curl chatter',
      'HTTP/1.1 200 OK',
      'Server: nginx',
      '',
      'body here',
    ].join('\n');
    const parsed = parseOf(curlInput);
    expect(parsed.statusLine).toBe('HTTP/1.1 200 OK');
    expect(parsed.headers.map((h) => h.name)).toEqual(['Server']);
    expect(parsed.notes.length).toBeGreaterThan(0);
    expect(extractUrlFromInput(curlInput)).toBe('https://example.com/');
    expect(extractUrlFromInput('HTTP/1.1 200 OK\nServer: x')).toBeNull();
  });

  it('unfolds obs-fold continuation lines and records a note', () => {
    const parsed = parseOf(
      ['HTTP/1.1 200 OK', 'Content-Type:', '  text/html;', '  charset=utf-8', ''].join('\n')
    );
    expect(parsed.headerMap['content-type']).toBe('text/html; charset=utf-8');
    expect(parsed.notes.some((n) => n.includes('olded'))).toBe(true);
  });
});

describe('duplicate and multi-value headers', () => {
  it('merges duplicate headers comma-separated in headerMap', () => {
    const parsed = parseOf(
      ['HTTP/1.1 200 OK', 'X-Loop: a', 'X-Loop: b', 'X-Loop: c', ''].join('\n')
    );
    expect(parsed.headers).toHaveLength(3);
    expect(parsed.headerMap['x-loop']).toBe('a, b, c');
  });

  it('keeps every Set-Cookie line separate and analyzes each cookie', () => {
    const parsed = parseOf(
      [
        'HTTP/1.1 200 OK',
        'Set-Cookie: a=1; Secure; HttpOnly; SameSite=Strict',
        'Set-Cookie: b=2; SameSite=None',
        'Set-Cookie: c=3',
        '',
      ].join('\n')
    );
    expect(parsed.cookies).toHaveLength(3);
    expect(parsed.headerMap['set-cookie']).toContain('SameSite=None');
    expect(parsed.headerMap['set-cookie']?.split(', ')).toHaveLength(3);
    const [a, b, c] = parsed.cookies;
    if (!a || !b || !c) throw new Error('expected three cookies');
    expect(a!.flags).toEqual({
      secure: true,
      httpOnly: true,
      sameSite: 'Strict',
      partitioned: false,
    });
    expect(a.warnings).toEqual([]);
    expect(b!.flags.secure).toBe(false);
    expect(b!.warnings.join(' ')).toContain('SameSite=None requires the Secure');
    expect(c!.warnings).toHaveLength(3);
    expect(c.warnings.join(' ')).toContain('Secure');
    expect(c.warnings.join(' ')).toContain('HttpOnly');
    expect(c.warnings.join(' ')).toContain('SameSite');
  });

  it('analyzes cookie attributes with partitioned flag', () => {
    const cookie = analyzeSetCookie(
      'token=xyz; Path=/; Secure; HttpOnly; SameSite=None; Partitioned'
    );
    expect(cookie.name).toBe('token');
    expect(cookie.value).toBe('xyz');
    expect(cookie.flags.partitioned).toBe(true);
    expect(cookie.warnings).toEqual([]);
  });

  it('handles cookie without equals sign or attributes', () => {
    const cookie = analyzeSetCookie('flagged');
    expect(cookie.name).toBe('flagged');
    expect(cookie.value).toBe('');
    expect(cookie.flags.secure).toBe(false);
    expect(cookie.warnings).toHaveLength(3);
  });
});

describe('missing security headers', () => {
  it('flags missing recommended security headers with suggestions', () => {
    const parsed = parseOf(SAMPLE);
    const missing = parsed.securityChecks.filter((c) => !c.present).map((c) => c.header);
    expect(missing).toContain('strict-transport-security');
    expect(missing).toContain('referrer-policy');
    const hsts = parsed.securityChecks.find((c) => c.header === 'strict-transport-security');
    expect(hsts?.suggestion).toContain('max-age');
  });

  it('marks present ones and never flags present headers', () => {
    const parsed = parseOf(
      [
        'HTTP/1.1 200 OK',
        'X-Content-Type-Options: nosniff',
        'Referrer-Policy: strict-origin-when-cross-origin',
        '',
      ].join('\n')
    );
    const xcto = parsed.securityChecks.find((c) => c.header === 'x-content-type-options');
    const rp = parsed.securityChecks.find((c) => c.header === 'referrer-policy');
    expect(xcto?.present).toBe(true);
    expect(rp?.present).toBe(true);
    expect(SECURITY_CHECKS.length).toBeGreaterThanOrEqual(4);
  });

  it('returns full missing list for empty parse', () => {
    const parsed = parseOf('');
    expect(parsed.isValid).toBe(false);
    expect(parsed.securityChecks.every((c) => !c.present)).toBe(true);
    expect(summaryText(parsed)).toBe('No response parsed yet');
  });
});

describe('malformed input', () => {
  it('never throws on garbage input', () => {
    expect(() => parseHttpResponse('\x00\x01\x02')).not.toThrow();
    expect(() => parseHttpResponse(':::')).not.toThrow();
    expect(() => parseHttpResponse('nonsense line\nAnother: value')).not.toThrow();
  });

  it('returns invalid with notes for unparseable text', () => {
    const parsed = parseHttpResponse('nonsense line');
    expect(parsed.isValid).toBe(false);
    expect(parsed.headers).toHaveLength(0);
    expect(parsed.notes.length).toBeGreaterThan(0);
  });

  it('skips malformed header names but keeps the rest', () => {
    const parsed = parseHttpResponse('Bad Header: x\nGood: y');
    expect(parsed.headerMap).toEqual({ good: 'y' });
    expect(parsed.notes.some((n) => n.includes('Malformed'))).toBe(true);
  });

  it('handles whitespace-only and very long input', () => {
    expect(parseHttpResponse('   \n  ').isValid).toBe(false);
    const long = parseHttpResponse(`HTTP/1.1 200 OK\n${'X-Long: a\n'.repeat(2000)}`);
    expect(long.headers).toHaveLength(2000);
  });

  it('accepts CRLF and bare-CR line endings', () => {
    const parsed = parseHttpResponse('HTTP/1.1 204 No Content\r\nServer: test\r\n\r\n');
    expect(parsed.statusCode).toBe(204);
    expect(parsed.headers).toHaveLength(1);
  });
});

describe('serialization / deserialization', () => {
  it('serializes and deserializes tool state losslessly', () => {
    const full = state({
      input: SAMPLE,
      history: [{ text: 'Saved parse', createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    const round = deserializeState(JSON.parse(serializeState(full)));
    expect(round.success).toBe(true);
    if (round.success) {
      expect(round.data).toEqual(full);
    }
    expect(roundTrips(full)).toBe(true);
    expect(roundTrips(state())).toBe(true);
  });

  it('rejects invalid payloads with a meaningful error', () => {
    for (const bad of [null, 42, 'text', [], true]) {
      const result = deserializeState(bad);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid data format');
      }
    }
  });

  it('falls back to defaults for wrong-typed fields and trims/caps history', () => {
    const result = deserializeState({
      input: 123,
      history: 'nope',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.input).toBe('');
      expect(result.data.history).toEqual([]);
    }
    const history = Array.from({ length: MAX_HISTORY + 5 }, (_, i) => ({
      text: `h${i}`,
      createdAt: '2026-01-01T00:00:00.000Z',
    }));
    const capped = deserializeState({ input: 'HTTP/1.1 200 OK', history });
    expect(capped.success).toBe(true);
    if (capped.success) {
      expect(capped.data.history).toHaveLength(MAX_HISTORY);
    }
  });

  it('withHistory prepends and caps at MAX_HISTORY', () => {
    let s = state();
    s = withHistory(s, 'one');
    s = withHistory(s, 'two');
    expect(s.history.map((h) => h.text)).toEqual(['two', 'one']);
    for (let i = 0; i < MAX_HISTORY + 3; i++) s = withHistory(s, `x${i}`);
    expect(s.history).toHaveLength(MAX_HISTORY);
    expect(new Date(s.history[0]?.createdAt as string).toString()).not.toBe('Invalid Date');
  });

  it('exposes the tool definition with the canonical id and exporters', () => {
    expect(httpHeaderParserTool.id).toBe('http-header-parser');
    expect(httpHeaderParserTool.initialState).toEqual({ input: '', history: [] });
    expect(httpHeaderParserTool.exporters?.map((e) => e.format)).toEqual([
      'png',
      'jpeg',
      'webp',
      'pdf',
    ]);
    const serialized = httpHeaderParserTool.serialize(state({ input: 'HTTP/1.1 200 OK' }));
    expect(JSON.parse(serialized).input).toBe('HTTP/1.1 200 OK');
  });

  it('parseState wraps parseHttpResponse', () => {
    expect(parseState(state({ input: SAMPLE })).statusCode).toBe(200);
    expect(parseState(state()).isValid).toBe(false);
  });
});

describe('helpers', () => {
  it('builds a curl command and detects state payloads', () => {
    const parsed = parseOf(SAMPLE);
    expect(curlCommand(parsed, 'https://example.com/page')).toBe(
      'curl -I https://example.com/page'
    );
    expect(curlCommand(parsed)).toBe('curl -I https://example.com');
    expect(isState({ input: 'x' })).toBe(true);
    expect(isState({ input: 5 })).toBe(false);
    expect(isState(null)).toBe(false);
    expect(historyText(parsed)).toBe(summaryText(parsed));
    expect(summaryText(parsed)).toContain('6 headers');
  });
});
