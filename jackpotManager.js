// jackpotManager.js
require('dotenv').config(); // Ensure this is at the top
const Jackpot = require('./models/jackpotSchema');
const io = require('./socket');
const weightedRandomSelection = require('./utils/weightedRandomSelection');
const { manager } = require('./steamTradeBot'); // Import Steam trade bot manager
const User = require('./models/userSchema');

/**
 * Timer settings
 */
let roundDuration = 10; // in seconds (adjust as needed)
let roundStartTime = null;
let timerInterval = null;

/**
 * Spin settings
 */
const spinDuration = 5000; // Spin duration in milliseconds (e.g., 5 seconds)
const spinStartDelay = 1000; // Delay before spin starts in milliseconds (e.g., 1 second)

/**
 * Time between rounds
 */
const timeBetweenRounds = 10000; // 10 seconds in milliseconds

/**
 * Calculates the time left in the current round.
 * @returns {number} Time left in seconds.
 */
function getTimeLeft() {
  if (!roundStartTime) return roundDuration;
  const elapsed = Math.floor((Date.now() - roundStartTime) / 1000);
  return Math.max(roundDuration - elapsed, 0);
}

/**
 * Starts the round timer.
 */
function startRoundTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
  }

  roundStartTime = Date.now();

  io.getIO().emit('timer', { timeLeft: roundDuration });

  timerInterval = setInterval(async () => {
    const timeLeft = getTimeLeft();
    io.getIO().emit('timer', { timeLeft });

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      roundStartTime = null;
      timerInterval = null;
      // End the round
      await endRound();
    }
  }, 1000);
}

/**
 * Send trade offer with Promises
 */
const sendTradeOffer = (offer) => {
  return new Promise((resolve, reject) => {
    offer.send((err, status) => {
      if (err) {
        console.error('Trade offer failed:', err);
        return reject(new Error('Failed to send trade offer.'));
      }

      if (status === 'pending') {
        console.log('Trade offer sent, awaiting mobile confirmation.');
      } else {
        console.log('Trade offer sent successfully.');
      }

      resolve(status);
    });
  });
};


/**
 * Transfer items based on winner distribution (90% to the winner, 10% kept in the bot)
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const transferWinnings = async (winner) => {
  try {
    // Validate Winner's Trade URL
    if (!winner.tradeUrl) {
      throw new Error('Winner does not have a valid trade offer URL.');
    }

    // // Validate Admin's Trade URL
    // if (!admin.tradeUrl) {
    //   throw new Error('Admin does not have a valid trade offer URL.');
    // }

    // Fetch the bot's inventory contents
    manager.getUserInventoryContents(manager.steamID, "252490", "2", false, async (err, inventory) => {
      if (err) {
        console.error('Error fetching inventory:', err);
        return;
      }

      try {
        // Log the fetched inventory for debugging
        console.log("Inventory fetched:", inventory);

        if (!inventory || inventory.length === 0) {
          throw new Error('No items found in the bot\'s inventory.');
        }

        // Calculate the split indices
        const totalItems = inventory.length;
        const winnerItemCount = Math.floor(totalItems * 0.9);
        const adminItemCount = totalItems - winnerItemCount;

        // Split the inventory
        const winnerItems = inventory.slice(0, winnerItemCount);
        const adminItems = inventory.slice(winnerItemCount);

        console.log(`Allocating ${winnerItems.length} items to Winner and ${adminItems.length} items to Admin.`);

        // Create Trade Offer for Winner
        const winnerOffer = manager.createOffer(winner.tradeUrl);
        winnerItems.forEach(item => {
          // Log item details
          console.log(`Processing item for Winner: ${item.name} (ID: ${item.assetid})`);

          // Ensure all required properties are present and item is tradable
          if (item.tradable && item.assetid && item.appid && item.contextid) {
            winnerOffer.addMyItem({
              assetid: item.assetid,
              appid: item.appid,
              contextid: item.contextid
            });
          } else {
            console.error(`Skipping item (Not tradable or missing parameters): ${JSON.stringify(item)}`);
          }
        });
        winnerOffer.setMessage('Congratulations! You have won the jackpot!');

        // Send Trade Offer to Winner
        console.log('Sending trade offer to Winner...');
        await sendTradeOffer(winnerOffer);
        console.log(`Trade offer sent to winner (${winner._id}) successfully.`);

        // Introduce a delay before sending the next offer to avoid rate limiting
        const delayBetweenOffers = 5000; // 5 seconds
        console.log(`Waiting for ${delayBetweenOffers / 1000} seconds before sending the Admin's trade offer...`);
        await delay(delayBetweenOffers);

        // Create Trade Offer for Admin
        const adminOffer = manager.createOffer(process.env.ADMIN_TRADE_URI_FOR_TEN_PERCENT);
        adminItems.forEach(item => {
          // Log item details
          console.log(`Processing item for Admin: ${item.name} (ID: ${item.assetid})`);

          // Ensure all required properties are present and item is tradable
          if (item.tradable && item.assetid && item.appid && item.contextid) {
            adminOffer.addMyItem({
              assetid: item.assetid,
              appid: item.appid,
              contextid: item.contextid
            });
          } else {
            console.error(`Skipping item (Not tradable or missing parameters): ${JSON.stringify(item)}`);
          }
        });
        adminOffer.setMessage('Admin: Allocated your share of the jackpot.');

        // Send Trade Offer to Admin
        console.log('Sending trade offer to Admin...');
        await sendTradeOffer(adminOffer);
        console.log(`Trade offer sent to Admin .`);

        console.log(`All trade offers sent successfully to Winner (${winner._id}) .`);

      } catch (innerError) {
        console.error('Error processing inventory and sending trade offers:', innerError);
      }
    });
  } catch (error) {
    console.error('Error transferring winnings:', error);
  }
};
// const transferWinnings = async (winner, winnerItems, adminItems) => {
//   try {
//     if (!winner.tradeUrl) {
//       throw new Error('Winner does not have a valid trade offer URL.');
//     }

//     // Fetch the bot's inventory contents
//     manager.getUserInventoryContents(manager.steamID, "252490", "2", false, async (err, inventory) => {
//       if (err) {
//         console.error('Error fetching inventory:', err);
//         return;
//       }

//       // Log the fetched inventory for debugging
//       console.log("Inventory:", inventory);

//       const winnerOffer = manager.createOffer(winner.tradeUrl);

//       // Iterate over the fetched inventory and add tradable items to the offer
//       inventory.forEach(item => {
//         // Log the properties of each item to verify
//         console.log(`Processing item: ${item.name} (ID: ${item.assetid})`);
//         console.log(`Properties - appid: ${item.appid}, contextid: ${item.contextid}, assetid: ${item.assetid}`);

//         // Ensure all required properties are present
//         if (item.tradable && item.assetid && item.appid && item.contextid) {
//           winnerOffer.addMyItem({
//             assetid: item.assetid,    // Access the asset ID
//             appid: item.appid,        // Access the App ID
//             contextid: item.contextid  // Access the context ID
//           });
//         } else {
//           console.error(`Item missing parameters or not tradable: ${JSON.stringify(item)}`);
//         }
//       });

//       winnerOffer.setMessage('Congratulations! You have won the jackpot!');

//       // Send the trade offer
//       await sendTradeOffer(winnerOffer);
//       console.log(`Trade offer sent to winner (${winner._id}) successfully.`);
//     });
//   } catch (error) {
//     console.error('Error transferring winnings:', error);
//   }
// };

/**
 * Ends the current jackpot round by selecting a winner based on weighted random selection.
 */
