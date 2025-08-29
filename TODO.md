# TODO LIST

## Queue Things

- 2v2/FFA Queue System
  - Teams should be balanced by MMR, without splitting pre-queues teams up
  - Ability to have queues for FFA (1v1v1v1), this queue should be able to create a match for anywhere between a min and max number of players (where they are put into a game after the min is fufilled and a certain amount of time has passed, or instantly when max is filled)
- Ability to have queue matches that are more than one game (Bo3 or Bo5)

## Match Things

- Stake banning system
- Roles need to be assigned to users based on their MMR
  - Roles need to be assignable from literal MMR scores as well as leaderboard positions
- A button available to players in queue that calls a helper to the queue (the button is there but doesn't work yet)
- Only putting staff in matches if they have been called (or have admin perms since that is unavoidable)
- Optional VCs for matches, players can vote if they want to be in a VC for a particular game (no default VC)
  
## Webhooks/API

- Webhooks that will receive data for when a user's mmr is updated, when they play a match, who their current opponent is, etc. just anything that is possible to get
- Have an API where we can programmatically decide things like when a game is over
- match up APIs to work with Andy's website

## Moderation Tools

- All matches need to be able to be modified by staff, including canceling matches or giving the win to someone
- Players need to be able to be banned (temporarily and permanently) from queuing, this needs to be tied to their userID in case they leave the server and join back
- Queues need to be able to locked so that people can't queue until we unlock them
- All queues need their transcripts saved to somewhere were staff can access them at any point forever (maybe a time limit is reasonable but it would have to be large)
- Staff need to be able to edit player stats, such as add/remove mmr, win streaks, wins/losses, etc.

## Leaderboard

- Some way to view a players stats and position on the leaderboard and stuff like that via a discord command needs to be there

## Not Required (lets be honest we're doing this)

- Tournaments using the same bot, this is a bit of a complex addition but just having one bot for tournaments and queues would be very nice, and allow us to seed tourneys without using an external script
