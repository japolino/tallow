/**
 * Who made the recordings in assets/sounds (all from freesound.org; the full table is in CREDITS.md). `by` is set
 * for the ones under a Creative Commons Attribution licence, which must be credited; the rest are CC0.
 */
export interface SoundCredit {
  name: string;
  user: string;
  url: string;
  by?: string;
}

export const SOUND_CREDITS: readonly SoundCredit[] = [
  { name: "Dice Rolling on Table", user: "Flem0527", url: "https://freesound.org/people/Flem0527/sounds/629982/" },
  { name: "dice roll_wooden table_1.wav", user: "ekfink", url: "https://freesound.org/people/ekfink/sounds/235484/" },
  { name: "dice_01.wav", user: "dermotte", url: "https://freesound.org/people/dermotte/sounds/220743/", by: "CC BY 4.0" },
  { name: "dice_05.wav", user: "dermotte", url: "https://freesound.org/people/dermotte/sounds/220745/", by: "CC BY 4.0" },
  { name: "dice_03.wav", user: "dermotte", url: "https://freesound.org/people/dermotte/sounds/220741/", by: "CC BY 4.0" },
  { name: "Dice Shaking in Hand", user: "Flem0527", url: "https://freesound.org/people/Flem0527/sounds/629983/" },
  { name: "diceshake.wav", user: "Zaxtor99", url: "https://freesound.org/people/Zaxtor99/sounds/147530/" },
  { name: "Playing Card Deal Variation 2", user: "el_boss", url: "https://freesound.org/people/el_boss/sounds/571576/" },
  { name: "Playing Card Deal Variation 3", user: "el_boss", url: "https://freesound.org/people/el_boss/sounds/571575/" },
  { name: "Playing Card Deal Variation 1", user: "el_boss", url: "https://freesound.org/people/el_boss/sounds/571577/" },
  { name: "Card Deal", user: "RealSquink", url: "https://freesound.org/people/RealSquink/sounds/787405/" },
  { name: "Flop.ogg", user: "egomassive", url: "https://freesound.org/people/egomassive/sounds/536788/", by: "CC BY 3.0" },
  { name: "shuffle05", user: "SilverDubloons", url: "https://freesound.org/people/SilverDubloons/sounds/817574/" },
  { name: "shuffle01", user: "SilverDubloons", url: "https://freesound.org/people/SilverDubloons/sounds/817570/" },
  { name: "shuffle04", user: "SilverDubloons", url: "https://freesound.org/people/SilverDubloons/sounds/817573/" },
  { name: "Writing with pencil.wav", user: "theshuggie", url: "https://freesound.org/people/theshuggie/sounds/371026/" },
  { name: "Writing_Pencil_2_01", user: "Joao_Janz", url: "https://freesound.org/people/Joao_Janz/sounds/551560/" },
  { name: "Paper Rip 3", user: "omgitsjo", url: "https://freesound.org/people/omgitsjo/sounds/710162/" },
  { name: "tear paper.wav", user: "edschaefer", url: "https://freesound.org/people/edschaefer/sounds/343098/" },
  { name: "Rip 9 - Long", user: "NearTheAtmoshphere", url: "https://freesound.org/people/NearTheAtmoshphere/sounds/676626/" },
  { name: "PaperSlide.wav", user: "eyesonlegs", url: "https://freesound.org/people/eyesonlegs/sounds/464302/" },
  { name: "55_Coger_Foto.wav (Sliding Paper)", user: "Atrius1", url: "https://freesound.org/people/Atrius1/sounds/470189/" },
  { name: "Piece Placement.mp3", user: "el_boss", url: "https://freesound.org/people/el_boss/sounds/546119/" },
  { name: "Piece Capture.mp3", user: "el_boss", url: "https://freesound.org/people/el_boss/sounds/546120/" },
  { name: "scrabblePieceOnWood", user: "SilverDubloons", url: "https://freesound.org/people/SilverDubloons/sounds/817568/" },
  { name: "Small Wood Piece Sound", user: "qubodup", url: "https://freesound.org/people/qubodup/sounds/822567/" },
  { name: "Blanket Movement 6", user: "OwlStorm", url: "https://freesound.org/people/OwlStorm/sounds/320144/" },
  { name: "19.wav", user: "adcbicycle", url: "https://freesound.org/people/adcbicycle/sounds/14167/" },
  { name: "Steel - Angle iron drop small", user: "ldezem", url: "https://freesound.org/people/ldezem/sounds/386214/" },
  { name: "Steel - Drop to forge", user: "ldezem", url: "https://freesound.org/people/ldezem/sounds/386219/" },
  { name: "bell9.wav", user: "creeeeak", url: "https://freesound.org/people/creeeeak/sounds/531030/" },
  { name: "bell12.wav", user: "creeeeak", url: "https://freesound.org/people/creeeeak/sounds/531017/" },
  { name: "marbles - 15cm ceramic bowl - drop into bowl full of ~13mm marbles - 1 ~13mm marble 10.wav", user: "Anthousai", url: "https://freesound.org/people/Anthousai/sounds/448327/" },
  { name: "marble.wav", user: "jradcoolness", url: "https://freesound.org/people/jradcoolness/sounds/334222/" },
  { name: "Unrolling Scroll.wav", user: "spookymodem", url: "https://freesound.org/people/spookymodem/sounds/202107/" },
  { name: "Paper unroll", user: "leoanderson67", url: "https://freesound.org/people/leoanderson67/sounds/710764/" },
  { name: "Woodblock-soft.wav", user: "hollandm", url: "https://freesound.org/people/hollandm/sounds/692828/" },
  { name: "Match Ignition 8", user: "HunteR4708", url: "https://freesound.org/people/HunteR4708/sounds/256799/" },
  { name: "Striking a Match 1.mp3", user: "Bricklover", url: "https://freesound.org/people/Bricklover/sounds/532892/" },
  { name: "match.mp3", user: "aerolus", url: "https://freesound.org/people/aerolus/sounds/508261/" },
  { name: "Table Slam.wav", user: "KenRT", url: "https://freesound.org/people/KenRT/sounds/364835/" },
  { name: "hand_on_table", user: "nottooloud_1", url: "https://freesound.org/people/nottooloud_1/sounds/787456/" },
  { name: "Thunder Clap And Rumble #5", user: "Kinoton", url: "https://freesound.org/people/Kinoton/sounds/760212/" },
  { name: "Thunder Clap And Rumble #8", user: "Kinoton", url: "https://freesound.org/people/Kinoton/sounds/760215/" },
  { name: "STE-050-quiet rumble thunder.wav", user: "tams_kp", url: "https://freesound.org/people/tams_kp/sounds/653664/" },
  { name: "distant rumbling thunderstorm, ambience", user: "greyfeather", url: "https://freesound.org/people/greyfeather/sounds/712914/" },
  { name: "rain against window 2", user: "bastipictures", url: "https://freesound.org/people/bastipictures/sounds/243781/" },
  { name: "Winter wild wind howled through the windows and windows shocking", user: "lastraindrop", url: "https://freesound.org/people/lastraindrop/sounds/716989/" },
  { name: "Quiet summer night tone with steady close crickets and other animal calls 1", user: "leonelmail", url: "https://freesound.org/people/leonelmail/sounds/579572/" },
  { name: "Fire close 1.wav", user: "Poulpy2.0", url: "https://freesound.org/people/Poulpy2.0/sounds/679405/" },
  { name: "JM_AMB_Room Tone 01_MONO", user: "Julien_Matthey", url: "https://freesound.org/people/Julien_Matthey/sounds/837886/" },
];