async function endRound() {
  try {
    // Retrieve the current jackpot in progress
    let jackpot = await Jackpot.findOne({ status: 'in_progress' })
      .populate('participants.user')
      .populate('participants.items');

    if (!jackpot) {
      console.log('No active jackpot to end.');
      return;
    }

    // Calculate each participant's total contribution
    const participantsWithValue = jackpot.participants.map(participant => {
      const totalContribution = participant.items.reduce((acc, item) => {
        const itemValue = parseFloat(item.price);
        return acc + (isNaN(itemValue) ? 0 : itemValue);
      }, 0);
      return {
        participant,
        totalContribution,
      };
    });

    // Calculate the overall total value
    const overallTotal = participantsWithValue.reduce((acc, p) => acc + p.totalContribution, 0);

    if (overallTotal === 0) {
      console.log('No valid contributions to determine a winner.');
      jackpot.status = 'completed';
      await jackpot.save();
      return;
    }

    // Select the winner based on weighted random selection
    const winnerParticipant = weightedRandomSelection(participantsWithValue, overallTotal);

    if (!winnerParticipant) {
      console.log('Failed to select a winner.');
      jackpot.status = 'completed';
      await jackpot.save();
      return;
    }

    // Distribute items between winner (90%) and admin/bot (10%)
    const totalItems = winnerParticipant.participant.items;
    const itemSplitIndex = Math.floor(totalItems.length * 0.9); // Keep 10% for bot/admin
    const winnerItems = totalItems.slice(0, itemSplitIndex);
    // const adminItems = totalItems.slice(itemSplitIndex);

    // Transfer 90% of items to winner, and keep 10% for the bot
    await transferWinnings(winnerParticipant.participant.user);

    // Update the jackpot with the winner
    jackpot.status = 'completed';
    jackpot.winner = winnerParticipant.participant.user._id;
    await jackpot.save();

    // Update all participants' statistics and game history
    for (const p of participantsWithValue) {
      const user = await User.findById(p.participant.user._id);
      if (!user) {
        console.error(`User with ID ${p.participant.user._id} not found.`);
        continue;
      }

      let deposited = user.deposited + p.totalContribution;
      let totalWon = user.totalWon;
      let profit = user.profit;

      let isWinner = false;
      let gameTotalWon = 0;
      let winningTrade = "";

      if (p.participant.user._id.toString() === winnerParticipant.participant.user._id.toString()) {
        totalWon += jackpot.totalValue;
        profit = totalWon - deposited;
        isWinner = true;
        gameTotalWon = jackpot.totalValue;

        // Add game history entry for the winner
        const gameHistoryEntryWinner = {
          jackpotId: jackpot._id,
          deposited: p.totalContribution,
          totalWon: jackpot.totalValue,
          profit: profit,
          chance: `${((p.totalContribution / overallTotal) * 100).toFixed(2)}%`,
          gamemode: "Classic", // Adjust as needed or fetch from jackpot details
          winningTrade: "Trade ID 123456", // Replace with actual trade ID or URL
          isWinner: true,
          timestamp: new Date(),
        };
        user.gameHistory.push(gameHistoryEntryWinner);
      } else {
        // For non-winners
        profit = profit - p.totalContribution; // Assuming they lose their contribution
        totalWon += 0; // No winnings

        // Add game history entry for the participant
        const gameHistoryEntryParticipant = {
          jackpotId: jackpot._id,
          deposited: p.totalContribution,
          totalWon: 0,
          profit: -p.totalContribution,
          chance: `${((p.totalContribution / overallTotal) * 100).toFixed(2)}%`,
          gamemode: "Classic", // Adjust as needed or fetch from jackpot details
          winningTrade: "", // No trade for non-winners
          isWinner: false,
          timestamp: new Date(),
        };
        user.gameHistory.push(gameHistoryEntryParticipant);
      }

      user.deposited = deposited;
      user.totalWon = totalWon;
      user.profit = profit;

      await user.save();
    }

    // Emit the 'spin' event to synchronize the wheel spin across all clients
    io.getIO().emit('spin', {
      winnerId: {
        id: winnerParticipant.participant.user._id,
        username: winnerParticipant.participant.user.username,
        items: winnerItems,
        totalValue: winnerParticipant.totalContribution,
        skinCount: winnerItems.length,
        img: winnerParticipant.participant.user.avatar.small || "/default-avatar.png",
        color: winnerParticipant.participant.color,
      },
      startTime: Date.now() + spinStartDelay, // Scheduled start time
      duration: spinDuration, // Spin duration in milliseconds
    });
    io.getIO().emit('newJackPot', {
      msg: 'success',
    });
    // Emit 'nextRound' event with the start time of the next round (10 seconds after spin ends)
    const nextRoundStartTime = Date.now() + spinDuration + timeBetweenRounds;
    io.getIO().emit('nextRound', { startTime: nextRoundStartTime });

    // Start a 10-second countdown for the next round and emit 'nextRoundTimer' every second
    let countdown = timeBetweenRounds / 1000; // 10 seconds
    let newJackpot;

    const countdownInterval = setInterval(async() => {
      countdown -= 1;
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        io.getIO().emit('nextRoundTimer', { timeLeft: 0 });
        io.getIO().emit('newRoundStarted'); // Inform clients that a new round has started
        newJackpot = new Jackpot({ status: 'waiting', totalValue: 0, participants: [] });
        await newJackpot.save();

      } else {
        io.getIO().emit('nextRoundTimer', { timeLeft: countdown });
      }
      
    }, 1000);



  } catch (error) {
    console.error('Error ending round:', error);
  }
}

