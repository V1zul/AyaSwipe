// server.js
import express from "express";
import path from "path";
import compression from "compression";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// gzip responses
app.use(compression());

// serve static files (index.html, style.css, script.js, assets)
app.use(express.static(__dirname, {
  setHeaders(res) {
    // mobile-friendly caching; tweak as needed during dev
    res.setHeader("Cache-Control", "public, max-age=3600");
  }
}));

// fallback to index.html (if you ever add client-side routes)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Quran Swipe running on http://localhost:${PORT}`);
});
