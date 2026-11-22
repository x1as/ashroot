// Item icons, 16x16 pixel art (pixel-art-sprites: one silhouette per item type, uniform 1px outline,
// light from the top-left, limited palette). Material keys are remapped per rarity, so a xiphos of
// a mortal smith (dull iron), a hero (polished bronze), a titan (dark steel, violet runes) and a god
// (gold, white glow) are four different pictures of the same silhouette.
//   A/M/D = metal light/mid/dark, J/j = gem or rune light/dark, c/C = cloth light/dark, n/N = wood/leather
import { bake, toDataURL } from '../engine/sprite.js';
import { BASES } from '../data/items.js';

export const ICON16 = {
  sword: ['..............w.', '.............wA.', '............wAM.', '...........wAMD.', '..........wAMD..', '.........wAMD...', '........wAMD....', '.......wAMD.....', '..J...wAMD......', '...J.wAMD.......', '....JJMD........', '....JNJ.........', '...NnN.J........', '..NnN...........', '.jnN............', 'jj..............'],
  dagger: ['w..............w', 'Aw............wA', 'MAw..........wAM', '.MAw........wAM.', '..MAw......wAM..', '...MAw....wAM...', '....MAw..wAM....', '.....MAwwAM.....', '......JAAJ......', '.....J.JJ.J.....', '....nN.NN.Nn....', '...nN......Nn...', '..nN........Nn..', '.jN..........Nj.', 'jj............jj'],
  club: ['..........nnnn..', '.........nwnnNn.', '........nwnNnnNn', '.......nnnNnknNN', '......nwnnNnnNN.', '.....MAMnnNnNN..', '....nMDMnNNNN...', '...nnnNnNNN.....', '..nnnNNNN.......', '.nwnNNN.........', 'nwnNN...........', 'nnNN............', 'MAM.............', 'MDM.............'],
  staff: ['..........jJJj..', '.........jJwJJj.', '.........JwJJJJ.', '.........jJJJJj.', '..........jJJj..', '.........MAAM...', '........MDnD....', '.......nwN......', '......nwN.......', '.....nwN........', '....nwN.........', '...nwN..........', '..nwN...........', '.nwN............', 'MDN.............', 'DD..............'],
  bow: ['...nnN..........', '..nN.w..........', '.nN...w.........', '.nN....w........', 'nN......w.......', 'nN.......w......', 'nN........w.....', 'nMDDDDDDDDDAJJ..', 'nN........w..J..', 'nN.......w......', 'nN......w.......', '.nN....w........', '.nN...w.........', '..nN.w..........', '...nnN..........'],
  pilos: ['.......cc.......', '......cwcC......', '.....cwccCC.....', '.....cwcccC.....', '....cwccccCC....', '....cwcccccC....', '...cwccccccCC...', '...cwcccccccC...', '..MAMMMMMMMMMD..', '..MDDDDDDDDDDD..'],
  chalcid: ['.....MMMMMM.....', '....MAAAMMMD....', '...MAwAMMMMMD...', '...MAMMMMMMMD...', '..MAMMDDDDMMMD..', '..MAMD....DMMD..', '..MAMD....DMMD..', '..MMD.....DMMD..', '..MMD.....DMD...', '...MD.....DD....', '...D............'],
  corinth: ['....cccccccc....', '...cCcCcCcCcC...', '......MMMM......', '....MAAAMMMD....', '...MAwAMMMMMD...', '...MAMMMMMMMD...', '...MAMkkkkMMD...', '...MAMMkkMMMD...', '...MAMMkkMMMD...', '...MAMDkkDMMD...', '...MMD.kk.DMD...', '....D......D....'],
  chiton: ['...cc......cc...', '..cwcc....ccCc..', '..cwccccccccCc..', '...cwcccccccC...', '....cwcccccC....', '....cwcccccC....', '....nNNJNNNN....', '....cwcccccC....', '...cwccccccCC...', '...cwcccccccC...', '..cwcCcCcCcCcC..'],
  linothorax: ['..MMM......MMM..', '.MAwM......MAMD.', '.MAMccccccccMMD.', '..cwcccccccccC..', '..cwcMMMMMMcC...', '..cwcMAMAMAcC...', '..cwccccccccC...', '..nNNNNJNNNNN...', '..cCcCcCcCcCc...', '..cCcCcCcCcCc...', '..C.C.C.C.C.C...'],
  cuirass: ['..MM........MM..', '.MAwMMMMMMMMMMD.', '.MAMMMMMMMMMMMD.', '.MAwAMMD.MAMMMD.', '.MAMMMD..MMMMMD.', '..MAMMMMJMMMMD..', '..MAwMDMMDMMMD..', '..MAMMDMMDMMMD..', '..MAMMMMMMMMMD..', '...MAMMMMMMMD...', '...DDDDDDDDDD...'],
  wraps: ['....nNnNnN......', '...nwnnnnnN.....', '...nwNnNnNN.....', '...nwnnnnnN.....', '...nwNnNnNNNn...', '...nwnnnnnnNNn..', '...nwnnnnnnnNn..', '....nwnnnnnnN...', '....cCcCcCcC....', '....cwcccccC....', '....cCcJcCcC....'],
  bracer: ['....nnnnnnn.....', '...nwMAMMMnN....', '...nwMAMMMnN....', '...nwnnJnnnN....', '...nwMAMMMnN....', '...nwMAMMMnN....', '...nwnnnnnnN....', '...nwMAMMMnN....', '....NNNNNNN.....'],
  gauntlet: ['...MAMAMAM......', '...MwMwMwMD.....', '...MAMAMAMD.MM..', '...MAMMMMMDMAD..', '...MAwMMMMMMD...', '...MAMMMMMMD....', '....MAMMMMMD....', '....MJMMMMJD....', '....MAMMMMMD....', '....DDDDDDDD....'],
  sandal: ['....nN..........', '....nN.nN.......', '....nNnNnN......', '....nN.nN.......', '....nNnJnN......', '....cnNnNnN.....', '...ccwccccnN....', '...cwcccccccnN..', '..NNNNNNNNNNNNN.', '..NNNNNNNNNNNNN.'],
  endromis: ['....nnnnn.......', '....nwnnN.......', '....nwJnN.......', '....nwnnN.......', '....nwJnN.......', '....nwnnN.......', '....nwJnNn......', '....nwnnnNnn....', '....nwnnnnnNnN..', '...NNNNNNNNNNN..'],
  greave: ['....MMMMM.......', '...MAwAMMD......', '...MAwMMMD......', '...MAMJMMD......', '...MAwMMMD......', '...MAMMMMD......', '....MAMMD.......', '....MAMMD.......', '....nNNNNnn.....', '...nnnnnnnnNN...', '...NNNNNNNNNN...'],
  gorgon: ['..D.........D...', '...D.......D....', '....D.....D.....', '.....D...D......', '......MMM.......', '.....MAwAM......', '....MAJJJAM.....', '...MAJkJkJAM....', '...MAJJJJJAM....', '...MAJjjjJAM....', '....MAJJJAM.....', '.....MAMAM......', '......MMM.......'],
  ring: ['......jJj.......', '.....jJwJj......', '......JJJ.......', '.....MMMMM......', '....MA...MD.....', '...MA.....MD....', '...MA.....MD....', '...MA.....MD....', '....MA...MD.....', '.....MMMMM......'],
  // relics keep their own colours (each is one specific mythic object)
  relic_phoenix: ['...........ee...', '..........eye...', '.........eyye...', '........eyyeE...', '.......eyyeE....', '......eyyeE.....', '.....eyyeEr.....', '....eyyeEr......', '...eyeeErr......', '...eeEErr.......', '..rEEr..........', '.r..............', 'r...............'],
  relic_hourglass: ['..MMMMMMMMMM....', '...nnnnnnnn.....', '...w......N.....', '....wyyyyN......', '.....wyyN.......', '......yN........', '.....w.yN.......', '....w..yyN......', '...w.yyyyyN.....', '...nnnnnnnn.....', '..MMMMMMMMMM....'],
  relic_fang: ['......wwww......', '.....wwbbbb.....', '.....wbbbbc.....', '......wbbbc.....', '......wbbc......', '.......wbc......', '.......wbc......', '........bc......', '........c.......'],
  relic_ember: ['......e.........', '.....eye........', '.....eyye.......', '....eyywye......', '....eyyyyE......', '.....EyyE.......', '......GG........', '.....GgG........', '....GgG.........', '...GgG..........', '..GgG...........', '.GgG............', 'GG..............'],
  relic_compass: ['.....rrrrr......', '....rhrrrrR.....', '...rhrRrrRrR....', '...rrRrrRrrR....', '...rRrrRrrRR....', '...rrRrRrrRR....', '....rRrrRRR.....', '.....RRRRR..r...', '............r...', '...........r....'],
  relic_coin: ['.....yyyyy......', '...yyYYYYYyy....', '..yYwwYYYYYYy...', '..yYwYYkYYYYy...', '.yYYYYkkkYYYYy..', '.yYYYkkYkkYYYy..', '.yYYYYkkkYYYYy..', '..yYYYYkYYYYy...', '..yYYYYYYYYYy...', '...yyYYYYYyy....', '.....yyyyy......'],
  spear: ['.............wA.', '............wAMD', '...........wAMD.', '..........JAMD..', '.........nJJD...', '........nwN.....', '.......nwN......', '......nwN.......', '.....nwN........', '....nwN.........', '...nwN..........', '..nwN...........', '.nwN............', 'nwN.............', 'MD..............', 'D...............'],
  aspis: ['.....MMMMMM.....', '...MMAAAAAAMM...', '..MAwAAAAAAAMD..', '.MAwAAAAJAAAAMD.', '.MAAAAAJAJAAAMD.', 'MAAAAAJAAAJAAAMD', 'MAAAAJAAAAAJAAMD', 'MAAAJAAAAAAAJAMD', 'MMAAAAAAAAAAAAMD', '.MMAAAAAAAAAAMD.', '.MMMAAAAAAAAMDD.', '..MMMMAAAAMMDD..', '...DMMMMMMMMD...', '.....DDDDDD.....'],
  labrys: ['.DM....JJ....MD.', 'DMAM...JJ...MAMD', 'DMAAM..MM..MAAMD', 'DMAwAMMMMMMAwAMD', 'DMAAAMAAAAMAAAMD', 'DMAAM.MAAM.MAAMD', 'DMAM..MMMM..MAMD', '.DM...JnNJ...MD.', '.......nN.......', '.......nN.......', '.......nN.......', '......JnNJ......', '.......nN.......', '.......nN.......', '.......MD.......', '.......DD.......'],
  pelekys: ['.........MMM....', '.......JMAAAM...', '.......JMAwAAM..', '......nNMAwAAAM.', '......nNMAAAAAMD', '......nNMAAAAAMD', '......nNMAAAAMD.', '......nNJMMMMD..', '......nN........', '......nN........', '......nN........', '.....JnNJ.......', '......nN........', '......nN........', '......MD........', '......DD........'],
  cleaver: ['....MAAAAAAMD...', '....MAwAAAAMD...', '....MAwAAAAMD...', '....MAwAAAAMD...', '....MAAAAAAMD...', '....MAwAAAAMD...', '....MAAAAAAMD...', '....MAAAAAAMD...', '....MAAAAAAMD...', '....MMMMMMMMD...', '...JJJJJJJJJJJ..', '.......nN.......', '.......nN.......', '.......nN.......', '......MAMD......', '.......DD.......'],
};

