// Detect the server's single-verdict protocol before replacing any page controls.
export const isNativeReviewPage = (root: Document): boolean =>
  root.querySelector('#verdictbuttons_cheating, input[name="cheating"], #submitverdictform input[name="verdict_tick"]') !== null;