module.exports = {
  startRoundTimer,
  getTimeLeft,
  endRound,
};














// ------------------------------------------------------
// const Jackpot = require('./models/jackpotSchema');
// const io = require('./socket');
// const weightedRandomSelection = require('./utils/weightedRandomSelection');
// const { manager } = require('./steamTradeBot'); // Import Steam trade bot manager
// const User = require('./models/userSchema');

// /**
//  * Timer settings
//  */
// let roundDuration = 10; // in seconds (adjust as needed)
// let roundStartTime = null;
// let timerInterval = null;

// /**
//  * Spin settings
//  */
// const spinDuration = 5000; // Spin duration in milliseconds (e.g., 5 seconds)
// const spinStartDelay = 1000; // Delay before spin starts in milliseconds (e.g., 1 second)

// /**
//  * Calculates the time left in the current round.
//  * @returns {number} Time left in seconds.
//  */
// function getTimeLeft() {
//   if (!roundStartTime) return roundDuration;
//   const elapsed = Math.floor((Date.now() - roundStartTime) / 1000);
//   return Math.max(roundDuration - elapsed, 0);
// }

// /**
//  * Starts the round timer.
//  */
// function startRoundTimer() {
//   if (timerInterval) {
//     clearInterval(timerInterval);
//   }

//   roundStartTime = Date.now();

//   io.getIO().emit('timer', { timeLeft: roundDuration });

//   timerInterval = setInterval(async () => {
//     const timeLeft = getTimeLeft();
//     io.getIO().emit('timer', { timeLeft });

//     if (timeLeft <= 0) {
//       clearInterval(timerInterval);
//       roundStartTime = null;
//       timerInterval = null;
//       // End the round
//       await endRound();
//     }
//   }, 1000);
// }

// /**
//  * Send trade offer with Promises
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
//  * Transfer items based on winner distribution (90% to the winner, 10% kept in the bot)
//  */
// const transferWinnings = async (winner, winnerItems, adminItems) => {
//   try {
//     if (!winner.tradeUrl) {
//       throw new Error('Winner does not have a valid trade offer URL.');
//     }

