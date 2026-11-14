/**
 * What the table shows instead of numbers: the scale that weighs a check, and
 * the narrator's spoken words, and how words are laid out on a page and in a
 * speech. No browser: only the parts that are plain code.
 */
import { describe, expect, test } from "bun:test";
import { tipShown } from "../src/room/counters.js";
import { wrapText } from "../src/room/paper.js";
import { passages, wordTime } from "../src/room/voice.js";