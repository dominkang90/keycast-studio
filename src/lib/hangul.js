// Hangul from key presses: the standard Korean layout (두벌식) turns letter keys into jamo, and the
// composer joins them into syllables the way the Windows Korean IME does, including double vowels
// and final consonants, a final consonant moving to the next syllable, and Backspace removing the
// last jamo of the syllable being composed.

const DUBEOLSIK = {
  q: 'ㅂ', w: 'ㅈ', e: 'ㄷ', r: 'ㄱ', t: 'ㅅ', y: 'ㅛ', u: 'ㅕ', i: 'ㅑ', o: 'ㅐ', p: 'ㅔ',
  a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ', h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ',
  z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ', b: 'ㅠ', n: 'ㅜ', m: 'ㅡ',
};
const SHIFTED = { q: 'ㅃ', w: 'ㅉ', e: 'ㄸ', r: 'ㄲ', t: 'ㅆ', o: 'ㅒ', p: 'ㅖ' };

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const VOWEL_PAIRS = { 'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ', 'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ', 'ㅡㅣ': 'ㅢ' };
const FINAL_PAIRS = { 'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄵ', 'ㄴㅎ': 'ㄶ', 'ㄹㄱ': 'ㄺ', 'ㄹㅁ': 'ㄻ', 'ㄹㅂ': 'ㄼ', 'ㄹㅅ': 'ㄽ', 'ㄹㅌ': 'ㄾ', 'ㄹㅍ': 'ㄿ', 'ㄹㅎ': 'ㅀ', 'ㅂㅅ': 'ㅄ' };
const FINAL_SPLIT = Object.fromEntries(Object.entries(FINAL_PAIRS).map(([pair, one]) => [one, [pair[0], pair[1]]]));

const isVowel = (j) => JUNG.includes(j);

/** The jamo a key types on the standard Korean layout, or null for keys that type none. */
export function jamoForKey(name, shift = false) {
  if (typeof name !== 'string' || name.length !== 1) return null;
  const k = name.toLowerCase();
  return (shift && SHIFTED[k]) || DUBEOLSIK[k] || null;
}

const EMPTY = Object.freeze({ cho: '', jung: '', jong: '' });

function render(s) {
  if (s.cho && s.jung) {
    return String.fromCharCode(0xac00 + (CHO.indexOf(s.cho) * 21 + JUNG.indexOf(s.jung)) * 28 + JONG.indexOf(s.jong));
  }
  return s.cho || s.jung || '';
}

/**
 * A Hangul composer. `type(jamo)`, `other(text)` for any other character, `backspace()`; `labels()`
 * gives the characters on screen, one per syllable or character.
 */
export class HangulComposer {
  constructor() {
    this.done = [];
    this.cur = EMPTY;
    this.hist = [];
  }

  set(next) {
    this.hist.push(this.cur);
    this.cur = Object.freeze(next);
  }

  commit() {
    const ch = render(this.cur);
    if (ch) this.done.push(ch);
    this.cur = EMPTY;
    this.hist = [];
  }

  /** Starts a new syllable with `next`; Backspace can go back to an empty one. */
  fresh(next) {
    this.commit();
    this.hist = [EMPTY];
    if (next.cho && next.jung) this.hist.push(Object.freeze({ cho: next.cho, jung: '', jong: '' }));
    this.cur = Object.freeze(next);
  }

  type(j) {
    const c = this.cur;
    if (isVowel(j)) {
      if (!c.cho && !c.jung) this.set({ cho: '', jung: j, jong: '' });
      else if (c.cho && !c.jung) this.set({ ...c, jung: j });
      else if (!c.jong) {
        const pair = VOWEL_PAIRS[c.jung + j];
        if (pair) this.set({ ...c, jung: pair });
        else this.fresh({ cho: '', jung: j, jong: '' });
      } else {
        // The final consonant (or the second half of a double one) starts the next syllable.
        const split = FINAL_SPLIT[c.jong];
        const keep = split ? split[0] : '';
        const move = split ? split[1] : c.jong;
        this.cur = Object.freeze({ ...c, jong: keep });
        this.fresh({ cho: move, jung: j, jong: '' });
      }
      return;
    }
    // A consonant.
    if (!c.cho && !c.jung) this.set({ cho: j, jung: '', jong: '' });
    else if (!c.jung) this.fresh({ cho: j, jung: '', jong: '' });
    else if (!c.cho) this.fresh({ cho: j, jung: '', jong: '' });
    else if (!c.jong) {
      if (JONG.includes(j)) this.set({ ...c, jong: j });
      else this.fresh({ cho: j, jung: '', jong: '' });
    } else {
      const pair = FINAL_PAIRS[c.jong + j];
      if (pair) this.set({ ...c, jong: pair });
      else this.fresh({ cho: j, jung: '', jong: '' });
    }
  }

  other(text) {
    this.commit();
    this.done.push(text);
  }

  /** Removes the last jamo of the syllable being composed, or else the last character. */
  backspace() {
    if (render(this.cur)) this.cur = this.hist.pop() || EMPTY;
    else this.done.pop();
  }

  labels() {
    const ch = render(this.cur);
    return ch ? [...this.done, ch] : [...this.done];
  }
}

/** The text a run of keys types in Hangul mode (used by tests and the live preview). */
export function hangulText(keys) {
  const h = new HangulComposer();
  for (const k of keys) {
    if (k === 'Backspace') h.backspace();
    else {
      const j = jamoForKey(k.replace(/^\^/, ''), k.startsWith('^'));
      if (j) h.type(j); else h.other(k === 'Space' ? ' ' : k);
    }
  }
  return h.labels().join('');
}
