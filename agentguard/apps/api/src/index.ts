import http from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app";
import { prisma } from "./prisma";
import { setRealtimeEmitter } from "./services/gateway";

const port = Number(process.env.API_PORT ?? 4000);
const app = createApp();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"]
  }
});

setRealtimeEmitter((event, payload) => {
  io.emit(event, payload);
});

io.on("connection", (socket) => {
  socket.emit("connected", { service: "agentguard-api", timestamp: new Date().toISOString() });
});

server.listen(port, () => {
  console.log(`AgentGuard API listening on http://localhost:${port}`);
});

const shutdown = async () => {
  await prisma.$disconnect();
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

