const express = require("express");
const router = express.Router();
const Channel = require("../models/Channel");
const Message = require("../models/Message");

router.get("/", async (req, res) => {
  try {
    const channels = await Channel.find().sort({ topic: 1, name: 1 });

    const channelsWithUsers = channels.map((channel) => {
      const roomInfo = req.app
        .get("io")
        .sockets.adapter.rooms.get(channel._id.toString());
      const activeUsers = roomInfo ? roomInfo.size : 0;

      return {
        ...channel.toObject(),
        activeUsers,
      };
    });

    res.json(channelsWithUsers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/", async (req, res) => {
  const channel = new Channel({
    name: req.body.name,
    description: req.body.description,
    topic: req.body.topic || "General",
  });

  try {
    const newChannel = await channel.save();
    res.status(201).json(newChannel);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/:id/messages", async (req, res) => {
  try {
    const messages = await Message.find({ channel: req.params.id })
      .sort({ timestamp: -1 })
      .limit(50);
    res.json(messages.reverse());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
