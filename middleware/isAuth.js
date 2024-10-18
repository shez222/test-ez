// src/middleware/isAuth.js
const jwt = require('jsonwebtoken');

const isAuth = (req, res, next) => {
  const token = req.cookies.token; // Assuming you're storing the token in cookies

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
