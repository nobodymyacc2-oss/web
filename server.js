const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

let waitingUser = null;               // socket waiting for partner
const partners = new Map();           // socket.id -> partnerSocket.id
const profiles = new Map();           // socket.id -> { age, gender, country }

function pairUsers(socketA, socketB) {
  if (!socketA || !socketB) return;

  partners.set(socketA.id, socketB.id);
  partners.set(socketB.id, socketA.id);

  const profileA = profiles.get(socketA.id) || null;
  const profileB = profiles.get(socketB.id) || null;

  socketA.emit("paired", {
    message: "You are now connected to a stranger.",
    partnerProfile: profileB,
  });
  socketB.emit("paired", {
    message: "You are now connected to a stranger.",
    partnerProfile: profileA,
  });
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // profile data from client
  socket.on("setProfile", (profile) => {
    profiles.set(socket.id, {
      age: profile.age || "",
      gender: profile.gender || "",
      country: profile.country || "",
    });
  });

  socket.on("findPartner", () => {
    if (!waitingUser || waitingUser.id === socket.id) {
      waitingUser = socket;
      socket.emit("status", { message: "Looking for a stranger..." });
    } else {
      const partner = waitingUser;
      waitingUser = null;
      pairUsers(socket, partner);
    }
  });

  socket.on("clientMessage", (data) => {
    const partnerId = partners.get(socket.id);
    if (!partnerId) return;

    const partnerSocket = io.sockets.sockets.get(partnerId);
    if (!partnerSocket) return;

    partnerSocket.emit("serverMessage", {
      from: "stranger",
      text: data.text,
      timestamp: Date.now(),
    });

    socket.emit("serverMessage", {
      from: "you",
      text: data.text,
      timestamp: Date.now(),
    });
  });

  socket.on("disconnectPartner", () => {
    const partnerId = partners.get(socket.id);
    if (partnerId) {
      const partnerSocket = io.sockets.sockets.get(partnerId);
      if (partnerSocket) {
        partnerSocket.emit("partnerDisconnected", {
          message: "Stranger disconnected.",
        });
      }
      partners.delete(partnerId);
      profiles.delete(partnerId);
      partners.delete(socket.id);
    }
  });

  socket.on("nextPartner", () => {
    const partnerId = partners.get(socket.id);
    if (partnerId) {
      const partnerSocket = io.sockets.sockets.get(partnerId);
      if (partnerSocket) {
        partnerSocket.emit("partnerDisconnected", {
          message: "Stranger left the chat.",
        });
      }
      partners.delete(partnerId);
      profiles.delete(partnerId);
      partners.delete(socket.id);
    }

    if (!waitingUser || waitingUser.id === socket.id) {
      waitingUser = socket;
      socket.emit("status", { message: "Looking for a new stranger..." });
    } else {
      const partner = waitingUser;
      waitingUser = null;
      pairUsers(socket, partner);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    if (waitingUser && waitingUser.id === socket.id) {
      waitingUser = null;
    }

    const partnerId = partners.get(socket.id);
    if (partnerId) {
      const partnerSocket = io.sockets.sockets.get(partnerId);
      if (partnerSocket) {
        partnerSocket.emit("partnerDisconnected", {
          message: "Stranger disconnected.",
        });
      }
      partners.delete(partnerId);
      profiles.delete(partnerId);
    }

    profiles.delete(socket.id);
    partners.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server listening on http://localhost:" + PORT);
});
