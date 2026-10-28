// Build-time product configuration. Change these before publishing a release for players.
module.exports = {
  game: {
    version: '1.21.11',
    fabricLoader: '0.19.5'
  },
  auth: {
    // 'live' uses the login.live.com flow with the community-standard client ID (the one Mojang's own
    // launcher uses; open-source launcher libraries use it too). Once your own Azure app is approved for
    // the Minecraft API, switch to { mode: 'azure', clientId: '<your app id>' }. Players can also override
    // this under Settings > Advanced.
    mode: 'live',
    clientId: '00000000402b5328'
  },
  // Launcher updates come from this public GitHub repo's Releases (must match "build.publish" in package.json).
  // Updates are also Ed25519-signed; see scripts/update-keygen.js.
  updates: {
    owner: 'iMurrz',
    repo: 'sloth-client-releases'
  },
  launcherName: 'sloth-launcher'
};
