// src/worker.ts
// Requires: npm i -D @cloudflare/workers-types
// Tip: tsconfig.json -> { "compilerOptions": { "types": ["@cloudflare/workers-types"] } }

import { WorkflowEntrypoint, WorkflowStep } from "cloudflare:workers";

// ---------------- Worker (routes) ----------------
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // --- CORS preflight (must be first) ---
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: preflightHeaders(req) });
    }

    // --- Health ---
    if (req.method === "GET" && url.pathname === "/") {
      return new Response("OK. Use POST /chat or open your Pages UI.", { headers: corsHeaders() });
    }

    // --- Chat API (LLM + persist to DO) ---
    if (url.pathname === "/chat" && req.method === "POST") {
      const body = await safeJson(req);
      const userMessage =
        typeof body.message === "string" && body.message.trim() ? body.message : "Say hi";
      const sessionId = String(body.sessionId || "default");

      // Workers AI: Llama 3.3
      const out = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: [
          { role: "system", content: "Be concise." },
          { role: "user", content: userMessage }
        ],
        max_tokens: 120
      });

      // Persist this turn in the Durable Object
      const id = await env.SessionDO.idFromName(sessionId);
      const stub = env.SessionDO.get(id);
      await stub.fetch("https://do/save", {
        method: "POST",
        body: JSON.stringify({ user: userMessage, ai: out.response })
      });

      return new Response(JSON.stringify({ reply: out.response }), {
        headers: { "content-type": "application/json", ...corsHeaders() }
      });
    }

    // --- (Optional) read back last 10 turns ---
    if (url.pathname === "/history" && req.method === "GET") {
      const sessionId = url.searchParams.get("sessionId") ?? "default";
      const id = await env.SessionDO.idFromName(sessionId);
      const stub = env.SessionDO.get(id);
      const res = await stub.fetch("https://do/history");
      return withCors(res);
    }

    // --- Start a one-step Workflow run (bonus coordination) ---
    if (url.pathname === "/wf" && req.method === "POST") {
      const body = await safeJson(req);
      const sessionId = String(body.sessionId || "default");
      const message   = String(body.message   || "Hello from Workflows");

      const instance = await env.MY_WORKFLOW.create({
        id: crypto.randomUUID(),
        params: { sessionId, message }
      });

      return new Response(JSON.stringify({ ok: true, workflowRunId: instance.id }), {
        headers: { "content-type": "application/json", ...corsHeaders() }
      });
    }

    return new Response("Not found", { status: 404, headers: corsHeaders() });
  }
};

// ---------------- Durable Object (memory/state) ----------------
export class SessionDurableObject {
  constructor(readonly state: DurableObjectState) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Save a turn
    if (url.pathname.endsWith("/save") && req.method === "POST") {
      const { user, ai } = (await safeJson(req)) as { user?: string; ai?: string };
      const hist: Array<{ user: string; ai: string; at: number }> =
        (await this.state.storage.get("hist")) ?? [];
      hist.push({ user: user ?? "", ai: ai ?? "", at: Date.now() });
      while (hist.length > 10) hist.shift(); // keep last 10
      await this.state.storage.put("hist", hist);
      return new Response(JSON.stringify({ ok: true, size: hist.length }), {
        headers: { "content-type": "application/json", ...corsHeaders() }
      });
    }

    // Return history
    if (url.pathname.endsWith("/history")) {
      const hist = (await this.state.storage.get("hist")) ?? [];
      return new Response(JSON.stringify({ hist }), {
        headers: { "content-type": "application/json", ...corsHeaders() }
      });
    }

    return new Response("DO ok", { headers: corsHeaders() });
  }
}

// ---------------- Workflow class (coordination) ----------------
export class ChatWorkflow extends WorkflowEntrypoint<
  Env,
  { sessionId?: string; message?: string }
> {
  // relaxed typing for broad compatibility across wrangler versions
  async run(event: any, step: WorkflowStep): Promise<{ reply: string }> {
    const sessionId: string = event?.payload?.sessionId ?? "default";
    const message: string   = event?.payload?.message   ?? "Say hi";

    // Step 1: LLM call
    const reply = await step.do("llm", async () => {
      const out = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: [
          { role: "system", content: "Be concise." },
          { role: "user", content: message }
        ],
        max_tokens: 120
      });
      return String(out.response ?? "");
    });

    // Step 2: persist in DO
    await step.do("persist", async () => {
      const id = await this.env.SessionDO.idFromName(sessionId);
      const stub = this.env.SessionDO.get(id);
      await stub.fetch("https://do/save", {
        method: "POST",
        body: JSON.stringify({ user: message, ai: reply })
      });
      return true;
    });

    // Step 3: return
    return { reply };
  }
}

// ---------------- Types & helpers ----------------
interface Env {
  AI: any;
  SessionDO: DurableObjectNamespace;
  MY_WORKFLOW: {
    create(init: { id: string; params?: Record<string, unknown> }): Promise<{ id: string }>;
  };
}

async function safeJson(req: Request) {
  try { return await req.json(); } catch { return {}; }
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS"
  };
}

function preflightHeaders(req: Request): Headers {
  const h = new Headers();
  h.set("access-control-allow-origin", "*");
  h.set("access-control-allow-methods", "GET,POST,OPTIONS");
  const reqHeaders = req.headers.get("access-control-request-headers");
  h.set("access-control-allow-headers", reqHeaders || "content-type");
  h.set("access-control-max-age", "86400");
  return h;
}

function withCors(res: Response): Response {
  const h = new Headers(res.headers);
  h.set("access-control-allow-origin", "*");
  h.set("access-control-allow-headers", "content-type");
  h.set("access-control-allow-methods", "GET,POST,OPTIONS");
  return new Response(res.body, { status: res.status, headers: h });
}
