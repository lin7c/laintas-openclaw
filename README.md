# laintas-openclaw

Your assistant, on your devices, in your chats — with exactly one model backend: **Laintas**.

`laintas-openclaw` is a Laintas-maintained fork of [OpenClaw](https://github.com/openclaw/openclaw) (MIT), pinned to upstream v2026.11.2 with a small set of patch commits on top. Every bundled third-party model provider extension (about 66 of them) and the installable external-provider catalog have been removed, and the Laintas provider ships built in as the only one:

- **Sign in with Laintas** — device-code login against `accounts.laintas.com`. No API key to copy or paste; the token is your login.
- **Models from Laintas** — after sign-in, the model catalog comes from `https://laintas.com/v1/models`, and usage is billed to your Laintas account balance.
- **First run goes through onboarding**, and the only sign-in choice offered is Laintas.

Channels, tools and the rest of the OpenClaw feature set are unchanged. It is a separate product from Laintas CLI (which is independently developed); this one is honestly a fork, and upstream attribution is preserved. See [FORK.md](FORK.md) for the base version, what was removed/added, and the maintenance model.

## Install

Requires **Node.js >= 24.16 < 25** (or >= 26.1).

Download `laintas-openclaw-<version>.tar.gz` and `checksums.txt` from the [latest release](https://github.com/lin7c/laintas-openclaw/releases/latest), verify, and unpack:

```bash
sha256sum -c checksums.txt --ignore-missing
tar xzf laintas-openclaw-v1.0.0.tar.gz
cd laintas-openclaw-v1.0.0
./laintas-openclaw            # first run starts onboarding with Laintas sign-in
```

The tarball contains the built `dist` runtime, the `laintas-openclaw` launcher, and the bundled Laintas provider. State and configuration live under `~/.laintas-openclaw`, separate from a stock OpenClaw install. Self-update is disabled: new builds are published by Laintas as releases of this repository.

## Usage

```bash
laintas-openclaw                                    # onboarding / gateway
laintas-openclaw models auth login --provider laintas
laintas-openclaw models list
```

## License

MIT, inherited from upstream OpenClaw — see [LICENSE](LICENSE). Upstream copyright notices are retained.
