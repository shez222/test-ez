// server.js

require('dotenv').config(); // Ensure this is at the top
const express = require('express');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const session = require('express-session');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const mongoose = require('mongoose');
const User = require('./models/userSchema');
const Item = require('./models/itemSchema');
const Message = require('./models/messageSchema'); // Import the Message model
const { getInventory } = require('./utils/getInventory');
const jackpotRoutes = require('./routes/jackpotRoutes');
const Jackpot = require('./models/jackpotSchema');
const isAuth = require('./middleware/isAuth');
const front_url = process.env.FRONTEND_URL
const back_url = process.env.BACKEND_URL
// Initialize the app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: `${front_url}`,
    methods: ['GET', 'POST'],
    credentials: true,
  })
);

// Socket.io setup
const http = require('http').Server(app);
const io = require('./socket').init(http, {
  cors: {
    origin: `${front_url}`, // Allow only your client application's origin
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS', 'DELETE'], // Allowable methods
    credentials: true, // Optional: if you need cookies or authorization headers
  },
});


app.use(session({
  secret: 'your-session-secret', // Use a secure, random string
  resave: false,
  saveUninitialized: true,
  cookie: {
      // secure: true, // Set to true if using HTTPS
      sameSite: 'Lax',
      maxAge: 3600000 // 1 hour
  }
}));


app.use(passport.initialize());
app.use(passport.session());

// Configure Passport with Steam Strategy
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

passport.use(
  new SteamStrategy(
    {
      returnURL: `${back_url}/auth/steam`,
      // returnURL: '`${front_url}`',
      realm: `${back_url}/`,
      apiKey: process.env.STEAM_API_KEY,
    },
    (identifier, profile, done) => {
      process.nextTick(() => {
        profile.identifier = identifier;
        return done(null, profile);
      });
    }
  )
);


// Steam Authentication Route
app.get('/auth/steam', (req, res, next) => {
  console.log('Initiating Steam authentication...');
  
  // Check if it's a return from Steam
  if (req.query['openid.return_to']) {
    console.log('Return from Steam detected', req.ip);
    
    passport.authenticate('steam', { failureRedirect: '/' }, (err, user, info) => {
      if (err) {
        console.error('Authentication Error:', err);
        return res.status(500).json({ message: 'Authentication Error' }); // Return error response
      }
      
      if (!user) {
        console.error('User not found:', info);
        return res.status(401).json({ message: 'User not found' }); // Return not found response
      }
    
      req.logIn(user, async (err) => {
        if (err) {
          console.error('Login Error:', err);
          return res.status(500).json({ message: 'Login Error' }); // Return error response
        }
        
        console.log('Authenticated user:', req.user);
        
        // Return user data as JSON
        const user = req.user;
        const steamID64 = user.id;
        const username = user.displayName;
        const avatar = {
          small: user.photos[0].value,
          medium: user.photos[1].value,
          large: user.photos[2].value,
        };
    
    
        // Create JWT token
        const token = jwt.sign(
          { steamID64, username, avatar },
          "somesecret",
          { expiresIn: '1h' }
        );
    
        try {
          // Check if user already exists
          let existingUser = await User.findOne({ steamId: steamID64 });
    
          if (!existingUser) {
            const newUser = new User({
              steamId: steamID64,
              username: username,
              avatar: avatar,
              token: token,
            });
            await newUser.save();
            console.log(`New user created: ${username}`);
          } else {
            existingUser.token = token;
            await existingUser.save();
            console.log(`User already exists: ${username}`);
          }
    
          // Set JWT token as a cookie
          res.cookie('FBI', existingUser._id, {
            maxAge: 3600000,
            secure: true,  // HTTPS only
            sameSite: 'Strict'
          });
    
          res.redirect(`${front_url}`);
        } catch (error) {
          console.error('Error saving user:', error);
          res.redirect('/');
        }
      });
    })(req, res, next);
    
  } else {
    console.log('Initiating new authentication flow',req.ip);
    passport.authenticate('steam')(req, res, next);
  }
});




