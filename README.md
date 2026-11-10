# Laintas for OpenClaw

Use your **Laintas account** inside OpenClaw. You sign in with Laintas in
your browser and approve the device — there is **no API key** to create,
copy or paste. Every call is billed to your Laintas account balance, at the
same prices as Laintas's own clients.

## Install

One command installs everything — including OpenClaw itself if you don't
have it yet — plus the Laintas provider plugin:

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/lin7c/openclaw-laintas/main/install.sh | bash
openclaw models auth login --provider laintas   # approve the device in your browser
openclaw models set laintas/gpt-6-luna          # or pick any model from: openclaw models list
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/lin7c/openclaw-laintas/main/install.ps1 | iex
openclaw models auth login --provider laintas
openclaw models set laintas/gpt-6-luna
```

Or by hand:

```bash
curl -fsSL https://codeload.github.com/lin7c/openclaw-laintas/tar.gz/refs/heads/main | tar -xz -C /tmp
openclaw plugins install --force --accept-capabilities /tmp/openclaw-laintas-main
openclaw models auth login --provider laintas
```

## How it works

- Sign-in is the Laintas device flow: OpenClaw shows a verification link
  and a code; you approve on the Laintas accounts page (the page names
  OpenClaw as the requesting app and shows the same code).
- OpenClaw stores the resulting session token in its own auth profile
  store, like any subscription provider. To remove it from this machine,
  delete the `laintas` auth profile from OpenClaw's auth store.
- The model list is fetched from your Laintas account at runtime, so it
  always matches what your account can use.
- Inference calls go to `https://laintas.com/v1`, an OpenAI-compatible
  facade in front of the Laintas gateway, which handles balance checks
  and settlement exactly as it does for Laintas CLI.

## Notes

- Laintas models report zero cost in OpenClaw's local readouts — your
  Laintas usage page is the bill.
- If a call answers 401, the session was revoked or expired: run
  `openclaw models auth login --provider laintas` again.
