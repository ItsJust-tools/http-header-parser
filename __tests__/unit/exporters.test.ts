import { describe, it, expect } from 'vitest';
import {
  serializeState,
  deserializeState,
  withHistory,
  roundTrips,
  parseState,
} from '@/tool/tool-definition';
import { DEFAULT_STATE, parseHttpResponse, type ToolState } from '@/tool/types';
import { createCanvasExporter, formatExportError, throwIfAborted } from '@/tool/exporters/utils';

const state = (patch: Partial<ToolState> = {}): ToolState => ({ ...DEFAULT_STATE, ...patch });

describe('export pipeline helpers', () => {
  it('formats export errors with CORS hints', () => {
    expect(formatExportError(new Error('tainted canvas: CORS policy'), 'PNG')).toContain('CORS');
    expect(formatExportError(new Error('boom'), 'PNG')).toBe('boom');
    expect(formatExportError('weird', 'PDF')).toBe('PDF export failed');
  });

  it('throws AbortError when the signal is aborted', () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => throwIfAborted(controller.signal)).toThrow(DOMException);
    expect(() => throwIfAborted(undefined)).not.toThrow();
  });

  it('createCanvasExporter produces png/jpeg/webp exporters with right formats', () => {
    for (const [format, mime, ext] of [
      ['png', 'image/png', 'png'],
      ['jpeg', 'image/jpeg', 'jpg'],
      ['webp', 'image/webp', 'webp'],
    ] as const) {
      const exporter = createCanvasExporter(format, mime, ext);
      expect(exporter.format).toBe(format);
    }
  });

  it('exporter returns failure result when rendering throws without a DOM element', async () => {
    const exporter = createCanvasExporter('png', 'image/png', 'png');
    const result = await exporter.export(
      null as unknown as HTMLElement,
      {
        format: 'png',
      } as Parameters<typeof exporter.export>[1]
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.format).toBe('png');
  });
});

describe('state helpers used by export/share', () => {
  it('serializes the exact state for export payloads', () => {
    const s = state({ input: 'HTTP/1.1 200 OK\nServer: x\n' });
    const payload = JSON.parse(serializeState(s));
    expect(payload).toEqual({ input: s.input, history: [] });
  });

  it('deserialized state parses identically to fresh state', () => {
    const s = state({ input: 'HTTP/1.1 404 Not Found\nServer: y\n' });
    const restored = deserializeState(JSON.parse(serializeState(s)));
    expect(restored.success).toBe(true);
    if (restored.success) {
      expect(parseState(restored.data).statusCode).toBe(404);
      expect(parseHttpResponse(restored.data.input).statusLine).toBe('HTTP/1.1 404 Not Found');
    }
  });

  it('roundTrips and withHistory keep state intact', () => {
    const s = withHistory(state(), 'entry');
    expect(roundTrips(s)).toBe(true);
    expect(s.history[0]?.text).toBe('entry');
    expect(s.history[0]?.createdAt).toBeTruthy();
  });
});
