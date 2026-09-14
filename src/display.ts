export function isStandaloneDisplay(
  media: { matches: boolean } | null = typeof window === "undefined"
    ? null
    : window.matchMedia("(display-mode: standalone)"),
  nav: { standalone?: boolean } = typeof navigator === "undefined"
    ? {}
    : (navigator as Navigator & { standalone?: boolean }),
): boolean {
  return Boolean(media?.matches || nav.standalone);
}

export function isAppleMobile(
  ua: string = typeof navigator === "undefined" ? "" : navigator.userAgent,
): boolean {
  return /iPad|iPhone|iPod/.test(ua);
}
