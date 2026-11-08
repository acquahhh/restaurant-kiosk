// Creates the restaurant's own HTTPS certificates with OpenSSL (ships with Git
// for Windows). Run on the server PC:   node scripts/make-certificates.mjs
// Optional extra addresses:             node scripts/make-certificates.mjs 192.168.1.50 kiosk-server
//
// certs/restaurant-ca.crt  install on every screen once (trust)
// certs/restaurant-ca.cer  same, DER format (some Android versions prefer it)
// certs/server.crt + .key  used by the HTTPS server
// certs/ca.key             the authority's private key: never copy it anywhere
//
// Re-running keeps the existing authority (screens stay trusted) and only
// renews the server certificate, e.g. after the PC's address changes.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const dir = path.join(root, "certs");
mkdirSync(dir, { recursive: true });

function findOpenssl() {
  const candidates = [
    process.env.OPENSSL,
    "openssl",
    "C:\\Program Files\\Git\\usr\\bin\\openssl.exe",
    "C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe",
    "C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe",
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      execFileSync(c, ["version"], { stdio: "pipe" });
      return c;
    } catch {}
  }
  console.error("OpenSSL was not found. Install Git for Windows (git-scm.com), or set OPENSSL to the path of openssl.exe.");
  process.exit(1);
}
const openssl = findOpenssl();
const run = (...args) => execFileSync(openssl, args, { stdio: "pipe", cwd: dir });

// Every name and address the screens may use to reach this PC.
const ips = new Set(["127.0.0.1"]);
for (const list of Object.values(os.networkInterfaces())) {
  for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) ips.add(a.address);
}
const dns = new Set(["localhost", os.hostname().toLowerCase()]);
for (const extra of process.argv.slice(2)) (/^\d+\.\d+\.\d+\.\d+$/.test(extra) ? ips : dns).add(extra.toLowerCase());

const caKey = path.join(dir, "ca.key");
const caCrt = path.join(dir, "restaurant-ca.crt");
if (!existsSync(caKey) || !existsSync(caCrt)) {
  console.log("Creating the restaurant certificate authority (once)...");
  run("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "3650",
      "-keyout", "ca.key", "-out", "restaurant-ca.crt",
      "-subj", "/CN=Restaurant Ordering Local CA/O=Restaurant",
      "-addext", "basicConstraints=critical,CA:TRUE,pathlen:0",
      "-addext", "keyUsage=critical,keyCertSign,cRLSign");
  run("x509", "-in", "restaurant-ca.crt", "-outform", "der", "-out", "restaurant-ca.cer");
} else {
  console.log("Keeping the existing certificate authority (screens stay trusted).");
}

const san = [...[...dns].map((d) => `DNS:${d}`), ...[...ips].map((i) => `IP:${i}`)].join(",");
writeFileSync(path.join(dir, "server.ext"), [
  "basicConstraints=CA:FALSE",
  "keyUsage=critical,digitalSignature,keyEncipherment",
  "extendedKeyUsage=serverAuth",
  `subjectAltName=${san}`,
].join("\n"));
run("req", "-newkey", "rsa:2048", "-nodes", "-keyout", "server.key", "-out", "server.csr", "-subj", "/CN=restaurant-ordering-server");
// 800 days: within the limit browsers accept for privately issued certificates.
run("x509", "-req", "-in", "server.csr", "-CA", "restaurant-ca.crt", "-CAkey", "ca.key", "-CAcreateserial",
    "-out", "server.crt", "-days", "800", "-sha256", "-extfile", "server.ext");
rmSync(path.join(dir, "server.csr"));

console.log("\nServer certificate is valid for:");
for (const d of dns) console.log("  https://" + d);
for (const i of ips) console.log("  https://" + i);
console.log("\nNext: trust certs\\restaurant-ca.crt on every screen (see docs/LOCAL-SERVER-SETUP.md).");
console.log("If this PC's address changes, run this script again; screens stay trusted.");
