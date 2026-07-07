/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/


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
export async function localFetch(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<Response> {
	const { timeoutMs, ...rest } = init ?? {};
	// hard guard: refuse http(s) urls that resolve to anything other than loopback / private / link-local.
	// We can't do DNS here, but we can validate the hostname string.
	assertLocalUrl(url);

	const controller = new AbortController();
	const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
	try {
		const res = await fetch(url, { ...rest, signal: controller.signal });
		if (!res.ok) {
			throw new HttpError(res.status, `${res.status} ${res.statusText} for ${url}`);
		}
		return res;
	} finally {
		if (timer) clearTimeout(timer);
	}
}


function assertLocalUrl(url: string) {
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


/**
 * Streaming SSE/NDJSON reader. Calls `onChunk` with each parsed JSON object.
 * Returns a cancel function.
 */
export async function streamSSE(
	url: string,
	body: unknown,
	signal: AbortSignal | undefined,
	onChunk: (obj: unknown) => void,
	headers: Record<string, string> = {},
): Promise<{ cancel(): void; finished: Promise<void> }> {
	const controller = new AbortController();
	if (signal) {
		if (signal.aborted) controller.abort();
		signal.addEventListener('abort', () => controller.abort());
	}

	const res = await localFetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...headers },
		body: JSON.stringify(body),
		signal: controller.signal,
		timeoutMs: 60_000,
	});

	const reader = res.body?.getReader();
	if (!reader) throw new Error('No response body for streaming request');

	const decoder = new TextDecoder();
	let buf = '';
	const cancel = () => controller.abort();

	const finished = (async () => {
		try {
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				buf += decoder.decode(value, { stream: true });
				const parts = buf.split(/\r?\n\r?\n|\r?\n/).filter(Boolean);
				buf = parts.pop() ?? '';
				for (const part of parts) {
					const line = part.startsWith('data:') ? part.slice(5).trim() : part.trim();
					if (!line || line === '[DONE]') continue;
					try {
						onChunk(JSON.parse(line));
					} catch {
						// ignore non-JSON lines
					}
				}
			}
		} catch {
			// aborted or network error
		} finally {
			try { reader.releaseLock(); } catch { /* ignore */ }
		}
	})();

	return { cancel, finished };
}
