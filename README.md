# ☁️ cf_ai_cloudflare_chat — Llama 3.3 × Workflows × Durable Objects × Pages  

**Live Worker API:** [hello-worker.maitreyasanjay-vaghulade.workers.dev](https://hello-worker.maitreyasanjay-vaghulade.workers.dev)  
**Live Frontend (Pages):** [cloudflare-ai-chat-kmo.pages.dev/chat](https://cloudflare-ai-chat-kmo.pages.dev/chat)
**email**: maitreyasanjay.vaghulade@stonybrook.edu

---

## 🚀 Overview

This repository is an **original submission** for Cloudflare’s **AI-Powered Application Assignment**.  
It demonstrates how to build a fully serverless AI app using **Cloudflare Workers AI**, **Workflows**, **Durable Objects**, and **Pages**.

| Component | Description |
|------------|--------------|
| **LLM** | Llama 3.3 70B Instruct FP8 Fast on **Workers AI** |
| **Workflow / Coordination** | Cloudflare **Workflows** (`ChatWorkflow`) |
| **Memory / State** | Cloudflare **Durable Objects** (`SessionDurableObject`) |
| **Frontend** | Minimal **Pages** chat UI |
| **Routing / CORS** | Handled inside Worker with full preflight support |

---

## 🧠 Features

- 🔹 Realtime chat with **Llama 3.3**
- 🔹 **Durable Object** memory (10-turn history per session)
- 🔹 **Workflows** for multi-step orchestration (LLM → persist)
- 🔹 **Pages** UI for user input
- 🔹 Fully deployable via Wrangler 4 (no servers!)

---

## 🧩 Architecture

```text
[ Pages Chat UI (/chat) ]
        │
        ▼
  [ Worker /chat ]
        │
        ├──→ Workers AI  (LLM inference)
        │
        └──→ Durable Object  (state persistence)
                    │
                    ▼
            Per-session memory (last 10 turns)

Optionally:
[ Worker /wf ] → Workflows (ChatWorkflow → LLM + save)

🧱 Tech Stack

Cloudflare Workers
Workers AI (Llama 3.3)
Durable Objects
Workflows
Pages
TypeScript + Wrangler 4

⚙️ Configuration — wrangler.toml
name = "hello-worker"
main = "src/worker.ts"
compatibility_date = "2025-11-01"

[ai]
binding = "AI"

[[durable_objects.bindings]]
name = "SessionDO"
class_name = "SessionDurableObject"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["SessionDurableObject"]

[[workflows]]
name = "chat-workflow"
class_name = "ChatWorkflow"
binding = "MY_WORKFLOW"

📁 Folder Structure
cf_ai_cloudflare_chat/
├─ wrangler.toml
├─ tsconfig.json
├─ src/
│  └─ worker.ts          # Worker + DO + Workflow
└─ pages/
   └─ chat.html          # Frontend UI

💬 API Endpoints
POST /chat
Performs a single LLM call + saves it.

Body
{ "sessionId": "demo", "message": "One short sentence about Cloudflare Workers" }

Response
{ "reply": "Cloudflare Workers let you run code globally at the edge." }

curl -X POST https://hello-worker.maitreyasanjay-vaghulade.workers.dev/chat \
  -H "content-type: application/json" \
  -d '{"sessionId":"demo","message":"Hello!"}'

🖥️ Front-End (pages/chat.html)

Hosted on Cloudflare Pages, connects to the Worker’s /chat.

<script>
  const API = "https://hello-worker.maitreyasanjay-vaghulade.workers.dev/chat";
  const log = document.getElementById("log");
  const msg = document.getElementById("msg");
  const send = document.getElementById("send");
  const sessionId = "demo";

  send.onclick = sendMsg;
  msg.addEventListener("keydown", e => { if (e.key === "Enter") sendMsg(); });

  async function sendMsg() {
    const m = msg.value.trim();
    if (!m) return;
    append(`You: ${m}`); msg.value = "";
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: {"content-type":"application/json"},
        body: JSON.stringify({ message: m, sessionId })
      });
      const j = await r.json();
      append(`AI: ${j.reply}`);
    } catch (err) {
      append(`❌ ${err}`);
    }
  }
  function append(t){ log.textContent += "\n" + t; }
</script>

🧠 Memory / State

Each sessionId → one Durable Object instance storing:

{ "user": "<prompt>", "ai": "<reply>", "at": 1730490000000 }

Only the last 10 turns are kept.

🧪 Local Development
# dev mode
npx wrangler dev

# deploy worker
npx wrangler deploy

# deploy pages frontend
npx wrangler pages deploy ./pages --project-name cloudflare-ai-chat --branch=main

✅ Rubric Mapping
Requirement	Implementation
LLM	Workers AI (Llama 3.3 70B Instruct FP8 Fast)
Workflow / Coordination	Cloudflare Workflows + Durable Objects
User Input via Chat / Voice	Chat UI on Pages
Memory or State	Durable Object persistence
Documentation	This README.md + live links
Originality	100% original implementation

🧾 Running Instructions Summary

Clone the repo

git clone https://github.com/<your-username>/cf_ai_cloudflare_chat.git
cd cf_ai_cloudflare_chat/hello-worker


Install deps

npm i -D @cloudflare/workers-types


Develop or deploy

npx wrangler dev
npx wrangler deploy


Access

API: hello-worker.maitreyasanjay-vaghulade.workers.dev/chat

UI: cloudflare-ai-chat-kmo.pages.dev/chat

🧩 Demo Flow

Open the Pages chat link
Type a message → Worker / chat
Worker → Workers AI → Durable Object
Reply displayed instantly, session stored for context

🧮 Tech Highlights

CORS handled natively (OPTIONS → 204 + access-control headers)
Async Workflows for multi-step orchestration
DO migration using new_sqlite_classes for Free Plan compatibility
Fully edge-native (no external backend)

📜 License

MIT © 2025 Maitreya Sanjay Vaghulade
Built exclusively for Cloudflare SWE Intern Assignment
