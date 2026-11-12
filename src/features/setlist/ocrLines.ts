import { isSetlistJunk, normalizeSetlistLine } from '../../shared/setlist/titles';

// Text read from a photo of a setlist (the paper taped to the stage, a
// screenshot) → one song per line for the textarea, where the person fixes
// what the OCR got wrong before sending.
//
// Blocks arrive in reading order (recognizeImageText: native OCR is ordered
// column by column, left to right, each top to bottom). Within that order:
// 1. list markers go: «1.», «01 -», «2)», «(3)», «#4», bullets «•», «-», «*»;
// 2. a word broken with a hyphen at the end of a line is joined with the next
//    line when that one starts in lower case («Can-» + «ción» → «Canción»);
// 3. empty lines, lines that are only numbers / punctuation and section
//    markers («Setlist», «Encore», «Bis») are dropped (same rule as the
//    database, src/shared/setlist/titles.ts).

const BULLET = /^[•·▪●◦‣○■□*>~\-–—]+\s*/u;
// A number followed by a separator: «1.», «01 -», «2)», «(3)», «#4:», «5/».
const NUMBERED = /^(?:#\s*)?\(?\d{1,3}\s*[.)\]:/\-–—]\s*/u;
// A zero-padded or #-number with only a space after it: «01 Canción», «#4 Canción».
const PADDED = /^(?:0\d|#\d{1,3})\s+(?=\S)/u;

export const stripListMarker = (line: string) => {
  let result = normalizeSetlistLine(line);
  for (let i = 0; i < 2; i += 1) {
    const next = result.replace(BULLET, '').replace(NUMBERED, '').replace(PADDED, '').trim();
    if (next === result) break;
    result = next;
  }
  return result;
};

const ENDS_WITH_BROKEN_WORD = /\p{L}-$/u;
const STARTS_LOWERCASE = /^\p{Ll}/u;

export const joinHyphenatedBreaks = (lines: readonly string[]) => {
  const result: string[] = [];
  for (const line of lines) {
    const previous = result[result.length - 1];
    if (previous && ENDS_WITH_BROKEN_WORD.test(previous) && STARTS_LOWERCASE.test(line)) {
      result[result.length - 1] = `${previous.slice(0, -1)}${line}`;
    } else {
      result.push(line);
    }
  }
  return result;
};

export const ocrBlocksToSetlistLines = (blocks: readonly (readonly string[])[]) => {
  const lines = blocks.flatMap(block => block.map(normalizeSetlistLine)).filter(Boolean);
  // Hyphenated breaks first: «1. Can-» / «ción» still reads as one word.
  return joinHyphenatedBreaks(lines)
    .map(stripListMarker)
    .filter(line => line && !isSetlistJunk(line));
};
