// The admin on this Mac: the real Worker on a local SQLite (.dev/db.sqlite) and a local bucket (.dev/files/),
// serving the built pages from dist/. `npm run dev` builds first.
// (wrangler dev cannot start in this desktop environment; this is the stand-in.)
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeEnv } from "./local-env.ts";
import worker from "../worker/index.ts";

process.chdir(join(dirname(fileURLToPath(import.meta.url)), ".."));
const PORT = Number(process.env.PORT ?? 3203);
mkdirSync(".dev", { recursive: true });
const { env } = makeEnv({ db: ".dev/db.sqlite", files: ".dev/files" });

// two doors, as on Cloudflare: PORT is admin.tcf.monster, PORT + 1 is tcf.monster (the Worker sees app.localhost: the site at / for a visitor, the app otherwise)
env.MAIL_LOG = "1";
env.APP_OPEN = "1";
const serve = (host) => async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = { ...req.headers };
  if (headers.origin) headers.origin = `http://${host}`;
  const r = await worker.fetch(new Request(`http://${host}${req.url}`, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined }), env);
  const out = Object.fromEntries(r.headers);
  if (r.headers.getSetCookie?.().length) out["set-cookie"] = r.headers.getSetCookie();
  res.writeHead(r.status, out);
  res.end(Buffer.from(await r.arrayBuffer()));
};
createServer(serve(`admin.localhost:${PORT}`)).listen(PORT, () => console.log(`admin on http://localhost:${PORT}`));
createServer(serve(`app.localhost:${PORT + 1}`)).listen(PORT + 1, () => console.log(`app on http://localhost:${PORT + 1}`));
