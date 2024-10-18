const Jackpot = require('../models/jackpotSchema');
const Item = require('../models/itemSchema');
const User = require('../models/userSchema');
const io = require('../socket');
const jackpotManager = require('../jackpotManager');
const generateRandomColor = require('../utils/randcolor');
const { manager } = require('../steamTradeBot'); // Import trade bot manager
const SteamTradeManager = require('steam-tradeoffer-manager');

// Function to send trade offer using user's Trade URL
const sendTradeOfferToUser = async (tradeUrl, items) => {
  // console.log(manager);
  // console.log(items);
  
  // console.log(process.env.TRADE_OFFER_URL);

  const tradeOffer = manager.createOffer(tradeUrl); // Use the user's Trade URL directly
  
  
  // Add the items the bot is requesting from the user
  items.forEach(item => {
    tradeOffer.addTheirItem({
      assetid: item.assetId,
      appid: item.appId,
      contextid: '2', // Context ID (typically '2' for CS:GO)
    });
  });

  tradeOffer.setMessage('You are joining the jackpot.');
  console.log(tradeOffer);
  
  
  // Send the trade offer and return its ID and URL
  return new Promise((resolve, reject) => {
    tradeOffer.send((err, status) => {
      console.log(err)
      if (err) {
        ;
        
        console.error('Failed to send trade offer:', err);
        return reject(err);
      }

      console.log(`Trade offer sent to user with status: ${status}`);
      resolve({
        offerId: tradeOffer.id,
        offerUrl: `https://steamcommunity.com/tradeoffer/${tradeOffer.id}`, // Trade offer URL
      });
    });
  });
};

// Track trade offer acceptance
const trackTradeOffer = (offerId, userId, itemIds, jackpotId) => {
  manager.getOffer(offerId, async (err, offer) => {
    if (err) {
      console.error(`Failed to get offer: ${err}`);
      return;
    }

    // Poll for trade acceptance status
    const pollTradeStatus = setInterval(async () => {
      offer.update(async (err) => {
        if (err) {
          console.error(`Failed to update offer status: ${err}`);
          return;
        }

        // If the trade is accepted, update the jackpot and allow the user to join
        if (offer.state === SteamTradeManager.ETradeOfferState.Accepted) {
          clearInterval(pollTradeStatus);
          console.log(`Trade offer ${offer.id} was accepted!`);
          
          // Add user to jackpot with items
          await addUserToJackpot(userId, itemIds, jackpotId);

        } else if (offer.state === SteamTradeManager.ETradeOfferState.Declined) {
          clearInterval(pollTradeStatus);
          console.log(`Trade offer ${offer.id} was declined.`);
          // Optionally handle declined trade
        }
      });
    }, 5000); // Poll every 5 seconds
  });
};

// Function to add user to jackpot
const addUserToJackpot = async (userId, itemIds, jackpotId) => {
  try {
    console.log(userId,itemIds,jackpotId);
    
    const jackpot = await Jackpot.findById(jackpotId);

    // Fetch the user and items
    const user = await User.findById(userId);
    const items = await Item.find({ _id: { $in: itemIds } });

    // Calculate total value of items added to the jackpot
    const totalValue = items.reduce((acc, item) => {
      const itemValue = parseFloat(item.price);
      return acc + (isNaN(itemValue) ? 0 : itemValue);
    }, 0);

    // Assign random color for user in the jackpot
    const randomColor = generateRandomColor();

    // Add user to jackpot
    jackpot.participants.push({
      user: user._id,
      items: items.map(item => item._id),
      color: randomColor,
    });

    jackpot.totalValue += totalValue;

    // Update jackpot status to 'in_progress' if criteria met
    if (jackpot.participants.length >= 2 && jackpot.status === 'waiting') {
      jackpot.status = 'in_progress';

      // Start the round timer
      jackpotManager.startRoundTimer();
    }

    // Save the jackpot
    await jackpot.save();
    // Remove items from user's inventory
    // user.inventory = user.inventory.filter(
    //   (itemId) => !itemIds.includes(itemId.toString())
    // );
    // await user.save();

    // Notify clients via Socket.io
    io.getIO().emit('participants', {
      participants: jackpot.participants,
    });

    console.log('User successfully added to jackpot.');

  } catch (error) {
    console.error('Error adding user to jackpot:', error);
  }
};

