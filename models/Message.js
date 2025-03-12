const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  channel: {
    type: String,
    required: true,
    ref: "Channel",
  },
  sender: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Message", messageSchema);
