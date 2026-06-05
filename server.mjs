import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), "public");
const port = Number(process.env.PORT || 5173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml"
};

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  const decodedPath = decodeURIComponent(url.pathname);
  const cleanPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(root, cleanPath);

  try {
    const info = existsSync(filePath) ? await stat(filePath) : null;
    if (!info) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    if (info.isDirectory()) {
      filePath = join(filePath, "index.html");
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream"
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(500);
    response.end("Server error");
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`11408 app running at http://127.0.0.1:${port}`);
});
