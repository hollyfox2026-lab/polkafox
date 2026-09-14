type MediaLike = { matches: boolean } | null;
type NavLike = { standalone?: boolean };

function defaultNav(): NavLike {
  return typeof navigator === "undefined" ? {} : (navigator as Navigator & { standalone?: boolean });
}

function defaultDisplayModes(): MediaLike[] {
  if (typeof window === "undefined") return [null];
  return [
    window.matchMedia("(display-mode: standalone)"),
    window.matchMedia("(display-mode: minimal-ui)"),
    window.matchMedia("(display-mode: fullscreen)"),
  ];
}

/**
 * Отдельное окно с экрана «Домой»: у него своя память, не общая с Safari.
 * iOS 16.4+ изолирует и standalone, и minimal-ui.
 */
export function isIsolatedHomeScreen(
  modes: MediaLike[] = defaultDisplayModes(),
  nav: NavLike = defaultNav(),
): boolean {
  if (nav.standalone) return true;
  return modes.some((mode) => Boolean(mode?.matches));
}

export function isStandaloneDisplay(
  media: MediaLike = typeof window === "undefined"
    ? null
    : window.matchMedia("(display-mode: standalone)"),
  nav: NavLike = defaultNav(),
): boolean {
  return isIsolatedHomeScreen([media], nav);
}

export function isAppleMobile(
  ua: string = typeof navigator === "undefined" ? "" : navigator.userAgent,
): boolean {
  return /iPad|iPhone|iPod/.test(ua);
}
