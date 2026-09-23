/* ---------------------------------------------------------------
   Zen & Dynamics brand mark helpers. New in this pass — the original
   had no logo anywhere. Two assets, both shipped in icons/:
     icons/mark.png         square icon (also the PWA/app icon)
     icons/logo-lockup.png  full wordmark, for a prominent hero use
   Both keep the logo's native black background/rounded-badge look
   (it was designed on black), so they drop cleanly onto the app's
   white content areas and blend seamlessly into the black header bar.
----------------------------------------------------------------*/

/** Small square mark, used inline in the black header bar next to the org/person name. */
export function brandMark() {
  return '<img class="brand-mark" src="icons/mark.png" alt="Zen & Dynamics" width="30" height="30" />';
}

/** Full wordmark lockup, used prominently on screens with no header bar yet (setup, recovery). */
export function brandHero() {
  return '<div class="brand-hero"><img src="icons/logo-lockup.png" alt="Zen & Dynamics" /></div>';
}
