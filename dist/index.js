// index.ts
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
var PROVIDER_ID = "laintas";
var API_BASE = "https://laintas.com/v1";
var DEVICE_BASE = "https://accounts.laintas.com/api/auth/cli-device";
var CLIENT = "openclaw";
var DEFAULT_MODEL = "gpt-6-luna";
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function startDeviceLogin() {
  const resp = await fetch(`${DEVICE_BASE}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client: CLIENT })
  });
  if (!resp.ok) throw new Error(`Laintas sign-in could not start (HTTP ${resp.status})`);
  return await resp.json();
}
async function pollDeviceLogin(start) {
  const resp = await fetch(`${DEVICE_BASE}/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: start.deviceId, deviceSecret: start.deviceSecret })
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (data.status === "approved" && data.token) return data.token;
  return null;
}
async function fetchModelRows(token) {
  const resp = await fetch(`${API_BASE}/models`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Laintas-Client": CLIENT
    }
  });
  if (!resp.ok) return [];
  const body = await resp.json();
  return (body.data || []).filter((entry) => entry?.id).map((entry) => ({
    id: entry.id,
    name: entry.id,
    reasoning: true,
    input: ["text", "image"],
    // Real prices are settled in the Laintas account; the local cost
    // readout is not the bill.
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128e3,
    maxTokens: 8192
  }));
}
async function runDeviceLogin(ctx) {
  const start = await startDeviceLogin();
  const progress = ctx.prompter.progress("Waiting for approval in your browser\u2026");
  try {
    await ctx.prompter.deviceCode({
      title: "Laintas sign-in",
      code: start.userCode,
      expiresInMinutes: Math.max(1, Math.round(start.expiresIn / 60)),
      message: `Open ${start.verificationUri} and approve this device. Only approve if the page shows this same code.`
    });
  } catch {
    await ctx.prompter.note(
      `Open ${start.verificationUri} and approve this device. Only approve if the page shows this same code: ${start.userCode}`,
      "Laintas sign-in"
    );
  }
  const deadline = Date.now() + start.expiresIn * 1e3;
  const interval = Math.max(2, start.interval || 2) * 1e3;
  while (Date.now() < deadline) {
    if (ctx.signal?.aborted) {
      progress.stop("Cancelled");
      return { profiles: [] };
    }
    await sleep(interval);
    const token = await pollDeviceLogin(start);
    if (token) {
      progress.stop("Signed in to Laintas");
      let rows = await fetchModelRows(token).catch(() => []);
      if (!rows.length) {
        rows = [
          {
            id: DEFAULT_MODEL,
            name: DEFAULT_MODEL,
            reasoning: true,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128e3,
            maxTokens: 8192
          }
        ];
      }
      return {
        profiles: [
          {
            profileId: `${PROVIDER_ID}:default`,
            credential: { type: "token", provider: PROVIDER_ID, token }
          }
        ],
        defaultModel: `${PROVIDER_ID}/${DEFAULT_MODEL}`,
        configPatch: {
          models: {
            providers: {
              [PROVIDER_ID]: {
                baseUrl: API_BASE,
                api: "openai-completions",
                headers: { "X-Laintas-Client": CLIENT },
                models: rows
              }
            }
          },
          agents: {
            defaults: {
              models: { [`${PROVIDER_ID}/${DEFAULT_MODEL}`]: {} }
            }
          }
        },
        notes: [
          "Calls are billed to your Laintas account balance \u2014 there is no API key."
        ]
      };
    }
  }
  progress.stop("Sign-in timed out");
  return { profiles: [] };
}
async function runCatalog(ctx) {
  const auth = ctx.resolveProviderApiKey(PROVIDER_ID);
  const token = auth?.apiKey;
  if (!token) return null;
  const models = await fetchModelRows(token);
  if (!models.length) return null;
  return {
    provider: {
      baseUrl: API_BASE,
      api: "openai-completions",
      apiKey: token,
      headers: { "X-Laintas-Client": CLIENT },
      models
    }
  };
}
var index_default = definePluginEntry({
  id: "laintas",
  name: "Laintas",
  description: "Sign in to OpenClaw with your Laintas account \u2014 no API key to copy. Models are billed to your Laintas balance.",
  register(api) {
    api.registerProvider({
      id: PROVIDER_ID,
      label: "Laintas",
      auth: [
        {
          id: "device",
          label: "Sign in with Laintas",
          hint: "Browser device-code flow",
          kind: "device_code",
          run: runDeviceLogin
        }
      ],
      catalog: { run: runCatalog },
      staticCatalog: {
        run: async () => ({
          providers: {
            [PROVIDER_ID]: {
              baseUrl: API_BASE,
              api: "openai-completions",
              models: []
            }
          }
        })
      }
    });
  }
});
export {
  index_default as default
};