const joinJackpot = async (req, res) => {
  try {
    const { userId, itemIds } = req.body; // Accept only userId and itemIds from the request

    // Validate user and items
    if (!userId || !itemIds || itemIds.length === 0) {
      return res.status(400).json({ error: 'User ID and item IDs are required' });
    }

    // Find or create the current jackpot (waiting or in-progress)
    let jackpot = await Jackpot.findOne({ status: { $in: ['in_progress', 'waiting'] } });
    if (!jackpot) {
      jackpot =  new Jackpot({ status: 'waiting', totalValue: 0, participants: [] });
      await jackpot.save();
    }

    // Fetch the user
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Check if the user has a trade URL
    const tradeUrl = user.tradeUrl;
    if (!tradeUrl) {
      return res.json({
        msg: 'User does not have a Steam Trade URL. Please update your profile.',
        tradeUrl:false
       });
    }

    // Fetch the items
    const items = await Item.find({ _id: { $in: itemIds } });
    if (items.length === 0) return res.status(404).json({ error: 'No items found' });

    // Send trade offer to the user using their Trade URL from the user schema
    // console.log(process.env.TRADE_OFFER_URL);
    
    try {
    // console.log(manager);
      // console.log(jackpot);
      
      // const tradeData = await sendTradeOfferToUser(tradeUrl,items);

      // Send trade URL to user
      // console.log(tradeData);
      await addUserToJackpot(userId, itemIds, jackpot._id);
      res.json({
        success: true,
        message: 'Trade offer sent. Please accept the offer to join the jackpot.',
        // tradeOfferUrl: tradeData.offerUrl,
      });
      // trackTradeOffer(tradeData.offerId, userId, itemIds, jackpot._id);
      
      
      // Track trade offer acceptance

    } catch (err) {
      return res.status(500).json({ error: 'Failed to send trade offer to user' });
    }

  } catch (error) {
    console.error('Error joining jackpot:', error);
    res.status(500).json({ error: error.message });
  }
};


