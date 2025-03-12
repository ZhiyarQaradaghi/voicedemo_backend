const mongoose = require("mongoose");

const channelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  topic: {
    type: String,
    default: "General",
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Channel = mongoose.model("Channel", channelSchema);

module.exports = Channel;
