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
		const res = await fetch(url, { ...rest, signal: controller.signal });
		if (!res.ok) {
			controller.abort(); // close the connection; we won't read the error body
			throw new HttpError(res.status, `${res.status} ${res.statusText} for ${url}`);
		}
		return res;
	} finally {
		if (timer) clearTimeout(timer);
		cancellationListener?.dispose();
		upstreamSignal?.removeEventListener('abort', abort);
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
	const isLocal = h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0'
		|| h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.lan')
		|| /^10\./.test(h)
		|| /^192\.168\./.test(h)
		|| /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)
		|| h === 'host.docker.internal';
	if (!isLocal) {
		throw new Error(`Refusing non-local URL: ${url} (Forge is local-only)`);
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error(`Refusing non-HTTP URL: ${url}`);
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
	const controller = new AbortController();
	let cancelledLocally = false;
	let idleTimedOut = false;

	const abortListener = () => {
		cancelledLocally = true;
		controller.abort();
	};
	if (signal) {
		if (signal.aborted) abortListener();
		else signal.addEventListener('abort', abortListener);
	}

	try {
		const res = await localFetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...headers },
			body: JSON.stringify(body),
			signal: controller.signal,
		});

		const reader = toStreamBody(res.body)?.getReader();
		if (!reader) throw new Error('No response body for streaming request');

		const decoder = new TextDecoder();
		let buf = '';
		let idleTimer: ReturnType<typeof setTimeout> | null = null;

		const armIdleTimeout = () => {
			if (idleTimer) clearTimeout(idleTimer);
			idleTimer = setTimeout(() => {
				idleTimedOut = true;
				controller.abort();
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
			try {
				onChunk(JSON.parse(line));
			} catch {
				// ignore non-JSON lines
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
						throw new Error(`SSE stream from ${url} exceeded the maximum buffer size (${MAX_STREAM_BUFFER_BYTES} bytes)`);
					}
					const parts = buf.split(/\r?\n\r?\n|\r?\n/).filter(Boolean);
					buf = parts.pop() ?? '';
					for (const part of parts) {
						parsePart(part);
					}
				}
				// process any residual partial chunk the final read left behind
				if (buf) parsePart(buf);
			} catch (err) {
				if (!cancelledLocally) {
					throw idleTimedOut ? new Error(`Stream from ${url} timed out after ${STREAM_IDLE_TIMEOUT_MS}ms without data`) : err;
				}
				// aborted by signal/cancel — resolve cleanly like a normal end
			} finally {
				clearIdleTimeout();
				signal?.removeEventListener('abort', abortListener);
				try { reader.releaseLock(); } catch { /* ignore */ }
			}
		})();

		return { cancel, finished };
	} catch (err) {
		// don't leak the abort listener if localFetch itself failed
		signal?.removeEventListener('abort', abortListener);
		throw err;
	}
}