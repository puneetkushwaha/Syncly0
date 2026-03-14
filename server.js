const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Health check
app.get('/health', (req, res) => res.send('OK'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['polling', 'websocket'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Track users in rooms
const roomUsers = new Map(); // roomId -> Set(userId)
const userNames = new Map(); // userId -> userName
const roomLinks = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', ({ roomId, userId, userName }) => {
    socket.join(roomId);
    
    if (!roomUsers.has(roomId)) {
      roomUsers.set(roomId, new Set());
    }
    roomUsers.get(roomId).add(userId);
    userNames.set(userId, userName || `Partner_${userId.substring(0, 4)}`);
    
    console.log(`User ${userId} (${userName}) joined room ${roomId}`);
    
    // Send list of existing users (with names) and current link
    const existingUsers = Array.from(roomUsers.get(roomId))
      .filter(id => id !== userId)
      .map(id => ({ userId: id, userName: userNames.get(id) }));
      
    socket.emit('room-users', existingUsers);
    
    const currentLink = roomLinks.get(roomId);
    if (currentLink) {
      socket.emit('sync-link', { url: currentLink });
    }

    // Notify others
    socket.to(roomId).emit('user-joined', { userId, userName: userNames.get(userId) });

    socket.on('disconnect', () => {
      console.log('User disconnected:', userId);
      if (roomUsers.has(roomId)) {
        roomUsers.get(roomId).delete(userId);
        if (roomUsers.get(roomId).size === 0) {
          roomUsers.delete(roomId);
        }
      }
      socket.to(roomId).emit('user-left', { userId });
    });
  });

  // Signaling
  socket.on('signal', ({ roomId, data }) => {
    socket.to(roomId).emit('signal', data);
  });

  // Playback Sync
  socket.on('sync-playback', ({ roomId, type, time, playing }) => {
    socket.to(roomId).emit('sync-playback', { type, time, playing });
  });

  // Link Sync
  socket.on("sync-link", ({ roomId, url }) => {
    roomLinks.set(roomId, url);
    socket.to(roomId).emit("sync-link", { url });
  });

  socket.on("peer-ready", ({ roomId, userId }) => {
    console.log(`User ${userId} peer is ready in room ${roomId}`);
    socket.to(roomId).emit("peer-ready", { userId });
  });

  // Chat
  socket.on('chat-message', ({ roomId, message, userId, userName }) => {
    io.to(roomId).emit('chat-message', { message, userId, userName, timestamp: Date.now() });
  });
});

const PORT = process.env.PORT || 3010;
const HOST = '0.0.0.0'; // Bind to all interfaces for Render
server.listen(PORT, HOST, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
