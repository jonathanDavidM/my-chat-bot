import express, { type Request, type Response, type NextFunction } from "express";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import chatRoutes from "./routes/chat.routes.js";
import { resolveAllowedOrigin } from "./lib/chat-handler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "../.env") });

const app = express();
const PORT = process.env.PORT || 3002;

function corsAndOriginGuard(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  const allowed = origin ? resolveAllowedOrigin(origin) : null;

  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", allowed);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (origin && !allowed) {
    if (req.method === "OPTIONS") return res.status(403).end();
    return res.status(403).json({ success: false, message: "Origin not allowed" });
  }

  if (req.method === "OPTIONS") return res.status(204).end();
  next();
}

app.use(corsAndOriginGuard);
app.use(express.json({ limit: "32kb" }));

app.use("/api/chat", chatRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT}`);
});
