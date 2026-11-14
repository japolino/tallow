/**
 * You may sit down as one of your own personas (session.ts, whoYouAre): in the room they are on a paper with a box each
 * (room/roster.ts), and a written line is read for one of them by meaning, by its words only when no model can tell.
 */
import { describe, expect, test } from "bun:test";
import type { CardInfo, Persona } from "../src/game/card.js";
import type { Table, Written } from "../src/game/table.js";
import { rowAt, rowHeight } from "../src/room/roster.js";

const KESTREL: Persona = { name: "Kestrel", who: "Cartographer. A wandering cartographer with a bad knee and a good memory.", title: "Cartographer" };
const ROOK: Persona = { name: "Rook", who: "A one-eyed smuggler who owes everyone money." };
const MAREN: CardInfo = { name: "Maren Vell", description: "Maren Vell is a lamplighter in a river town, thirty-one, quick-tongued and stubborn." };