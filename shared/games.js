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
  { name:"Zoopaloola",           short:"ZOOPA",  tag:"ARCADE",  url:"https://zoopaloola.vercel.app/",           img:"screenshots/zoopaloola.png" },
  { name:"Factorio Lamp Editor", short:"LAMPS",  tag:"TOOL",    url:"https://factorio-lamp-editor.vercel.app/", img:"screenshots/factorio-lamp.png" },
  { name:"LoL Fusion loldle",    short:"LOLDLE", tag:"PUZZLE",  url:"https://lol-fusion.vercel.app/",           img:"screenshots/lol-fusion.png" },
  { name:"Pug Fiesta",           short:"PUG",    tag:"ACTION",  url:"https://pug-fiesta.vercel.app/",           img:"screenshots/pug-fiesta.png" },
  { name:"Pug Fiesta 3D",        short:"PUG3D",  tag:"ACTION",  url:"https://pug-fiesta3-d.vercel.app/",        img:"screenshots/pug-fiesta-3d.png" },
  { name:"Combat Arena",         short:"ARENA",  tag:"PVP",     url:"https://combatarena.onrender.com/",        img:"screenshots/combat-arena.png" },
  { name:"Bluff Helper",         short:"BLUFF",  tag:"TOOL",    url:"bluff/index.html",                         img:"screenshots/bluff.png" },
  { name:"Calendar Puzzle",      short:"CALNDR", tag:"PUZZLE",  url:"https://calendar-puzzle2.vercel.app/",     img:"screenshots/calendar-puzzle.png" },
  { name:"Pokemon Shooter",      short:"POKE",   tag:"SHOOTER", url:"pokemonShooter/index.html",                img:"screenshots/pokemon-shooter.png" },
  { name:"Tralala Clicker",      short:"TRALA",  tag:"CLICKER", url:"tralalaGame/index.html",                   img:"screenshots/tralala.png" },
  { name:"LoL Wheel",            short:"WHEEL",  tag:"RNG",     url:"lolWheel/index.html",                      img:"screenshots/lol-wheel.png" },
  { name:"Neon Drifter",         short:"DRIFT",  tag:"RACE",    url:"neonDrifter/index.html",                   img:"screenshots/neon-drifter.png" },
  { name:"Guitar Tuner",         short:"TUNER",  tag:"TOOL",    url:"guitarTuner/index.html",                   img:"screenshots/guitar-tuner.png" },
  { name:"OK Corral",            short:"CORRAL", tag:"SHOOTER", url:"https://okcorral.onrender.com/",           img:"screenshots/ok-corral.png" },
];

window.TAG_COLORS = {
  ARCADE:'#ff9a3c', PUZZLE:'#9b5cff', TOOL:'#2fd6e0', ACTION:'#ff4757',
  SHOOTER:'#ffd23f', PVP:'#ff3df0', CLICKER:'#3dff7a', RNG:'#ff7ab8', RACE:'#3d7bff'
};
window.GAMES = DEF.map(function(g){
  return { name:g.name, short:g.short, tag:g.tag, url:abs(g.url), img:abs(g.img) };
});
window.SITE = { root: ROOT, coffee: 'https://buymeacoffee.com/jojkos' };
})();
