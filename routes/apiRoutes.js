// routes/apiRoutes.js

const express = require('express');
const User = require('../models/userSchema');
const Item = require('../models/itemSchema');
const { getInventory } = require('../utils/getInventory');
const isAuth = require('../middleware/isAuth');

const router = express.Router();

// Protected user route
router.get('/user', isAuth, async (req, res) => {
  const user = await User.findOne({ steamId: req.user.id });

  if (!user) return res.status(404).json({ message: 'User not found' });

  // Respond with user data
  res.json({ steamID64: user.steamId, username: user.username, avatar: user.avatar });
});

// Protected inventory route
router.get('/inventory', isAuth, async (req, res) => {
  console.log(req.user.id);
  try {
    const steamID64 = req.user.id;
    const appId = 252490;
    const contextId = 2;

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

    // Return the updated user's inventory
    const userInventory = await User.findOne({ steamId: steamID64 }).populate('inventory');
    res.json({ items: userInventory.inventory });

  } catch (error) {
    console.error("Error in /api/inventory:", error);
    res.status(500).json({ error: error.message });
  }
});

// router.get('/inventory', isAuth, async (req, res) => {
//   try {
//     const steamID64 = req.user.id;
//     const appId = 252490;
//     const contextId = 2;
    

//     if (!steamID64) {
//       return res.status(400).json({ error: 'Missing SteamID64 parameter.' });
//     }

//     // Fetch the inventory from the external source
//     const inventory = await getInventory(appId, steamID64, contextId);
//     if (!inventory || !inventory.items || inventory.items.length === 0) {
//       return res.status(404).json({ error: 'No inventory found.' });
//     }

//     // Find the user in the database
//     const user = await User.findOne({ steamId: steamID64 }).populate('inventory');
//     if (!user) {
//       return res.status(404).json({ error: 'User not found.' });
//     }

//     // Extract assetIds from the fetched inventory
//     const fetchedAssetIds = new Set(
//       inventory.items.flatMap(item => item.assetIds)
//     );

//     // Extract assetIds from the existing inventory
//     const existingAssetIds = new Set(
//       user.inventory.map(item => item.assetId.toString())
//     );

//     // Compare the two sets to determine if there's any change
//     const isSame =
//       fetchedAssetIds.size === existingAssetIds.size &&
//       [...fetchedAssetIds].every(assetId => existingAssetIds.has(assetId));

//     if (isSame) {
//       // No changes in inventory, return the existing inventory
//       return res.json({ items: user.inventory });
//     }

//     // If there are changes, proceed to update the inventory

//     // Step 1: Delete all existing items associated with the user
//     await Item.deleteMany({ owner: user._id, appId, contextId });

//     // Step 2: Prepare new items to insert
//     const newItems = [];
//     const uniqueAssetIds = new Set(); // To ensure uniqueness

//     inventory.items.forEach(item => {
//       // Extract the numeric part from the price string
//       const priceString = item.price;
//       const priceMatch = priceString.match(/\d+(\.\d+)?/);
//       const price = priceMatch ? parseFloat(priceMatch[0]) : 0;

//       item.assetIds.forEach(assetId => {
//         if (!uniqueAssetIds.has(assetId)) {
//           uniqueAssetIds.add(assetId);
//           // Prepare the new item object
//           const newItem = {
//             name: item.market_hash_name,
//             iconUrl: item.icon_url,
//             price: price, // Save the numeric value
//             owner: user._id,
//             assetId,
//             appId,
//             contextId
//           };
//           newItems.push(newItem);
//         }
//       });
//     });

//     // Step 3: Bulk insert new items if there are any
//     let insertedItems = [];
//     if (newItems.length > 0) {
//       insertedItems = await Item.insertMany(newItems);
//     }

//     // Step 4: Update the user's inventory with the new item IDs
//     const newInventoryItemIds = insertedItems.map(item => item._id);
//     user.inventory = newInventoryItemIds; // Replace existing inventory
//     await user.save();

//     // Optionally, populate the inventory for the response
//     const populatedUser = await User.findOne({ steamId: steamID64 }).populate('inventory');

//     res.json({ items: populatedUser.inventory });

//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

module.exports = router;
