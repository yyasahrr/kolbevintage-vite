/* A throwaway object-storage stand-in for proving the backup upload path
   (decisions 11 + 85) without a cloud account. Accepts PUT, checks the bearer
   token and the gzip magic, and prints what it received.

   node scripts/cloud-stub.mjs 4310 expected-token
*/
import { createServer } from "node:http";
import { createHash } from "node:crypto";

const port = Number(process.argv[2] ?? 4310);
const token = process.argv[3] ?? "cloud-token";

createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const auth = req.headers.authorization ?? "";
    const gzip = body[0] === 0x1f && body[1] === 0x8b;
    const sha = createHash("sha256").update(body).digest("hex").slice(0, 12);
    const ok = req.method === "PUT" && auth === `Bearer ${token}` && gzip;
    console.log(JSON.stringify({ method: req.method, url: req.url, auth: auth.slice(0, 14) + "…", gzip, bytes: body.length, sha, ok }));
    res.writeHead(ok ? 200 : 400, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok, sha }));
  });
}).listen(port, "127.0.0.1", () => console.log(`cloud stub on ${port}`));
