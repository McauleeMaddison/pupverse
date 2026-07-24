const ANALYTICS_DEBUG_KEY = "pupverse-analytics-debug";

function sanitiseProperties(properties = {}) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) =>
      ["string", "number", "boolean"].includes(typeof value)
    )
  );
}

export function trackEvent(name, properties = {}) {
  const event = {
    name,
    properties: sanitiseProperties(properties),
    occurredAt: new Date().toISOString(),
  };

  window.dataLayer?.push({ event: name, ...event.properties });
  window.pupverseAnalytics?.track?.(name, event.properties);

  if (window.localStorage?.getItem(ANALYTICS_DEBUG_KEY) === "true") {
    console.info("[PupVerse analytics]", event);
  }
}