//     // Fetch the bot's inventory contents
//     manager.getUserInventoryContents(manager.steamID, "252490", "2", false, async (err, inventory) => {
//       if (err) {
//         console.error('Error fetching inventory:', err);
//         return;
//       }

//       // Log the fetched inventory for debugging
//       console.log("Inventory:", inventory);

//       const winnerOffer = manager.createOffer(winner.tradeUrl);

//       // Iterate over the fetched inventory and add tradable items to the offer
//       inventory.forEach(item => {
//         // Log the properties of each item to verify
//         console.log(`Processing item: ${item.name} (ID: ${item.assetid})`);
//         console.log(`Properties - appid: ${item.appid}, contextid: ${item.contextid}, assetid: ${item.assetid}`);

//         // Ensure all required properties are present
//         if (item.tradable && item.assetid && item.appid && item.contextid) {
//           winnerOffer.addMyItem({
//             assetid: item.assetid,    // Access the asset ID
//             appid: item.appid,        // Access the App ID
//             contextid: item.contextid  // Access the context ID
//           });
//         } else {
//           console.error(`Item missing parameters or not tradable: ${JSON.stringify(item)}`);
//         }
//       });

//       winnerOffer.setMessage('Congratulations! You have won the jackpot!');

//       // Send the trade offer
//       await sendTradeOffer(winnerOffer);
//       console.log(`Trade offer sent to winner (${winner._id}) successfully.`);
//     });
//   } catch (error) {
//     console.error('Error transferring winnings:', error);
//   }
// };

// /**
//  * Ends the current jackpot round by selecting a winner based on weighted random selection.
//  */
// // async function endRound() {
// //   try {
// //     // Retrieve the current jackpot in progress
// //     let jackpot = await Jackpot.findOne({ status: 'in_progress' })
// //       .populate('participants.user')
// //       .populate('participants.items');

// //     if (!jackpot) {
// //       console.log('No active jackpot to end.');
// //       return;
// //     }

// //     // Calculate each participant's total contribution
// //     const participantsWithValue = jackpot.participants.map(participant => {
// //       const totalContribution = participant.items.reduce((acc, item) => {
// //         const itemValue = parseFloat(item.price);
// //         return acc + (isNaN(itemValue) ? 0 : itemValue);
// //       }, 0);
// //       return {
// //         participant,
// //         totalContribution,
// //       };
// //     });

// //     // Calculate the overall total value
// //     const overallTotal = participantsWithValue.reduce((acc, p) => acc + p.totalContribution, 0);

// //     if (overallTotal === 0) {
// //       console.log('No valid contributions to determine a winner.');
// //       jackpot.status = 'completed';
// //       await jackpot.save();
// //       return;
// //     }

// //     // Select the winner based on weighted random selection
// //     const winnerParticipant = weightedRandomSelection(participantsWithValue, overallTotal);

// //     if (!winnerParticipant) {
// //       console.log('Failed to select a winner.');
// //       jackpot.status = 'completed';
// //       await jackpot.save();
// //       return;
// //     }

// //     // Distribute items between winner (90%) and admin/bot (10%)
// //     const totalItems = winnerParticipant.participant.items;
// //     const itemSplitIndex = Math.floor(totalItems.length * 0.9); // Keep 10% for bot/admin
// //     const winnerItems = totalItems.slice(0, itemSplitIndex);
// //     const adminItems = totalItems.slice(itemSplitIndex);
    
// //     // Transfer 90% of items to winner, and keep 10% for the bot
// //     // await transferWinnings(winnerParticipant.participant.user, winnerItems, adminItems);

// //     // Update the jackpot with the winner
// //     jackpot.status = 'completed';
// //     jackpot.winner = winnerParticipant.participant.user._id;
// //     await jackpot.save();

// //     const user = await User.findById(winnerParticipant.participant.user._id);
// //     if (!user) return res.status(404).json({ error: 'User not found' });
// //     let deposited = user.deposited + winnerParticipant.totalContribution;
// //     let totalWon = user.totalWon + jackpot.totalValue;
// //     let profit = deposited - totalWon
// //     if (totalWon > deposited) {
// //       profit = -profit
// //     }
// //     user.deposited = deposited
// //     user.totalWon = totalWon
// //     user.profit = profit
// //     await user.save();

// //     // Emit the round result to all clients
// //     io.getIO().emit('roundResult', {
// //       winner: {
// //         id: winnerParticipant.participant.user._id,
// //         username: winnerParticipant.participant.user.username,
// //         items: winnerItems,
// //         totalValue: winnerParticipant.totalContribution,
// //         skinCount: winnerItems.length,
// //         img: winnerParticipant.participant.user.avatar.small || "/default-avatar.png",
// //         color: winnerParticipant.participant.color,
// //       },
// //     });

// //     // Emit the 'spin' event to synchronize the wheel spin across all clients
// //     io.getIO().emit('spin', {
// //       winnerId: {
// //         id: winnerParticipant.participant.user._id,
// //         username: winnerParticipant.participant.user.username,
// //         items: winnerItems,
// //         totalValue: winnerParticipant.totalContribution,
// //         skinCount: winnerItems.length,
// //         img: winnerParticipant.participant.user.avatar.small || "/default-avatar.png",
// //         color: winnerParticipant.participant.color,
// //       },
// //       startTime: Date.now() + spinStartDelay,
// //       duration: spinDuration,
// //     });

