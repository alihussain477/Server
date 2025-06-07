import express from "express";
import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";
import Pino from "pino";

const app = express();
app.use(express.json());

let sock;
let authState;
let latestQR = null;

// Serve frontend HTML from backend
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>WhatsApp Panel</title>
</head>
<body>
  <h1>WhatsApp Login Panel</h1>
  <div id="qr">Loading QR Code...</div>

  <h2>Send Message</h2>
  <input type="text" id="number" placeholder="Enter number with country code (e.g. 919876543210)" />
  <br /><br />
  <textarea id="message" placeholder="Enter message"></textarea>
  <br /><br />
  <button onclick="sendMessage()">Send</button>

  <script>
    async function fetchQR() {
      const res = await fetch('/qr');
      const data = await res.json();
      if (data.qr) {
        document.getElementById('qr').innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?data=' + encodeURIComponent(data.qr) + '&size=200x200" />';
      } else {
        document.getElementById('qr').innerText = 'Logged in or QR not available';
      }
    }

    async function sendMessage() {
      const number = document.getElementById('number').value.trim();
      const message = document.getElementById('message').value.trim();
      if (!number || !message) {
        alert('Number and message required');
        return;
      }
      const res = await fetch('/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number, message }),
      });
      const text = await res.text();
      alert(text);
    }

    setInterval(fetchQR, 5000); // Update QR every 5 seconds
    fetchQR();
  </script>
</body>
</html>`);
});

// API endpoint QR code (frontend polling ke liye)
app.get("/qr", (req, res) => {
  res.json({ qr: latestQR });
});

// API endpoint to send message
app.post("/send", async (req, res) => {
  try {
    const { number, message } = req.body;
    if (!number || !message) return res.status(400).send("Number and message required");
    await sock.sendMessage(number + "@s.whatsapp.net", { text: message });
    res.send("Message sent!");
  } catch (e) {
    res.status(500).send("Error sending message: " + e.message);
  }
});

// WhatsApp connection and QR management
async function startSock() {
  authState = await useMultiFileAuthState("./auth_info");

  sock = makeWASocket({
    logger: Pino({ level: "silent" }),
    auth: authState.state,
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      latestQR = qr;
      console.log("QR code received. Scan this with your WhatsApp.");
    }
    if (connection === "open") {
      console.log("WhatsApp connected!");
      latestQR = null;
    }
    if (connection === "close") {
      console.log("Connection closed. Trying to reconnect...");
      startSock();
    }
  });

  sock.ev.on("creds.update", authState.saveCreds);
}

startSock();

app.listen(3000, () => {
  console.log("Panel running at http://localhost:3000");
});
