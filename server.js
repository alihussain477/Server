import express from "express";
import fileUpload from "express-fileupload";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { makeWASocket, useMultiFileAuthState, DisconnectReason, delay } from "@whiskeysockets/baileys";
import P from "pino";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(fileUpload());

// Serve frontend HTML from this route
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ALEX WP LODER PANEL</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
</head>
<body class="bg-dark text-light">
  <div class="container py-5">
    <h2 class="text-center mb-4">ALEX WP LODER PANEL</h2>
    <form action="/send" method="POST" enctype="multipart/form-data" class="bg-secondary p-4 rounded shadow">
      <div class="mb-3">
        <label class="form-label">Target Number (without +):</label>
        <input type="text" name="target" class="form-control" required />
      </div>
      <div class="mb-3">
        <label class="form-label">Upload Message File (.txt):</label>
        <input type="file" name="messageFile" class="form-control" accept=".txt" required />
      </div>
      <div class="mb-3">
        <label class="form-label">Hater Name:</label>
        <input type="text" name="hater" class="form-control" required />
      </div>
      <div class="mb-3">
        <label class="form-label">Delay Time (in seconds):</label>
        <input type="number" name="delayTime" class="form-control" min="1" required />
      </div>
      <button type="submit" class="btn btn-warning w-100">Start Sending</button>
    </form>
  </div>
</body>
</html>`);
});

let sock;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info");
  sock = makeWASocket({
    logger: P({ level: "silent" }),
    printQRInTerminal: true,
    auth: state,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      if ((lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut) {
        console.log("Reconnecting WhatsApp...");
        connectToWhatsApp();
      } else {
        console.log("You are logged out. Please restart.");
      }
    } else if (connection === "open") {
      console.log("WhatsApp connected.");
    }
  });
}

connectToWhatsApp();

app.post("/send", async (req, res) => {
  try {
    const { target, hater, delayTime } = req.body;
    const messageFile = req.files?.messageFile;
    if (!messageFile) return res.send("No message file uploaded.");

    // Save uploaded file to /uploads
    const uploadDir = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

    const filePath = path.join(uploadDir, messageFile.name);
    await messageFile.mv(filePath);

    // Read messages lines
    const messages = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
    const jid = target + "@s.whatsapp.net";

    for (const line of messages) {
      const finalMessage = `${hater} ${line}`;
      await sock.sendMessage(jid, { text: finalMessage });
      console.log(`[✓] Sent to ${target}: ${finalMessage}`);
      await delay(parseInt(delayTime) * 1000);
    }

    return res.send("Messages sent successfully.");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error sending messages.");
  }
});

app.listen(PORT, () => console.log(`Panel running: http://localhost:${PORT}`));
