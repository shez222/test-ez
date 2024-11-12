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



router.get('/inventory', isAuth, async (req, res) => {
  console.log(req.user.id);
  try {
    const steamID64 = req.user.id;
    const appId = 252490;
    const contextId = 2;

    if (!steamID64) {
      return res.status(400).json({ error: 'Missing SteamID64 parameter.' });
    }

    // Fetch the inventory from Steam
    const inventory = await getInventory(appId, steamID64, contextId);
    if (!inventory || !inventory.items || inventory.items.length === 0) {
      return res.status(404).json({ error: 'No inventory found.' });
    }

    // Find the user in the database
    const user = await User.findOne({ steamId: steamID64 });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Collect assetIds from Steam inventory
    const steamAssetIds = new Set(
      inventory.items.flatMap(item => item.assetIds)
    );

    // Fetch all items in the database for this user
    const dbItems = await Item.find({ owner: user._id, appId, contextId });

    // Create a Set of assetIds in the database
    const dbAssetIds = new Set(dbItems.map(item => item.assetId));

    // Determine assetIds to remove (in db but not in Steam)
    const assetIdsToRemove = [...dbAssetIds].filter(
      assetId => !steamAssetIds.has(assetId)
    );

    // Remove items from Item collection
    if (assetIdsToRemove.length > 0) {
      await Item.deleteMany({
        owner: user._id,
        assetId: { $in: assetIdsToRemove },
      });
    }

    // Remove items from user's inventory
    user.inventory = user.inventory.filter(itemId => {
      const item = dbItems.find(dbItem => dbItem._id.equals(itemId));
      return item && steamAssetIds.has(item.assetId);
    });

    // Determine new assetIds (in Steam but not in db)
    const newAssetIds = [...steamAssetIds].filter(
      assetId => !dbAssetIds.has(assetId)
    );

    // Prepare new items to insert
    const newItems = [];

    // Process each inventory item
    inventory.items.forEach(item => {
      // Extract the numeric part from the price string
      const priceString = item.price;
      const priceMatch = priceString.match(/\d+(\.\d+)?/);
      const price = priceMatch ? parseFloat(priceMatch[0]) : 0;

      // For each assetId in item.assetIds
      item.assetIds.forEach(assetId => {
        if (newAssetIds.includes(assetId)) {
          const newItem = {
            name: item.market_hash_name,
            iconUrl: item.icon_url,
            price: `${price} USD`, // Save the numeric value
            owner: user._id,
            assetId,
            appId,
            contextId,
          };
          newItems.push(newItem);
        }
      });
    });

    // Bulk insert new items and update user's inventory
    if (newItems.length > 0) {
      const insertedItems = await Item.insertMany(newItems);
      user.inventory.push(...insertedItems.map(item => item._id));
    }

    // Save user after updating inventory
    await user.save();

    // Return the updated user's inventory
    const userInventory = await User.findOne({ steamId: steamID64 }).populate(
      'inventory'
    );
    res.json({ items: userInventory.inventory });
  } catch (error) {
    console.error('Error in /api/inventory:', error);
    res.status(500).json({ error: error.message });
  }
});

//remove item from user inventory but not remove it from items
// router.get('/inventory', isAuth, async (req, res) => {
//   console.log(req.user.id);
//   try {
//     const steamID64 = req.user.id;
//     const appId = 252490;
//     const contextId = 2;

//     if (!steamID64) {
//       return res.status(400).json({ error: 'Missing SteamID64 parameter.' });
//     }

//     // Fetch the inventory from Steam
//     const inventory = await getInventory(appId, steamID64, contextId);
//     if (!inventory || !inventory.items || inventory.items.length === 0) {
//       return res.status(404).json({ error: 'No inventory found.' });
//     }

//     // Find the user in the database and populate the inventory
//     const user = await User.findOne({ steamId: steamID64 }).populate('inventory');
//     if (!user) {
//       return res.status(404).json({ error: 'User not found.' });
//     }

//     // Collect assetIds from Steam inventory
//     const steamAssetIds = new Set(
//       inventory.items.flatMap(item => item.assetIds)
//     );

//     // Fetch all items in the database for this user
//     const dbItems = await Item.find({ owner: user._id, appId, contextId });

//     // Create a Map of assetId to Item
//     const dbItemsMap = new Map(dbItems.map(item => [item.assetId, item]));

//     // Determine assetIds to remove (in db but not in Steam)
//     const assetIdsToRemove = [...dbItemsMap.keys()].filter(
//       assetId => !steamAssetIds.has(assetId)
//     );

