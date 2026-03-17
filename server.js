import { createServer } from "node:http";
import { readFile } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || 8080;

const mimeTypes = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".ts": "text/plain",
};

const server = createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;

  if (pathname.includes("..")) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const filePath = join(__dirname, pathname === "/" ? "/index.html" : pathname);
  const ext = extname(filePath);
  const contentType = mimeTypes[ext] || "application/octet-stream";

  readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on http://0.0.0.0:${port}`);
});