// //     io.getIO().emit('updatedJackPot', {
// //       msg: 'success',
// //     });

// //     // Start a new jackpot round
// //     const newJackpot = new Jackpot({ status: 'waiting', totalValue: 0, participants: [] });
// //     await newJackpot.save();

// //   } catch (error) {
// //     console.error('Error ending round:', error);
// //   }
// // }


// async function endRound() {
//   try {
//     // Retrieve the current jackpot in progress
//     let jackpot = await Jackpot.findOne({ status: 'in_progress' })
//       .populate('participants.user')
//       .populate('participants.items');

//     if (!jackpot) {
//       console.log('No active jackpot to end.');
//       return;
//     }

//     // Calculate each participant's total contribution
//     const participantsWithValue = jackpot.participants.map(participant => {
//       const totalContribution = participant.items.reduce((acc, item) => {
//         const itemValue = parseFloat(item.price);
//         return acc + (isNaN(itemValue) ? 0 : itemValue);
//       }, 0);
//       return {
//         participant,
//         totalContribution,
//       };
//     });

//     // Calculate the overall total value
//     const overallTotal = participantsWithValue.reduce((acc, p) => acc + p.totalContribution, 0);

//     if (overallTotal === 0) {
//       console.log('No valid contributions to determine a winner.');
//       jackpot.status = 'completed';
//       await jackpot.save();
//       return;
//     }

//     // Select the winner based on weighted random selection
//     const winnerParticipant = weightedRandomSelection(participantsWithValue, overallTotal);

//     if (!winnerParticipant) {
//       console.log('Failed to select a winner.');
//       jackpot.status = 'completed';
//       await jackpot.save();
//       return;
//     }

//     // Distribute items between winner (90%) and admin/bot (10%)
//     const totalItems = winnerParticipant.participant.items;
//     const itemSplitIndex = Math.floor(totalItems.length * 0.9); // Keep 10% for bot/admin
//     const winnerItems = totalItems.slice(0, itemSplitIndex);
//     const adminItems = totalItems.slice(itemSplitIndex);

//     // Transfer 90% of items to winner, and keep 10% for the bot
//     // await transferWinnings(winnerParticipant.participant.user, winnerItems, adminItems);

//     // Update the jackpot with the winner
//     jackpot.status = 'completed';
//     jackpot.winner = winnerParticipant.participant.user._id;
//     await jackpot.save();

//     const user = await User.findById(winnerParticipant.participant.user._id);
//     if (!user) {
//       console.error('Winner user not found.');
//       return;
//     }

//     let deposited = user.deposited + winnerParticipant.totalContribution;
//     let totalWon = user.totalWon + jackpot.totalValue;
//     let profit = deposited - totalWon;
//     if (totalWon > deposited) {
//       profit = -profit;
//     }
//     user.deposited = deposited;
//     user.totalWon = totalWon;
//     user.profit = profit;

//     // Add game history entry
//     const gameHistoryEntry = {
//       jackpotId: jackpot._id,
//       deposited: winnerParticipant.totalContribution,
//       totalWon: jackpot.totalValue,
//       profit: profit,
//       chance: `${((winnerParticipant.totalContribution / overallTotal) * 100).toFixed(2)}%`,
//       gamemode: "Classic", // Adjust as needed or fetch from jackpot details
//       winningTrade: "Trade ID 123456", // Replace with actual trade ID or URL
//       timestamp: new Date(),
//     };
//     user.gameHistory.push(gameHistoryEntry);

//     await user.save();

//     // Emit the round result to all clients
//     io.getIO().emit('roundResult', {
//       winner: {
//         id: winnerParticipant.participant.user._id,
//         username: winnerParticipant.participant.user.username,
//         items: winnerItems,
//         totalValue: winnerParticipant.totalContribution,
//         skinCount: winnerItems.length,
//         img: winnerParticipant.participant.user.avatar.small || "/default-avatar.png",
//         color: winnerParticipant.participant.color,
//       },
//     });

//     // Emit the 'spin' event to synchronize the wheel spin across all clients
//     io.getIO().emit('spin', {
//       winnerId: {
//         id: winnerParticipant.participant.user._id,
//         username: winnerParticipant.participant.user.username,
//         items: winnerItems,
//         totalValue: winnerParticipant.totalContribution,
//         skinCount: winnerItems.length,
//         img: winnerParticipant.participant.user.avatar.small || "/default-avatar.png",
//         color: winnerParticipant.participant.color,
//       },
//       startTime: Date.now() + spinStartDelay,
//       duration: spinDuration,
//     });

//     io.getIO().emit('updatedJackPot', {
//       msg: 'success',
//     });

//     // Start a new jackpot round
//     const newJackpot = new Jackpot({ status: 'waiting', totalValue: 0, participants: [] });
//     await newJackpot.save();

//   } catch (error) {
//     console.error('Error ending round:', error);
//   }
// }


