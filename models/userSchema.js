const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  steamId: { type: String, required: true, unique: true }, // Steam ID64 of the user
  username: { type: String, required: true }, // Username or display name
  profileUrl: { type: String }, // Steam profile URL
  tradeUrl: { type: String }, // Steam profile URL
  avatar: { // User's avatar images
    small: { type: String },
    medium: { type: String },
    large: { type: String },
  },
  inventory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Item' }], // Array of item references owned by the user
  deposited: { type: Number, default: 0 }, // Commission percentage
  totalWon: { type: Number, default: 0 }, // Commission percentage
  profit: { type: Number, default: 0 }, // Commission percentage
  createdAt: { type: Date, default: Date.now }, // Timestamp for when the user registered
});

module.exports = mongoose.model('User', userSchema);
