const JAIPUR_BOUNDS = {
  south: 26.72,
  west: 75.62,
  north: 27.12,
  east: 76.05,
};
const CACHE_TTL = 5 * 60_000;
const providerCache = new Map();
const nominatimCache = new Map();
let lastGeocodeAt = 0;
let geocodeQueue = Promise.resolve();

function withinJaipur(lat, lon) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= JAIPUR_BOUNDS.south &&
    lat <= JAIPUR_BOUNDS.north &&
    lon >= JAIPUR_BOUNDS.west &&
    lon <= JAIPUR_BOUNDS.east
  );
}

async function cached(cache, key, ttl, load) {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.value;
  const value = await load();
  cache.set(key, { value, expiresAt: Date.now() + ttl });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return value;
}

async function providerFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": "CityPulse/1.0 (Jaipur civic intelligence; Open data dashboard)",
        ...options.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`Provider returned HTTP ${response.status}`);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function weatherCodeLabel(code) {
  if (code === 0) return "Clear sky";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Current conditions";
}

export async function getJaipurWeather(latitude, longitude) {
  if (!withinJaipur(latitude, longitude)) {
    throw new Error("Choose a location within Jaipur.");
  }
  const cacheKey = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
  return cached(providerCache, `weather:${cacheKey}`, CACHE_TTL, async () => {
    const query = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current:
        "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,weather_code,wind_speed_10m,wind_direction_10m",
      timezone: "Asia/Kolkata",
    });
    const response = await providerFetch(`https://api.open-meteo.com/v1/forecast?${query}`);
    const data = await response.json();
    const current = data.current;
    if (!current || !Number.isFinite(current.temperature_2m)) {
      throw new Error("Weather provider returned an incomplete observation.");
    }
    return {
      status: "live",
      source: "Open-Meteo",
      attribution: "Weather data by Open-Meteo",
      observedAt: current.time,
      temperatureC: current.temperature_2m,
      feelsLikeC: current.apparent_temperature,
      humidityPercent: current.relative_humidity_2m,
      precipitationMm: current.precipitation,
      rainMm: current.rain,
      windKph: current.wind_speed_10m,
      windDirectionDegrees: current.wind_direction_10m,
      weatherCode: current.weather_code,
      condition: weatherCodeLabel(current.weather_code),
    };
  });
}

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .trim();
}

function xmlTag(item, tag) {
  const match = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

export async function getJaipurNews(area, language = "en") {
  const normalizedLanguage = language === "hi" ? "hi" : "en";
  const safeArea = area.replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim().slice(0, 80);
  if (!safeArea) throw new Error("Search for a Jaipur area to see its news.");
  const cacheKey = `${normalizedLanguage}:${safeArea.toLowerCase()}`;
  return cached(providerCache, `news:${cacheKey}`, CACHE_TTL, async () => {
    const query = new URLSearchParams({
      q: `${safeArea} Jaipur`,
      hl: normalizedLanguage === "hi" ? "hi-IN" : "en-IN",
      gl: "IN",
      ceid: normalizedLanguage === "hi" ? "IN:hi" : "IN:en",
    });
    const response = await providerFetch(
      `https://news.google.com/rss/search?${query}`,
      { headers: { Accept: "application/rss+xml, application/xml, text/xml" } },
    );
    const xml = await response.text();
    const news = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)]
      .slice(0, 8)
      .map(([, item]) => ({
        title: xmlTag(item, "title"),
        url: xmlTag(item, "link"),
        publisher: xmlTag(item, "source") || "Google News",
        publishedAt: xmlTag(item, "pubDate"),
      }))
      .filter((item) => item.title && /^https:\/\//i.test(item.url));
    return {
      status: "live",
      source: "Google News RSS",
      attribution: "Headlines by Google News; original publishers linked",
      news,
    };
  });
}

