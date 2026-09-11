# Forge Advanced Project Audit

Date: 2026-09-11  
Scope: repository-wide architecture, correctness, security boundaries, dependency risk, build integrity, React integration, IPC lifecycle, local-provider behavior, persistence, and focused regression coverage.

## Executive summary

The audit found and fixed multiple high-impact defects in Forge-specific code, including a session-registry path traversal/mass-assignment boundary, workspace escape paths in AI file tools, stale/disabled MCP clients remaining callable, missing MCP runtime dependencies, unhandled IPC failures, provider registration races, destructive startup extension removal, incorrect Forge migration paths, and several compile- or runtime-breaking React/edit-flow mismatches.

The canonical compiler moved from 10 Forge errors to zero. The React bundle, architectural layer checker, targeted lint, 22 focused Node tests, archive traversal test, and whitespace checks all pass. The production npm dependency tree reports zero known vulnerabilities.

One high-risk platform item remains: the repository is based on Electron 34.3.2, for which npm reports current Electron security advisories. npm's supported remediation is Electron 44.3.0, a ten-major runtime jump that requires a dedicated VS Code/Electron compatibility rebase and platform test matrix; force-installing it during an audit would not be a safe fix.

## Fixed findings

| Risk | Finding | Remediation |
| --- | --- | --- |
| Critical | Session update IPC accepted arbitrary `Partial<IAgentSession>`, allowing identity, workspace hash, and persistence-path fields to be overwritten. | Added a narrow update contract, immutable identity fields, runtime type/enum validation, ID/path validation, and a traversal regression test. |
| High | AI file tools accepted out-of-workspace and no-workspace access, with symlink traversal gaps. | Enforced canonical URI containment using VS Code URI identity, rejected file operations without an open workspace, checked existing nested symlinks before file operations, and stopped recursive directory-tree traversal through symlinks. |
| High | Startup code could automatically delete blacklisted extensions from the user's installation. | Removed the destructive startup deletion workflow and its public service API. |
| High | Settings/keybinding/extension migration still wrote to Void data directories. | Corrected macOS, Linux, and Windows destinations to Forge / `.forge-editor`. |
| High | Disabled MCP servers could still retain clients/tools, and tool calls did not require a healthy connected state. | Disabled servers now remain offline without spawning transports, toggling off closes clients and clears tools, calls require `success`, failures clean up transports, and channel disposal closes all clients. |
| High | MCP URL configuration was typed as a live `URL` despite arriving from JSON; custom headers were not consistently forwarded. | Hydrate/validate HTTP(S) URLs in the main process and forward configured headers through Streamable HTTP and SSE fallback transports. |
| High | MCP imports could fail at runtime because the hoisted schema package had no resolvable `zod` peer. | Added `zod` as an explicit runtime dependency and verified direct MCP-channel imports in the Node harness. |
| High | `gulp-untar` pulled in critically vulnerable `tar@2` archive handling. | Replaced it with a small `tar-stream` Vinyl transform that accepts regular files only and rejects absolute, drive, backslash, NUL, and parent-traversal paths. |
| High | Provider model registration could complete after a provider became unhealthy and resurrect stale models. | Added per-provider generations and health checks before and during registration; unhealthy transitions invalidate pending work. |
| Medium | Sequential provider polling allowed one slow provider to delay every other provider and ignored configured endpoints in some checks. | Run a single concurrent probe batch, preserve per-provider single-flight behavior/backoff, and probe endpoint-bound provider instances. |
| Medium | LLM/list/pull IPC call rejections were ignored and leaked callback hooks; main-process cleanup used a rejected `finally()` chain that could become unhandled. | Added rejection callbacks and hook cleanup on every IPC path; replaced the unsafe cleanup chain with handled success/error branches. |
| Medium | Quick Edit initialized/saved the current editor instead of the Quick Edit target; tool callers still used the obsolete argument shape. | Unified callers on `CallBeforeStartApplyingOpts` and resolve the URI through the apply/edit origin. |
| Medium | Terminal markdown UI read a nonexistent `promise` field and cleared running state too early. | Use and await the actual `resPromise`, preserving interrupt/running state until command completion. |
| Medium | React code contained missing runtime imports, invalid disposable registration, stale JSX namespace usage, wrong error discriminants, nullability errors, and unsupported style typings. | Restored required workbench imports/styles, wrapped cleanup callbacks as disposables, corrected types/discriminants/null guards, enabled imported generated JS, and fixed draggable-region typing. |
| Medium | The Forge language-model bridge advertised tool/vision capabilities its text-only adapter drops. | Advertise only capabilities the bridge currently preserves. |
| Medium | Local HTTP policy rejected IPv6 loopback while documentation overstated localhost-only isolation despite deliberate private-LAN support. | Accept `[::1]`, retain public-host rejection, add policy tests, and document the private-LAN trust boundary accurately. |
| Medium | Source compilation had duplicate/wrong imports and missing timeout/hook declarations. | Corrected imports and declarations; canonical compilation now reports zero errors. |
| Low | The dependency graph contained unused direct provider SDKs and UI/build packages. | Removed unused Anthropic, Google, Mistral, Groq, Ollama, OpenAI, Google Auth, PostHog, Next, React ESLint, and Diff typings; updated the used Diff runtime, SQLite, and the MCP transitive graph through nonbreaking remediation. |
| Low | The Agent window offered per-session bypass/autopilot choices that were metadata only and did not change runtime approval enforcement. | Removed those choices and clarified that sessions use the global Forge tool-approval policy. |

