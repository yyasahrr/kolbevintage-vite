#!/usr/bin/env node
/* =====================================================================
   A fake payment gateway, for looking at the real flow with your own eyes.

   It speaks exactly the two calls the shop's real adapter speaks:

     POST /initiate { reference, amount, ... }  → { providerRef, redirectUrl }
     POST /verify   { reference, providerRef }  → { status, amount, providerRef }

   and it behaves like a provider that takes money:

     • /initiate builds a redirect to its own small payment page;
     • the page's «پرداخت» button marks the reference as paid, POSTs the signed
       callback to the shop's callbackUrl server-to-server, and returns the
       shopper to the shop with the same status+signature in the query string;
     • /verify answers `settled` only for references that were actually paid.

   Run it next to the server:

     node scripts/gateway-stub.mjs                       # listens on :4010
     PAYMENT_GATEWAY_URL=http://127.0.0.1:4010 \
     PAYMENT_GATEWAY_SECRET=dev-secret \
     PUBLIC_BASE_URL=http://localhost:4000 npm run dev

   then set the provider to `gateway` in the panel. Nothing here is a payment:
   it exists so that "the callback verified the amount server-side" is something
   you can watch happen, not something you read in a doc.
   ===================================================================== */

import { createServer } from "node:http";
import { createHmac } from "node:crypto";

const PORT = Number(process.env.GATEWAY_STUB_PORT ?? 4010);
const SECRET = process.env.PAYMENT_GATEWAY_SECRET ?? "dev-secret";

/** reference → { amount, paid, description, callbackUrl, returnUrl } */
const payments = new Map();

const sign = (reference, status) =>
  createHmac("sha256", SECRET).update(`${reference}:${status}`).digest("hex");

const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

const page = (reference, entry) => `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>درگاه آزمایشی</title>
<style>
 body{font-family:system-ui,sans-serif;background:#f6f2ea;color:#241f1a;display:grid;place-items:center;min-height:100vh;margin:0}
 .card{background:#fff;border:1px solid #e2dad0;padding:28px 26px;width:min(420px,92vw)}
 h1{font-size:18px;margin:0 0 6px} p{font-size:13px;line-height:1.9;color:#6b6358;margin:0 0 18px}
 .row{display:flex;gap:8px} a{flex:1;text-align:center;padding:11px;text-decoration:none;font-size:13px;border:1px solid #241f1a}
 .pay{background:#241f1a;color:#fff} .cancel{border-color:#e2dad0;color:#6b6358}
 code{direction:ltr;display:block;font-size:11px;color:#8a8175;margin-top:16px;word-break:break-all}
</style></head><body><div class="card">
<h1>درگاه آزمایشی</h1>
<p>مبلغ: ${Number(entry.amount).toLocaleString("fa-IR")} تومان<br>شناسه: <span dir="ltr">${reference}</span></p>
<div class="row">
  <a class="pay" href="/decide?ref=${encodeURIComponent(reference)}&result=settled">پرداخت موفق</a>
  <a class="cancel" href="/decide?ref=${encodeURIComponent(reference)}&result=cancelled">انصراف</a>
</div>
<code>${entry.description ?? ""}</code>
</div></body></html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);

  if (req.method === "POST" && url.pathname === "/initiate") {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      const reference = String(body.reference ?? "");
      if (!reference) return json(res, 400, { message: "reference required" });
      payments.set(reference, {
        amount: Number(body.amount ?? 0),
        paid: false,
        description: body.description,
        callbackUrl: body.callbackUrl ?? null,
        returnUrl: body.returnUrl ?? null,
      });
      json(res, 200, {
        providerRef: `stub-${reference.slice(-8)}`,
        redirectUrl: `http://127.0.0.1:${PORT}/pay?ref=${encodeURIComponent(reference)}`,
        instructions: "این یک درگاه قلابی است؛ پولی جابه‌جا نمی‌شود.",
      });
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/verify") {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      const reference = String(body.reference ?? "");
      const entry = payments.get(reference);
      if (!entry) return json(res, 404, { status: "pending", message: "unknown reference" });
      json(res, 200, {
        status: entry.paid ? "settled" : "pending",
        amount: entry.amount,
        providerRef: `stub-${reference.slice(-8)}`,
      });
    });
    return;
  }

  if (url.pathname === "/pay") {
    const reference = url.searchParams.get("ref") ?? "";
    const entry = payments.get(reference);
    if (!entry) return json(res, 404, { message: "unknown reference" });
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page(reference, entry));
    return;
  }

  if (url.pathname === "/decide") {
    const reference = url.searchParams.get("ref") ?? "";
    const result = url.searchParams.get("result") === "settled" ? "settled" : "cancelled";
    const entry = payments.get(reference);
    if (!entry) return json(res, 404, { message: "unknown reference" });
    if (result === "settled") entry.paid = true;

    // what a real provider does first: tell the shop server-to-server
    if (entry.callbackUrl) {
      const body = JSON.stringify({ status: result, reference, signature: sign(reference, result) });
      fetch(entry.callbackUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "x-provider-signature": sign(reference, result) },
        body,
      })
        .then((r) => r.text())
        .then((text) => console.log(`[gateway-stub] callback ${reference} → ${text.slice(0, 160)}`))
        .catch((error) => console.error("[gateway-stub] callback failed", error.message));
    }

    // and then sends the shopper back to the shop
    const back = entry.returnUrl
      ? `${entry.returnUrl}?status=${encodeURIComponent(result)}&signature=${sign(reference, result)}`
      : "/";
    res.writeHead(302, { location: back });
    res.end();
    return;
  }

  json(res, 404, { message: "not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[gateway-stub] listening on http://127.0.0.1:${PORT} (secret: ${SECRET === "dev-secret" ? "dev-secret" : "set"})`);
});