// Return after Steam authentication handled in the same route
// app.get(
//   '/auth/steam',
//   passport.authenticate('steam', { failureRedirect: '/' }),
//   async (req, res) => {
//     const user = req.user;
//     const steamID64 = user.id;
//     const username = user.displayName;
//     const avatar = {
//       small: user.photos[0].value,
//       medium: user.photos[1].value,
//       large: user.photos[2].value,
//     };

//     // Retrieve client IP from session
//     const clientIp = req.session.clientIp;
//     console.log('Client IP from session after Steam authentication:', clientIp);

//     // Create JWT token
//     const token = jwt.sign(
//       { steamID64, username, avatar },
//       "somesecret",
//       { expiresIn: '1h' }
//     );

//     try {
//       // Check if user already exists
//       let existingUser = await User.findOne({ steamId: steamID64 });

//       if (!existingUser) {
//         const newUser = new User({
//           steamId: steamID64,
//           username: username,
//           avatar: avatar,
//           token: token,
//           lastLoginIp: clientIp, // Store the IP in the user document
//         });
//         await newUser.save();
//         console.log(`New user created: ${username}`);
//       } else {
//         existingUser.token = token;
//         existingUser.lastLoginIp = clientIp;
//         await existingUser.save();
//         console.log(`User already exists: ${username}`);
//       }

//       // Set JWT token as a cookie
//       res.cookie('FBI', existingUser._id, {
//         maxAge: 3600000,
//         secure: true,  // HTTPS only
//         sameSite: 'Strict'
//       });

//       res.redirect(`${front_url}`);
//     } catch (error) {
//       console.error('Error saving user:', error);
//       res.redirect('/');
//     }
//   }
// );


// app.get(
//   '/auth/steam/return',
//   passport.authenticate('steam', { failureRedirect: '/' }),
//   async (req, res) => {
//     const user = req.user;
//     const steamID64 = user.id;
//     const username = user.displayName;
//     const profile = user.profileUrl;
//     const avatar = {
//       small: user.photos[0].value,
//       medium: user.photos[1].value,
//       large: user.photos[2].value,
//     };

//     try {
//       // Check if user already exists
//       let existingUser = await User.findOne({ steamId: steamID64 });

//       if (!existingUser) {
//         // If the user doesn't exist, create a new user
//         const newUser = new User({
//           steamId: steamID64,
//           username: username,
//           profileUrl: profile,
//           avatar: avatar,
//         });
//         await newUser.save();
//         console.log(`New user created: ${username}`);
//       } else {
//         console.log(`User already exists: ${username}`);
//       }
//       console.log(res);
      

//       // Create JWT token
//       const token = jwt.sign(
//         { steamID64, username, avatar }, // Data to encode in JWT
//         "somesecret",          // Secret key to sign the token
//         { expiresIn: '1h' }              // Token expiration
//       );

//       // Set JWT token as HTTP-only cookie (ensure `secure: true` is used in production with HTTPS)
//       res.cookie('token', token, {
//         httpOnly: true,
//         maxAge: 3600000, // 1 hour
//         secure: true,     // Only sent over HTTPS
//         sameSite: 'Strict'
//       });

//       // Redirect to frontend after setting the cookie (without exposing sensitive data in the URL)
//       res.redirect(`${front_url}`);
//     } catch (error) {
//       console.error('Error saving user:', error);
//       res.redirect('/');
//     }
//   }
// );

