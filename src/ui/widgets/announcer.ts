// What a screen reader hears on the train page. The live part is drawn again on every poll, so a live region inside
// it would be a new element each time (some screen readers miss those, others read the whole block again). Instead
// one live region outside it, kept for the page's life, says only what changed.

interface Heard { headline: string; hero: string }

const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const read = (region: ParentNode): Heard => ({ headline: text(region.querySelector(".live__headline")), hero: text(region.querySelector(".live__hero")) });

export class Announcer {
  private last: Heard;
  private spoken: string; // the last news said, so the same news isn't said twice

  /** `el` is the live region; what `region` shows when the page opens counts as already heard (it's on screen). */
  constructor(private readonly el: HTMLElement, region: ParentNode) {
    this.last = read(region);
    this.spoken = this.last.headline;
  }

  /**
   * After a poll redrew `region`: the headline, plus the big number when it changed, if that isn't what was said last.
   * `forced` (you tapped refresh) says "Updated" when there's no news, so the tap isn't met with silence.
   */
  heard(region: ParentNode, forced: boolean): void {
    const now = read(region);
    const news = [now.headline, now.hero !== this.last.hero ? now.hero : ""].filter(Boolean).join(". ");
    this.last = now;
    if (news && news !== this.spoken) {
      this.spoken = news;
      this.say(news);
    } else if (forced) this.say("Updated");
  }

  /** Say something else (a refresh refused, a fetch failed). */
  say(message: string): void {
    this.el.textContent = message;
  }
}
