import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api } from "../server/api.mjs";
const root = fileURLToPath(new URL("../dist/client/", import.meta.url));
const mime = {
  ".wasm": "application/wasm",
  ".js": "text/javascript",
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};
const flag = process.argv.indexOf("--port");
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname.startsWith("/api/")) {
        const result = await api(
          new Request(url, { method: req.method, headers: req.headers }),
        );
        res.writeHead(result.status, Object.fromEntries(result.headers));
        res.end(Buffer.from(await result.arrayBuffer()));
        return;
      }
      const file = path.resolve(
        root,
        "." +
          decodeURIComponent(
            url.pathname === "/" ? "/index.html" : url.pathname,
          ),
      );
      if (!file.startsWith(root)) {
        res.writeHead(404).end();
        return;
      }
      const data = await fs.readFile(file);
      res.writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      });
      res.end(data);
    } catch {
      res.writeHead(404).end();
    }
  })
  .listen(
    Number(flag >= 0 ? process.argv[flag + 1] : process.env.PORT || 5173),
    "0.0.0.0",
  );
