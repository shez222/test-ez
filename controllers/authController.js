const login = async (req, res) => {
  try {
    const response = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=1E0DDC6BB18FAAAE89D3D06505AC82A1&steamids=${steamID64}`,
    );

    res.json({
      playerDetails: response.data
    })

  } catch (error) {
    console.error('Error joining jackpot:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = { login }