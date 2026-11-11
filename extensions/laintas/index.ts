import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry"

// Laintas for OpenClaw.
//
// Sign-in is a Laintas device-code login: OpenClaw shows a verification
// link and a code, the user approves this device on the Laintas accounts
// page, and OpenClaw receives a Laintas session token. Inference goes to
// the Laintas OpenAI-compatible endpoint with that token; billing is
// settled against the user's Laintas account balance by the Laintas
// gateway. No API key is ever shown, copied or stored by hand — the token
// is the login, kept in OpenClaw's own auth profile store.

const PROVIDER_ID = "laintas"
const API_BASE = "https://laintas.com/v1"
const DEVICE_BASE = "https://accounts.laintas.com/api/auth/cli-device"
const CLIENT = "openclaw"
const DEFAULT_MODEL = "gpt-6-luna"

type DeviceStart = {
  deviceId: string
  deviceSecret: string
  verificationUri: string
  userCode: string
  expiresIn: number
  interval: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function startDeviceLogin(): Promise<DeviceStart> {
  const resp = await fetch(`${DEVICE_BASE}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client: CLIENT }),
  })
  if (!resp.ok) throw new Error(`Laintas sign-in could not start (HTTP ${resp.status})`)
  return (await resp.json()) as DeviceStart
}

async function pollDeviceLogin(start: DeviceStart): Promise<string | null> {
  const resp = await fetch(`${DEVICE_BASE}/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: start.deviceId, deviceSecret: start.deviceSecret }),
  })
  if (!resp.ok) return null // expired or already claimed
  const data = (await resp.json()) as { status?: string; token?: string }
  if (data.status === "approved" && data.token) return data.token
  return null
}

type ModelRow = {
  id: string
  name: string
  reasoning: boolean
  input: Array<"text" | "image">
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number }
  contextWindow: number
  maxTokens: number
}

async function fetchModelRows(token: string): Promise<ModelRow[]> {
  const resp = await fetch(`${API_BASE}/models`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Laintas-Client": CLIENT,
    },
  })
  if (!resp.ok) return []
  const body = (await resp.json()) as { data?: Array<{ id: string }> }
  return (body.data || [])
    .filter((entry) => entry?.id)
    .map((entry) => ({
      id: entry.id,
      name: entry.id,
      reasoning: true,
      input: ["text", "image"] as Array<"text" | "image">,
      // Real prices are settled in the Laintas account; the local cost
      // readout is not the bill.
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 8192,
    }))
}

async function runDeviceLogin(ctx: any) {
  const start = await startDeviceLogin()
  const progress = ctx.prompter.progress("Waiting for approval in your browser…")
  try {
    await ctx.prompter.deviceCode({
      title: "Laintas sign-in",
      code: start.userCode,
      expiresInMinutes: Math.max(1, Math.round(start.expiresIn / 60)),
      message:
        `Open ${start.verificationUri} and approve this device. ` +
        `Only approve if the page shows this same code.`,
    })
  } catch {
    await ctx.prompter.note(
      `Open ${start.verificationUri} and approve this device. ` +
        `Only approve if the page shows this same code: ${start.userCode}`,
      "Laintas sign-in",
    )
  }
  const deadline = Date.now() + start.expiresIn * 1000
  const interval = Math.max(2, start.interval || 2) * 1000
  while (Date.now() < deadline) {
    if (ctx.signal?.aborted) {
      progress.stop("Cancelled")
      return { profiles: [] }
    }
    await sleep(interval)
    const token = await pollDeviceLogin(start)
    if (token) {
      progress.stop("Signed in to Laintas")
      // Materialize the provider into config: the embedded agent runtime
      // resolves models from models.providers, not from the live catalog,
      // so the login writes the current model rows next to the profile.
      // The catalog hook keeps the list fresh for picker/list surfaces.
      // No credential goes into the patch — the token stays in the auth
      // profile store and is resolved from there at request time.
      let rows = await fetchModelRows(token).catch(() => [] as ModelRow[])
      if (!rows.length) {
        rows = [
          {
            id: DEFAULT_MODEL,
            name: DEFAULT_MODEL,
            reasoning: true,
            input: ["text", "image"] as Array<"text" | "image">,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 8192,
          },
        ]
      }
      return {
        profiles: [
          {
            profileId: `${PROVIDER_ID}:default`,
            credential: { type: "token", provider: PROVIDER_ID, token },
          },
        ],
        defaultModel: `${PROVIDER_ID}/${DEFAULT_MODEL}`,
        configPatch: {
          models: {
            providers: {
              [PROVIDER_ID]: {
                baseUrl: API_BASE,
                api: "openai-completions",
                headers: { "X-Laintas-Client": CLIENT },
                models: rows,
              },
            },
          },
          agents: {
            defaults: {
              models: { [`${PROVIDER_ID}/${DEFAULT_MODEL}`]: {} },
            },
          },
        },
        notes: [
          "Calls are billed to your Laintas account balance — there is no API key.",
        ],
      }
    }
  }
  progress.stop("Sign-in timed out")
  return { profiles: [] }
}

async function runCatalog(ctx: any) {
  const auth = ctx.resolveProviderApiKey(PROVIDER_ID)
  const token = auth?.apiKey
  if (!token) return null
  const models = await fetchModelRows(token)
  if (!models.length) return null
  return {
    provider: {
      baseUrl: API_BASE,
      api: "openai-completions",
      apiKey: token,
      headers: { "X-Laintas-Client": CLIENT },
      models,
    },
  }
}

export default definePluginEntry({
  id: "laintas",
  name: "Laintas",
  description:
    "Sign in to OpenClaw with your Laintas account — no API key to copy. Models are billed to your Laintas balance.",
  register(api: any) {
    api.registerProvider({
      id: PROVIDER_ID,
      label: "Laintas",
      auth: [
        {
          id: "device",
          label: "Sign in with Laintas",
          hint: "Browser device-code flow",
          kind: "device_code",
          run: runDeviceLogin,
        },
      ],
      catalog: { run: runCatalog },
      staticCatalog: {
        run: async () => ({
          providers: {
            [PROVIDER_ID]: {
              baseUrl: API_BASE,
              api: "openai-completions",
              models: [],
            },
          },
        }),
      },
    })
  },
})