export const ICON_OF = {
  w_sword: 'sword', w_dagger: 'dagger', w_great: 'club', w_staff: 'staff', w_bow: 'bow', w_spear: 'spear', w_aspis: 'aspis', w_labrys: 'labrys', w_pelekys: 'pelekys', w_cleaver: 'cleaver',
  h_light: 'pilos', h_medium: 'chalcid', h_heavy: 'corinth', c_light: 'chiton', c_medium: 'linothorax', c_heavy: 'cuirass',
  g_light: 'wraps', g_medium: 'bracer', g_heavy: 'gauntlet', b_light: 'sandal', b_medium: 'endromis', b_heavy: 'greave',
  a_amulet: 'gorgon', r_ring: 'ring', x_relic: 'relic_coin',
};
export const SLOT_ICON = { weapon: 'sword', helm: 'corinth', chest: 'cuirass', gloves: 'gauntlet', boots: 'greave', amulet: 'gorgon', ring: 'ring', relic: 'relic_coin' };

// material ramps per rarity: mortal iron, heroic bronze, titanic steel+violet, divine gold+light
const RPAL = [
  { A: '#c9c2b0', M: '#8d8473', D: '#544c40', J: '#b8aa90', j: '#6e6352', c: '#9b8b70', C: '#5e5243' },
  { A: '#f0d9a0', M: '#c8924a', D: '#7a5126', J: '#7fb2ff', j: '#3b6bc4', c: '#4f7fc9', C: '#2c4a80' },
  { A: '#c9d2e8', M: '#7d86a8', D: '#3b3f5c', J: '#c9a6ff', j: '#6a44c2', c: '#7b55c9', C: '#432a78' },
  { A: '#fff6c8', M: '#ffd36b', D: '#b8862e', J: '#ffffff', j: '#ffb347', c: '#fff3d6', C: '#e0b860' },
];

const cache = new Map();
export function iconSprite(key, rarity = 0) {
  const k = key + '|' + rarity;
  if (!cache.has(k)) cache.set(k, bake(ICON16[key] || ICON16.ring, { pal: RPAL[rarity] }));
  return cache.get(k);
}
export const keyOf = (it) => (BASES[it.base].kind === 'relic' ? 'relic_' + (it.relic || 'coin') : ICON_OF[it.base]);
export const itemIcon = (it) => iconSprite(keyOf(it), it.rarity).c;
const urls = new Map();
export function itemIconURL(it, scale = 4) {
  const k = keyOf(it) + '|' + it.rarity + '|' + scale;
  if (!urls.has(k)) urls.set(k, toDataURL(iconSprite(keyOf(it), it.rarity), scale));
  return urls.get(k);
}
export function slotIconURL(slot, scale = 4) {
  const k = 'slot|' + slot + '|' + scale;
  if (!urls.has(k)) urls.set(k, toDataURL(iconSprite(SLOT_ICON[slot], 0), scale));
  return urls.get(k);
}
