/**
 * The systems of the run, in the order they are given each moment of a turn (game/system.ts). The order matters where
 * one leans on another: where you are is settled before who you are fighting, and what the world does unasked comes
 * after everything the turn itself did.
 */
import type { System } from "../system.js";
import { places } from "./places.js";
import { factions } from "./factions.js";
import { fight } from "./fight.js";
import { quests } from "./quests.js";
import { goods } from "./goods.js";
import { upkeep } from "./upkeep.js";
import { events } from "./events.js";
import { perks } from "./perks.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SYSTEMS: readonly System<any, any>[] = [places, factions, fight, quests, goods, upkeep, events, perks];

/** The systems named, in their usual order; unknown names are left out. */
export const systemsNamed = (names: readonly string[]): System<any, any>[] => SYSTEMS.filter((s) => names.includes(s.name));
