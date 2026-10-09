const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cheerio = require("cheerio");
const dns = require("node:dns/promises");
const net = require("node:net");

const app = express();
const PORT = process.env.PORT || 3000;

const MAX_RESPONSE_BYTES = Math.max(
100_000,
Math.min(Number(process.env.MAX_RESPONSE_BYTES) || 1_500_000, 3_000_000)
);

app.disable("x-powered-by");

app.use(
helmet({
contentSecurityPolicy: {
directives: {
defaultSrc: ["'self'"],
scriptSrc: ["'self'", "'unsafe-inline'"],
scriptSrcAttr: ["'unsafe-inline'"],
styleSrc: ["'self'", "'unsafe-inline'"],
imgSrc: ["'self'", "data:", "https:"],
connectSrc: ["'self'"],
objectSrc: ["'none'"],
frameAncestors: ["'none'"],
baseUri: ["'self'"],
formAction: ["'self'"],
upgradeInsecureRequests: null
}
},
crossOriginEmbedderPolicy: false
})
);

app.use(express.static("public", { extensions: ["html"] }));

app.use(
"/api",
rateLimit({
windowMs: 60_000,
limit: 20,
standardHeaders: "draft-7",
legacyHeaders: false,
message: {
error: "Too many requests. Wait a minute and try again."
}
})
);

function allowedHosts() {
return (process.env.ALLOWED_HOSTS || "")
.split(",")
.map((s) => s.trim().toLowerCase().replace(/.$/, ""))
.filter(Boolean);
}

function isPublicIp(ip) {
if (net.isIPv4(ip)) {
const p = ip.split(".").map(Number);

```
return !(
  p[0] === 0 ||
  p[0] === 10 ||
  p[0] === 127 ||
  (p[0] === 169 && p[1] === 254) ||
  (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
  (p[0] === 192 && p[1] === 168) ||
  (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
  p[0] >= 224
);
```

}

if (net.isIPv6(ip)) {
const x = ip.toLowerCase();

```
return !(
  x === "::" ||
  x === "::1" ||
  x.startsWith("fc") ||
  x.startsWith("fd") ||
  x.startsWith("fe8") ||
  x.startsWith("fe9") ||
  x.startsWith("fea") ||
  x.startsWith("feb") ||
  x.startsWith("::ffff:127.") ||
  x.startsWith("::ffff:10.") ||
  x.startsWith("::ffff:192.168.")
);
```

}

return false;
}

async function validateTarget(rawUrl) {
let target;

try {
target = new URL(rawUrl);
} catch {
throw new Error(
"Enter a complete URL, such as https://example.com/page"
);
}

if (target.protocol !== "https:") {
throw new Error("Only HTTPS websites are allowed.");
}

if (target.username || target.password) {
throw new Error("URLs containing usernames or passwords are not allowed.");
}

if (target.port && target.port !== "443") {
throw new Error("Only standard HTTPS port 443 is allowed.");
}

const hostname = target.hostname.toLowerCase().replace(/.$/, "");

if (!hostname || hostname === "localhost" || net.isIP(hostname)) {
throw new Error("IP-address and localhost targets are not allowed.");
}

const permitted = allowedHosts().some(
(domain) => hostname === domain || hostname.endsWith("." + domain)
);

if (!permitted) {
throw new Error(
"That domain is not on this reader's permitted-site list."
);
}

let records;

try {
records = await dns.lookup(hostname, {
all: true,
verbatim: true
});
} catch {
throw new Error("The website hostname could not be resolved.");
}

if (
!records.length ||
records.some((record) => !isPublicIp(record.address))
) {
throw new Error(
"This hostname does not resolve exclusively to public IP addresses."
);
}

return target;
}

async function readLimitedBody(response, maxBytes) {
if (!response.body) {
throw new Error("The destination returned an empty response.");
}

const reader = response.body.getReader();
const chunks = [];
let total = 0;

try {
while (true) {
const { done, value } = await reader.read();

```
  if (done) break;

  total += value.byteLength;

  if (total > maxBytes) {
    await reader.cancel();
    throw new Error(
      "The page is too large to display. Try a smaller page."
    );
  }

  chunks.push(Buffer.from(value));
}
```

} finally {
reader.releaseLock();
}

return Buffer.concat(chunks);
}

app.get("/api/read", async (req, res) => {
let timeout;

try {
const rawUrl = String(req.query.url || "");

```
if (!rawUrl || rawUrl.length > 2048) {
  return res.status(400).json({
    error: "Enter a URL up to 2,048 characters long."
  });
}

const target = await validateTarget(rawUrl);
const controller = new AbortController();

timeout = setTimeout(() => controller.abort(), 10_000);

let upstream;

try {
  upstream = await fetch(target, {
    method: "GET",
    redirect: "manual",
    signal: controller.signal,
    headers: {
      "User-Agent": "HauntHubSafeReader/1.0",
      Accept: "text/html,application/xhtml+xml;q=0.9"
    }
  });
} finally {
  clearTimeout(timeout);
  timeout = undefined;
}

if ([301, 302, 303, 307, 308].includes(upstream.status)) {
  return res.status(400).json({
    error:
      "This page redirects. Submit its destination URL directly if its domain is permitted."
  });
}

if (!upstream.ok) {
  return res.status(502).json({
    error: `The destination returned HTTP ${upstream.status}.`
  });
}

const contentType = (
  upstream.headers.get("content-type") || ""
).toLowerCase();

if (
  !contentType.includes("text/html") &&
  !contentType.includes("application/xhtml+xml")
) {
  return res.status(415).json({
    error: "Only HTML pages can be displayed."
  });
}

const declaredLength = Number(
  upstream.headers.get("content-length") || 0
);

if (declaredLength > MAX_RESPONSE_BYTES) {
  return res.status(413).json({
    error: "The page is too large to display."
  });
}

const bytes = await readLimitedBody(upstream, MAX_RESPONSE_BYTES);
const $ = cheerio.load(bytes.toString("utf8"));

const title = $("title").first().text().trim() || target.hostname;
const description =
  $('meta[name="description"]').attr("content") || "";

// Remove scripts, forms, frames, and active content from fetched pages.
$(
  "script,style,noscript,iframe,frame,frameset,object,embed," +
    "form,button,input,textarea,select,option,svg,canvas," +
    "video,audio,source,link,meta"
).remove();

$(
  "[style], [onload], [onclick], [onerror], [onmouseover], [srcdoc]"
).removeAttr(
  "style onload onclick onerror onmouseover srcdoc"
);

$("img").each((_, el) => {
  const alt = $(el).attr("alt");
  $(el).replaceWith(alt ? `[Image: ${alt}]` : "[Image]");
});

$("a").each((_, el) => {
  const label = $(el).text().trim() || "link";
  $(el).replaceWith(`${label} (link not opened by this reader)`);
});

const bodyHtml = $("body").length
  ? $("body").html()
  : $.root().html();

res.set("Cache-Control", "no-store");

return res.json({
  title: title.slice(0, 250),
  description: description.slice(0, 500),
  source: target.href,
  textHtml: (bodyHtml || "").slice(0, 800_000)
});
```

} catch (error) {
const message =
error.name === "AbortError"
? "The destination took too long to respond."
: error.message || "Unable to read that page.";

```
return res.status(400).json({ error: message });
```

} finally {
if (timeout) clearTimeout(timeout);
}
});

app.get("/health", (_req, res) => {
res.json({ ok: true });
});

app.listen(PORT, "0.0.0.0", () => {
console.log(`HauntHub Safe Reader listening on port ${PORT}`);
});
