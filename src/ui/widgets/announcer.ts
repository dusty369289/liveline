// What a screen reader hears on the train page. The live part is drawn again on every poll, so a live region inside
// it would be a new element each time (some screen readers miss those, others read the whole block again). Instead
// one live region outside it, kept for the page's life, says only what changed.
//
// What counts as news is judged by a key, not the words on screen: the countdown ticks down and the clock times and
// lateness move on nearly every poll, and a reader that spoke each of those would never be quiet. When a key changes,
// the whole current text is said, times and all.

interface Heard { headline: string; hero: string; headlineKey: string; heroKey: string }

const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const parts = (el: Element | null) => (el && el.children.length ? [...el.children] : el ? [el] : []);
// The hero's parts ("37", "min", "until it reaches…") are spans with nothing between, so read them as separate words
const words = (els: Element[]) => els.map(text).filter(Boolean).join(" ");
// The countdown's number is not news ("Now" and "Due" are); its platform and clock time are
const isCount = (el: Element) => el.matches(".live__hero-num, .live__hero-unit") && /^\d*$|^min$/.test(text(el));
// Clock times ("09:23") and lateness ("(2 min late)", "on time", "4 min after expected") are not news on their own.
// Any case: the engine writes "on time" mid-sentence, and a train flipping to "1 min late" is not news either.
const headlineKey = (s: string) =>
  s.replace(/\b\d{1,2}:\d{2}\b/g, "").replace(/\(?\b(\d+ min (late|early)|on time)\)?|\b\d+ min after expected/gi, "")
    .replace(/\s+/g, " ").trim();

const read = (region: ParentNode): Heard => {
  // The headline ends in a full stop, and the news joins its parts with ". ", so it would be said with two
  const headline = text(region.querySelector(".live__headline")).replace(/\.$/, "");
  const hero = parts(region.querySelector(".live__hero"));
  return { headline, hero: words(hero), headlineKey: headlineKey(headline), heroKey: words(hero.filter((el) => !isCount(el))) };
};

export class Announcer {
  private last: Heard;

  /** `el` is the live region; what `region` shows when the page opens counts as already heard (it's on screen). */
  constructor(private readonly el: HTMLElement, region: ParentNode) {
    this.last = read(region);
  }

  /**
   * After a poll redrew `region`: when the headline's or the hero's news changed, the headline, plus the hero line when
   * its news changed. `forced` (you tapped refresh) says "Updated" when there's no news, so the tap isn't met with silence.
   */
  heard(region: ParentNode, forced: boolean): void {
    const now = read(region);
    const heroNews = now.heroKey !== this.last.heroKey;
    const fresh = heroNews || now.headlineKey !== this.last.headlineKey;
    const news = [now.headline, heroNews ? now.hero : ""].filter(Boolean).join(". ");
    this.last = now;
    if (fresh && news) this.say(news);
    else if (forced) this.say("Updated");
  }

  /** Say something else (a refresh refused, a fetch failed). */
  say(message: string): void {
    this.el.textContent = message;
  }
}
