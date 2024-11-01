const SteamUser = require('steam-user');
const SteamCommunity = require('steamcommunity');
const SteamTradeManager = require('steam-tradeoffer-manager');
const SteamTotp = require('steam-totp');

const client = new SteamUser();
const community = new SteamCommunity();
const manager = new SteamTradeManager({
  steam: client,
  community: community,
  language: 'en',
  useAccessToken: true
  
});

// Steam bot credentials from environment variables
const config = {
  accountName: process.env.STEAM_ACCOUNT_NAME,
  password: process.env.STEAM_PASSWORD,
  sharedSecret: process.env.STEAM_SHARED_SECRET,
  identitySecret: process.env.STEAM_IDENTITY_SECRET
};

console.log('Config:', config);

// Validate Steam credentials
if (!config.accountName || !config.password || !config.sharedSecret || !config.identitySecret) {
  console.error('Steam credentials are not fully set in environment variables.');
  process.exit(1);
}

// Log in to Steam
client.logOn({
  accountName: config.accountName,
  password: config.password,
  twoFactorCode: SteamTotp.generateAuthCode(config.sharedSecret)
});

client.on('loggedOn', () => {
  client.setPersona(SteamUser.EPersonaState.Online);
  client.gamesPlayed([252490]); // Example game ID
  console.log('Steam client logged in and online');
});

client.on('error', (err) => {
  console.error('Steam client encountered an error:', err);
});

client.on('webSession', (sessionId, cookies) => {
  console.log('Web session established.');
  manager.setCookies(cookies);
  community.setCookies(cookies);
  community.startConfirmationChecker(20000, config.identitySecret);
});

module.exports = { manager };
