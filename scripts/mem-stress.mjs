// Memory stress-test driver. Usage:
//   node scripts/mem-stress.mjs <BASE_URL> <EMAIL> <PASSWORD> <STUDENT_ID> [chatId]
// Logs in via NextAuth credentials, then drives /api/chat over N turns,
// printing each turn's assistant text + the tool-activity it triggered.

const [, , BASE, EMAIL, PASSWORD, STUDENT_ID, FIXED_CHAT] = process.argv;
if (!BASE || !EMAIL || !PASSWORD || !STUDENT_ID) {
  console.error("args: <BASE> <EMAIL> <PASSWORD> <STUDENT_ID> [chatId]");
  process.exit(1);
}

const jar = new Map();
function setCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
function uuid() {
  return crypto.randomUUID();
}

async function login() {
  let res = await fetch(`${BASE}/api/auth/csrf`, { redirect: "manual" });
  setCookies(res);
  const { csrfToken } = await res.json();
  const body = new URLSearchParams({
    csrfToken,
    email: EMAIL,
    password: PASSWORD,
    redirect: "false",
    callbackUrl: `${BASE}/app`,
  });
  res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(),
    },
    body,
    redirect: "manual",
  });
  setCookies(res);
  const s = await (await fetch(`${BASE}/api/auth/session`, { headers: { cookie: cookieHeader() } })).json();
  if (!s?.user) throw new Error("login failed");
  return s.user;
}

// Parse the AI-SDK UI message stream (SSE: lines of `data: {json}`).
async function sendTurn(chatId, text) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader() },
    body: JSON.stringify({
      id: chatId,
      message: { id: uuid(), role: "user", parts: [{ type: "text", text }] },
      selectedChatModel: "gemini-3.5-flash",
      selectedVisibilityType: "private",
      studentId: STUDENT_ID,
    }),
  });
  setCookies(res);
  if (!res.ok) {
    const t = await res.text();
    return { text: `[HTTP ${res.status}] ${t.slice(0, 300)}`, tools: [] };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let out = "";
  const tools = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const l = line.trim();
      if (!l.startsWith("data:")) continue;
      const payload = l.slice(5).trim();
      if (payload === "[DONE]") continue;
      let evt;
      try { evt = JSON.parse(payload); } catch { continue; }
      if (evt.type === "text-delta" && typeof evt.delta === "string") out += evt.delta;
      if (evt.type === "data-toolActivity" && evt.data?.status === "running") tools.push(evt.data.name);
    }
  }
  return { text: out.trim(), tools };
}

const TURNS = [
  // --- Early fact drops ---
  "Hi! I just started working with Marco. Quick context: his daughter is named Sofia, she's 7 and just started learning English at school too, which motivates him.",
  "Important pattern I noticed: Marco consistently confuses make/do collocations — says 'make a mistake' fine but 'make homework', 'make a decision' wrong constantly. Please remember that.",
  "Also big one: he has a job interview IN ENGLISH on July 3rd, for a logistics coordinator role. That's our hard deadline.",
  "One more on his learning style: he HATES grammar drills, finds them boring and shuts down. But he loves role-play and dialogues — totally lights up. Lean into that.",
  // --- Unrelated work mid-conversation ---
  "OK let's get to work. Can you sketch a lesson plan for next Tuesday on 'at the airport' travel vocabulary? A2 level.",
  "Looks good. Now make me a short homework set to go with that airport lesson.",
  "By the way what days does he usually have lessons? I think Tuesdays and Thursdays at 6pm, can you note that.",
  "Let's talk scheduling — given the deadline, how many sessions do we realistically have and how should I pace the interview prep?",
  "Marco mentioned he gets really nervous speaking on the phone in English. Note that too — phone anxiety.",
  "Can you generate a quick illustration of a busy airport check-in scene I can use as a speaking prompt?",
  // --- More distractor work ---
  "What exercise types can you build for me, and which suit an A2 learner best?",
  "Make a second homework set, this time focused on make/do collocations specifically.",
  "He did well last week on present continuous — finally using it naturally in conversation. Log that as progress.",
  "Quick question, what's a good authentic YouTube-style topic for travel English at A2?",
  // --- Late recall probes IN SAME CHAT ---
  "Remind me — what was the exact date of Marco's job interview?",
  "And what's his daughter's name again? I want to use her in a personalized example.",
  "Given everything you know about how Marco likes to learn, how should I structure the interview-prep practice? Be specific to him.",
  "What have we practiced or worked on recently with Marco? List it.",
  "What are the top things I should target before the interview, and why — cite what you know about him.",
];

(async () => {
  const user = await login();
  console.error(`# logged in as ${user.email} (${user.id})`);
  const chatId = FIXED_CHAT || uuid();
  console.error(`# chatId=${chatId}`);
  console.log(`CHATID ${chatId}`);
  for (let i = 0; i < TURNS.length; i++) {
    const t = TURNS[i];
    const { text, tools } = await sendTurn(chatId, t);
    console.log(`\n===== TURN ${i + 1} =====`);
    console.log(`TEACHER: ${t}`);
    console.log(`TOOLS: ${tools.join(", ") || "(none)"}`);
    console.log(`AGENT: ${text}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
