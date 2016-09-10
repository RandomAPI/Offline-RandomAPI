#!/usr/bin/env node

const path    = require('path');
const fs      = require('fs.extra');
const color   = require('colors');
const request = require('request');
const utils   = require('./utils.js');
const pack    = require('./package.json');

let args   = process.argv.slice(2);
let config = utils.getConfig();

if (!args.length || args[0] === '--help' || args[0] === 'help') {
  console.log(
`${pack.name} - ${pack.description} | Version ${pack.version}

*Requires a premium plan on RandomAPI*
How to use:
   1. Create a new authToken at http://beta.randomapi.com/settings/offline#new
   2. Login with your username and authToken to link this machine to your account.
   3. Run the sync operation to synchronize your APIs, lists, and snippets with the RandomAPI server.
   4. Run the ls command to view locally available APIs
   5. Generate results using the gen command or visit http://localhost:${config.port} to generate results via browser
      - options must be provided as a comma delimited list in CLI (e.g. results=25,fmt=csv,seed=a)

Usage: ${pack.name} [command]

Commands:
   config [property] [new value]     View saved settings
   gen [list # OR ref #] [options]   Generate result for given API
   list                              Alias for ls
   ls                                View available local APIs
   login                             Login and link your machine with your RandomAPI account using an authToken
   logout                            Logout off your RandomAPI account
   run [list # OR ref #] [options]   Alias for gen
   start                             Start OfflineAPI Server
   status                            View status of OfflineAPI Server
   stop                              Stop OfflineAPI Server
   sync                              Synchronize your local APIs with the RandomAPI server
   verify                            Verify your login authToken is valid`);

  return;
}

// Load in available commands
let cmds = [];
fs.readdirSync(utils.lodir('commands')).forEach(file => {
  cmds.push(file.slice(0, -3));
});

if (cmds.indexOf(args[0]) !== -1) {
  let filename = utils.lodir('commands', args[0]);
  let cmd = require(filename);

  cmd.run(args);
} else {
  utils.error('randomapi: \'' + args[0] + '\' is not a randomapi command. See \'randomapi --help\'');
}
