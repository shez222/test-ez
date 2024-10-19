// src/middleware/isAuth.js
const jwt = require('jsonwebtoken');
const User = require('../models/userSchema')

const isAuth = async (req, res, next) => {
  const user = req.cookies.FBI; // Assuming you're storing the token in cookies
  
  let existingUser = await User.findOne({ _id: user });
  
  if (!existingUser) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const token = existingUser.token;

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  jwt.verify(token, "somesecret", (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    req.user = decoded; // Attach user information to request object
    next();
  });
};

module.exports = isAuth;
