const HOST = "https://tutorroom-759438277418.us-central1.run.app";
(async () => {
  const csrfRes = await fetch(`${HOST}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json() as any;
  const cookies = (csrfRes.headers.getSetCookie?.() ?? []).map(c => c.split(";")[0]);
  console.log("csrf cookies:", cookies);
  const res = await fetch(`${HOST}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookies.join("; ") },
    body: new URLSearchParams({ email: "demo@tutorroom.ai", password: "TeachFlow!Demo2026", csrfToken }).toString(),
  });
  console.log("status:", res.status, "location:", res.headers.get("location"));
  console.log("set-cookies:", (res.headers.getSetCookie?.() ?? []).map(c => c.slice(0, 60)));
})();
