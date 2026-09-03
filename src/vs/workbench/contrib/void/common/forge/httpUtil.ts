/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';


export class HttpError extends Error {
	constructor(public readonly status: number, message: string) {
		super(message);
		this.name = 'HttpError';
	}
}


/**
 * fetch() that respects a CancellationToken and surfaces a typed error on non-2xx.
 * Always pinned to localhost/LAN — refuses to send to public IPs (defence in depth
 * for the local-first mission).
 */
export async function localFetch(url: string, init?: RequestInit & { timeoutMs?: number; token?: CancellationToken }): Promise<Response> {
	const { timeoutMs, token, signal: upstreamSignal, ...rest } = init ?? {};
	// hard guard: refuse http(s) urls that resolve to anything other than loopback / private / link-local.
	// We can't do DNS here, but we can validate the hostname string.
	assertLocalUrl(url);

	const controller = new AbortController();
	const abort = () => controller.abort();
	const cancellationListener = token?.onCancellationRequested(abort);
	if (token?.isCancellationRequested || upstreamSignal?.aborted) {
		abort();
	}
	upstreamSignal?.addEventListener('abort', abort, { once: true });
	const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
	try {
		// Never follow redirects: a local server must not be able to bounce our
		// request (with its body) to a remote host. Callers that need redirect
		// support must re-validate the Location via assertLocalUrl themselves.
		const res = await fetch(url, { ...rest, signal: controller.signal, redirect: 'error' });
		if (!res.ok) {
			controller.abort(); // close the connection; we won't read the error body
			throw new HttpError(res.status, `${res.status} ${res.statusText} for ${redactUrl(url)}`);
		}
		return res;
	} finally {
		if (timer) clearTimeout(timer);
		cancellationListener?.dispose();
		// NOTE: for non-streaming callers the response body is consumed after we
		// return, so we intentionally keep the upstream→inner abort wiring alive
		// until the upstream signal fires (once:true auto-removes). Removing it
		// here would break cancellation of in-flight body reads (see streamSSE).
	}
}

function redactUrl(url: string): string {
	try {
		const parsed = new URL(url);
		if (parsed.username || parsed.password) {
			parsed.username = '***';
			parsed.password = '';
			return parsed.toString();
		}
		return url;
	} catch {
		return url;
	}
}


export function assertLocalUrl(url: string) {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error(`Not a valid URL: ${url}`);
	}
	const h = parsed.hostname.toLowerCase();
	// NOTE: string-only check — no DNS resolution here (see callers in
	// electron-main, which resolve via Node if needed). `.local`/mDNS and
	// wildcard LAN ranges are intentionally allowed for self-hosted runtimes
	// on the local network; DNS-rebinding of public names to local IPs is an
	// accepted residual risk for a desktop IDE (documented, single-layer).
	const isLocal = h === 'localhost' || h === '::1' || h === '0.0.0.0'
		|| /^127\.(\d{1,3}\.){2}\d{1,3}$/.test(h)
		|| h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.lan')
		|| /^10\./.test(h)
		|| /^192\.168\./.test(h)
		|| /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)
		|| h === 'host.docker.internal';
	if (!isLocal) {
		throw new Error(`Refusing non-local URL: ${redactUrl(url)} (Forge is local-only)`);
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error(`Refusing non-HTTP URL: ${redactUrl(url)}`);
	}
}


// Minimal structural typing for the fetch() response body stream. We avoid
// referencing lib.dom's ReadableStream/ReadableStreamDefaultReader here so
// this file stays valid in the `common` layer (see build/lib/layersChecker.js).
interface StreamReader {
	read(): Promise<{ value: Uint8Array | undefined; done: boolean }>;
	releaseLock(): void;
	cancel(reason?: unknown): Promise<void>;
}

type StreamBody = { getReader(): StreamReader };

const toStreamBody = (body: unknown): StreamBody | null => {
	if (body && typeof (body as StreamBody).getReader === 'function') {
		return body as StreamBody;
	}
	return null;
};

const STREAM_IDLE_TIMEOUT_MS = 60_000;
const MAX_STREAM_BUFFER_BYTES = 16 * 1024 * 1024;


/**
 * Streaming SSE/NDJSON reader. Calls `onChunk` with each parsed JSON object.
 * Returns a cancel function.
 *
 * `finished` resolves on a clean end-of-stream OR when the caller cancels via
 * `signal`/`cancel()`. It REJECTS on genuine network/protocol errors (and on
 * an idle stream that produces no data for `STREAM_IDLE_TIMEOUT_MS`) so
 * callers can surface truncated responses instead of committing them as success.
 */
