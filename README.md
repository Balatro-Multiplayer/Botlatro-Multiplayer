<img src="https://cdn.discordapp.com/attachments/1226193437192360070/1429930718624219197/egg.png?ex=68f7ee42&is=68f69cc2&hm=1564d9e1420ac5051fcc72209a9534d1c7f974a47f67c12800accb6fdc7f9a03&" alt="" height="100">

# Botlatro Multiplayer 

Built as a replacement for the NeatQueue discord bot, bespoke for the balatro multiplayer server.

## Overview

Botlatro provides an easy and reliable matchmaking system for players on the Discord. It replicates the functionality of NeatQueue while removing its tendency to crash, and with an orgy of added features.
If you have used NeatQueue, this project should feel familiar but more stable and user friendly.

## Features

- Acts as a direct replacement for NeatQueue.
- Custom elo and decay systems.
- multi-queueing
- in-built & seamless banning system
- moderation tools
- Website integration at the official <a href="https://balatromp.com/">balatromp.com</a>
- Easier to maintain and extend.

## Why This Exists

NeatQueue served the community well, but it wasn’t built with Balatro Multiplayer’s needs in mind. This project was created to provide a more focused, efficient alternative that doesnt crash EVERY FIVE SECONDS.

# Quick Setup Steps

(out of date, updating soon)

- Clone the repo
- Install [Bun](https://bun.sh)
- Run `bun install`
- Download postgresql and set it all up on your PC properly
- Add the `.env` file to your project (see `.env.example`)
- set 'type:' to 'module' in package.json
- `bun run migrate` to initialize the DB
- `bun run dev` to run the bot in development mode
