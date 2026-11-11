# laintas-openclaw

A Laintas-maintained fork of OpenClaw. It is **not** the independently
developed Laintas CLI: it is a downstream fork of the MIT-licensed
OpenClaw codebase, with all third-party model providers removed and the
Laintas account backend built in as the only model provider.

## Base

- Upstream: https://github.com/openclaw/openclaw (MIT, see `LICENSE`)
- Pinned release: **2026.11.2**, tag `v2026.11.2`
  (upstream commit `b556fdf457b026574bf0f1e7b4914b15f3f179ce`)
- Fork commits live on the `laintas` branch, on top of the pinned tag.

## What was removed

- Every bundled extension that registers a chat/media model provider,
  a model catalog, or provider auth choices — OpenAI, Anthropic,
  Google, Amazon Bedrock, Groq, OpenRouter, and ~60 more
  (`extensions/<provider>` directories deleted).
- Vendor agent runtimes that run third-party models: `codex`,
  `copilot`, `muse` (Meta), `agentsapi` (OpenAI Agents API).
- The installable-provider backdoor: `scripts/lib/official-external-provider-catalog.json`
  is emptied and the provider entries were removed from
  `scripts/lib/official-external-plugin-catalog.json`, so onboarding and
  catalog queries no longer offer third-party providers for install.
- Onboarding's generic "Custom Provider" auth choice
  (`CORE_AUTH_CHOICE_OPTIONS` is empty); the only provider auth choice
  is Laintas (plus the provider-agnostic token bindings and Skip).
- Core data tables keyed by provider id (env-var maps, display names,
  failover classification) remain, but they register nothing: with no
  provider plugin behind an id, it cannot be listed, configured through
  any UI, or logged into.

Channels, gateway, tools, memory, and other non-model features are
untouched, as is the generic OpenAI-compatible request path
(`openai-completions`) that the Laintas provider uses.

## What was added / changed

- **Bundled Laintas provider** (`extensions/laintas`, enabled by
  default): device-code login against
  `https://accounts.laintas.com/api/auth/cli-device` (client
  `openclaw`); the session token is stored only in the auth profile
  store. Login materializes `models.providers.laintas`
  (baseUrl `https://laintas.com/v1`, api `openai-completions`) with the
  account's current model rows; a runtime catalog hook keeps the list
  fresh. Calls are billed to the user's Laintas account balance by the
  Laintas gateway — there is no API key to copy or paste.
- **Model badges**: rows built from the signed-in `/v1/models` payload
  carry the same badge the Laintas AI web picker shows —
  `laintas-model` for models on Laintas' own GPUs, `Activated` for
  models served by a key the user activated, otherwise the model's
  tier (`T2`, ...), with that precedence (self-hosted, then activated,
  then tier). The badge is appended to the display name
  (`gpt-6-luna · T2`); the model `id` is never changed, so routing and
  billing are unaffected. It has to ride in `name`: the public model
  projection drops catalog `tags`, and the persisted-config model
  schema (`ModelDefinitionSchema`) is strict and has no tags field, so
  no metadata channel reaches the rendering surfaces. `name` is what
  the pickers render (the TUI model selector shows it as the row
  description whenever it differs from the id) and what
  `models list --json` reports; the plain `models list` table prints
  only the model ref and core-owned role tags, so the badge does not
  appear there.
  Badge data is the gateway's per-model capability flags (`tier`,
  `selfHosted`, `ownKey`); the plugin accepts them flat on each
  `/models` entry, nested under a `laintas` object on the entry, or in
  a top-level `modelCapabilities` map. Until the `/v1` facade passes
  those fields through (it currently emits only
  id/object/created/owned_by), rows simply carry no badge — and the
  pre-login static row never has one, since badge data only exists in
  the signed-in payload.
- **First run**: the bare command already routed fresh installs into
  the onboarding wizard; the wizard's auth step now offers only
  Laintas. Non-interactive commands never wait for device approval.
- **Rebrand**: CLI/binary name `laintas-openclaw` (package `bin`,
  `CLI_NAME`, help/banner/version output); default state/config
  directory `~/.laintas-openclaw`; default provider/model
  `laintas` / `gpt-6-luna`; app metadata via `openclawConfig` in
  `package.json`. The npm package name stays `openclaw` because
  workspace packages depend on it by that name, and internal
  identifiers/env vars (`OPENCLAW_*`) are unchanged. Node's compile
  cache still uses a `~/.cache/openclaw` namespace (upstream package
  internals); all state and config live in `~/.laintas-openclaw`.
- **No upstream self-update**: `laintas-openclaw update` (and every
  subcommand) prints that updates are managed by Laintas and does
  nothing. The upstream npm/git update machinery is unreachable from
  the CLI.

## Build and run

Requirements: Node >= 24.16 < 25 (or >= 26.1), pnpm 12.

```sh
pnpm install
../laintas-openclaw --version   # wrapper at the fork root
../laintas-openclaw models auth login --provider laintas
../laintas-openclaw agent --local -m laintas/gpt-6-luna --message "hello"
```

The wrapper at the fork root runs the CLI from source
(`src/entry.ts` via the repo tsx loader). A production dist build
(`pnpm build`) needs roughly 5 GB of build memory for the tsdown pass;
when `src/dist/entry.js` exists the wrapper prefers it via the
upstream launcher (`src/openclaw.mjs`).

## Maintenance model

The fork stays pinned to the upstream tag above. Laintas changes are
the small, single-purpose commits on the `laintas` branch after the
tag, so an upstream upgrade means: rebase (or replay) those commits
onto the new tag, re-check the deleted-extension list against any new
upstream provider extensions, re-empty the external provider catalog
if upstream regenerates it, and re-run the verification battery
(version/help branding, `models list`, Laintas device login, a removed
provider failing, state dir location, pre-login agent auth error).