## Verification evidence

- `npm run compile` — passed; main source and all extension compilations completed with zero errors.
- `npm run buildreact` — passed; all eight Forge React entry points bundled successfully. The build still prints legacy unused-import and stale Browserslist warnings.
- `npm run valid-layers-check` — passed.
- Targeted ESLint across every changed TypeScript/TSX file plus changed build JavaScript — passed.
- Forge common Node tests — 18 passing.
- MCP/session-registry Node tests — 4 passing.
- Secure untar in-memory test — safe extraction passed and `../escape.txt` was rejected.
- Strict isolated React TypeScript diagnostic filter — zero diagnostics in Forge sources. The isolated config reports 253 upstream VS Code ambient/declaration diagnostics; the canonical repository compiler is clean.
- `npm audit --omit=dev --audit-level=low` — zero vulnerabilities.
- `git diff --check` — passed.

## Residual risks and architectural follow-up

### 1. Electron major-version security rebase — high priority

Electron 34.3.2 is part of the shipped desktop platform even though npm classifies it as a development dependency. The remaining audit includes advisories affecting Electron and its archive installer. npm proposes Electron 44.3.0, which is a breaking ten-major upgrade. This should be handled as a dedicated rebase with macOS, Windows, Linux, extension-host, updater, protocol, signing, native-module ABI, and smoke-test validation.

After all safe/nonbreaking remediation, the complete root graph has 23 advisory entries: 14 moderate and 9 high, with zero critical. Besides Electron, they are concentrated in Gulp/watch/source-map and test tooling; several require breaking Gulp/source-map upgrades and `serialize-javascript` currently has no supported fix in the affected test chain.

### 2. Session persistence has two process owners

The renderer chat-thread service and main-process session registry both merge/write the same `~/.forge/sessions` JSON records. Each is locally serialized, but there is no cross-process transaction or authoritative schema owner. Consolidate persistence in the main process behind one atomic `SessionStore` (temporary file, fsync/rename, schema migration, corruption quarantine), leaving the renderer as an IPC client.

### 3. Agent sessions are not execution-isolated

Session `agentType`, model, status, permission, and file-change fields are primarily metadata while several execution decisions remain global. The misleading approval bypass controls were removed, but true background/per-session execution needs a session-scoped execution context, cancellation ownership, model selection, approval policy, status transitions, and workspace/worktree binding. The synthetic Agents window can still have no folder; file tools now fail closed in that state.

### 4. Terminal commands are not a sandbox

Forge now validates a terminal's initial working directory, but an arbitrary shell command can leave that directory or access the host. UI approval remains the security boundary. Do not describe workspace containment as a terminal sandbox; real isolation requires an OS/container sandbox with explicit mounts and network policy.

### 5. MCP fidelity remains text-only

Tool outputs currently accept the first text content block and reject image, audio, embedded resource, structured content, and empty-success responses. Tool schemas are also flattened into the current internal parameter representation. Add a lossless MCP content/result model before advertising richer MCP compatibility.

### 6. Governance and regression gates

The repository has no root `CONTEXT.md` or architecture decision records for Forge's trust model, provider boundary, session ownership, or agent execution semantics. Add those documents and a CI gate for canonical compile, Forge Node tests, React bundle, layer check, production audit, and platform smoke tests. This will keep the repaired boundaries from drifting.

## Change footprint

The changes are intentionally concentrated in Forge workbench services, MCP/session main-process channels, React integration, provider health/bridge code, build archive handling, dependency manifests, and focused tests. No commit was created.
