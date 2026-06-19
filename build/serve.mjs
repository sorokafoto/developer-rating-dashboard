// Локальный просмотр дашборда. Запуск: npm run serve
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(path.join(__dirname, ".."));
const PORT = process.env.PORT || 4322;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
};

const DENY_SEGMENTS = new Set(["node_modules", ".git", "build"]);

function resolvePublicPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const rel = decoded === "/" ? "/index.html" : decoded;
  const filePath = path.resolve(ROOT, "." + rel);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) return null;

  const parts = path.relative(ROOT, filePath).split(path.sep);
  if (parts.some((p) => DENY_SEGMENTS.has(p))) return null;

  return filePath;
}

http
  .createServer((req, res) => {
    const filePath = resolvePublicPath(req.url || "/");
    if (!filePath) {
      res.writeHead(403);
      return res.end("Forbidden");
    }

    fs.readFile(filePath, (err, buf) => {
      if (err) {
        res.writeHead(404);
        return res.end("Not found");
      }
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(filePath)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(buf);
    });
  })
  .listen(PORT, () => console.log(`http://localhost:${PORT}`));