// module.exports = {
//   startRoundTimer,
//   getTimeLeft,
//   endRound,
// };




// --------------------------------------------------------------------------------------------------
// const Jackpot = require('./models/jackpotSchema');
// const io = require('./socket');
// const weightedRandomSelection = require('./utils/weightedRandomSelection');
// const { manager } = require('./steamTradeBot'); // Import Steam trade bot manager

// /**
//  * Timer settings
//  */
// let roundDuration = 60; // in seconds (adjust as needed)
// let roundStartTime = null;
// let timerInterval = null;

// /**
//  * Spin settings
//  */
// const spinDuration = 5000; // Spin duration in milliseconds (e.g., 5 seconds)
// const spinStartDelay = 1000; // Delay before spin starts in milliseconds (e.g., 1 second)

// /**
//  * Calculates the time left in the current round.
//  * @returns {number} Time left in seconds.
//  */
// function getTimeLeft() {
//   if (!roundStartTime) return roundDuration;
//   const elapsed = Math.floor((Date.now() - roundStartTime) / 1000);
//   return Math.max(roundDuration - elapsed, 0);
// }

// /**
//  * Starts the round timer.
//  */
// function startRoundTimer() {
//   if (timerInterval) {
//     clearInterval(timerInterval);
//   }

//   roundStartTime = Date.now();

//   io.getIO().emit('timer', { timeLeft: roundDuration });

//   timerInterval = setInterval(async () => {
//     const timeLeft = getTimeLeft();
//     io.getIO().emit('timer', { timeLeft });

//     if (timeLeft <= 0) {
//       clearInterval(timerInterval);
//       roundStartTime = null;
//       timerInterval = null;
//       // End the round
//       await endRound();
//     }
//   }, 1000);
// }

// /**
//  * Send trade offer with Promises
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
//  * Transfer items based on winner distribution
//  */
// const transferWinnings = async (winner, winnerItems, adminItems) => {
//   try {
//     if (!winner.tradeOfferUrl) {
//       throw new Error('Winner does not have a valid trade offer URL.');
//     }

//     // Create a trade offer for the winner
//     const winnerOffer = manager.createOffer(winner.tradeOfferUrl);
//     winnerItems.forEach(item => {
//       winnerOffer.addMyItem({
//         assetid: item.assetId,
//         appid: item.appId,
//         contextid: '2'
//       });
//     });
//     winnerOffer.setMessage('Congratulations! You have won the jackpot!');
//     await sendTradeOffer(winnerOffer);

//     // Admin trade
//     const adminSteamTradeUrl = process.env.ADMIN_TRADE_URL; // Admin trade URL
//     if (!adminSteamTradeUrl) {
//       throw new Error('Admin trade offer URL is not set.');
//     }
//     const adminOffer = manager.createOffer(adminSteamTradeUrl);
//     adminItems.forEach(item => {
//       adminOffer.addMyItem({
//         assetid: item.assetId,
//         appid: item.appId,
//         contextid: '2'
//       });
//     });
//     adminOffer.setMessage('Admin commission from the jackpot.');
//     await sendTradeOffer(adminOffer);

//     console.log(`Trade offers sent successfully: Winner (${winner._id}) and Admin`);
//   } catch (error) {
//     console.error('Error transferring winnings:', error);
//   }
// };

// /**
//  * Ends the current jackpot round by selecting a winner based on weighted random selection.
//  */
// async function endRound() {
//   try {
//     // Retrieve the current jackpot in progress
//     let jackpot = await Jackpot.findOne({ status: 'in_progress' })
//       .populate('participants.user')
//       .populate('participants.items');

//     if (!jackpot) {
//       console.log('No active jackpot to end.');
//       return;
//     }

//     // Calculate each participant's total contribution
//     const participantsWithValue = jackpot.participants.map(participant => {
//       const totalContribution = participant.items.reduce((acc, item) => {
//         const itemValue = parseFloat(item.price);
//         return acc + (isNaN(itemValue) ? 0 : itemValue);
//       }, 0);
//       return {
//         participant,
//         totalContribution,
//       };
//     });

//     // Calculate the overall total value
//     const overallTotal = participantsWithValue.reduce((acc, p) => acc + p.totalContribution, 0);

//     if (overallTotal === 0) {
//       console.log('No valid contributions to determine a winner.');
//       jackpot.status = 'completed';
//       await jackpot.save();
//       return;
//     }

//     // Select the winner based on weighted random selection
//     const winnerParticipant = weightedRandomSelection(participantsWithValue, overallTotal);

//     if (!winnerParticipant) {
//       console.log('Failed to select a winner.');
//       jackpot.status = 'completed';
//       await jackpot.save();
//       return;
//     }

//     // Distribute items between winner (90%) and admin (10%)
//     const totalItems = winnerParticipant.participant.items;
//     const itemSplitIndex = Math.ceil(totalItems.length * 0.9);
//     const winnerItems = totalItems.slice(0, itemSplitIndex);
//     const adminItems = totalItems.slice(itemSplitIndex);

//     // Transfer items to winner and admin
//     await transferWinnings(winnerParticipant.participant.user, winnerItems, adminItems);

