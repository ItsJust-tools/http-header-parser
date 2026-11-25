import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { Canvas } from '@/tool/components/Canvas';
import { Sidebar } from '@/tool/components/Sidebar';
import { Toolbar } from '@/tool/components/Toolbar';
import { DEFAULT_STATE, parseHttpResponse, type ToolState } from '@/tool/types';
import {
  serializeState,
  deserializeState,
  withHistory,
  roundTrips,
  parseState,
} from '@/tool/tool-definition';

const state = (patch: Partial<ToolState> = {}): ToolState => ({ ...DEFAULT_STATE, ...patch });

const SAMPLE = [
  'HTTP/1.1 200 OK',
  'Content-Type: text/html; charset=utf-8',
  'Cache-Control: no-store',
  'X-Content-Type-Options: nosniff',
  'Access-Control-Allow-Origin: *',
  'Set-Cookie: sid=abc; HttpOnly; SameSite=Lax',
  'Server: nginx/1.25',
  '',
  'body',
].join('\n');

describe('Canvas rendering', () => {
  it('renders status line, grouped headers, security checks and cookies', () => {
    const parsed = parseHttpResponse(SAMPLE);
    const onChange = vi.fn();
    render(<Canvas state={state({ input: SAMPLE })} parsed={parsed} onChange={onChange} />);

    expect(screen.getByTestId('status-line')).toHaveTextContent('HTTP/1.1 200 OK');
    expect(screen.getByTestId('status-desc')).toHaveTextContent('succeeded');
    expect(screen.getByTestId('group-caching')).toBeInTheDocument();
    expect(screen.getByTestId('group-security')).toBeInTheDocument();
    expect(screen.getByTestId('group-cors')).toBeInTheDocument();
    expect(screen.getByTestId('group-content')).toBeInTheDocument();
    expect(screen.getByTestId('group-cookies')).toBeInTheDocument();
    expect(screen.getByTestId('group-other')).toBeInTheDocument();

    const names = screen.getAllByTestId('header-name').map((el) => el.textContent);
    expect(names.join(' ')).toContain('Cache-Control:');
    expect(names.join(' ')).toContain('Access-Control-Allow-Origin:');

    expect(screen.getAllByTestId('header-desc').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('header-security-note').length).toBeGreaterThan(0);

    expect(screen.getAllByTestId('security-present').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('security-missing').length).toBeGreaterThan(0);
    expect(screen.getByTestId('security-missing-count')).toHaveTextContent('missing');

    expect(screen.getByTestId('cookie-name')).toHaveTextContent('sid');
    expect(screen.getByText(/HttpOnly: yes/)).toBeInTheDocument();
    expect(screen.getByText(/SameSite: Lax/)).toBeInTheDocument();
  });

  it('shows the invalid-input note for garbage and supports editing state', () => {
    const onChange = vi.fn();
    render(
      <Canvas
        state={state({ input: 'total garbage' })}
        parsed={parseHttpResponse('garbage')}
        onChange={onChange}
      />
    );
    expect(screen.getByTestId('invalid-note')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('input-raw'), { target: { value: 'HTTP/1.1 200 OK\n' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ input: 'HTTP/1.1 200 OK\n' }));
  });

  it('clears empty state gracefully and shows empty history', () => {
    render(<Canvas state={state()} parsed={parseHttpResponse('')} />);
    expect(screen.queryByTestId('status-card')).not.toBeInTheDocument();
    expect(screen.getByTestId('history-empty')).toBeInTheDocument();
  });

  it('manages history add and clear, and toggles JSON', () => {
    const onChange = vi.fn();
    const onSaveHistory = vi.fn();
    const parsed = parseHttpResponse(SAMPLE);
    render(
      <Canvas
        state={state({ input: SAMPLE, history: [{ text: 'p1', createdAt: 't1' }] })}
        parsed={parsed}
        onChange={onChange}
        onSaveHistory={onSaveHistory}
      />
    );
    fireEvent.click(screen.getByTestId('btn-save-history'));
    expect(onSaveHistory).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('btn-clear-history'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ history: [] }));
    expect(screen.queryByTestId('headers-json')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('btn-toggle-json'));
    expect(screen.getByTestId('headers-json').textContent).toContain('Cache-Control');
  });

  it('renders parser notes when input has noise lines', () => {
    const noisy = `curl -i https://example.com\nHTTP/1.1 200 OK\nServer: x\n`;
    render(<Canvas state={state({ input: noisy })} parsed={parseHttpResponse(noisy)} />);
    expect(screen.getByTestId('notes-section')).toBeInTheDocument();
  });
});

describe('Sidebar rendering', () => {
  it('shows parse stats and zero counts for empty state', () => {
    const parsed = parseHttpResponse(SAMPLE);
    const { unmount } = render(
      <Sidebar state={state({ input: SAMPLE })} parsed={parsed} onChange={() => {}} />
    );
    expect(screen.getByTestId('sidebar-stats')).toHaveTextContent('Headers: 6');
    expect(screen.getByTestId('sidebar-stats')).toHaveTextContent('Cookies: 1');
    unmount();

    render(<Sidebar state={state()} parsed={parseHttpResponse('')} onChange={() => {}} />);
    expect(screen.getByTestId('sidebar-stats')).toHaveTextContent('Headers: 0');
    expect(screen.getByTestId('sidebar-stats')).toHaveTextContent('Missing security headers: 6');
  });
});

describe('Toolbar rendering', () => {
  it('fires clear and copy handlers and hides history button when empty', () => {
    const onClear = vi.fn();
    const onCopy = vi.fn();
    const onChange = vi.fn();

    const { rerender } = render(
      <Toolbar state={state()} onChange={onChange} onClear={onClear} onCopy={onCopy} />
    );
    fireEvent.click(screen.getByTestId('btn-clear'));
    expect(onClear).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('btn-copy-result'));
    expect(onCopy).toHaveBeenCalled();
    expect(screen.queryByTestId('btn-clear-history-toolbar')).not.toBeInTheDocument();

    rerender(
      <Toolbar
        state={state({ history: [{ text: 'x', createdAt: 'y' }] })}
        onChange={onChange}
        onClear={onClear}
        onCopy={onCopy}
      />
    );
    fireEvent.click(screen.getByTestId('btn-clear-history-toolbar'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ history: [] }));
  });
});

describe('state operations from the UI layer', () => {
  it('round-trips state via serializer and history helper', () => {
    const s = withHistory(state({ input: SAMPLE }), 'saved 1');
    expect(s.history[0]?.text).toBe('saved 1');
    expect(roundTrips(s)).toBe(true);
    const parsedBack = deserializeState(JSON.parse(serializeState(s)));
    expect(parsedBack.success).toBe(true);
  });

  it('parseState reflects serialized input', () => {
    const s = state({ input: SAMPLE });
    const restored = deserializeState(JSON.parse(serializeState(s)));
    expect(restored.success).toBe(true);
    if (restored.success) {
      expect(parseState(restored.data).statusCode).toBe(200);
    }
  });
});
