// Brand-new-chat recall probe. Opens a FRESH chatId (no transcript carryover)
// and asks recall questions that must be answered purely from durable memory.
// Usage: node scripts/mem-probe-newchat.mjs <BASE> <EMAIL> <PASS> <STUDENT_ID>

const [, , BASE, EMAIL, PASSWORD, STUDENT_ID] = process.argv;
const jar = new Map();
function setCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const uuid = () => crypto.randomUUID();

async function login() {
  let r = await fetch(`${BASE}/api/auth/csrf`); setCookies(r);
  const { csrfToken } = await r.json();
  r = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: cookie() },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, redirect: "false", callbackUrl: `${BASE}/app` }),
    redirect: "manual",
  });
  setCookies(r);
}

async function send(chatId, text) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookie() },
    body: JSON.stringify({ id: chatId, message: { id: uuid(), role: "user", parts: [{ type: "text", text }] }, selectedChatModel: "gemini-3.5-flash", selectedVisibilityType: "private", studentId: STUDENT_ID }),
  });
  setCookies(res);
  if (!res.ok) return { text: `[HTTP ${res.status}] ${(await res.text()).slice(0, 200)}`, tools: [] };
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = "", out = ""; const tools = [];
  for (;;) { const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); const lines = buf.split("\n"); buf = lines.pop() ?? "";
    for (const line of lines) { const l = line.trim(); if (!l.startsWith("data:")) continue;
      const p = l.slice(5).trim(); if (p === "[DONE]") continue; let e; try { e = JSON.parse(p); } catch { continue; }
      if (e.type === "text-delta" && typeof e.delta === "string") out += e.delta;
      if (e.type === "data-toolActivity" && e.data?.status === "running") tools.push(e.data.name);
    } }
  return { text: out.trim(), tools };
}

// Each probe is its OWN fresh chat to maximize cross-conversation difficulty.
const PROBES = [
  "What do you remember about Marco's family?",
  "When is Marco's job interview and what's the role?",
  "Given Marco's learning preferences, how should I structure his practice sessions? Be specific to what you know about him.",
  "What are Marco's main recurring errors I should target?",
  "What have we practiced or worked on recently with Marco?",
];

(async () => {
  await login();
  for (let i = 0; i < PROBES.length; i++) {
    const chatId = uuid(); // fresh chat each time
    const { text, tools } = await send(chatId, PROBES[i]);
    console.log(`\n===== NEWCHAT PROBE ${i + 1} (chat ${chatId.slice(0, 8)}) =====`);
    console.log(`TEACHER: ${PROBES[i]}`);
    console.log(`TOOLS: ${tools.join(", ") || "(none)"}`);
    console.log(`AGENT: ${text}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