//     // Update the jackpot with the winner
//     jackpot.status = 'completed';
//     jackpot.winner = winnerParticipant.participant.user._id;
//     await jackpot.save();

//     // Emit the round result to all clients
//     io.getIO().emit('roundResult', {
//       winner: {
//         id: winnerParticipant.participant.user._id,
//         username: winnerParticipant.participant.user.username,
//         items: winnerItems,
//         totalValue: winnerParticipant.totalContribution,
//         skinCount: winnerItems.length,
//         img: winnerParticipant.participant.user.avatar.small || "/default-avatar.png",
//         color: winnerParticipant.participant.color,
//       },
//     });

//     // Emit the 'spin' event to synchronize the wheel spin across all clients
//     io.getIO().emit('spin', {
//       winnerId: {
//         id: winnerParticipant.participant.user._id,
//         username: winnerParticipant.participant.user.username,
//         items: winnerItems,
//         totalValue: winnerParticipant.totalContribution,
//         skinCount: winnerItems.length,
//         img: winnerParticipant.participant.user.avatar.small || "/default-avatar.png",
//         color: winnerParticipant.participant.color,
//       },
//       startTime: Date.now() + spinStartDelay,
//       duration: spinDuration,
//     });

//     io.getIO().emit('updatedJackPot', {
//       msg: 'success',
//     });

//     // Start a new jackpot round
//     const newJackpot = new Jackpot({ status: 'waiting', totalValue: 0, participants: [] });
//     await newJackpot.save();

//   } catch (error) {
//     console.error('Error ending round:', error);
//   }
// }

// module.exports = {
//   startRoundTimer,
//   getTimeLeft,
//   endRound,
// };


































// // jackpotManager.js

// const Jackpot = require('./models/jackpotSchema');
// const io = require('./socket');
// const weightedRandomSelection = require('./utils/weightedRandomSelection'); // New utility function

// /**
//  * Timer settings
//  */
// let roundDuration = 60; // in seconds (adjust as needed)
// let roundStartTime = null;
// let timerInterval = null;

// /**
//  * Spin settings
//  */
// const spinDuration = 5000; // Spin duration in milliseconds (e.g., 5 seconds)
// const spinStartDelay = 1000; // Delay before spin starts in milliseconds (e.g., 1 second)

// /**
//  * Calculates the time left in the current round.
//  * @returns {number} Time left in seconds.
//  */
// function getTimeLeft() {
//   if (!roundStartTime) return roundDuration;
//   const elapsed = Math.floor((Date.now() - roundStartTime) / 1000);
//   return Math.max(roundDuration - elapsed, 0);
// }

// /**
//  * Starts the round timer.
//  */
// function startRoundTimer() {
//   if (timerInterval) {
//     clearInterval(timerInterval);
//   }

//   roundStartTime = Date.now();

//   io.getIO().emit('timer', { timeLeft: roundDuration });

//   timerInterval = setInterval(async () => {
//     const timeLeft = getTimeLeft();
//     io.getIO().emit('timer', { timeLeft });

//     if (timeLeft <= 0) {
//       clearInterval(timerInterval);
//       roundStartTime = null;
//       timerInterval = null;
//       // End the round
//       await endRound();
//     }
//   }, 1000);
// }

// /**
//  * Ends the current jackpot round by selecting a winner based on weighted random selection.
//  */
// async function endRound() {
//   try {
//     // Retrieve the current jackpot in progress
//     let jackpot = await Jackpot.findOne({ status: 'in_progress' })
//       .populate('participants.user')
//       .populate('participants.items');

//     if (!jackpot) {
//       console.log('No active jackpot to end.');
//       return;
//     }

//     // Calculate each participant's total contribution
//     const participantsWithValue = jackpot.participants.map(participant => {
//       const totalContribution = participant.items.reduce((acc, item) => {
//         const itemValue = parseFloat(item.price);
//         return acc + (isNaN(itemValue) ? 0 : itemValue);
//       }, 0);
//       return {
//         participant,
//         totalContribution,
//       };
//     });

//     // Calculate the overall total value
//     const overallTotal = participantsWithValue.reduce((acc, p) => acc + p.totalContribution, 0);

//     if (overallTotal === 0) {
//       console.log('No valid contributions to determine a winner.');
//       jackpot.status = 'completed';
//       await jackpot.save();
//       return;
//     }

//     // Select the winner based on weighted random selection
//     const winnerParticipant = weightedRandomSelection(participantsWithValue, overallTotal);

//     if (!winnerParticipant) {
//       console.log('Failed to select a winner.');
//       jackpot.status = 'completed';
//       await jackpot.save();
//       return;
//     }

//     // Update the jackpot with the winner
//     console.log("Winner Selected:", winnerParticipant);

//     jackpot.status = 'completed';
//     jackpot.winner = winnerParticipant.participant.user._id;
//     await jackpot.save();

//     // Emit the round result to all clients
//     io.getIO().emit('roundResult', {
//       winner: {
//         id: winnerParticipant.participant.user._id,
//         username: winnerParticipant.participant.user.username,
//         items: winnerParticipant.participant.items,
//         totalValue: winnerParticipant.totalContribution,
//         skinCount: winnerParticipant.participant.items.length,
//         img: winnerParticipant.participant.user.avatar.small || "/default-avatar.png",
//         color: winnerParticipant.participant.color, // Ensure color is included
//       },
//     });

