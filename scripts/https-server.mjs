// Serves the app over HTTPS on the restaurant network, and redirects plain
// http:// addresses (including old :3000 bookmarks) to it.
//   node scripts/https-server.mjs
// Ports: HTTPS_PORT (default 443), HTTP_REDIRECT_PORTS (default "80,3000").
import https from "node:https";
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import next from "next";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
process.chdir(root);
const httpsPort = Number(process.env.HTTPS_PORT || 443);
const redirectPorts = (process.env.HTTP_REDIRECT_PORTS ?? "80,3000").split(",").map(Number).filter(Boolean);

let tls;
try {
  tls = { key: readFileSync(path.join(root, "certs/server.key")), cert: readFileSync(path.join(root, "certs/server.crt")) };
} catch {
  console.error("No certificate found. Run: node scripts/make-certificates.mjs");
  process.exit(1);
}

const app = next({ dev: false, dir: root });
const handle = app.getRequestHandler();
await app.prepare();

// The device address is taken from the connection itself, never from what the
// client claims, so rate limits cannot be dodged by sending a fake header.
const clientIp = (req) => (req.socket.remoteAddress ?? "unknown").replace(/^::ffff:/, "");

https
  .createServer(tls, (req, res) => {
    req.headers["x-forwarded-for"] = clientIp(req);
    req.headers["x-forwarded-proto"] = "https";
    handle(req, res);
  })
  .listen(httpsPort, "0.0.0.0", () => console.log(`HTTPS: https://<this PC>${httpsPort === 443 ? "" : ":" + httpsPort}/kiosk`));

for (const port of redirectPorts) {
  http
    .createServer((req, res) => {
      const host = (req.headers.host ?? "localhost").replace(/:\d+$/, "");
      res.writeHead(301, { Location: `https://${host}${httpsPort === 443 ? "" : ":" + httpsPort}${req.url ?? "/"}` });
      res.end();
    })
    .on("error", (e) => console.warn(`Redirect on port ${port} not started (${e.code}); continuing.`))
    .listen(port, "0.0.0.0");
}
