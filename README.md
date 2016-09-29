# RandomAPI (OfflineAPI)

*This cli-tool requires a premium plan on RandomAPI*

*Please visit http://beta.randomapi.com to register*

##### Detailed tutorial: http://blog.randomapi.com/offline-randomapi/
### How to use:
   1. Create a new authToken at http://beta.randomapi.com/settings/offline#new
   2. Login with your username and authToken to link this machine to your account.
   3. Run the `sync` operation to synchronize your APIs, lists, and snippets with the RandomAPI server.
   4. Run the `ls` command to view locally available APIs
   5. Generate results using the `gen` command or visit http://localhost:61337 to generate results via browser
      - options must be provided as a comma delimited list in CLI (e.g. results=25,fmt=csv,seed=a)

Usage: `randomapi [command]`

```
Commands:
   config [property] [new value]     View saved settings
   gen [list # OR ref #] [options]   Generate result for given API
   list                              Alias for ls
   ls                                View available local APIs
   login                             Login and link your machine with your RandomAPI account using an authToken
   logout                            Logout off your RandomAPI account
   restart                           Restart OfflineAPI Server
   run [list # OR ref #] [options]   Alias for gen
   start                             Start OfflineAPI Server
   status                            View status of OfflineAPI Server
   stop                              Stop OfflineAPI Server
   sync                              Synchronize your local APIs with the RandomAPI server
   verify                            Verify your login authToken is valid
   ```
