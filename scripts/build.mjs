import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const executable = process.env.NSH_BIN || "nsh",
  output = resolve(".nsh/package");
execFileSync(executable, ["package", ".", "--target", "web", "-o", output], {
  stdio: "inherit",
});
execFileSync(resolve("node_modules/.bin/tsc"), ["-p", "tsconfig.json"], {
  stdio: "inherit",
});
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/server", { recursive: true });
cpSync(output + "/XinRead", "dist/client", { recursive: true });
for (const file of ["local.js", "featured.json"])
  cpSync("web/" + file, "dist/client/" + file);
const html = readFileSync("dist/client/index.html", "utf8")
  .replace('lang="en"', 'lang="zh-CN"')
  .replace("<title>XinRead</title>", "<title>小信阅读</title>")
  .replace("XinRead needs JavaScript.", "请启用 JavaScript 以打开小信阅读。");
for (const [suffix, data] of [
  ["", html],
  [".br", brotliCompressSync(html)],
  [".gz", gzipSync(html)],
])
  writeFileSync("dist/client/index.html" + suffix, data);
const worker =
  readFileSync("server/api.mjs", "utf8") +
  '\nexport default {fetch(req,env){return new URL(req.url).pathname.startsWith("/api/")?api(req):env.ASSETS.fetch(req)}};\n';
writeFileSync("dist/server/index.js", worker);
if (existsSync(".openai/hosting.json")) {
  mkdirSync("dist/.openai");
  cpSync(".openai/hosting.json", "dist/.openai/hosting.json");
}
