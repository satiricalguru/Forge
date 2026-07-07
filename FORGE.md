# Forge — Phase 0 Status

Local-first AI IDE forked from [voideditor/void](https://github.com/voideditor/void).

## Repo location

**Important:** The project must live in a path **without spaces** (Void/VS Code build requirement).

- **Active path:** `/Users/jatinpandey/Antigravity/forge`
- Original Cursor workspace `Forge IDE` was moved here because native module builds break on spaced paths.

## Quick start (macOS)

```bash
cd /Users/jatinpandey/Antigravity/forge
source ~/.nvm/nvm.sh && nvm use    # Node 20.18.2 from .nvmrc
npm install
./scripts/patch-spdlog-xcode26.sh  # Required on Xcode 26+ / Apple Clang 21
npm rebuild
node build/npm/postinstall.js
NODE_OPTIONS="--max-old-space-size=8192" npm run buildreact
npm run watch                        # leave running (~2 min until 2/3 checkmarks)
# In another terminal:
./scripts/code.sh \
  --user-data-dir "$(pwd)/.tmp/user-data" \
  --extensions-dir "$(pwd)/.tmp/extensions"
```

**Developer mode requires `npm run watch`** (or Cmd+Shift+B in VS Code/Cursor opened on this folder). A one-shot `npm run compile` is not enough for CSS module loading in the workbench.

## Phase 0 changes applied

- Cloned `voideditor/void`, remote renamed to `upstream-void`
- `product.json` rebranded to **Forge** (app name, bundle IDs, data dirs)
- Extension gallery pointed at **Open VSX** (not Microsoft Marketplace)
- `forge_icons/` copied from `void_icons/` (placeholder icons until custom assets)
- `.cursor/rules/forge-spec.mdc` — master spec for subsequent phases
- `forgeVersion` field added to `product.ts` type definitions

## Phase 1 changes applied (Strip)

- **Cloud providers removed** — only `ollama`, `vLLM`, `lmStudio`, `openAICompatible` remain
- **Telemetry disabled** — PostHog gutted (no-op metrics service), `enableTelemetry: false` in product.json
- **Auto-update disabled** — no calls to `voideditor/binaries` GitHub releases
- **Settings UI** — "Main Providers" and Metrics sections removed; local-only onboarding
- **Marketplace** — hardcoded VS Marketplace URL filter replaced with Open VSX

## Phase 2 — Provider layer (complete)

- **`ILocalProvider` interface** (`common/forgeProviderTypes.ts`):
  - `streamChat`, `streamFIM`, `healthcheck`, `listModels`, `capabilitiesFor`
  - `ChatRequest`, `FIMRequest`, `StreamChunk`, `ModelCapabilities`, `ProviderHealth` types
- **Provider implementations** (`common/forge/`):
  - `OllamaProvider` — native `/api/chat` + `/api/generate` (FIM) via SSE
  - `LMStudioProvider` — OpenAI `/v1/chat/completions` + `/v1/completions` (FIM)
  - `OpenAICompatibleProvider` — generic class with per-runtime spec
  - Pre-baked: `vLLMProvider` (port 8000), `LlamaCppProvider` (port 8080), `LocalAIProvider` (port 8080)
- **Auto-discovery** (`common/forgeProviderRegistryService.ts`):
  - `LocalProviderRegistryService` polls every 7s with 2.5s probe timeout
  - Fires `onDidChangeHealth` Event — drives health-dots UI
  - Respects `CancellationToken` for clean lifecycle
- **Registry** (`common/forgeProviderRegistry.ts`):
  - DI-backed (`ILocalProviderRegistry` decorator), singleton `Eager`
  - `register(provider)` returns `IDisposable`
- **Health dots** (`browser/forge/`):
  - `useProviderHealth(service, id)` — React hook (single dot)
  - `useAllProviderHealth(service)` — React hook (all providers)
  - `ProviderHealthDots` — component: ● green (healthy) ● amber (checking) ● red (error) ● grey (unknown)
- **Contribution** (`common/forgeProviderContribution.ts`):
  - Registers 5 providers on startup, starts auto-discovery polling
  - Imported via `void.contribution.ts`
- **HTTP guard** (`common/forge/httpUtil.ts`):
  - `localFetch()` — refuses non-localhost URLs (defence in depth)
  - `streamSSE()` — streaming NDJSON/SSE reader with typed errors

## Next phase

**Phase 3 — Chat (Cmd+L) + inline edit (Cmd+K) via providers.**