export async function streamSSE(
	url: string,
	body: unknown,
	signal: AbortSignal | undefined,
	onChunk: (obj: unknown) => void,
	headers: Record<string, string> = {},
): Promise<{ cancel(): void; finished: Promise<void> }> {
	assertLocalUrl(url);
	const controller = new AbortController();
	let cancelledLocally = false;
	let idleTimedOut = false;

	const abortListener = () => {
		cancelledLocally = true;
		try { controller.abort(); } catch { /* ignore */ }
	};
	if (signal) {
		if (signal.aborted) abortListener();
		else signal.addEventListener('abort', abortListener);
	}

	let res: Response;
	try {
		res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...headers },
			body: JSON.stringify(body),
			signal: controller.signal,
			redirect: 'error',
		});
	} catch (err) {
		// don't leak the abort listener if fetch itself failed
		signal?.removeEventListener('abort', abortListener);
		throw err;
	}
	if (!res.ok) {
		signal?.removeEventListener('abort', abortListener);
		try { await res.body?.cancel(); } catch { /* ignore */ }
		throw new HttpError(res.status, `${res.status} ${res.statusText} for ${redactUrl(url)}`);
	}

	const reader = toStreamBody(res.body)?.getReader();
	if (!reader) {
		signal?.removeEventListener('abort', abortListener);
		try { await res.body?.cancel(); } catch { /* ignore */ }
		throw new Error('No response body for streaming request');
	}

	const decoder = new TextDecoder();
	let buf = '';
	let idleTimer: ReturnType<typeof setTimeout> | null = null;

	const armIdleTimeout = () => {
		if (idleTimer) clearTimeout(idleTimer);
		idleTimer = setTimeout(() => {
			// Idle timeout is a genuine error, NOT a user cancel: mark it first
			// so the finished() catch below surfaces it instead of swallowing.
			idleTimedOut = true;
			try { controller.abort(); } catch { /* ignore */ }
			// Reader.read() may not reject promptly on all platforms — cancel
			// the reader directly to unblock the loop.
			try { void reader.cancel('idle timeout'); } catch { /* ignore */ }
		}, STREAM_IDLE_TIMEOUT_MS);
	};
	const clearIdleTimeout = () => {
		if (idleTimer) {
			clearTimeout(idleTimer);
			idleTimer = null;
		}
	};

	const parsePart = (part: string) => {
		const line = part.startsWith('data:') ? part.slice(5).trim() : part.trim();
		if (!line || line === '[DONE]') return;
		// Surface streamed server-side errors instead of swallowing them: providers
		// otherwise report a generic "empty response".
		try {
			const parsed = JSON.parse(line) as { error?: unknown };
			if (parsed && typeof parsed === 'object' && parsed.error !== null && parsed.error !== undefined) {
				const message = typeof parsed.error === 'string' ? parsed.error
					: (parsed.error as { message?: unknown }).message !== null && (parsed.error as { message?: unknown }).message !== undefined ? String((parsed.error as { message?: unknown }).message)
					: JSON.stringify(parsed.error);
				throw new Error(message);
			}
			onChunk(parsed);
		} catch (err) {
			if (err instanceof SyntaxError) {
				// ignore non-JSON keep-alive lines
				return;
			}
			throw err;
		}
	};

	const cancel = () => abortListener();

	const finished = (async () => {
		try {
			armIdleTimeout();
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				armIdleTimeout();
				buf += decoder.decode(value, { stream: true });
				if (buf.length > MAX_STREAM_BUFFER_BYTES) {
					throw new Error(`SSE stream from ${redactUrl(url)} exceeded the maximum buffer size (${MAX_STREAM_BUFFER_BYTES} bytes)`);
				}
				const lines = buf.split(/\r?\n/);
				buf = lines.pop() ?? '';
				for (const line of lines) {
					parsePart(line);
				}
			}
			// process any residual partial chunk the final read left behind
			if (buf) parsePart(buf);
		} catch (err) {
			// Idle timeout takes precedence over cancel (the timer sets both).
			if (idleTimedOut) {
				throw new Error(`Stream from ${redactUrl(url)} timed out after ${STREAM_IDLE_TIMEOUT_MS}ms without data`);
			}
			if (!cancelledLocally) {
				throw err;
			}
			// aborted by signal/cancel — resolve cleanly like a normal end
		} finally {
			clearIdleTimeout();
			signal?.removeEventListener('abort', abortListener);
			try { await reader.cancel(); } catch { /* ignore */ }
			try { reader.releaseLock(); } catch { /* ignore */ }
		}
	})();

	return { cancel, finished };
}