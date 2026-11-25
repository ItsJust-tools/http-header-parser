'use client';

import React, { useMemo, useState } from 'react';
import {
  curlCommand,
  extractUrlFromInput,
  groupByCategory,
  CATEGORY_LABELS,
  CATEGORY_HINTS,
  type ParsedResponse,
  type ToolState,
} from '../types';

export const CATEGORY_BADGE: Record<string, string> = {
  caching: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  security: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  cors: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  content: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
  cookies: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200',
  other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

function CopyButton({ value, testid }: { value: string; testid?: string }) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; ignore
    }
  }, [value]);
  return (
    <button
      type="button"
      onClick={handleCopy}
      data-testid={testid}
      className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
      aria-label="Copy"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export const Canvas: React.FC<CanvasProps> = ({ state, onChange, parsed, onSaveHistory }) => {
  const input = state.input;
  const grouped = useMemo(() => groupByCategory(parsed.headers), [parsed.headers]);
  const url = useMemo(() => extractUrlFromInput(input) ?? 'https://example.com', [input]);
  const [showJson, setShowJson] = useState(false);

  const headersJson = useMemo(() => JSON.stringify(parsed, null, 2), [parsed]);
  const missing = parsed.securityChecks.filter((c) => !c.present);

  return (
    <div className="p-4 space-y-6 overflow-y-auto h-full" data-testid="canvas">
      <div>
        <label
          htmlFor="raw-input"
          className="block text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
        >
          Raw HTTP response
        </label>
        <textarea
          id="raw-input"
          data-testid="input-raw"
          value={input}
          spellCheck={false}
          onChange={(e) => onChange?.({ ...state, input: e.target.value })}
          placeholder={
            'HTTP/1.1 200 OK\nContent-Type: text/html; charset=utf-8\nSet-Cookie: sid=abc; HttpOnly\n\n(optional body…)'
          }
          className="mt-1 w-full h-40 rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="btn-save-history"
            onClick={() =>
              onSaveHistory?.(
                parsed.isValid
                  ? `${parsed.headers.length} headers, status ${parsed.statusCode ?? '?'}`
                  : 'Nothing to parse'
              )
            }
            className="rounded-md bg-violet-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-600"
          >
            Save parse to history
          </button>
          <CopyButton value={input} testid="btn-copy-raw" />
          <CopyButton value={headersJson} testid="btn-copy-json" />
          <CopyButton value={curlCommand(parsed, url)} testid="btn-copy-curl" />
          <button
            type="button"
            data-testid="btn-toggle-json"
            onClick={() => setShowJson((v) => !v)}
            className="text-xs rounded border border-gray-300 dark:border-gray-700 px-2 py-1"
          >
            {showJson ? 'Hide' : 'Show'} header JSON
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400" data-testid="fetch-note">
          Fetch from a URL: browsers block reading cross-origin response headers via CORS, so the
          reliable path is copying curl -i output and pasting it here.
        </p>
      </div>

      {input.trim() !== '' && !parsed.isValid ? (
        <div
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
          data-testid="invalid-note"
        >
          No status line or recognizable headers found. Paste a raw HTTP response, curl -i or wget
          -S output.
        </div>
      ) : null}

      {parsed.isValid ? (
        <>
          <div
            className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
            data-testid="status-card"
          >
            <span className="block text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400">
              Status
            </span>
            <span className="font-mono text-xl font-bold" data-testid="status-line">
              {parsed.statusLine}
            </span>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300" data-testid="status-desc">
              {parsed.statusDescription}
            </p>
          </div>

          {grouped.map((group) => (
            <section
              key={group.category}
              data-testid={`group-${group.category}`}
              className="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50"
            >
              <h3 className="flex items-center gap-2 px-4 pt-3 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] ${CATEGORY_BADGE[group.category]}`}
                >
                  {CATEGORY_LABELS[group.category]}
                </span>
                <span className="font-normal normal-case">{CATEGORY_HINTS[group.category]}</span>
              </h3>
              <ul className="space-y-2 p-4" data-testid={`headers-${group.category}`}>
                {group.headers.map((header, i) => (
                  <li
                    key={`${header.name}-${i}`}
                    className="rounded-md border border-gray-200 bg-white p-3 text-xs dark:border-gray-800 dark:bg-gray-900"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span
                          className="font-mono font-semibold text-gray-900 dark:text-gray-100 break-all"
                          data-testid="header-name"
                        >
                          {header.name}:
                        </span>{' '}
                        <span
                          className="font-mono text-gray-700 dark:text-gray-300 break-all"
                          data-testid="header-value"
                        >
                          {header.value}
                        </span>
                      </div>
                      <CopyButton value={`${header.name}: ${header.value}`} />
                    </div>
                    <p className="mt-1 text-gray-600 dark:text-gray-400" data-testid="header-desc">
                      {header.description}
                    </p>
                    {header.securityNote ? (
                      <p
                        className="mt-1 rounded bg-green-50 px-2 py-1 text-green-800 dark:bg-green-900/30 dark:text-green-200"
                        data-testid="header-security-note"
                      >
                        🔒 {header.securityNote}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section
            className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
            data-testid="security-section"
          >
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Security headers
            </h3>
            <ul className="mt-2 space-y-1 text-xs" data-testid="security-list">
              {parsed.securityChecks.map((check) => (
                <li key={check.header} className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      check.present
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                    }`}
                    data-testid={`security-${check.present ? 'present' : 'missing'}`}
                  >
                    {check.present ? 'present' : 'missing'}
                  </span>
                  <span className="font-mono text-gray-900 dark:text-gray-100">{check.label}</span>
                  {!check.present ? (
                    <span className="text-gray-500 dark:text-gray-400">{check.suggestion}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            {missing.length === 0 ? (
              <p
                className="mt-2 text-xs text-green-700 dark:text-green-300"
                data-testid="security-ok"
              >
                All recommended security headers are present.
              </p>
            ) : (
              <p
                className="mt-2 text-xs text-red-700 dark:text-red-300"
                data-testid="security-missing-count"
              >
                {missing.length} recommended security header{missing.length === 1 ? '' : 's'}{' '}
                missing.
              </p>
            )}
          </section>

          {parsed.cookies.length > 0 ? (
            <section
              className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
              data-testid="cookies-section"
            >
              <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Cookies ({parsed.cookies.length})
              </h3>
              <ul className="mt-2 space-y-2 text-xs" data-testid="cookie-list">
                {parsed.cookies.map((cookie, i) => (
                  <li
                    key={`${cookie.name}-${i}`}
                    className="rounded-md border border-gray-200 p-2 dark:border-gray-800"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold" data-testid="cookie-name">
                        {cookie.name}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] ${
                          cookie.flags.secure
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                        }`}
                      >
                        Secure: {cookie.flags.secure ? 'yes' : 'no'}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] ${
                          cookie.flags.httpOnly
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                        }`}
                      >
                        HttpOnly: {cookie.flags.httpOnly ? 'yes' : 'no'}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] ${
                          cookie.flags.sameSite
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                        }`}
                      >
                        SameSite: {cookie.flags.sameSite ?? 'not set'}
                      </span>
                    </div>
                    {cookie.warnings.map((warning) => (
                      <p
                        key={warning}
                        className="mt-1 rounded bg-amber-50 px-2 py-1 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                        data-testid="cookie-warning"
                      >
                        ⚠️ {warning}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {parsed.notes.length > 0 ? (
            <section
              className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-900/50 dark:text-gray-400"
              data-testid="notes-section"
            >
              <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Parser notes
              </h3>
              <ul className="mt-1 list-disc pl-4" data-testid="notes-list">
                {parsed.notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {showJson ? (
            <pre
              className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-900 p-3 text-[11px] text-gray-100"
              data-testid="headers-json"
            >
              {headersJson}
            </pre>
          ) : null}
        </>
      ) : null}

      <HistoryList entries={state.history} onClear={() => onChange?.({ ...state, history: [] })} />

      <p className="text-center text-xs text-gray-500 dark:text-gray-400">
        All parsing runs locally in your browser; nothing is uploaded.
      </p>
    </div>
  );
};

interface CanvasProps {
  state: ToolState;
  onChange?: (state: ToolState) => void;
  parsed: ParsedResponse;
  onSaveHistory?: (text: string) => void;
}

function HistoryList({
  entries,
  onClear,
}: {
  entries: Array<{ text: string; createdAt: string }>;
  onClear: () => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
          History
        </h3>
        {entries.length > 0 ? (
          <button
            type="button"
            data-testid="btn-clear-history"
            onClick={onClear}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Clear
          </button>
        ) : null}
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400" data-testid="history-empty">
          No saved parses yet.
        </p>
      ) : (
        <ul className="space-y-1" data-testid="history-list">
          {entries.map((entry, i) => (
            <li
              key={`${entry.createdAt}-${i}`}
              className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-xs dark:border-gray-800"
            >
              <span className="text-gray-700 dark:text-gray-300">{entry.text}</span>
              <CopyButton value={entry.text} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
