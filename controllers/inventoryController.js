const { getInventory } = require('../utils/getInventory');
const User = require('../models/userSchema');
const Item = require('../models/itemSchema')



const getInventoryItems = async (req, res) => {
    try {
      const steamID64 = req.user.steamID64
      const appId = 252490;
      const contextId =  2;
      
      if (!steamID64) {
        return res.status(400).json({ error: 'Missing SteamID64 parameter.' });
      }
  
      const inventory = await getInventory(appId, steamID64, contextId);
  
      // Find the user in the database
      const user = await User.findOne({ steamId: steamID64 });
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }
      // Save each item in the inventory to the database
      const itemPromises = inventory.items.map(async (item) => {
        try {
          // Extract the numeric part from the price string and convert it to a number
          const priceString = item.price; 
          const priceMatch = priceString.match(/\d+(\.\d+)?/);
          const price = priceMatch ? parseFloat(priceMatch[0]) : 0;
  
          // Check if any of the asset IDs already exists in the database
          const existingItem = await Item.findOne({
            owner: user._id,
            appId: appId,
            contextId: contextId,
            assetId: { $in: item.assetIds }
          });
  
          if (existingItem) {
            // Item already exists in the inventory, update if needed
            return existingItem;
          }
  
          // Create a new item entry for each asset ID
          const newItemPromises = item.assetIds.map(async (assetId) => {
            const newItem = new Item({
              name: item.market_hash_name,
              iconUrl: item.icon_url,
              price: `${price} USD`,  // Save the numeric value
              owner: user._id,
              assetId: assetId,
              appId: appId,
              contextId: contextId,
              // quantity: item.quantity
            });
  
            const savedItem = await newItem.save();
            user.inventory.push(savedItem._id); // Add item reference to user's inventory
            return savedItem;
          });
  
          return Promise.all(newItemPromises);
  
        } catch (itemError) {
          // Handle errors
          console.error(`Error processing item ${item.market_hash_name}`, itemError);
          throw itemError;
        }
      });
  
      await Promise.all(itemPromises);
  
      await user.save();
      const userInventory = await User.findOne({steamId: steamID64}).populate('inventory')

      res.json({items:userInventory.inventory, inv:inventory});
  
    } catch (error) {
      console.error("Error in /api/inventory:", error);
      res.status(500).json({ error: error.message });
    }
  };

  module.exports = {
    getInventoryItems
  };