export async function searchJaipurPlaces(query) {
  const normalizedQuery = query.trim().slice(0, 80);
  if (normalizedQuery.length < 3) return [];
  const key = normalizedQuery.toLocaleLowerCase();
  const cachedResult = nominatimCache.get(key);
  if (cachedResult && cachedResult.expiresAt > Date.now()) return cachedResult.value;

  const task = geocodeQueue.then(async () => {
    const waitMs = Math.max(0, 1100 - (Date.now() - lastGeocodeAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastGeocodeAt = Date.now();
    const params = new URLSearchParams({
      q: `${normalizedQuery}, Jaipur, Rajasthan, India`,
      format: "jsonv2",
      addressdetails: "1",
      limit: "6",
      countrycodes: "in",
      viewbox: `${JAIPUR_BOUNDS.west},${JAIPUR_BOUNDS.north},${JAIPUR_BOUNDS.east},${JAIPUR_BOUNDS.south}`,
      bounded: "1",
    });
    const response = await providerFetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      { headers: { "Accept-Language": "en" } },
    );
    const records = await response.json();
    const results = records
      .filter((place) => withinJaipur(Number(place.lat), Number(place.lon)))
      .map((place) => ({
        id: String(place.place_id),
        name: place.name || place.display_name.split(",")[0],
        displayName: place.display_name,
        category: place.type || place.class || "place",
        latitude: Number(place.lat),
        longitude: Number(place.lon),
        source: "OpenStreetMap / Nominatim",
      }));
    nominatimCache.set(key, { value: results, expiresAt: Date.now() + 60 * 60_000 });
    if (nominatimCache.size > 500) {
      nominatimCache.delete(nominatimCache.keys().next().value);
    }
    return results;
  });
  geocodeQueue = task.catch(() => {});
  return task;
}

export async function getJaipurTraffic(latitude, longitude) {
  if (!withinJaipur(latitude, longitude)) {
    throw new Error("Choose a location within Jaipur.");
  }
  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) {
    return {
      status: "not_configured",
      source: "TomTom Traffic",
      message: "Live traffic is unavailable until a TomTom developer key is configured.",
    };
  }
  const key = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
  return cached(providerCache, `traffic:${key}`, 60_000, async () => {
    const query = new URLSearchParams({
      key: apiKey,
      point: `${latitude},${longitude}`,
      unit: "KMPH",
    });
    const response = await providerFetch(
      `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?${query}`,
    );
    const data = await response.json();
    const flow = data.flowSegmentData;
    if (!flow || !Number.isFinite(flow.currentSpeed)) {
      throw new Error("Traffic provider returned no road-flow observation here.");
    }
    return {
      status: "live",
      source: "TomTom Traffic",
      currentSpeedKph: flow.currentSpeed,
      freeFlowSpeedKph: flow.freeFlowSpeed,
      confidence: flow.confidence,
      roadClosed: flow.roadClosure === true,
      observedAt: new Date().toISOString(),
    };
  });
}

export async function getJaipurAreaBriefing({ latitude, longitude, name, language }) {
  const areaName = name.trim().slice(0, 80);
  if (!areaName) throw new Error("An area name is required.");
  const results = await Promise.allSettled([
    getJaipurWeather(latitude, longitude),
    getJaipurNews(areaName, language),
    getJaipurTraffic(latitude, longitude),
  ]);
  const [weather, news, traffic] = results.map((result) =>
    result.status === "fulfilled"
      ? result.value
      : { status: "unavailable", message: "This source is temporarily unavailable." },
  );
  return {
    area: { name: areaName, latitude, longitude },
    weather,
    news,
    traffic,
    incidents: news.status === "live" ? news.news.filter((item) =>
      /\b(accident|collision|crash|fire|flood|rescue|police|injur|दुर्घटना|आग|बाढ़|पुलिस)\b/i.test(item.title),
    ) : [],
    asOf: new Date().toISOString(),
    sources: [
      ...(weather.status === "live" ? ["Open-Meteo"] : []),
      ...(news.status === "live" ? ["Google News RSS"] : []),
      ...(traffic.status === "live" ? ["TomTom Traffic"] : []),
    ],
  };
}

const placeCache = new Map();
const PLACES_QUERY = {
  areas: (bounds) => `nwr["place"~"suburb|neighbourhood|quarter"](${bounds});`,
  hospitals: (bounds) => `nwr["amenity"~"hospital|clinic"](${bounds});`,
  landmarks: (bounds) =>
    `nwr["tourism"~"attraction|museum|viewpoint"](${bounds}); nwr["historic"](${bounds}); nwr["amenity"="place_of_worship"](${bounds});`,
};

export async function getJaipurPlaces(group = "all") {
  const validGroup = ["all", "areas", "hospitals", "landmarks"].includes(group)
    ? group
    : "all";
  return cached(placeCache, validGroup, 60 * 60_000, async () => {
    const groups = validGroup === "all" ? ["areas", "hospitals", "landmarks"] : [validGroup];
    const bounds = `${JAIPUR_BOUNDS.south},${JAIPUR_BOUNDS.west},${JAIPUR_BOUNDS.north},${JAIPUR_BOUNDS.east}`;
    const statements = groups.map((name) => PLACES_QUERY[name](bounds)).join("\n");
    const query = `[out:json][timeout:20];(${statements});out center tags 300;`;
    const response = await providerFetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }),
    });
    const data = await response.json();
    const places = (data.elements || [])
      .map((place) => {
        const tags = place.tags || {};
        const latitude = place.lat ?? place.center?.lat;
        const longitude = place.lon ?? place.center?.lon;
        if (!withinJaipur(latitude, longitude)) return null;
        const category =
          tags.amenity === "hospital" || tags.amenity === "clinic"
            ? "hospital"
            : tags.place
              ? "area"
              : "landmark";
        return {
          id: `${place.type}/${place.id}`,
          name: tags.name || tags["name:en"] || tags["name:hi"],
          category,
          latitude,
          longitude,
          address: [tags["addr:suburb"], tags["addr:city"]].filter(Boolean).join(", "),
          source: "OpenStreetMap",
        };
      })
      .filter((place) => place?.name)
      .filter((place, index, items) =>
        items.findIndex(
          (item) =>
            item.name.toLocaleLowerCase() === place.name.toLocaleLowerCase() &&
            item.category === place.category,
        ) === index,
      )
      .slice(0, 300);
    return { status: "live", source: "OpenStreetMap", attribution: "© OpenStreetMap contributors", places };
  });
}

export function isJaipurCoordinate(latitude, longitude) {
  return withinJaipur(latitude, longitude);
}