//     // **New Addition:** Emit the 'spin' event to synchronize the wheel spin across all clients
//     io.getIO().emit('spin', {
//       winnerId: {
//         id: winnerParticipant.participant.user._id,
//         username: winnerParticipant.participant.user.username,
//         items: winnerParticipant.participant.items,
//         totalValue: winnerParticipant.totalContribution,
//         skinCount: winnerParticipant.participant.items.length,
//         img: winnerParticipant.participant.user.avatar.small || "/default-avatar.png",
//         color: winnerParticipant.participant.color, // Ensure color is included
//       },
//       startTime: Date.now() + spinStartDelay, // Start spin after a short delay
//       duration: spinDuration, // Duration of the spin in milliseconds
//     });

//     // Notify clients that the jackpot has been updated
//     io.getIO().emit('updatedJackPot', {
//       msg: 'success',
//     });

//     // Start a new jackpot round
//     const newJackpot = new Jackpot({ status: 'waiting', totalValue: 0, participants: [] });
//     await newJackpot.save();

//     // Optionally, start the next round timer if your logic requires it
//     // startRoundTimer();
//   } catch (error) {
//     console.error('Error ending round:', error);
//   }
// }

// module.exports = {
//   startRoundTimer,
//   getTimeLeft,
//   endRound,
// };



// // jackpotManager.js

// const Jackpot = require('./models/jackpotSchema');
// const io = require('./socket');

// let roundDuration = 5; // in seconds
// let roundStartTime = null;
// let timerInterval = null;

// function getTimeLeft() {
//   if (!roundStartTime) return roundDuration;
//   const elapsed = Math.floor((Date.now() - roundStartTime) / 1000);
//   return Math.max(roundDuration - elapsed, 0);
// }

// function startRoundTimer() {
//   if (timerInterval) {
//     clearInterval(timerInterval);
//   }

//   roundStartTime = Date.now();

//   io.getIO().emit('timer', { timeLeft: roundDuration });

//   timerInterval = setInterval(async () => {
//     const timeLeft = getTimeLeft();
//     io.getIO().emit('timer', { timeLeft });

//     if (timeLeft <= 0) {
//       clearInterval(timerInterval);
//       roundStartTime = null;
//       timerInterval = null;
//       // End the round
//       await endRound();
//     }
//   }, 1000);
// }

// async function endRound() {
//   try {
//     // Get the current jackpot
//     let jackpot = await Jackpot.findOne({ status: 'in_progress' })
//       .populate('participants.user')
//       .populate('participants.items');

//     if (!jackpot) {
//       console.log('No active jackpot to end.');
//       return;
//     }

//     // Generate wheel items based on participants' contributions
//     const wheelItems = generateWheelItems(jackpot.participants);

//     // Randomly select the winner based on the wheel items
//     const winnerIndex = Math.floor(Math.random() * wheelItems.length);
//     const winnerParticipant = wheelItems[winnerIndex];

//     // Update jackpot with winner
//     jackpot.status = 'completed';
//     jackpot.winner = winnerParticipant.user._id;
//     await jackpot.save();

    
//     // Emit the round result to all clients
//     io.getIO().emit('roundResult', {
//       winnerIndex,
//       winnerParticipant,
//     });

//     setInterval(()=>{
//       io.getIO().emit('updatedJackPot',{
//         msg:'success'
//       })
//     },7000)

//     // Start a new jackpot
//     const newJackpot = new Jackpot({ status: 'waiting', totalValue: 0, participants: [] });
//     await newJackpot.save();
//   } catch (error) {
//     console.error('Error ending round:', error);
//   }
// }

// function generateWheelItems(participants) {
//   let totalValue = participants.reduce((acc, p) => {
//     const participantValue = p.items.reduce((itemAcc, item) => {
//       return itemAcc + parseFloat(item.price);
//     }, 0);
//     return acc + participantValue;
//   }, 0);

//   let wheelItems = participants.flatMap((participant) => {
//     const participantValue = participant.items.reduce((itemAcc, item) => {
//       return itemAcc + parseFloat(item.price);
//     }, 0);
//     const scaledSlots = Math.round((participantValue / totalValue) * 100);
//     return Array(scaledSlots).fill(participant);
//   });

//   // Shuffle the wheel items
//   // wheelItems = shuffleArray(wheelItems);

//   return wheelItems;
// }

// // function shuffleArray(array) {
// //   let currentIndex = array.length,
// //     randomIndex;
// //   while (currentIndex !== 0) {
// //     randomIndex = Math.floor(Math.random() * currentIndex);
// //     currentIndex--;
// //     // Swap elements
// //     [array[currentIndex], array[randomIndex]] = [
// //       array[randomIndex],
// //       array[currentIndex],
// //     ];
// //   }
// //   return array;
// // }

// module.exports = {
//   startRoundTimer,
//   getTimeLeft,
//   endRound,
// };
