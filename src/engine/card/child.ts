/**
 * Whether someone a card describes is a child, from the card's own words only: an age under 18, or the plain words
 * for a child, a baby, or someone days, weeks or months old. Courtship is never offered with such a person, and no
 * romantic or explicit scene includes one (docs/DESIGN.md, 7). Deliberately narrow: "young", "little", "kid" and the
 * like describe adults as often as not. Only the singular words count: "children" or "babies" are other people (a
 * dislike, a crowd in a list). And an age the card gives decides it: a card that says 18 or more, and gives no age
 * under 18, is an adult whatever its back story says ("she was a cheerful child once").
 *
 * Copied from the sibling project (its src/engine/card/child.ts), so the two can change separately.
 */

const NUM = "\\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a few|several";

/** Words that say the person is a child, unless they are someone's ("her children") or a group's name ("Children of the Moon"). */
const WORDS = new RegExp(
  [
    `(?<!\\b(?:her|his|their|its|my|your|our|of|with|for)\\s+(?:(?:a|an|the|two|three|many|own)\\s+)?)\\b(?:child|infant|toddler|newborn)\\b(?![-'’]|\\s+of\\b)`,
    `(?<!\\b(?:her|his|their|its|my|your|our|of|with|for)\\s+(?:(?:a|an|the|two|three|many|own)\\s+)?)\\bbaby\\b(?![-'’]|\\s+(?:blue|pink|face|faced|fat|doll|soft|steps|teeth)\\b)`,
    `\\b(?:${NUM})[-\\s](?:days?|weeks?|months?)[-\\s]old\\b`,
    `\\b(?:days|weeks|months)\\s+old\\b`,
    `\\baged?\\s+(?:${NUM})\\s+(?:days|weeks|months)\\b`,
    // Korean: 생후 (since birth), N개월/N주/N일 된·짜리 (N months/weeks/days old), 어린이/어린아이, 아동, and 아이 as a word
    // of its own (not 아이템, 아이디, 아이돌).
    "생후|\\d+\\s*(?:개월|주|일)\\s*(?:된|짜리)|어린\\s*(?:이|아이)|아동|(?<!\\p{Script=Hangul})아이(?:들)?(?:가|는|를|의|와|도|로|에게)?(?!\\p{Script=Hangul})",
    // Japanese and Chinese.
    "生後|子供|子ども|こども|幼児|乳児|赤ちゃん|赤ん坊|孩子|小孩|儿童|兒童|婴儿|嬰兒|幼儿|幼兒",
  ].join("|"),
  "iu",
);

/** An age the text gives: "12 years old", "12-year-old", "12yo", "aged 12", "age: 12", "(12)", "12살", "12세", "12歳", "12岁". */
const AGES = [
  /\b(\d{1,3})[-\s]?(?:years?|yrs?)[-\s]?old\b/gi,
  /\b(\d{1,3})\s?(?:yo|y\/o)\b/gi,
  /\bage[d:]?\s*:?\s*(\d{1,3})\b/gi,
  /\(\s*(\d{1,3})\s*\)/g,
  /(\d{1,3})\s*(?:살|세)(?!\p{Script=Hangul})/gu,
  /(\d{1,3})\s*(?:歳|才|岁|歲)/gu,
];

/** Ages written out in words, under 18: "a ten-year-old", "fifteen years old". */
const WORD_AGES = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen)[-\s](?:years?|yrs?)[-\s]old\b/i;

export function isChild(...texts: (string | null | undefined)[]): boolean {
  const text = texts.filter(Boolean).join("\n");
  const ages = AGES.flatMap((re) => [...text.matchAll(re)].map((m) => Number(m[1])));
  if (ages.some((a) => a < 18) || WORD_AGES.test(text)) return true;
  if (ages.some((a) => a >= 18)) return false;
  return WORDS.test(text);
}
