/* shared/games.js — the single source of truth for the games list.
   Local urls/imgs are written root-relative and resolved against the repo
   root, which is derived from this script's own URL — so the same file works
   from /, /v1/, /v2e/, on GitHub Pages project paths and on localhost.
   Add a game HERE and every variant picks it up. */
(function(){
'use strict';
var src = (document.currentScript && document.currentScript.src) || 'shared/games.js';
var ROOT = src.slice(0, src.lastIndexOf('shared/games.js'));
function abs(p){ return /^https?:/i.test(p) ? p : ROOT + p; }

var DEF = [
  { name:"Tralala Clicker",      createdAt:"2025-05-26T16:36:19Z", short:"TRALA",  tag:"CLICKER", url:"tralalaGame/index.html",                   img:"screenshots/tralala.png",
    blurb:"Brainrot Clicker: tap, upgrade, repeat.", meta:["Clicker", "Brainrot"] },
  { name:"Pug Fiesta",           createdAt:"2025-05-26T16:36:19Z", short:"PUG",    tag:"ACTION",  url:"https://pug-fiesta.vercel.app/",           img:"screenshots/pug-fiesta.png",
    blurb:"A high-energy synthwave arcade chase. Play as a pug racing the clock, with a global leaderboard.", meta:["Arcade", "Leaderboard"] },
  { name:"Pokemon Shooter",      createdAt:"2025-05-26T17:04:43Z", short:"POKE",   tag:"SHOOTER", url:"pokemonShooter/index.html",                img:"screenshots/pokemon-shooter.png",
    blurb:"Pokémon Hunt: a quick, chaotic browser shooter.", meta:["Arcade"] },
  { name:"LoL Wheel",            createdAt:"2025-05-26T17:57:34Z", short:"WHEEL",  tag:"RNG",     url:"lolWheel/index.html",                      img:"screenshots/lol-wheel.png",
    blurb:"Spin the wheel of League champions and let fate pick your next main.", meta:["Randomizer", "League"] },
  { name:"Guitar Tuner",         createdAt:"2025-06-27T11:44:12Z", short:"TUNER",  tag:"TOOL",    url:"guitarTuner/index.html",                   img:"screenshots/guitar-tuner.png",
    blurb:"An automatic guitar tuner that listens through your microphone.", meta:["Microphone"] },
  { name:"Neon Drifter",         createdAt:"2025-08-03T07:44:01Z", short:"DRIFT",  tag:"RACE",    url:"neonDrifter/index.html",                   img:"screenshots/neon-drifter.png",
    blurb:"Drift through the neon with precise, responsive controls and an aim-follow dash.", meta:["Keyboard", "Score attack"] },
  { name:"Calendar Puzzle",      createdAt:"2025-08-03T14:34:04Z", short:"CALNDR", tag:"PUZZLE",  url:"https://calendar-puzzle2.vercel.app/",     img:"screenshots/calendar-puzzle.png",
    blurb:"A solver for the A-Puzzle-A-Day calendar. Watch it find every solution in milliseconds.", meta:["Solver", "Animated"] },
  { name:"Bluff Helper",         createdAt:"2025-08-15T08:38:10Z", short:"BLUFF",  tag:"TOOL",    url:"bluff/index.html",                         img:"screenshots/bluff.png",
    blurb:"A board tracker for the Bluff dice game, with the real rules built in.", meta:["Dice", "Tracker"] },
  { name:"Zoopaloola",           createdAt:"2025-11-24T18:58:30Z", short:"ZOOPA",  tag:"ARCADE",  url:"https://zoopaloola.vercel.app/",           img:"screenshots/zoopaloola.png",
    blurb:"A modern remake of the classic Zoo Paloola bumper game, with online multiplayer.", meta:["Remake", "Multiplayer"] },
  { name:"Combat Arena",         createdAt:"2025-12-05T12:20:17Z", short:"ARENA",  tag:"PVP",     url:"https://combatarena.onrender.com/",        img:"screenshots/combat-arena.png",
    blurb:"Kombat Fury: a 1v1 fighter with four fighters, special moves and best-of-3 rounds. Local or online.", meta:["1v1", "Local + online"] },
  { name:"Factorio Lamp Editor", createdAt:"2025-12-06T08:12:10Z", short:"LAMPS",  tag:"TOOL",    url:"https://factorio-lamp-editor.vercel.app/", img:"screenshots/factorio-lamp.png",
    blurb:"Paint pixel art or text and export it as a Factorio lamp blueprint.", meta:["Pixel art", "Blueprints"] },
  { name:"Marco Oh No!",         createdAt:"2025-12-07T13:07:35Z", short:"MARCO",  tag:"PARTY",   url:"https://marcoohno.onrender.com/",          img:"screenshots/marco-oh-no.png",
    blurb:"Couch tag in a fresh maze every round. One seeker with a flashlight, everyone else hiding in the dark. The TV is the board, phones are the controllers.", meta:["Party", "TV + phones"] },
  { name:"LoL Fusion loldle",    createdAt:"2025-12-19T11:11:08Z", short:"LOLDLE", tag:"PUZZLE",  url:"https://lol-fusion.vercel.app/",           img:"screenshots/lol-fusion.png",
    blurb:"A daily League of Legends puzzle: guess the two champions fused into one.", meta:["Daily", "League"] },
  { name:"OK Corral",            createdAt:"2026-02-07T15:14:27Z", short:"CORRAL", tag:"SHOOTER", url:"https://okcorral.onrender.com/",           img:"screenshots/ok-corral.png",
    blurb:"A real-time western shootout: Sheriffs vs Outlaws on a tactical grid.", meta:["Multiplayer", "Real-time"] },
  { name:"Pug Fiesta 3D",        createdAt:"2026-04-25T13:24:38Z", short:"PUG3D",  tag:"ACTION",  url:"https://pug-fiesta3-d.vercel.app/",        img:"screenshots/pug-fiesta-3d.png",
    blurb:"A low-poly arcade chase: 45 seconds, a stage full of pugs and one dash button. Stack combos and climb the leaderboard.", meta:["45 s rounds", "3D", "Leaderboard"] },
  { name:"partyficRIM",          createdAt:"2026-05-01T09:15:33Z", short:"PARTY",  tag:"PARTY",   url:"https://partyficrim.onrender.com/",        img:"screenshots/partyficrim.png",
    blurb:"An asymmetric co-op arena: one big screen and two phones as controllers.", meta:["Co-op", "Screen + phones"] },
  { name:"Samurai Sword",        createdAt:"2026-07-02T15:11:52Z", short:"KATANA", tag:"CARDS",   url:"https://samurai-sword-omega.vercel.app/",  img:"screenshots/samurai-sword.png",
    blurb:"The feudal-Japan BANG! card game in your browser. Play online with friends, or fill the empty seats with bots.", meta:["3–7 players", "Online", "Bots"] },
  { name:"Obědy u Plynárenské",  createdAt:"2026-10-08T11:32:03Z", short:"OBEDY",  tag:"TOOL",    url:"https://obedy-sigma.vercel.app/",          img:"screenshots/obedy.png",
    blurb:"Today's lunch menus around Plynárenská 1 in Brno, with prices, walking distance, a map and a dice for the undecided.", meta:["Brno", "Daily"] },
  { name:"Jojkos Blaster",       createdAt:"2026-10-09T08:06:05Z", short:"BLAST",  tag:"ACTION",  url:"https://jojkos-blaster.vercel.app/",       img:"screenshots/jojkos-blaster.png",
    blurb:"The original DOS bomber running in a browser DOSBox, with custom sprites and all 64 stages selectable.", meta:["DOS", "64 stages", "Rooms"] },
];

window.TAG_COLORS = {
  ARCADE:'#ff9a3c', PUZZLE:'#9b5cff', TOOL:'#2fd6e0', ACTION:'#ff4757',
  SHOOTER:'#ffd23f', PVP:'#ff3df0', CLICKER:'#3dff7a', RNG:'#ff7ab8', RACE:'#3d7bff',
  PARTY:'#ff6b4a', CARDS:'#c3282f'
};
// Creation dates use the earliest recorded project history, including original
// versions. Equal timestamps keep their catalog order. See creation-history.md.
DEF.forEach(function(g){
  if (!g.createdAt || !Number.isFinite(Date.parse(g.createdAt))) {
    throw new Error('Missing or invalid createdAt for ' + g.name);
  }
});
DEF.sort(function(a, b){ return Date.parse(a.createdAt) - Date.parse(b.createdAt); });
window.GAMES = DEF.map(function(g){
  return { name:g.name, createdAt:g.createdAt, short:g.short, tag:g.tag, url:abs(g.url), img:abs(g.img), blurb:g.blurb || '', meta:g.meta || [] };
});
window.SITE = { root: ROOT, coffee: 'https://buymeacoffee.com/jojkos' };
})();
