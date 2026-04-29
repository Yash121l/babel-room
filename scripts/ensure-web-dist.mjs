/**
 * Ensures apps/web/dist exists so Wrangler can load [assets] during `wrangler dev` / deploy.
 * Run `npm run build -w babel-room-web` for a real production bundle.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, "../apps/web/dist");
const index = path.join(dist, "index.html");

if (!fs.existsSync(index)) {
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(
    index,
    `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><title>Babel Room</title></head><body><p>Run <code>npm run build -w babel-room-web</code> for the full UI, or use Vite on port 5173 with the API proxy.</p></body></html>\n`,
  );
}