// Get Jackpot Status
const getJackpotStatus = async (req, res) => {
  try {
    // Find a jackpot that is either 'in_progress' or 'waiting'
    let jackpot = await Jackpot.findOne({ status: { $in: ['in_progress', 'waiting'] } })
      .populate({
        path: 'participants.user',
        select: '_id username email profileUrl avatar inventory', // Specify fields to include, _id is included by default
      })
      .populate('participants.items')
      .populate('winner');

    // If no jackpot is found, return a 404 error
    if (!jackpot) {
      return res.status(404).json({ error: 'No active jackpot found' });
    }

    // Respond with the jackpot data
    res.json(jackpot);
  } catch (error) {
    console.error('Error fetching jackpot status:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get Jackpot History
const getJackpotHistory = async (req, res) => {
  try {
    // Calculate the date and time for 24 hours ago from now
    console.log("reached");
    
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    console.log(twentyFourHoursAgo);
    
    // Fetch all jackpots with status 'completed' and created within the last 24 hours
    const jackpots = await Jackpot.find({
      status: 'completed',
      createdAt: { $gte: twentyFourHoursAgo }, // Filter for jackpots created in the last 24 hours
    })
      .populate({
        path: 'participants.user', // Populate the 'user' field within 'participants'
        select: 'username steamId avatar', // Select specific fields (optional)
      })
      .populate({
        path: 'participants.items', // Populate the 'items' array within 'participants'
        select: 'name price iconUrl', // Select specific fields (optional)
      })
      .populate({
        path: 'winner', // Populate the 'winner' field
        select: 'username avatar', // Select specific fields (optional)
      });
      console.log("jack", jackpots);
    // Check if any jackpots are found
    if (!jackpots || jackpots.length === 0) {
      return res.status(404).json({ error: 'No completed jackpots found in the last 24 hours' });
    }

    // Optional: Filter out participants with null users (if any)
    // const filteredJackpots = jackpots.map(jackpot => {
    //   const validParticipants = jackpot.participants.filter(participant => participant.user !== null);
    //   return { ...jackpot.toObject(), participants: validParticipants };
    // });
    
    
    // Respond with the filtered jackpots data
    res.status(200).json(jackpots);
  } catch (error) {
    console.error('Error fetching jackpot history:', error);
    res.status(500).json({ error: error.message });
  }
};

const saveTradeUrl = async (req, res) => {
  try {
    const { tradeUrl } = req.body;
    const steamID64 = req.user.steamID64
    
    
    // Validate userId and tradeUrl
    if (!steamID64 || !tradeUrl) {
      return res.status(400).json({ error: 'User ID and Trade URL are required.' });
    }

    // Find the user by ID
    const user = await User.findOne({ steamId: steamID64 });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Update the user's trade URL
    user.tradeUrl = tradeUrl;
    await user.save();

    res.status(200).json({ success: true, message: 'Trade URL updated successfully.' });
  } catch (error) {
    console.error('Error updating trade URL:', error);
    res.status(500).json({ error: 'Failed to update trade URL.' });
  }
};

module.exports = {
  joinJackpot,
  getJackpotStatus,
  getJackpotHistory,
  saveTradeUrl
};






// // controllers/jackpotController.js

// const Jackpot = require('../models/jackpotSchema');
// const Item = require('../models/itemSchema');
// const User = require('../models/userSchema');
// const io = require('../socket');
// const jackpotManager = require('../jackpotManager');
// const generateRandomColor = require('../utils/randcolor'); // Ensure correct path
// const SteamTradeManager = require('steam-tradeoffer-manager');
// const SteamCommunity = require('steamcommunity');
// const SteamUser = require('steam-user');
// const SteamTotp = require('steam-totp');


// // Initialize Steam client and trade manager
// const client = new SteamUser();
// const community = new SteamCommunity();
// const manager = new SteamTradeManager({
//   steam: client,
//   community: community,
//   language: 'en'
// });

// // Steam bot credentials from environment variables
// const config = {
//   accountName: process.env.STEAM_ACCOUNT_NAME,
//   password: process.env.STEAM_PASSWORD,
//   sharedSecret: process.env.STEAM_SHARED_SECRET,
//   identitySecret: process.env.STEAM_IDENTITY_SECRET
// };
// console.log(config);


// // Validate Steam credentials
// if (!config.accountName || !config.password || !config.sharedSecret || !config.identitySecret) {
//   console.error('Steam credentials are not fully set in environment variables.');
//   process.exit(1);
// }

// // Log in to Steam
// client.logOn({
//   accountName: config.accountName,
//   password: config.password,
//   twoFactorCode: SteamTotp.generateAuthCode(config.sharedSecret)
// });

// client.on('loggedOn', () => {
//   client.setPersona(SteamUser.EPersonaState.Online);
//   client.gamesPlayed(252490); // Example game ID (Team Fortress 2)
//   console.log('Steam client logged in and online');
// });

// client.on('error', (err) => {
//   console.error('Steam client encountered an error:', err);
// });

// client.on('webSession', (sessionId, cookies) => {
//   console.log('Web session established.');
//   // manager.setCookies(cookies, (err) => {
//   //   if (err) {
//   //     console.error('Failed to set cookies for trade manager:', err);
//   //   } else {
//   //     console.log('Trade manager cookies set successfully.');
//   //   }
//   // });
//   manager.setCookies(cookies);
// 	community.setCookies(cookies);
// 	community.startConfirmationChecker(20000, config.identitySecret);
// });


// // Join the Jackpot
// const joinJackpot = async (req, res) => {
//   try {
//     const { userId, itemIds } = req.body;

//     // Validate user and items
//     if (!userId || !itemIds || itemIds.length === 0) {
//       return res.status(400).json({ error: 'User ID and item IDs are required' });
//     }

//     // Find or create the current jackpot (waiting or in-progress)
//     let jackpot = await Jackpot.findOne({ status: { $in: ['in_progress', 'waiting'] } });
//     if (!jackpot) {
//       jackpot = new Jackpot({ status: 'waiting', totalValue: 0, participants: [] });
//     }

//     // Fetch the user and items
//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ error: 'User not found' });

//     const items = await Item.find({ _id: { $in: itemIds } });
//     if (items.length === 0) return res.status(404).json({ error: 'No items found' });

//     // Optionally, remove items from user's inventory
//     // Uncomment if you want to remove the items from the user's inventory upon joining
//     /*
//     user.inventory = user.inventory.filter(
//       (itemId) => !itemIds.includes(itemId.toString())
//     );
//     await user.save();
//     */

//     // Check if the user is already participating
//     /*
//     const existingParticipant = jackpot.participants.find(participant => participant.user.equals(user._id));

//     if (existingParticipant) {
//       // If user is already participating, add new items to their existing items
//       existingParticipant.items.push(...items.map(item => item._id));
//     } else {
//     */
//         // Create and send trade offer
//     const offer = manager.createOffer(process.env.TRADE_OFFER_URL); // Trade offer URL from environment variables
//     items.forEach(item => {
//       offer.addTheirItem({
//         assetid: item.assetId,
//         appid: item.appId,
//         contextid: '2'
//       });
//     });

//     // Optional: Set a unique trade offer message
//     offer.setMessage(`Joining Jackpot ID: ${jackpot._id}`);

//     // Send the trade offer
//     await sendTradeOffer(offer);
//     // If user is not yet participating, add them with their items and a random color
//     const randomColor = generateRandomColor(); // Generate a random color
//     jackpot.participants.push({
//       user: user._id,
//       items: items.map(item => item._id),
//       color: randomColor, // Assign the random color
//     });
//     // }

//     // Calculate the total value of the items added to the jackpot
//     const totalValue = items.reduce((acc, item) => {
//       const itemValue = parseFloat(item.price); // Convert item price to a float
//       if (!isNaN(itemValue)) {
//         return acc + itemValue;
//       }
//       return acc; // Skip invalid item values
//     }, 0);

//     jackpot.totalValue += totalValue;

//     // If there are 2 or more participants, move to 'in_progress' and start the timer
//     if (jackpot.participants.length >= 2 && jackpot.status === 'waiting') {
//       jackpot.status = 'in_progress';

//       // Start the round timer
//       jackpotManager.startRoundTimer();
//     }

//     // Save the jackpot
//     const updatedJackpot = await jackpot.save();

//     // Emit the updated jackpot to all clients
//     const populatedJackpot = await Jackpot.findById(updatedJackpot._id)
//       .populate('participants.user')
//       .populate('participants.items');

//     io.getIO().emit('participants', {
//       participants: populatedJackpot.participants,
//     });

//     res.json({ success: true, jackpot: populatedJackpot });
//   } catch (error) {
//     console.error('Error joining jackpot:', error);
//     res.status(500).json({ error: error.message });
//   }
// };
// //  * Send Trade Offer with Promises
// //  */
// const sendTradeOffer = (offer) => {
//   return new Promise((resolve, reject) => {
//     offer.send((err, status) => {
//       if (err) {
//         console.error('Trade offer failed:', err);
//         return reject(new Error('Failed to send trade offer.'));
//       }

//       if (status === 'pending') {
//         console.log('Trade offer sent, awaiting mobile confirmation.');
//       } else {
//         console.log('Trade offer sent successfully.');
//       }

//       resolve(status);
//     });
//   });
// };
















// /**
//  * Join the Jackpot
//  */
// const joinJackpot = async (req, res) => {
//   try {
//     const { userId, itemIds } = req.body;

//     // Input validation
//     if (!userId || !Array.isArray(itemIds) || itemIds.length === 0) {
//       return res.status(400).json({ error: 'User ID and a non-empty array of item IDs are required.' });
//     }

//     // Fetch or create a jackpot
//     let jackpot = await Jackpot.findOne({ status: { $in: ['in_progress', 'waiting'] } });
//     if (!jackpot) {
//       jackpot = new Jackpot({ status: 'waiting', totalValue: 0, participants: [], commissionPercentage: 5 }); // Example commission
//     }

//     // Fetch user
//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ error: 'User not found.' });

//     // Fetch items and validate ownership
//     const items = await Item.find({ _id: { $in: itemIds }, owner: userId });
//     if (items.length === 0) return res.status(404).json({ error: 'No valid items found for the user.' });

//     // Check if user is already participating
//     // const existingParticipant = jackpot.participants.find(participant => participant.user.equals(user._id));
//     // if (existingParticipant) {
//     //   return res.status(400).json({ error: 'User is already participating in the jackpot.' });
//     // }

//     // Create and send trade offer
//     const offer = manager.createOffer(process.env.TRADE_OFFER_URL); // Trade offer URL from environment variables
//     items.forEach(item => {
//       offer.addTheirItem({
//         assetid: item.assetId,
//         appid: item.appId,
//         contextid: '2'
//       });
//     });

//     // Optional: Set a unique trade offer message
//     offer.setMessage(`Joining Jackpot ID: ${jackpot._id}`);

//     // Send the trade offer
//     await sendTradeOffer(offer);

//     // Update jackpot with participant's items and total value
//     jackpot.participants.push({
//       user: user._id,
//       items: items.map(item => item._id)
//     });

//     const totalValue = items.reduce((acc, item) => {
//       const itemValue = parseFloat(item.value);
//       return !isNaN(itemValue) ? acc + itemValue : acc;
//     }, 0);

//     jackpot.totalValue += totalValue;

//     // Update jackpot status if criteria met
//     if (jackpot.participants.length >= 2 && jackpot.status === 'waiting') { // Example threshold
//       jackpot.status = 'in_progress';
//     }

//     // Save the updated jackpot
//     await jackpot.save();

//     // Notify clients via Socket.io
//     io.getIO().emit('jackpots', { action: 'update', jackpot });

//     res.json({ success: true, jackpot });

//   } catch (error) {
//     console.error('Error joining jackpot:', error);
//     res.status(500).json({ error: 'An unexpected error occurred while joining the jackpot.' });
//   }
// };

// /**
//  * Send Trade Offer with Promises
//  */
// const sendTradeOffer = (offer) => {
//   return new Promise((resolve, reject) => {
//     offer.send((err, status) => {
//       if (err) {
//         console.error('Trade offer failed:', err);
//         return reject(new Error('Failed to send trade offer.'));
//       }

//       if (status === 'pending') {
//         console.log('Trade offer sent, awaiting mobile confirmation.');
//       } else {
//         console.log('Trade offer sent successfully.');
//       }

//       resolve(status);
//     });
//   });
// };

// /**
//  * Transfer Items to Winner
//  */
// const transferWinningsToWinner = async (winner, items) => {
//   try {
//     if (!winner.tradeOfferUrl) {
//       throw new Error('Winner does not have a valid trade offer URL.');
//     }

//     const offer = manager.createOffer(winner.tradeOfferUrl);

//     items.forEach(item => {
//       offer.addMyItem({
//         assetid: item.assetId,
//         appid: item.appId,
//         contextid: '2'
//       });
//     });

//     offer.setMessage('Congratulations! You have won the jackpot!');

//     // Send the trade offer
//     await sendTradeOffer(offer);

//     console.log(`Trade offer sent to winner (${winner._id}) successfully.`);
//   } catch (error) {
//     console.error('Error transferring winnings to winner:', error);
//     // Optionally, handle retries or notify administrators
//   }
// };

// /**
//  * Get Jackpot Status
//  */
// const getJackpotStatus = async (req, res) => {
//   try {
//     const jackpot = await Jackpot.findOne({ status: { $in: ['in_progress', 'waiting'] } })
//       .populate('participants.user', 'username steamId') // Select necessary fields
//       .populate('participants.items', 'name value assetId');

//     if (!jackpot) {
//       return res.status(404).json({ error: 'No active jackpot found.' });
//     }

//     res.json(jackpot);
//   } catch (error) {
//     console.error('Error fetching jackpot status:', error);
//     res.status(500).json({ error: 'Failed to retrieve jackpot status.' });
//   }
// };

// /**
//  * Complete the Jackpot
//  */
// const completeJackpot = async (req, res) => {
//   try {
//     const { jackpotId } = req.body;

//     if (!jackpotId) {
//       return res.status(400).json({ error: 'Jackpot ID is required.' });
//     }

//     const jackpot = await Jackpot.findById(jackpotId)
//       .populate('participants.user', 'username steamId tradeOfferUrl')
//       .populate('participants.items', 'name value assetId');

//     if (!jackpot || jackpot.status !== 'in_progress') {
//       return res.status(404).json({ error: 'Jackpot not found or not in progress.' });
//     }

//     const totalValue = jackpot.totalValue;
//     let winner = null;

//     // Calculate odds based on total value of each participant's items
//     const participantsWithOdds = jackpot.participants.map(participant => {
//       const participantValue = participant.items.reduce((acc, item) => acc + parseFloat(item.value), 0);
//       const odds = participantValue / totalValue;
//       return { participant, odds };
//     });

//     // Random selection based on odds
//     const randomValue = Math.random();
//     let cumulativeOdds = 0;
//     for (const { participant, odds } of participantsWithOdds) {
//       cumulativeOdds += odds;
//       if (randomValue <= cumulativeOdds) {
//         winner = participant;
//         break;
//       }
//     }

//     if (winner) {
//       const commissionValue = (jackpot.totalValue * jackpot.commissionPercentage) / 100;
//       const winningsValue = jackpot.totalValue - commissionValue;

//       const winnerItems = jackpot.participants
//         .find(participant => participant.user.equals(winner._id))
//         .items;

//       // Transfer winnings to the winner
//       await transferWinningsToWinner(winner, winnerItems);

//       // Update jackpot status and assign winner
//       jackpot.status = 'completed';
//       jackpot.winner = winner._id;
//       jackpot.winningsValue = winningsValue; // Optionally track winnings
//       await jackpot.save();

//       // Notify clients
//       io.getIO().emit('jackpots', { action: 'complete', jackpot });

//       return res.json({ success: true, jackpot });
//     } else {
//       throw new Error('Failed to determine a winner.');
//     }

//   } catch (error) {
//     console.error('Error completing jackpot:', error);
//     res.status(500).json({ error: 'An unexpected error occurred while completing the jackpot.' });
//   }
// };
