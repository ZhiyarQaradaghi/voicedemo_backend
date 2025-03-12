const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

const Message = require("./models/Message");
const Channel = require("./models/Channel");

dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

mongoose
  .connect(
    process.env.MONGO_URI || "mongodb://localhost:27017/voice-chat-app",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

const rooms = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-channel", (channelId, username) => {
    socket.join(channelId);

    if (!rooms[channelId]) {
      rooms[channelId] = {
        users: [],
        speakingQueue: [],
        currentSpeaker: null,
      };
    }

    rooms[channelId].users.push({
      id: socket.id,
      username,
    });

    io.to(channelId).emit("user-joined", {
      users: rooms[channelId].users,
      joinedUser: { id: socket.id, username },
    });

    socket.emit("queue-updated", { queue: rooms[channelId].speakingQueue });
    socket.emit("current-speaker-updated", {
      speaker: rooms[channelId].currentSpeaker,
    });

    console.log(`${username} joined channel ${channelId}`);
  });

  socket.on("voice-data", (data) => {
    const { channelId, audioChunk } = data;

    if (rooms[channelId]?.currentSpeaker?.id === socket.id) {
      socket.to(channelId).emit("receive-voice-data", {
        userId: socket.id,
        audioChunk,
      });
    }
  });

  socket.on("send-message", async (data) => {
    const { channelId, message, username } = data;

    try {
      const newMessage = new Message({
        channel: channelId,
        sender: username,
        content: message,
        timestamp: new Date(),
      });

      await newMessage.save();

      io.to(channelId).emit("receive-message", {
        id: newMessage._id,
        sender: username,
        content: message,
        timestamp: newMessage.timestamp,
      });
    } catch (error) {
      console.error("Error saving message:", error);
    }
  });

  socket.on("raise-hand", (data) => {
    const { channelId, username } = data;

    if (rooms[channelId]) {
      const alreadyInQueue = rooms[channelId].speakingQueue.some(
        (user) => user.id === socket.id
      );

      if (!alreadyInQueue) {
        rooms[channelId].speakingQueue.push({
          id: socket.id,
          username,
        });

        io.to(channelId).emit("queue-updated", {
          queue: rooms[channelId].speakingQueue,
        });

        io.to(channelId).emit("hand-raised", { userId: socket.id });

        if (!rooms[channelId].currentSpeaker) {
          rooms[channelId].currentSpeaker = {
            id: socket.id,
            username,
          };

          rooms[channelId].speakingQueue = rooms[
            channelId
          ].speakingQueue.filter((user) => user.id !== socket.id);

          io.to(channelId).emit("current-speaker-updated", {
            speaker: rooms[channelId].currentSpeaker,
          });

          io.to(channelId).emit("queue-updated", {
            queue: rooms[channelId].speakingQueue,
          });
        }
      }
    }
  });

  socket.on("lower-hand", (data) => {
    const { channelId } = data;

    if (rooms[channelId]) {
      rooms[channelId].speakingQueue = rooms[channelId].speakingQueue.filter(
        (user) => user.id !== socket.id
      );

      io.to(channelId).emit("queue-updated", {
        queue: rooms[channelId].speakingQueue,
      });

      io.to(channelId).emit("hand-lowered", { userId: socket.id });

      if (rooms[channelId].currentSpeaker?.id === socket.id) {
        rooms[channelId].currentSpeaker = null;

        io.to(channelId).emit("current-speaker-updated", {
          speaker: null,
        });

        if (rooms[channelId].speakingQueue.length > 0) {
          const nextSpeaker = rooms[channelId].speakingQueue[0];
          rooms[channelId].currentSpeaker = nextSpeaker;

          rooms[channelId].speakingQueue = rooms[
            channelId
          ].speakingQueue.filter((user) => user.id !== nextSpeaker.id);

          io.to(channelId).emit("current-speaker-updated", {
            speaker: rooms[channelId].currentSpeaker,
          });

          io.to(channelId).emit("queue-updated", {
            queue: rooms[channelId].speakingQueue,
          });
        }
      }
    }
  });

  socket.on("set-current-speaker", (data) => {
    const { channelId, speakerId } = data;

    if (rooms[channelId]) {
      const user = rooms[channelId].users.find((u) => u.id === speakerId);

      if (user) {
        rooms[channelId].currentSpeaker = user;

        io.to(channelId).emit("current-speaker-updated", {
          speaker: rooms[channelId].currentSpeaker,
        });
      }
    }
  });

  socket.on("remove-from-queue", (data) => {
    const { channelId, userId } = data;

    if (rooms[channelId]) {
      rooms[channelId].speakingQueue = rooms[channelId].speakingQueue.filter(
        (user) => user.id !== userId
      );

      io.to(channelId).emit("queue-updated", {
        queue: rooms[channelId].speakingQueue,
      });
    }
  });

  socket.on("send-reaction", (data) => {
    const { channelId, username, type } = data;

    io.to(channelId).emit("reaction-received", {
      userId: socket.id,
      username,
      type,
    });
  });

  socket.on("leave-channel", (channelId) => {
    if (rooms[channelId]) {
      rooms[channelId].users = rooms[channelId].users.filter(
        (user) => user.id !== socket.id
      );

      rooms[channelId].speakingQueue = rooms[channelId].speakingQueue.filter(
        (user) => user.id !== socket.id
      );

      if (rooms[channelId].currentSpeaker?.id === socket.id) {
        rooms[channelId].currentSpeaker = null;

        if (rooms[channelId].speakingQueue.length > 0) {
          const nextSpeaker = rooms[channelId].speakingQueue[0];
          rooms[channelId].currentSpeaker = nextSpeaker;

          rooms[channelId].speakingQueue = rooms[
            channelId
          ].speakingQueue.filter((user) => user.id !== nextSpeaker.id);

          io.to(channelId).emit("current-speaker-updated", {
            speaker: rooms[channelId].currentSpeaker,
          });
        } else {
          io.to(channelId).emit("current-speaker-updated", {
            speaker: null,
          });
        }
      }

      io.to(channelId).emit("user-left", {
        users: rooms[channelId].users,
        leftUserId: socket.id,
      });

      io.to(channelId).emit("queue-updated", {
        queue: rooms[channelId].speakingQueue,
      });

      socket.leave(channelId);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    Object.keys(rooms).forEach((channelId) => {
      if (rooms[channelId].users.some((user) => user.id === socket.id)) {
        rooms[channelId].users = rooms[channelId].users.filter(
          (user) => user.id !== socket.id
        );

        rooms[channelId].speakingQueue = rooms[channelId].speakingQueue.filter(
          (user) => user.id !== socket.id
        );

        if (rooms[channelId].currentSpeaker?.id === socket.id) {
          rooms[channelId].currentSpeaker = null;

          if (rooms[channelId].speakingQueue.length > 0) {
            const nextSpeaker = rooms[channelId].speakingQueue[0];
            rooms[channelId].currentSpeaker = nextSpeaker;

            rooms[channelId].speakingQueue = rooms[
              channelId
            ].speakingQueue.filter((user) => user.id !== nextSpeaker.id);
            io.to(channelId).emit("current-speaker-updated", {
              speaker: rooms[channelId].currentSpeaker,
            });
          } else {
            io.to(channelId).emit("current-speaker-updated", {
              speaker: null,
            });
          }
        }

        io.to(channelId).emit("user-left", {
          users: rooms[channelId].users,
          leftUserId: socket.id,
        });

        io.to(channelId).emit("queue-updated", {
          queue: rooms[channelId].speakingQueue,
        });
      }
    });
  });
});

app.get("/api/channels", async (req, res) => {
  try {
    const channels = await Channel.find();
    res.json(channels);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/channels", async (req, res) => {
  try {
    const newChannel = new Channel({
      name: req.body.name,
      description: req.body.description,
    });

    const savedChannel = await newChannel.save();
    res.status(201).json(savedChannel);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/channels/:channelId/messages", async (req, res) => {
  try {
    const messages = await Message.find({ channel: req.params.channelId })
      .sort({ timestamp: 1 })
      .limit(100);

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
// start
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