//     // Remove items from user's inventory
//     user.inventory = user.inventory.filter(item => {
//       // Ensure item is populated
//       const itemAssetId = item.assetId || (await Item.findById(item)).assetId;
//       return steamAssetIds.has(itemAssetId);
//     });

//     // Determine new assetIds (in Steam but not in db)
//     const newAssetIds = [...steamAssetIds].filter(
//       assetId => !dbItemsMap.has(assetId)
//     );

//     // Prepare new items to insert
//     const newItems = [];

//     // Process each inventory item
//     inventory.items.forEach(item => {
//       // Extract the numeric part from the price string
//       const priceString = item.price;
//       const priceMatch = priceString.match(/\d+(\.\d+)?/);
//       const price = priceMatch ? parseFloat(priceMatch[0]) : 0;

//       // For each assetId in item.assetIds
//       item.assetIds.forEach(assetId => {
//         if (newAssetIds.includes(assetId)) {
//           const newItem = {
//             name: item.market_hash_name,
//             iconUrl: item.icon_url,
//             price: `${price} USD`, // Save the numeric value
//             owner: user._id,
//             assetId,
//             appId,
//             contextId,
//           };
//           newItems.push(newItem);
//         }
//       });
//     });

//     // Bulk insert new items and update user's inventory
//     if (newItems.length > 0) {
//       const insertedItems = await Item.insertMany(newItems);
//       user.inventory.push(...insertedItems.map(item => item._id));
//     }

//     // Save user after updating inventory
//     await user.save();

//     // Return the updated user's inventory
//     const userInventory = await User.findOne({ steamId: steamID64 }).populate(
//       'inventory'
//     );
//     res.json({ items: userInventory.inventory });
//   } catch (error) {
//     console.error('Error in /api/inventory:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

// Protected inventory route
// router.get('/inventory', isAuth, async (req, res) => {
//   console.log(req.user.id);
//   try {
//     const steamID64 = req.user.id;
//     const appId = 252490;
//     const contextId = 2;

//     if (!steamID64) {
//       return res.status(400).json({ error: 'Missing SteamID64 parameter.' });
//     }

//     // Fetch the inventory
//     const inventory = await getInventory(appId, steamID64, contextId);
//     if (!inventory || !inventory.items || inventory.items.length === 0) {
//       return res.status(404).json({ error: 'No inventory found.' });
//     }

//     // Find the user in the database
//     const user = await User.findOne({ steamId: steamID64 });
//     if (!user) {
//       return res.status(404).json({ error: 'User not found.' });
//     }

//     // Gather all assetIds to check for existing items in one query
//     const allAssetIds = inventory.items.flatMap(item => item.assetIds);

//     // Fetch all existing items in one query
//     const existingItems = await Item.find({
//       owner: user._id,
//       appId,
//       contextId,
//       assetId: { $in: allAssetIds }
//     });

//     // Create a Set of assetIds that already exist
//     const existingAssetIds = new Set(existingItems.map(item => item.assetId));

//     // Prepare an array for new items to insert
//     const newItems = [];
//     const newInventoryItemIds = [];

//     // Process each inventory item
//     inventory.items.forEach(item => {
//       // Extract the numeric part from the price string
//       const priceString = item.price;
//       const priceMatch = priceString.match(/\d+(\.\d+)?/);
//       const price = priceMatch ? parseFloat(priceMatch[0]) : 0;

//       // For each assetId, check if it already exists in the database
//       item.assetIds.forEach(assetId => {
//         if (!existingAssetIds.has(assetId)) {
//           // If the item doesn't exist, prepare it for insertion
//           const newItem = {
//             name: item.market_hash_name,
//             iconUrl: item.icon_url,
//             price: `${price} USD`,  // Save the numeric value
//             owner: user._id,
//             assetId,
//             appId,
//             contextId
//           };

//           newItems.push(newItem);
//         }
//       });
//     });

//     // Bulk insert new items if there are any
//     if (newItems.length > 0) {
//       const insertedItems = await Item.insertMany(newItems);
//       newInventoryItemIds.push(...insertedItems.map(item => item._id));
//     }

//     // Add new items to the user's inventory and save user in one operation
//     if (newInventoryItemIds.length > 0) {
//       user.inventory.push(...newInventoryItemIds);
//       await user.save();
//     }

//     // Return the updated user's inventory
//     const userInventory = await User.findOne({ steamId: steamID64 }).populate('inventory');
//     res.json({ items: userInventory.inventory });

//   } catch (error) {
//     console.error("Error in /api/inventory:", error);
//     res.status(500).json({ error: error.message });
//   }
// });



module.exports = router;