app.get('/api/user', isAuth,(req, res) => {
  try {
    const user = req.user
    res.json({ username: user.username, steamID64: user.steamID64, avatar: user.avatar });
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
});



app.get('/api/inventory', isAuth, async (req, res) => {
  try {
    console.log(req.user.steamID64);
    
    const steamID64 = req.user.steamID64;
    const appId =  252490;
    const contextId =  2;

    if (!steamID64) {
      return res.status(400).json({ error: 'Missing SteamID64 parameter.' });
    }

    // Fetch the inventory
    const inventory = await getInventory(appId, steamID64, contextId);
    if (!inventory || !inventory.items || inventory.items.length === 0) {
      return res.status(404).json({ error: 'No inventory found.' });
    }

    // Find the user in the database
    const user = await User.findOne({ steamId: steamID64 });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Gather all assetIds to check for existing items in one query
    const allAssetIds = inventory.items.flatMap(item => item.assetIds);
    
    // Fetch all existing items in one query
    const existingItems = await Item.find({
      owner: user._id,
      appId,
      contextId,
      assetId: { $in: allAssetIds }
    });

    // Create a Set of assetIds that already exist
    const existingAssetIds = new Set(existingItems.map(item => item.assetId));

    // Prepare an array for new items to insert
    const newItems = [];
    const newInventoryItemIds = [];

    // Process each inventory item
    inventory.items.forEach(item => {
      // Extract the numeric part from the price string
      const priceString = item.price;
      const priceMatch = priceString.match(/\d+(\.\d+)?/);
      const price = priceMatch ? parseFloat(priceMatch[0]) : 0;

      // For each assetId, check if it already exists in the database
      item.assetIds.forEach(assetId => {
        if (!existingAssetIds.has(assetId)) {
          // If the item doesn't exist, prepare it for insertion
          const newItem = {
            name: item.market_hash_name,
            iconUrl: item.icon_url,
            price: `${price} USD`,  // Save the numeric value
            owner: user._id,
            assetId,
            appId,
            contextId
          };

          newItems.push(newItem);
        }
      });
    });

    // Bulk insert new items if there are any
    if (newItems.length > 0) {
      const insertedItems = await Item.insertMany(newItems);
      newInventoryItemIds.push(...insertedItems.map(item => item._id));
    }

    // Add new items to the user's inventory and save user in one operation
    if (newInventoryItemIds.length > 0) {
      user.inventory.push(...newInventoryItemIds);
      await user.save();
    }
    console.log("noman");
    
    // Return the updated user's inventory
    const userInventory = await User.findOne({ steamId: steamID64 }).populate('inventory');
    res.json({ items: userInventory.inventory });

  } catch (error) {
    console.error("Error in /api/inventory:", error);
    res.status(500).json({ error: error.message });
  }
});
// Use jackpot routes
app.use('/jackpotSystem', jackpotRoutes);

// Route to redirect user to Steam Trade Offer URL page
app.get('/trade-url', (req, res) => {
  try {
    const steamID64 = req.user?.id;
    if (!steamID64) {
      return res.status(401).json({ error: 'Unauthorized: No Steam ID found.' });
    }
    const tradeUrl = `https://steamcommunity.com/profiles/${steamID64}/tradeoffers/privacy#trade_offer_access_url`;
    res.redirect(tradeUrl);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Logout route
app.post('/auth/logout', (req, res) => {
  res.clearCookie('token'); // Clear the token cookie
  res.json({ message: 'Logged out' });
});

// Connect to MongoDB and start the server
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://bilalshehroz420:00000@cluster0.wru7job.mongodb.net/ez_skin?retryWrites=true&w=majority')
  .then(() => {
    http.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });

    // Existing Socket.IO connection handler
    io.on('connection', socket => {
      console.log('Client connected', socket.id);
      // Existing event handlers (if any)
    });

    // Chat namespace for chat functionality
    const chatNamespace = io.of('/chat');

    chatNamespace.on('connection', async (socket) => {
      console.log('Client connected to chat namespace', socket.id);

      try {
        // Fetch the last 20 messages from the database, sorted by timestamp ascending
        const lastMessages = await Message.find()
          .sort({ timestamp: -1 })
          .limit(20)
          .sort({ timestamp: 1 }); // To send them in chronological order

        // Send the initial messages to the newly connected client
        socket.emit('initialMessages', lastMessages);
      } catch (err) {
        console.error('Error fetching initial messages:', err);
      }

      // Listen for incoming chat messages
      socket.on('chatMessage', async (msg) => {
        // Add a timestamp if not provided
        msg.timestamp = msg.timestamp || new Date();

        // Save the message to the database
        const message = new Message({
          username: msg.username,
          text: msg.text,
          avatar: msg.avatar,
          timestamp: msg.timestamp,
        });

        try {
          await message.save();

          // After saving, check if there are more than 20 messages
          const messageCount = await Message.countDocuments();
          if (messageCount > 20) {
            // Fetch the messages to delete
            const messagesToDelete = await Message.find()
              .sort({ timestamp: 1 }) // Oldest first
              .limit(messageCount - 20);

            // Extract the IDs of messages to delete
            const idsToDelete = messagesToDelete.map(msg => msg._id);

            // Delete all messages with the extracted IDs
            await Message.deleteMany({ _id: { $in: idsToDelete } });
          }

        } catch (err) {
          console.error('Error saving message:', err);
          return;
        }

        // Broadcast the message to all connected clients in the chat namespace
        chatNamespace.emit('chatMessage', msg);
      });

      // Handle disconnect event
      socket.on('disconnect', () => {
        console.log('Client disconnected from chat namespace', socket.id);
      });
    });

  })
  .catch(err => console.error('Database connection error:', err));






























// require('dotenv').config(); // Ensure this is at the top
// const express = require('express');
// const passport = require('passport');
// const SteamStrategy = require('passport-steam').Strategy;
// const session = require('express-session');
// const cors = require('cors');
// const axios = require('axios');
// const fs = require('fs');
// const mongoose = require('mongoose');
// const User = require('./models/userSchema');
// const Item = require('./models/itemSchema');
// const { getInventory } = require('./utils/getInventory');
// const jackpotRoutes = require('./routes/jackpotRoutes');
// const Jackpot = require('./models/jackpotSchema');

// // Initialize the app
// const app = express();
// const PORT = process.env.PORT || 5000;

// // Middleware
// app.use(express.json());
// app.use(
//   cors({
//     origin: '`${front_url}`',
//     methods: ['GET', 'POST'],
//     credentials: true,
//   })
// );

// app.use(
//   session({
//     secret: process.env.SESSION_SECRET || 'your_secret',
//     resave: false,
//     saveUninitialized: true,
//     cookie: { secure: false }, // Set to true if using HTTPS
//   })
// );

// app.use(passport.initialize());
// app.use(passport.session());

// // Configure Passport with Steam Strategy
// passport.serializeUser((user, done) => {
//   done(null, user);
// });

// passport.deserializeUser((obj, done) => {
//   done(null, obj);
// });

// passport.use(
//   new SteamStrategy(
//     {
//       returnURL: '`${back_url}`/auth/steam/return',
//       realm: '`${back_url}`/',
//       apiKey: process.env.STEAM_API_KEY,
//     },
//     (identifier, profile, done) => {
//       process.nextTick(() => {
//         profile.identifier = identifier;
//         return done(null, profile);
//       });
//     }
//   )
// );

// // Socket.io setup
// const http = require('http').Server(app);
// const io = require('./socket').init(http, {
//   cors: {
//     origin: '`${front_url}`', // Allow only your client application's origin
//     methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS', 'DELETE'], // Allowable methods
//     credentials: true, // Optional: if you need cookies or authorization headers
//   },
// });

// // Import the jackpotManager module
// const jackpotManager = require('./jackpotManager');

// // Use jackpot routes
// app.use('/jackpotSystem', jackpotRoutes);

// // Inventory Route
// app.get('/api/inventory', async (req, res) => {
//   try {
//     const steamID64 = req.query.steamID64;
//     const appId = parseInt(req.query.appId, 10) || 252490;
//     const contextId = parseInt(req.query.contextId, 10) || 2;

//     if (!steamID64) {
//       return res.status(400).json({ error: 'Missing SteamID64 parameter.' });
//     }

//     // Fetch the inventory
//     const inventory = await getInventory(appId, steamID64, contextId);

//     // Find the user in the database
//     const user = await User.findOne({ steamId: steamID64 });
//     if (!user) {
//       return res.status(404).json({ error: 'User not found.' });
//     }

//     // Fetch items in the current jackpot
//     const jackpot = await Jackpot.findOne({ status: { $in: ['in_progress', 'waiting'] } }).populate('participants.items');
//     const jackpotItems = jackpot ? jackpot.participants.flatMap(participant => participant.items) : [];

//     // Extract asset IDs from jackpot items
//     const jackpotAssetIds = jackpotItems.map(item => item.assetId.toString());

//     // Filter out items that are in the jackpot from the inventory
//     const filteredInventoryItems = inventory.items.filter(item => !jackpotAssetIds.includes(item.assetIds[0].toString()));

//     // Save each item in the filtered inventory to the database
//     const itemPromises = filteredInventoryItems.map(async (item) => {
//       try {
//         // Extract the numeric part from the price string and convert it to a number
//         const priceString = item.price;
//         const priceMatch = priceString.match(/\d+(\.\d+)?/);
//         const price = priceMatch ? parseFloat(priceMatch[0]) : 0;

//         // Check if any of the asset IDs already exists in the database
//         const existingItem = await Item.findOne({
//           owner: user._id,
//           appId: appId,
//           contextId: contextId,
//           assetId: { $in: item.assetIds }
//         });

//         if (existingItem) {
//           // Item already exists in the inventory, update if needed
//           return existingItem;
//         }

//         // Create a new item entry for each asset ID
//         const newItemPromises = item.assetIds.map(async (assetId) => {
//           const newItem = new Item({
//             name: item.market_hash_name,
//             iconUrl: item.icon_url,
//             price: `${price} USD`,  // Save the numeric value
//             owner: user._id,
//             assetId: assetId,
//             appId: appId,
//             contextId: contextId,
//           });

//           const savedItem = await newItem.save();
//           user.inventory.push(savedItem._id); // Add item reference to user's inventory
//           return savedItem;
//         });

//         return Promise.all(newItemPromises);

//       } catch (itemError) {
//         throw itemError;
//       }
//     });

//     // Wait for all items to be saved
//     await Promise.all(itemPromises);

//     // Save the updated user with inventory references
//     await user.save();
//     const userInventory = await User.findOne({ steamId: steamID64 }).populate('inventory');

//     res.json({ items: userInventory.inventory, inv: filteredInventoryItems });

//   } catch (error) {
//     console.error("Error in /api/inventory:", error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // Redirect to Steam login
// app.get('/auth/steam', passport.authenticate('steam'));

// // Steam authentication callback
// app.get(
//   '/auth/steam/return',
//   passport.authenticate('steam', { failureRedirect: '/' }),
//   async (req, res) => {
//     const user = req.user;
//     const steamID64 = user.id;
//     const username = user.displayName;
//     const profile = user.profileUrl;
//     const avatar = {
//       small: user.photos[0].value,
//       medium: user.photos[1].value,
//       large: user.photos[2].value,
//     };

//     try {
//       // Check if user already exists
//       let existingUser = await User.findOne({ steamId: steamID64 });

//       if (!existingUser) {
//         // If the user doesn't exist, create a new user
//         const newUser = new User({
//           steamId: steamID64,
//           username: username,
//           profileUrl: profile,
//           avatar: avatar,
//         });
//         await newUser.save();
//         console.log(`New user created: ${username}`);
//       } else {
//         console.log(`User already exists: ${username}`);
//       }

//       // Redirect to frontend with user info
//       const redirectUrl = ``${front_url}`/?steamID64=${steamID64}&username=${username}&avatar=${JSON.stringify(
//         avatar
//       )}`;
//       res.redirect(redirectUrl);
//     } catch (error) {
//       console.error('Error saving user:', error);
//       res.redirect('/');
//     }
//   }
// );

// // Use jackpot routes
// app.use('/jackpotSystem', jackpotRoutes);

// // Route to redirect user to Steam Trade Offer URL page
// app.get('/trade-url', (req, res) => {
//   try {
//     const steamID64 = req.user?.id;
//     if (!steamID64) {
//       return res.status(401).json({ error: 'Unauthorized: No Steam ID found.' });
//     }
//     const tradeUrl = `https://steamcommunity.com/profiles/${steamID64}/tradeoffers/privacy#trade_offer_access_url`;
//     res.redirect(tradeUrl);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// // Logout route
// app.get('/logout', (req, res) => {
//   req.logout(err => {
//     if (err) {
//       return next(err);
//     }
//     req.session.destroy(err => {
//       if (err) {
//         return next(err);
//       }
//       res.redirect('`${front_url}`/'); // Redirect to your frontend after logout
//     });
//   });
// });

// // Connect to MongoDB and start the server
// mongoose.connect('mongodb+srv://bilalshehroz420:00000@cluster0.wru7job.mongodb.net/ez_skin?retryWrites=true&w=majority')
//   .then(() => {
//     http.listen(PORT, () => {
//       console.log(`Server is running on http://localhost:${PORT}`);
//     });

//     io.on('connection', socket => {
//       console.log('Client connected', socket.id);
//     });
//   })
//   .catch(err => console.error('Database connection error:', err));





















  // require('dotenv').config(); // Ensure this is at the top
// const express = require('express');
// const passport = require('passport');
// const SteamStrategy = require('passport-steam').Strategy;
// const session = require('express-session');
// const cors = require('cors');
// const axios = require('axios');
// const fs = require('fs');
// const mongoose = require('mongoose');
// const User = require('./models/userSchema');
// const Item = require('./models/itemSchema')
// const { getInventory } = require('./utils/getInventory')
// const jackpotRoutes = require('./routes/jackpotRoutes');
// const Jackpot = require('./models/jackpotSchema')

// // Initialize the app
// const app = express();
// const PORT = process.env.PORT || 5000;

// // Middleware
// app.use(express.json());
// app.use(cors({
//   origin: '`${front_url}`',
//   methods: ['GET', 'POST'],
//   credentials: true
// }));

// app.use(session({
//   secret: process.env.SESSION_SECRET || 'your_secret',
//   resave: false,
//   saveUninitialized: true,
//   cookie: { secure: false } // Set to true if using HTTPS
// }));

// app.use(passport.initialize());
// app.use(passport.session());

// // Configure Passport with Steam Strategy
// passport.serializeUser((user, done) => {
//   done(null, user);
// });

// passport.deserializeUser((obj, done) => {
//   done(null, obj);
// });

// passport.use(new SteamStrategy({
//     returnURL: '`${back_url}`/auth/steam/return',
//     realm: '`${back_url}`/',
//     apiKey: process.env.STEAM_API_KEY
//   },
//   (identifier, profile, done) => {
//     process.nextTick(() => {
//       profile.identifier = identifier;
//       return done(null, profile);
//     });
//   }
// ));

// // Function to get inventory


// // Inventory Route
// // app.get('/api/inventory', async (req, res) => {
// //   try {
// //     const steamID64 = req.query.steamID64;
// //     const appId = parseInt(req.query.appId, 10) || 252490;
// //     const contextId = parseInt(req.query.contextId, 10) || 2;
// //     console.log("check1");
    

// //     if (!steamID64) {
// //       return res.status(400).json({ error: 'Missing SteamID64 parameter.' });
// //     }

// //     const inventory = await getInventory(appId, steamID64, contextId);

// //     // Find the user in the database
// //     const user = await User.findOne({ steamId: steamID64 });
// //     if (!user) {
// //       return res.status(404).json({ error: 'User not found.' });
// //     }
// //     // Save each item in the inventory to the database
// //     const itemPromises = inventory.items.map(async (item) => {
// //       try {
// //         // Extract the numeric part from the price string and convert it to a number
// //         const priceString = item.price; 
// //         const priceMatch = priceString.match(/\d+(\.\d+)?/);
// //         const price = priceMatch ? parseFloat(priceMatch[0]) : 0;

// //         // Check if any of the asset IDs already exists in the database
// //         const existingItem = await Item.findOne({
// //           owner: user._id,
// //           appId: appId,
// //           contextId: contextId,
// //           assetId: { $in: item.assetIds }
// //         });

// //         if (existingItem) {
// //           // Item already exists in the inventory, update if needed
// //           return existingItem;
// //         }

// //         // Create a new item entry for each asset ID
// //         const newItemPromises = item.assetIds.map(async (assetId) => {
// //           const newItem = new Item({
// //             name: item.market_hash_name,
// //             iconUrl: item.icon_url,
// //             price: `${price} USD`,  // Save the numeric value
// //             owner: user._id,
// //             assetId: assetId,
// //             appId: appId,
// //             contextId: contextId,
// //             // quantity: item.quantity
// //           });

// //           const savedItem = await newItem.save();
// //           user.inventory.push(savedItem._id); // Add item reference to user's inventory
// //           return savedItem;
// //         });

// //         return Promise.all(newItemPromises);

// //       } catch (itemError) {
// //         // Handle errors
// //         console.error(`Error processing item ${item.market_hash_name}`, itemError);
// //         throw itemError;
// //       }
// //     });

// //     // Wait for all items to be saved
// //     await Promise.all(itemPromises);

// //     // Save the updated user with inventory references
// //     await user.save();
// //     const userInventory = await User.findOne({steamId: steamID64}).populate('inventory')
    
// //     // console.log(userInventory.inventory.length);
// //     // console.log(typeof(userInventory.inventory), typeof(inventory));
// //     // console.log(typeof(userInventory.inventory[0].iconUrl),typeof(inventory.items[0].icon_url));
    

// //     res.json({items:userInventory.inventory, inv:inventory});

// //   } catch (error) {
// //     console.error("Error in /api/inventory:", error);
// //     res.status(500).json({ error: error.message });
// //   }
// // });
// app.get('/api/inventory', async (req, res) => {
//   try {
//     const steamID64 = req.query.steamID64;
//     const appId = parseInt(req.query.appId, 10) || 252490;
//     const contextId = parseInt(req.query.contextId, 10) || 2;

//     if (!steamID64) {
//       return res.status(400).json({ error: 'Missing SteamID64 parameter.' });
//     }

//     // Fetch the inventory
//     const inventory = await getInventory(appId, steamID64, contextId);
//     // console.log("Fetched Inventory:", inventory);

//     // Find the user in the database
//     const user = await User.findOne({ steamId: steamID64 });
//     if (!user) {
//       return res.status(404).json({ error: 'User not found.' });
//     }

//     // Fetch items in the current jackpot
//     const jackpot = await Jackpot.findOne({ status: { $in: ['in_progress', 'waiting'] } }).populate('participants.items');
//     const jackpotItems = jackpot ? jackpot.participants.flatMap(participant => participant.items) : [];
//     // console.log("Jackpot Items:", jackpotItems);

//     // Extract asset IDs from jackpot items
//     const jackpotAssetIds = jackpotItems.map(item => item.assetId.toString());
//     // console.log("Jackpot Asset IDs:", jackpotAssetIds);

//     // Filter out items that are in the jackpot from the inventory
//     const filteredInventoryItems = inventory.items.filter(item => !jackpotAssetIds.includes(item.assetIds[0].toString()));
//     // console.log("Filtered Inventory Items:", filteredInventoryItems);

//     // Save each item in the filtered inventory to the database
//     const itemPromises = filteredInventoryItems.map(async (item) => {
//       try {
//         // Extract the numeric part from the price string and convert it to a number
//         const priceString = item.price;
//         const priceMatch = priceString.match(/\d+(\.\d+)?/);
//         const price = priceMatch ? parseFloat(priceMatch[0]) : 0;

//         // Check if any of the asset IDs already exists in the database
//         const existingItem = await Item.findOne({
//           owner: user._id,
//           appId: appId,
//           contextId: contextId,
//           assetId: { $in: item.assetIds }
//         });

//         if (existingItem) {
//           // Item already exists in the inventory, update if needed
//           return existingItem;
//         }

//         // Create a new item entry for each asset ID
//         const newItemPromises = item.assetIds.map(async (assetId) => {
//           const newItem = new Item({
//             name: item.market_hash_name,
//             iconUrl: item.icon_url,
//             price: `${price} USD`,  // Save the numeric value
//             owner: user._id,
//             assetId: assetId,
//             appId: appId,
//             contextId: contextId,
//           });

//           const savedItem = await newItem.save();
//           user.inventory.push(savedItem._id); // Add item reference to user's inventory
//           return savedItem;
//         });

//         return Promise.all(newItemPromises);

//       } catch (itemError) {
//         // Handle errors
//         // console.error(`Error processing item ${item.market_hash_name}`, itemError);
//         throw itemError;
//       }
//     });

//     // Wait for all items to be saved
//     await Promise.all(itemPromises);

//     // Save the updated user with inventory references
//     await user.save();
//     const userInventory = await User.findOne({ steamId: steamID64 }).populate('inventory');
//     // console.log(userInventory.inventory);
    
//     const exist = await Item.find().countDocuments()
//     console.log(exist);
    
//     res.json({ items: userInventory.inventory, inv: filteredInventoryItems });

//   } catch (error) {
//     console.error("Error in /api/inventory:", error);
//     res.status(500).json({ error: error.message });
//   }
// });





// // Redirect to Steam login
// app.get('/auth/steam', passport.authenticate('steam'));

// // Steam authentication callback
// app.get('/auth/steam/return',
//   passport.authenticate('steam', { failureRedirect: '/' }),
//   async (req, res) => {
//     const user = req.user;
//     const steamID64 = user.id;
//     const username = user.displayName;
//     const profile = user.profileUrl;
//     const avatar = {
//       small: user.photos[0].value,
//       medium: user.photos[1].value,
//       large: user.photos[2].value,
//     };

//     try {
//       // Check if user already exists
//       let existingUser = await User.findOne({ steamId: steamID64 });

//       if (!existingUser) {
//         // If the user doesn't exist, create a new user
//         const newUser = new User({
//           steamId: steamID64,
//           username: username,
//           profileUrl: profile,
//           avatar: avatar,
//         });
//         await newUser.save();
//         console.log(`New user created: ${username}`);
//       } else {
//         console.log(`User already exists: ${username}`);
//       }

//       // Redirect to frontend with user info
//       const redirectUrl = ``${front_url}`/?steamID64=${steamID64}&username=${username}&avatar=${JSON.stringify(avatar)}`;
//       res.redirect(redirectUrl);
//     } catch (error) {
//       console.error('Error saving user:', error);
//       res.redirect('/');
//     }
//   }
// );

// app.use('/jackpotSystem',jackpotRoutes)

// // Route to redirect user to Steam Trade Offer URL page
// app.get('/trade-url', (req, res) => {
//   try {
//     const steamID64 = req.user?.id;
//     if (!steamID64) {
//       return res.status(401).json({ error: 'Unauthorized: No Steam ID found.' });
//     }
//     const tradeUrl = `https://steamcommunity.com/profiles/${steamID64}/tradeoffers/privacy#trade_offer_access_url`;
//     res.redirect(tradeUrl);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// // Logout route
// app.get('/logout', (req, res) => {
//   req.logout(err => {
//     if (err) {
//       return next(err);
//     }
//     req.session.destroy(err => {
//       if (err) {
//         return next(err);
//       }
//       res.redirect('`${front_url}`/'); // Redirect to your frontend after logout
//     });
//   });
// });

// mongoose.connect('mongodb+srv://bilalshehroz420:00000@cluster0.wru7job.mongodb.net/ez_skin?retryWrites=true&w=majority')
//   .then(() => {
//     // app.listen(PORT, () => {
//     //   console.log(`Server is running on http://localhost:${PORT}`);
//     // });
//     const server = app.listen(PORT);
//     if (server) {
//       console.log(`Server is running on http://localhost:${PORT}`);
//     }
//     const CORS = {
//       cors: {
//           origin: "`${front_url}`", // Allow only your client application's origin
//           methods: ["GET", "POST","PUT","PATCH","OPTIONS","DELETE"], // Allowable methods
//           allowedHeaders: ["my-custom-header"], // Optional: specify headers
//           credentials: true // Optional: if you need cookies or authorization headers
//       }
//     }
//     const io = require('./socket').init(server,CORS);
//     return io;
//   }).then((io)=>{
//     // console.log(io);
    
//     io.on('connection', socket => {
//       console.log('Client connected',socket.id);

//   })
  
//   })
//   .catch(err => console.error('Database connection error:', err));

// server.js