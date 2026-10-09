// GE5219 Final Project: interactive map of 5- and 10-minute walking accessibility.
// Reads HOMES (data_homes.js) and AMENITIES (data_amenities.js), both written by Notebook 06,
// and REACH (data_reach.js, written by Notebook 07): the amenities each home reaches along the walking network.

// ---------------------------------------------------------------------------
// 1. Settings
// ---------------------------------------------------------------------------

// The five domains: short key used in the data, and the label shown to users
const DOMAINS = [
  // Food: hawker centres, food courts and coffee shops
  { key: "food", label: "Food" },
  // Groceries: supermarkets and wet markets
  { key: "groc", label: "Groceries" },
  // Healthcare: clinics, polyclinics, hospitals, pharmacies, eldercare
  { key: "health", label: "Healthcare" },
  // Parks & Recreation: parks, nature reserves, sports fields, gyms
  { key: "park", label: "Parks & Recreation" },
  // Public Transport: bus stops and MRT stations
  { key: "pt", label: "Public Transport" },
];

// Upper limits of the first four score classes: five equal bands of 20 points (the fifth class is 80–100)
const BREAKS = [20, 40, 60, 80];
// Colour per class on a light page: yellow (low score) to dark blue (high score), from the viridis scale, readable with colour-vision differences
const COLOURS_LIGHT = ["#fde725", "#7ad151", "#22a884", "#2a788e", "#414487"];
// Colour per class on a dark page: dark blue (low score) to yellow (high score), so higher scores stay the most visible
const COLOURS_DARK = ["#3e4a89", "#2a788e", "#22a884", "#7ad151", "#fde725"];
// Normalisation caps per domain (outputs/normalisation_caps.csv): the 95th percentile of the 10-minute counts
const CAPS = { food: 9, groc: 6, health: 23, park: 5, pt: 30 };
// Parks & Recreation cap without paid gyms (outputs/no_paid_gyms/normalisation_caps.csv)
const PARK_CAP_NO_GYMS = 4;
// Opacity of the home dots: normal, and faded while a building is selected
const DOT_OPACITY = { normal: 0.9, faded: 0.2 };
// Colour of the amenity dots (orange, so they stand apart from the blue homes)
const AMENITY_COLOUR = "#c4581c";
// Weights for the "Older residents" preset (Healthcare and Groceries count more)
const OLDER_WEIGHTS = { food: 15, groc: 25, health: 35, park: 10, pt: 15 };
// Map centre (Singapore) and starting zoom level
const START_VIEW = { center: [1.3521, 103.8198], zoom: 12 };
// Colour of each domain for the amenities of a selected building
const DOMAIN_COLOURS = { "Food": "#d9731a", "Groceries": "#7b4bb5", "Healthcare": "#c8323c", "Parks & Recreation": "#2f8a3e", "Public Transport": "#3d4650" };
// Letter shown on the amenity symbols of each domain
const DOMAIN_LETTERS = { "Food": "F", "Groceries": "G", "Healthcare": "H", "Parks & Recreation": "P", "Public Transport": "T" };
// Metres walked per minute at 4.8 km/h, as in Notebooks 03 and 07
const M_PER_MIN = 80;
// Sub-category of paid gyms (hidden when the gym switch is off)
const GYM_CATEGORY = "Gym";
// File with the walking routes from Notebook 07, loaded after the map is drawn
const REACH_FILE = "data_reach.js";
// Colour of the walkable-area outlines of a selected building
const OUTLINE_COLOUR = "#1c5cab";
// Fill opacity of the 10-minute area (lighter) and the 5-minute area (darker, drawn on top)
const OUTLINE_FILL = { 10: 0.08, 5: 0.18 };

// ---------------------------------------------------------------------------
// 2. State: everything the user can change
// ---------------------------------------------------------------------------

// Current settings of the page
const state = {
  // Walking time in minutes (5 or 10)
  t: 10,
  // Which housing groups are shown on the map
  show: { HDB: true, Private: true },
  // Weight per domain (0–100); equal at the start
  weights: { food: 20, groc: 20, health: 20, park: 20, pt: 20 },
  // Whether paid gyms count under Parks & Recreation
  gyms: true,
  // Index of the selected building (null when none is selected)
  selected: null,
  // Whether the other buildings are hidden while a building is selected
  hideOthers: false,
};

/**
 * True when the page is shown in its dark theme (chosen by the viewer or by the device).
 * @returns {boolean}
 */
function isDark() {
  // Theme chosen explicitly on the page, if any
  const chosen = document.documentElement.dataset.theme;
  // An explicit choice wins; otherwise follow the device setting
  return chosen ? chosen === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Colours of the five score classes for the current theme.
 * @returns {string[]} five hex colours, lowest class first.
 */
function classColours() {
  // Dark palette on a dark page, light palette otherwise
  return isDark() ? COLOURS_DARK : COLOURS_LIGHT;
}

// Number of homes in the data
const N = HOMES.home_id.length;
// Overall score of every home under the current settings
const scores = new Float64Array(N);

// ---------------------------------------------------------------------------
// 3. Calculations
// ---------------------------------------------------------------------------

/**
 * Column name of a domain value for the current settings.
 * Parks & Recreation switches to the "no paid gyms" columns when gyms are off.
 * @param {string} prefix - "s" for the domain score or "n" for the count.
 * @param {string} key - domain key, e.g. "park".
 * @returns {string} column name in HOMES, e.g. "s_park_10" or "s_park_10_ng".
 */
function col(prefix, key) {
  // Base column name, e.g. "s_food_10"
  const name = `${prefix}_${key}_${state.t}`;
  // Use the no-gym column for parks when gyms are switched off
  return key === "park" && !state.gyms ? `${name}_ng` : name;
}

/**
 * Recompute the overall score (0–100) of every home from its domain scores.
 * Score = 100 × Σ(weight × domain score) / Σ weights, the same formula as Notebook 06.
 * @returns {void} fills the global `scores` array.
 */
function computeScores() {
  // Sum of the weights; 1 is used when all sliders are at zero to avoid dividing by zero
  const total = DOMAINS.reduce((sum, d) => sum + state.weights[d.key], 0) || 1;
  // The domain-score column of each domain for the current settings
  const columns = DOMAINS.map((d) => HOMES[col("s", d.key)]);
  // The weight of each domain as a share of the total
  const shares = DOMAINS.map((d) => state.weights[d.key] / total);
  // Loop over all homes
  for (let i = 0; i < N; i++) {
    // Start the weighted sum at zero
    let s = 0;
    // Add each domain's weighted score
    for (let k = 0; k < DOMAINS.length; k++) s += shares[k] * columns[k][i];
    // Store the score on the 0–100 scale
    scores[i] = 100 * s;
  }
}

/**
 * Colour of a score, from the five-class blue scale.
 * @param {number} score - overall score (0–100).
 * @returns {string} hex colour.
 */
function colourOf(score) {
  // Colours of the current theme
  const colours = classColours();
  // Find the first class whose upper limit is above the score
  const k = BREAKS.findIndex((b) => score < b);
  // Scores of 80 and above fall in the top class
  return colours[k === -1 ? colours.length - 1 : k];
}

/**
 * Unit-weighted summary of HDB and private homes under the current settings.
 * @returns {object} mean score, share of units reaching all five domains,
 *   and the gap overall and within subzones (private minus HDB).
 */
function summarise() {
  // Running totals per housing group
  const acc = { HDB: { w: 0, ws: 0, wall: 0 }, Private: { w: 0, ws: 0, wall: 0 } };
  // Running totals per subzone and group, for the within-subzone gap
  const zones = new Map();
  // Count columns of the five domains for the current settings
  const counts = DOMAINS.map((d) => HOMES[col("n", d.key)]);
  // Loop over all homes
  for (let i = 0; i < N; i++) {
    // Housing group of this home
    const g = HOMES.housing_group[i];
    // Dwelling units of this home (the weight)
    const w = HOMES.du[i];
    // True when every domain has at least one amenity within reach
    const all = counts.every((c) => c[i] > 0);
    // Add the units to the group total
    acc[g].w += w;
    // Add the unit-weighted score
    acc[g].ws += w * scores[i];
    // Add the units that reach all five domains
    acc[g].wall += all ? w : 0;
    // Subzone of this home
    const z = HOMES.subzone[i];
    // Create the subzone totals the first time the subzone is seen
    if (!zones.has(z)) zones.set(z, { HDB: { w: 0, ws: 0 }, Private: { w: 0, ws: 0 } });
    // Add the units to the subzone and group total
    zones.get(z)[g].w += w;
    // Add the unit-weighted score to the subzone and group total
    zones.get(z)[g].ws += w * scores[i];
  }
  // Weighted sum of the subzone gaps
  let gapSum = 0;
  // Units in the subzones that have both groups
  let gapUnits = 0;
  // Loop over the subzones
  for (const z of zones.values()) {
    // Skip subzones that lack one of the groups
    if (z.HDB.w === 0 || z.Private.w === 0) continue;
    // Private mean minus HDB mean in this subzone
    const gap = z.Private.ws / z.Private.w - z.HDB.ws / z.HDB.w;
    // Units of both groups in this subzone, used as the weight
    const units = z.HDB.w + z.Private.w;
    // Add the weighted gap
    gapSum += gap * units;
    // Add the units
    gapUnits += units;
  }
  // Mean score of HDB homes
  const hdb = acc.HDB.ws / acc.HDB.w;
  // Mean score of private homes
  const priv = acc.Private.ws / acc.Private.w;
  // Return the summary values
  return {
    // Mean scores per group
    mean: { HDB: hdb, Private: priv },
    // Share of units reaching all five domains (%)
    allFive: { HDB: (100 * acc.HDB.wall) / acc.HDB.w, Private: (100 * acc.Private.wall) / acc.Private.w },
    // Overall gap, private minus HDB
    gap: priv - hdb,
    // Within-subzone gap, private minus HDB
    gapWithin: gapSum / gapUnits,
  };
}

// ---------------------------------------------------------------------------
// 4. Map
// ---------------------------------------------------------------------------

// Create the map; the canvas renderer draws thousands of dots quickly
const map = L.map("map", { preferCanvas: true, minZoom: 11, maxZoom: 19 }).setView(START_VIEW.center, START_VIEW.zoom);

// Base map drawn by Notebook 06 from the URA Master Plan 2025 land-use layer; it needs no internet connection
const planMap = L.imageOverlay(
  // The published page embeds the image as BASEMAP_DATA; the local page reads basemap.png from the web folder
  typeof BASEMAP_DATA !== "undefined" ? BASEMAP_DATA : "basemap.png",
  // Corners of the image: south-west and north-east (latitude, longitude)
  [[1.15, 103.59], [1.48, 104.10]],
  // Style hook for dark mode, and the credit for the data
  { className: "basemap-img", pane: "tilePane", attribution: "Base map: URA Master Plan 2025 land use" },
);

// The published page cannot load map tiles from other sites, so it uses the Master Plan base map only
if (typeof BASEMAP_DATA !== "undefined") {
  // Show the Master Plan base map
  planMap.addTo(map);
// The local or hosted page uses online tiles (OpenStreetMap first), with the Master Plan base map as a fallback
} else {
  // OneMap grey base map from the Singapore Land Authority
  const oneMap = L.tileLayer("https://www.onemap.gov.sg/maps/tiles/Grey/{z}/{x}/{y}.png", {
    // OneMap only has tiles over Singapore; asking outside this box returns "not found"
    bounds: [[1.144, 103.535], [1.494, 104.1]],
    // OneMap tiles start at zoom 11
    minZoom: 11,
    // Highest zoom level of the tiles
    maxZoom: 19,
    // Required credit for the base map
    attribution: '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener">OneMap</a> &copy; contributors | <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener">Singapore Land Authority</a>',
  // OneMap is offered in the base-map switch
  });
  // Esri light grey base map (no key needed)
  const esriGrey = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
    // Esri light grey tiles go up to zoom 16; larger zooms stretch them
    maxNativeZoom: 16,
    // Highest zoom level of the map
    maxZoom: 19,
    // Required credit for the base map
    attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS user community",
  });
  // OpenStreetMap standard base map (free for light use, with credit)
  const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    // Highest zoom level of the tiles
    maxZoom: 19,
    // Required credit for the base map
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  // OpenStreetMap is the base map shown at the start
  }).addTo(map);
  // Switch in the upper-right corner to choose the base map by hand
  L.control.layers({ "OpenStreetMap": osm, "OneMap (grey)": oneMap, "Esri (light grey)": esriGrey, "Master Plan 2025 (offline)": planMap }, null, { position: "topright" }).addTo(map);
  // Count of OpenStreetMap tiles that failed to load
  let tileErrors = 0;
  // Count of OpenStreetMap tiles that loaded
  let tilesLoaded = 0;
  // Count every tile that loads
  osm.on("tileload", () => { tilesLoaded++; });
  // If OpenStreetMap fails completely (for example on a page opened as a local file), switch to the offline Master Plan base map
  osm.on("tileerror", () => {
    // Switch only once, after ten failures and only when no OpenStreetMap tile has loaded at all
    if (++tileErrors !== 10 || tilesLoaded > 0) return;
    // Remove the OpenStreetMap layer
    map.removeLayer(osm);
    // Show the Master Plan base map below the dots
    planMap.addTo(map).bringToBack();
  });
}

// One layer per housing group, so each group can be shown or hidden
const groupLayers = { HDB: L.layerGroup().addTo(map), Private: L.layerGroup().addTo(map) };
// One dot per home, kept in an array so it can be recoloured
const markers = new Array(N);

// Loop over all homes to create their dots
for (let i = 0; i < N; i++) {
  // Dot at the home's location with a thin grey outline, so light colours stay visible on a light base map
  const m = L.circleMarker([HOMES.lat[i], HOMES.lon[i]], { radius: 3, color: "#555555", weight: 0.4, opacity: 0.6, fillOpacity: DOT_OPACITY.normal });
  // Remember which home the dot belongs to
  m.homeIndex = i;
  // Select the home when the dot is clicked: open its details and show its reachable amenities
  m.on("click", () => selectHome(i));
  // Add the dot to its housing-group layer
  m.addTo(groupLayers[HOMES.housing_group[i]]);
  // Keep the dot for recolouring
  markers[i] = m;
}

// Layer that holds the amenity dots of the chosen domain
const amenityLayer = L.layerGroup().addTo(map);

/**
 * HTML for the popup of one home.
 * @param {number} i - index of the home.
 * @returns {string} HTML with the score and a table of counts and nearest times.
 */
function popupHtml(i) {
  // One table row per domain
  const rows = DOMAINS.map((d) => {
    // Count within 5 minutes (no-gym value for parks when gyms are off)
    const n5 = HOMES[d.key === "park" && !state.gyms ? "n_park_5_ng" : `n_${d.key}_5`][i];
    // Count within 10 minutes
    const n10 = HOMES[d.key === "park" && !state.gyms ? "n_park_10_ng" : `n_${d.key}_10`][i];
    // Walking time to the nearest amenity; null when farther than 30 minutes
    const near = HOMES[`nearest_${d.key}_min`][i];
    // Build the row
    return `<tr><td>${d.label}</td><td>${n5}</td><td>${n10}</td><td>${near === null ? "&gt;30" : near.toFixed(1)}</td></tr>`;
  // Join the rows into one string
  }).join("");
  // Assemble the popup, starting with the address and postal code
  return `<strong>${HOMES.address[i]}</strong>, Singapore ${HOMES.postal[i]}<br>`
    // Housing group, type and units
    + `${HOMES.housing_group[i]} (${HOMES.subtype[i]}) · ${HOMES.du[i]} units<br>`
    // Subzone and planning area
    + `${titleCase(HOMES.subzone[i])}, ${titleCase(HOMES.pln_area[i])}<br>`
    // Score under the current settings, with its meaning
    + `Walking-access score: <strong>${scores[i].toFixed(1)} / 100</strong> (${state.t} min, your weights)<br><small>Higher scores mean better access to daily needs. See "How is the score calculated?" in the panel.</small><br>`
    // Table of counts and nearest times
    + `<table class="popup-table"><thead><tr><th>Domain</th><th>5 min</th><th>10 min</th><th>Nearest (min)</th></tr></thead><tbody>${rows}</tbody></table>`
    // How the times are measured
    + `<small>Counts and times follow walking routes on the pedestrian network, not straight lines.</small>`;
}

/**
 * Turn an upper-case name such as "TOH GUAN" into "Toh Guan".
 * @param {string} s - text in upper case.
 * @returns {string} text in title case.
 */
function titleCase(s) {
  // Lower-case everything, then capitalise the first letter of each word
  return String(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Make text safe to place inside HTML (names can contain "&" or "<").
 * @param {*} s - any value.
 * @returns {string} the text with HTML special characters escaped.
 */
function esc(s) {
  // Replace the five HTML special characters with their entities
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ---------------------------------------------------------------------------
// 4b. Selected building: reachable amenities and walkable area
// ---------------------------------------------------------------------------

// Layer for the selected building's amenities and outlines
const selectionLayer = L.layerGroup().addTo(map);
// Whether the home dots are currently faded (they fade while a building is selected)
let homesFaded = false;

/**
 * Fade the home dots while a building is selected, so its amenities stand out, and restore them afterwards.
 * @param {boolean} fade - true to fade, false to restore.
 * @returns {void}
 */
function fadeHomes(fade) {
  // Nothing to do when the dots are already in the requested state
  if (fade === homesFaded) return;
  // Remember the new state
  homesFaded = fade;
  // Apply the opacity to every home dot (fill and outline)
  for (const m of markers) m.setStyle({ fillOpacity: fade ? DOT_OPACITY.faded : DOT_OPACITY.normal, opacity: fade ? 0.15 : 0.6 });
}
// Amenity dot of each listed amenity, by its row in AMENITIES (used when a list item is clicked)
const selectionMarkers = new Map();
// Position of each code character in the alphabet of data_reach.js (filled once the file has loaded)
const codeValue = {};
// Whether data_reach.js has loaded (null while loading, false when it could not be loaded)
let reachReady = null;

/**
 * Load data_reach.js after the map is drawn, so the large file does not delay the first view.
 * @returns {void} sets `reachReady` and refreshes the selection when the file arrives.
 */
function loadReach() {
  // The file may already be on the page (for example in a single-file version)
  if (typeof REACH !== "undefined") { reachLoaded(); return; }
  // New script element for the file
  const tag = document.createElement("script");
  // Address of the file, next to the page
  tag.src = REACH_FILE;
  // When the file has loaded, prepare the decoder
  tag.onload = reachLoaded;
  // When the file is missing, record that route details are not available
  tag.onerror = () => { reachReady = false; renderSelection(); };
  // Add the element, which starts the download
  document.body.appendChild(tag);
}

/**
 * Prepare the decoder once data_reach.js is available, then refresh the selection.
 * @returns {void}
 */
function reachLoaded() {
  // Value (0–63) of every character in the alphabet
  for (let k = 0; k < REACH.alphabet.length; k++) codeValue[REACH.alphabet[k]] = k;
  // Mark the data as ready
  reachReady = true;
  // Show the details of a building selected while the file was loading
  renderSelection();
}

/**
 * Read a whole number written with the alphabet of data_reach.js.
 * @param {string} text - the full code string.
 * @param {number} start - position of the first character.
 * @param {number} width - number of characters.
 * @returns {number} the decoded number.
 */
function readNumber(text, start, width) {
  // Start from zero
  let v = 0;
  // Each character adds one base-64 digit
  for (let k = 0; k < width; k++) v = v * 64 + codeValue[text[start + k]];
  // Return the number
  return v;
}

/**
 * Amenities a home reaches within a walking distance, nearest first.
 * One entry per counted unit (for example one per MRT station or park), as in Notebook 03.
 * @param {number} i - index of the home.
 * @param {number} maxMetres - walking-distance limit in metres.
 * @returns {{j: number, m: number}[]} amenity row in AMENITIES and walking distance in metres.
 */
function reachableAmenities(i, maxMetres) {
  // Code string of this home
  const text = REACH.items[i];
  // Characters per amenity entry
  const step = REACH.idx_width + REACH.dist_width;
  // Decoded entries
  const out = [];
  // Loop over the entries
  for (let p = 0; p < text.length; p += step) {
    // Row of the amenity in AMENITIES
    const j = readNumber(text, p, REACH.idx_width);
    // Walking distance in metres
    const m = readNumber(text, p + REACH.idx_width, REACH.dist_width);
    // Entries are sorted by distance, so stop at the first one beyond the limit
    if (m > maxMetres) break;
    // Leave out paid gyms when the gym switch is off
    if (!state.gyms && AMENITIES.sub_category[j] === GYM_CATEGORY) continue;
    // Keep the entry
    out.push({ j, m });
  }
  // Return the entries
  return out;
}

/**
 * Corner points of a home's walkable-area outline.
 * Each of the 36 sectors (10° each, starting east and turning anticlockwise) has one radius from Notebook 07.
 * @param {number} i - index of the home.
 * @param {number} t - walking time in minutes (5 or 10).
 * @returns {number[][]} [latitude, longitude] of each corner.
 */
function outlineLatLngs(i, t) {
  // Radius codes of this home for the chosen time
  const text = t === 5 ? REACH.area5[i] : REACH.area10[i];
  // Latitude of the home
  const lat0 = HOMES.lat[i];
  // Longitude of the home
  const lon0 = HOMES.lon[i];
  // Metres per degree of latitude
  const mLat = 110574;
  // Metres per degree of longitude at this latitude
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  // Corner points
  const pts = [];
  // Loop over the sectors
  for (let k = 0; k < REACH.sectors; k++) {
    // Radius of this sector in metres
    const r = codeValue[text[k]] * REACH.step_m;
    // Direction of the sector centre, in radians from east
    const a = ((k + 0.5) * 2 * Math.PI) / REACH.sectors;
    // Corner point at that direction and radius
    pts.push([lat0 + (r * Math.sin(a)) / mLat, lon0 + (r * Math.cos(a)) / mLon]);
  }
  // Return the corners
  return pts;
}

/**
 * Straight-line distance between a home and an amenity, shown next to the walking distance for comparison.
 * @param {number} i - index of the home.
 * @param {number} j - row of the amenity.
 * @returns {number} distance in metres.
 */
function straightLine(i, j) {
  // Metres per degree of longitude at the home's latitude
  const mLon = 111320 * Math.cos((HOMES.lat[i] * Math.PI) / 180);
  // North-south difference in metres
  const dy = (AMENITIES.lat[j] - HOMES.lat[i]) * 110574;
  // East-west difference in metres
  const dx = (AMENITIES.lon[j] - HOMES.lon[i]) * mLon;
  // Length of the straight line
  return Math.hypot(dx, dy);
}

/**
 * Name of an amenity as shown to users.
 * @param {number} j - row of the amenity.
 * @returns {string} the name in title case when it is stored in capitals, or the type when there is no name.
 */
function amenityName(j) {
  // Stored name
  const name = AMENITIES.name[j];
  // No name: use the address when there is one, else the type (e.g. "Food court / coffee shop")
  if (!name) return (AMENITIES.address && AMENITIES.address[j]) || AMENITIES.sub_category[j];
  // Names stored in capitals (MRT stations, parks) read better in title case
  return name === name.toUpperCase() ? titleCase(name) : name;
}

/**
 * HTML for the popup of one amenity reached from the selected building.
 * @param {number} j - row of the amenity.
 * @param {number} m - walking distance in metres from the selected building.
 * @returns {string} HTML with the name, type, address and distances.
 */
function amenityPopupHtml(j, m) {
  // Address, when the source has one
  const address = AMENITIES.address ? AMENITIES.address[j] : "";
  // Park outline points mark where the walk reaches the park
  const parkNote = AMENITIES.domain[j] === "Parks & Recreation" && /Park|Nature reserve/.test(AMENITIES.sub_category[j]) ? "<br><small>Nearest point of the park edge from this building</small>" : "";
  // Assemble the popup: name, type and domain
  return `<strong>${esc(amenityName(j))}</strong><br>${esc(AMENITIES.sub_category[j])} · ${esc(AMENITIES.domain[j])}`
    // Address line
    + (address ? `<br>${esc(address)}` : "")
    // Note for park points
    + parkNote
    // Walking time and distance along the network
    + `<br><strong>${(m / M_PER_MIN).toFixed(1)} min walk (${m} m) by walking route</strong>`
    // Straight-line distance for comparison
    + `<br><small>Straight-line distance: ${Math.round(straightLine(state.selected, j))} m</small>`;
}

/**
 * Select a home: mark it, open its popup and show its reachable amenities.
 * @param {number} i - index of the home.
 * @returns {void}
 */
function selectHome(i) {
  // Remember the selection
  state.selected = i;
  // Draw the ring around the home
  foundRing.setLatLng([HOMES.lat[i], HOMES.lon[i]]).addTo(map);
  // Centre the map on the home, zooming in to street level if the map is further out
  map.setView([HOMES.lat[i], HOMES.lon[i]], Math.max(map.getZoom(), 16));
  // Draw the amenities, outlines and panel list
  renderSelection();
  // Open the home's details
  markers[i].bindPopup(popupHtml(i), { maxWidth: 340 }).openPopup();
}

/**
 * Clear the selected home and everything drawn for it.
 * @returns {void}
 */
function clearSelection() {
  // No home selected
  state.selected = null;
  // Remove the ring
  map.removeLayer(foundRing);
  // Close any open popup
  map.closePopup();
  // Remove the amenities and outlines, and hide the panel section
  renderSelection();
}

/**
 * Draw the selected home's walkable-area outlines and reachable amenities, and list them in the panel.
 * The list follows the walking time chosen in the panel; amenities beyond 5 minutes are drawn lighter.
 * @returns {void}
 */
function renderSelection() {
  // Remove what was drawn for the previous selection
  selectionLayer.clearLayers();
  // Forget the previous amenity dots
  selectionMarkers.clear();
  // Panel section of the selected building
  const section = document.getElementById("selection");
  // Body of that section
  const body = document.getElementById("selection-body");
  // Index of the selected home
  const i = state.selected;
  // Hide the section and show the hint when nothing is selected
  section.hidden = i === null;
  // Show the map key for the selected building only while a building is selected
  selectionKey.getContainer().hidden = i === null;
  // Mark the page while a building is selected (small screens then show the selection key instead of the score legend)
  document.body.classList.toggle("selecting", i !== null);
  // The hint is shown only when nothing is selected
  document.getElementById("select-hint").hidden = i !== null;
  // Fade the home dots while a building is selected
  fadeHomes(i !== null);
  // Hide or show the other buildings
  applyHideOthers();
  // Nothing more to draw without a selection
  if (i === null) return;
  // Address line of the selected building
  const head = `<p class="sel-address"><strong>${esc(HOMES.address[i])}</strong>, Singapore ${HOMES.postal[i]}</p>`
    // Housing group and type
    + `<p class="hint">${HOMES.housing_group[i]} (${HOMES.subtype[i]}) · ${HOMES.du[i]} units · score ${scores[i].toFixed(1)}</p>`;
  // Route data still loading
  if (reachReady === null) { body.innerHTML = head + `<p class="hint">Loading walking routes…</p>`; return; }
  // Route data not available (for example in the single-file version of the map)
  if (reachReady === false) { body.innerHTML = head + `<p class="hint">Route details are not available in this version of the map. The popup shows the counts and nearest walking times.</p>`; return; }
  // Walking-distance limit for the list (400 or 800 m)
  const limit = state.t * M_PER_MIN;
  // Amenities within the limit, nearest first
  const items = reachableAmenities(i, limit);
  // The selected building drawn again at full colour on top of the faded dots
  L.circleMarker([HOMES.lat[i], HOMES.lon[i]], { radius: 7, color: "#ffffff", weight: 2, fillColor: colourOf(scores[i]), fillOpacity: 1, interactive: false }).addTo(selectionLayer);
  // Outline of the area within 10 minutes (dashed)
  L.polygon(outlineLatLngs(i, 10), { color: OUTLINE_COLOUR, weight: 2, dashArray: "6 5", fillOpacity: OUTLINE_FILL[10], interactive: false }).addTo(selectionLayer);
  // Outline of the area within 5 minutes (solid)
  L.polygon(outlineLatLngs(i, 5), { color: OUTLINE_COLOUR, weight: 2, fillOpacity: OUTLINE_FILL[5], interactive: false }).addTo(selectionLayer);
  // Draw the farthest amenities first, so the nearest ones end up on top
  for (const { j, m } of [...items].reverse()) {
    // True when the amenity is within 5 minutes
    const near = m <= 5 * M_PER_MIN;
    // Square symbol in the domain colour with the domain letter; amenities beyond 5 minutes are smaller and lighter
    const icon = L.divIcon({ className: `poi-icon${near ? "" : " poi-icon-far"}`, html: `<span style="background:${DOMAIN_COLOURS[AMENITIES.domain[j]]}">${DOMAIN_LETTERS[AMENITIES.domain[j]]}</span>`, iconSize: near ? [20, 20] : [16, 16] });
    // Symbol at the amenity's location, with its name as a hover label
    const dot = L.marker([AMENITIES.lat[j], AMENITIES.lon[j]], { icon, title: amenityName(j), zIndexOffset: near ? 1000 : 0 });
    // Details when the dot is clicked
    dot.bindPopup(amenityPopupHtml(j, m), { maxWidth: 300 });
    // Add the dot to the selection layer
    dot.addTo(selectionLayer);
    // Keep the dot for the panel list
    selectionMarkers.set(j, dot);
  }
  // One folding group per domain, in the usual domain order
  const groups = DOMAINS.map((d) => {
    // Amenities of this domain
    const list = items.filter((e) => AMENITIES.domain[e.j] === d.label);
    // One list item per amenity: name and type on the left, time and distance on the right
    const lis = list.map(({ j, m }) => `<li data-j="${j}" class="${m <= 5 * M_PER_MIN ? "" : "poi-far"}"><span>${esc(amenityName(j))}<br><small>${esc(AMENITIES.sub_category[j])}</small></span><span class="poi-time">${(m / M_PER_MIN).toFixed(1)} min<br><small>${m} m</small></span></li>`).join("");
    // Group heading with the domain colour and the count; groups with none say so
    return `<details class="poi-group" ${list.length ? "open" : ""}><summary><span class="swatch" style="background:${DOMAIN_COLOURS[d.label]}"></span>${d.label} (${list.length})</summary>`
      // The list, or a note when nothing is in reach
      + (list.length ? `<ul class="poi-list">${lis}</ul>` : `<p class="hint">None within ${state.t} min.</p>`) + `</details>`;
  }).join("");
  // Fill the panel section
  body.innerHTML = head + `<p class="hint">Amenities within ${state.t} min (${limit} m) by walking route, nearest first.${state.t === 10 ? " Larger symbols and darker times are within 5 min." : ""}</p>` + groups;
}

// A click on an amenity in the panel list shows it on the map
document.getElementById("selection-body").addEventListener("click", (e) => {
  // The list item that was clicked
  const li = e.target.closest("li[data-j]");
  // Ignore clicks elsewhere
  if (!li) return;
  // Dot of that amenity
  const dot = selectionMarkers.get(Number(li.dataset.j));
  // Move the map to the amenity, keeping the zoom at street level or closer
  map.setView(dot.getLatLng(), Math.max(map.getZoom(), 16));
  // Open its details
  dot.openPopup();
});
// "Clear selection" button removes the selection
document.getElementById("clear-selection").addEventListener("click", clearSelection);
// "Hide other buildings" switch
document.getElementById("hide-others").addEventListener("change", (e) => {
  // Store the choice
  state.hideOthers = e.target.checked;
  // Apply it
  applyHideOthers();
});

/**
 * Hide the other buildings while a building is selected and the switch is on; otherwise show the groups chosen in the Housing filter.
 * The selected building stays visible because it is drawn again on the selection layer.
 * @returns {void}
 */
function applyHideOthers() {
  // True when the other buildings should be hidden
  const hide = state.selected !== null && state.hideOthers;
  // Loop over the two housing groups
  for (const g of ["HDB", "Private"]) {
    // Show the group only when it is ticked in the Housing filter and not hidden by the switch
    if (state.show[g] && !hide) groupLayers[g].addTo(map); else map.removeLayer(groupLayers[g]);
  }
}

// Legend in the lower-right corner
const legend = L.control({ position: "bottomright" });
// Build the legend content when it is added to the map
legend.onAdd = function () {
  // Container for the legend
  const div = L.DomUtil.create("div", "legend score-legend");
  // Fill the legend for the current theme
  drawLegend(div);
  // Return the finished legend
  return div;
};

/**
 * Fill the legend: title, meaning, and one row per class from highest to lowest, with the direction labelled.
 * @param {HTMLElement} div - legend container.
 * @returns {void}
 */
function drawLegend(div) {
  // Colours of the current theme
  const colours = classColours();
  // Lower edge of each class
  const lows = [0, ...BREAKS];
  // Upper edge of each class
  const highs = [...BREAKS, 100];
  // One row per class, highest first, e.g. "80–100"
  const rows = colours.map((c, k) => `<div class="legend-row"><i style="background:${c}"></i>${lows[k]}–${highs[k]}</div>`).reverse();
  // Title, meaning, the rows between the two direction labels, and the walking time in use
  div.innerHTML = `<strong>Walking-access score</strong><div class="legend-sub">0–100 · higher = better access to daily needs</div>`
    // Top direction label
    + `<div class="legend-end">Higher access</div>`
    // The class rows
    + rows.join("")
    // Bottom direction label
    + `<div class="legend-end">Lower access</div>`
    // Current walking time
    + `<div class="legend-sub">Within ${state.t} min (${state.t * M_PER_MIN} m) on foot</div>`;
}
// Add the legend to the map
legend.addTo(map);

/**
 * Small SVG sample of a walkable-area outline for the map key: a shaded square with a solid or dashed border.
 * @param {number} t - walking time in minutes (5 or 10).
 * @returns {string} SVG markup.
 */
function outlineSample(t) {
  // Dash pattern: dashed for 10 minutes, solid for 5 minutes
  const dash = t === 10 ? ' stroke-dasharray="5 4"' : "";
  // Square with the same colour, border and shading as the outline on the map
  return `<svg width="26" height="18" aria-hidden="true"><rect x="1" y="1" width="24" height="16" fill="${OUTLINE_COLOUR}" fill-opacity="${OUTLINE_FILL[t]}" stroke="${OUTLINE_COLOUR}" stroke-width="2"${dash}/></svg>`;
}

// Map key for a selected building, in the lower-left corner (hidden until a building is selected)
const selectionKey = L.control({ position: "bottomleft" });
// Build the key when it is added to the map
selectionKey.onAdd = function () {
  // Container for the key
  const div = L.DomUtil.create("div", "legend selection-key");
  // One row per amenity symbol
  const symbols = DOMAINS.map((d) => `<div class="key-row"><span class="key-symbol" style="background:${DOMAIN_COLOURS[d.label]}">${DOMAIN_LETTERS[d.label]}</span>${d.label}</div>`).join("");
  // Title, outline rows, ring row, symbol rows and a short note
  div.innerHTML = `<strong>Selected building</strong>`
    // Selected building ring
    + `<div class="key-row"><span class="key-ring"></span>Selected building</div>`
    // 5-minute area: solid line, darker shade
    + `<div class="key-row">${outlineSample(5)}Reachable within 5 min (400 m)</div>`
    // 10-minute area: dashed line, lighter shade
    + `<div class="key-row">${outlineSample(10)}Reachable within 10 min (800 m)</div>`
    // How to read the outlines
    + `<div class="legend-sub">The shaded areas trace the walking paths that can be reached along the network. Inward notches are directions with no path; the outline is approximate.</div>`
    // Amenity symbols heading
    + `<div class="legend-end">Amenities in reach</div>`
    // Amenity symbols
    + symbols
    // Size note
    + `<div class="legend-sub">Larger symbol: within 5 min. Smaller, lighter symbol: 5–10 min.</div>`;
  // Keep clicks and scrolling on the key from moving the map
  L.DomEvent.disableClickPropagation(div);
  // Hidden until a building is selected
  div.hidden = true;
  // Return the finished key
  return div;
};
// Add the key to the map
selectionKey.addTo(map);
// Redraw the colours when the device switches between light and dark
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", update);

// Make the dots larger when zoomed in, so they are easier to click
map.on("zoomend", () => {
  // Radius 3 at city scale, 5 at street scale
  const r = map.getZoom() >= 15 ? 5 : 3;
  // Apply the radius to every dot
  for (const m of markers) m.setRadius(r);
});

// ---------------------------------------------------------------------------
// 5. Controls
// ---------------------------------------------------------------------------

// Container of the sliders
const sliderBox = document.getElementById("sliders");
// Create one slider row per domain
for (const d of DOMAINS) {
  // Row element
  const row = document.createElement("div");
  // Style of the row
  row.className = "slider-row";
  // Label, slider (0–100, steps of 5) and the share display
  row.innerHTML = `<label for="w-${d.key}">${d.label}</label><input type="range" id="w-${d.key}" min="0" max="100" step="5" value="${state.weights[d.key]}"><output id="o-${d.key}"></output>`;
  // Add the row to the panel
  sliderBox.appendChild(row);
  // When the slider moves, store the new weight and redraw
  row.querySelector("input").addEventListener("input", (e) => {
    // Store the weight as a number
    state.weights[d.key] = Number(e.target.value);
    // Recompute and redraw everything
    update();
  });
}

/**
 * Set all weights at once and move the sliders to match.
 * @param {object} w - weight per domain key.
 * @returns {void}
 */
function setWeights(w) {
  // Loop over the domains
  for (const d of DOMAINS) {
    // Store the new weight
    state.weights[d.key] = w[d.key];
    // Move the slider
    document.getElementById(`w-${d.key}`).value = w[d.key];
  }
  // Recompute and redraw everything
  update();
}

// "Equal weights" button restores 20% for each domain
document.getElementById("preset-equal").addEventListener("click", () => setWeights({ food: 20, groc: 20, health: 20, park: 20, pt: 20 }));
// "Older residents" button applies the example weights
document.getElementById("preset-older").addEventListener("click", () => setWeights(OLDER_WEIGHTS));

// Walking-time radio buttons
for (const r of document.querySelectorAll('input[name="threshold"]')) {
  // When a button is chosen, store the threshold and redraw
  r.addEventListener("change", (e) => {
    // Store 5 or 10
    state.t = Number(e.target.value);
    // Recompute and redraw everything
    update();
  });
}

// HDB checkbox shows or hides the HDB layer
document.getElementById("show-hdb").addEventListener("change", (e) => toggleGroup("HDB", e.target.checked));
// Private checkbox shows or hides the private layer
document.getElementById("show-private").addEventListener("change", (e) => toggleGroup("Private", e.target.checked));

/**
 * Show or hide one housing group on the map.
 * @param {string} g - "HDB" or "Private".
 * @param {boolean} on - true to show, false to hide.
 * @returns {void}
 */
function toggleGroup(g, on) {
  // Remember the choice
  state.show[g] = on;
  // Show or hide the layers, keeping "Hide other buildings" in force while a building is selected
  applyHideOthers();
}

// Paid-gym checkbox switches the Parks & Recreation values
document.getElementById("use-gyms").addEventListener("change", (e) => {
  // Store the choice
  state.gyms = e.target.checked;
  // Recompute and redraw everything
  update();
});

// Amenity drop-down list
const amenitySelect = document.getElementById("amenity-domain");
// First option: no amenities shown
amenitySelect.add(new Option("None", ""));
// One option per domain
for (const d of DOMAINS) amenitySelect.add(new Option(d.label, d.label));
// When a domain is chosen, draw its amenities
amenitySelect.addEventListener("change", (e) => drawAmenities(e.target.value));

/**
 * Draw the amenities of one domain as small orange dots.
 * @param {string} domain - domain label as stored in AMENITIES, or "" for none.
 * @returns {void}
 */
function drawAmenities(domain) {
  // Remove the dots of the previous choice
  amenityLayer.clearLayers();
  // Stop here when "None" is chosen
  if (!domain) return;
  // Loop over all amenities
  for (let j = 0; j < AMENITIES.domain.length; j++) {
    // Skip amenities of other domains
    if (AMENITIES.domain[j] !== domain) continue;
    // Small orange dot with a white outline
    const m = L.circleMarker([AMENITIES.lat[j], AMENITIES.lon[j]], { radius: 2.5, color: "#ffffff", weight: 0.5, fillColor: AMENITY_COLOUR, fillOpacity: 1 });
    // Name and type when clicked
    m.bindPopup(`<strong>${AMENITIES.name[j] ?? "(no name)"}</strong><br>${AMENITIES.sub_category[j]}`);
    // Add the dot to the amenity layer
    m.addTo(amenityLayer);
  }
}

// ---------------------------------------------------------------------------
// 6. Search by postal code, address or condominium name
// ---------------------------------------------------------------------------

// Search box
const searchBox = document.getElementById("search");
// List that shows the matching buildings
const resultList = document.getElementById("search-results");
// Largest number of results listed
const MAX_RESULTS = 8;
// Indexes of the homes currently listed
let found = [];
// Position of the highlighted result in the list (-1 = none)
let active = -1;
// Words of each home's search text, split once at the start so typing stays fast
const searchWords = HOMES.search.map((text) => text.split(" "));
// Ring drawn around the building that was found
const foundRing = L.circleMarker([0, 0], { radius: 11, color: "#c4581c", weight: 3, fill: false, interactive: false });

/**
 * Find homes whose postal code starts with the query, or where every word typed is the start of a word in the address.
 * Matching word starts (not any part of a word) keeps "32" from matching postal codes such as 732185.
 * @param {string} query - text typed by the user.
 * @returns {number[]} indexes of up to MAX_RESULTS matching homes.
 */
function searchHomes(query) {
  // Lower-case the query and split it into words
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  // Nothing to search for
  if (words.length === 0) return [];
  // True when the query is only digits (a postal code or part of one)
  const digits = /^\d+$/.test(words.join(""));
  // Matching homes
  const hits = [];
  // Loop over all homes
  for (let i = 0; i < N && hits.length < MAX_RESULTS; i++) {
    // Postal code search: the postal code starts with the digits typed
    if (digits && HOMES.postal[i].startsWith(words.join(""))) hits.push(i);
    // Text search: every word typed starts one of the home's address words
    else if (!digits && words.every((w) => searchWords[i].some((x) => x.startsWith(w)))) hits.push(i);
  }
  // Return the matches
  return hits;
}

/**
 * Show the matching homes under the search box.
 * @returns {void}
 */
function showResults() {
  // Search the homes for the current text
  found = searchHomes(searchBox.value);
  // No result is highlighted yet
  active = -1;
  // One list item per match: address, then postal code and housing group
  resultList.innerHTML = found.map((i, k) => `<li role="option" data-k="${k}">${HOMES.address[i]}<br><small>${HOMES.postal[i]} · ${HOMES.housing_group[i]}</small></li>`).join("")
    // A short note when the text matches nothing
    || (searchBox.value.trim().length > 1 ? "<li><small>No building found. Try the six-digit postal code.</small></li>" : "");
}

/**
 * Zoom to one home, mark it, and open its details.
 * @param {number} i - index of the home.
 * @returns {void}
 */
function goToHome(i) {
  // Make sure the home's housing group is shown
  if (!state.show[HOMES.housing_group[i]]) {
    // Tick the matching checkbox again
    document.getElementById(HOMES.housing_group[i] === "HDB" ? "show-hdb" : "show-private").checked = true;
    // Show the layer
    toggleGroup(HOMES.housing_group[i], true);
  }
  // Select the home: ring, popup, reachable amenities and panel list
  selectHome(i);
  // Clear the result list
  resultList.innerHTML = "";
  // Put the chosen address in the search box
  searchBox.value = `${HOMES.address[i]} ${HOMES.postal[i]}`;
}

// Update the result list as the user types
searchBox.addEventListener("input", showResults);
// Keyboard: arrows move through the results, Enter opens one
searchBox.addEventListener("keydown", (e) => {
  // Stop when there are no results
  if (found.length === 0) return;
  // Down arrow moves to the next result
  if (e.key === "ArrowDown") active = Math.min(active + 1, found.length - 1);
  // Up arrow moves to the previous result
  else if (e.key === "ArrowUp") active = Math.max(active - 1, 0);
  // Enter opens the highlighted result, or the first one
  else if (e.key === "Enter") { goToHome(found[Math.max(active, 0)]); return; }
  // Other keys need no action here
  else return;
  // Keep the cursor in place for the arrow keys
  e.preventDefault();
  // Highlight the active result
  resultList.querySelectorAll("li").forEach((li, k) => li.classList.toggle("active", k === active));
});
// A click on a result opens that home
resultList.addEventListener("click", (e) => {
  // The list item that was clicked
  const li = e.target.closest("li[data-k]");
  // Open the home when a result was clicked
  if (li) goToHome(found[Number(li.dataset.k)]);
});

// ---------------------------------------------------------------------------
// 7. Redraw
// ---------------------------------------------------------------------------

/**
 * Recompute the scores, recolour the dots, and refresh the panel.
 * Called after every change of a control.
 * @returns {void}
 */
function update() {
  // Recompute every home's score
  computeScores();
  // Recolour every dot
  for (let i = 0; i < N; i++) markers[i].setStyle({ fillColor: colourOf(scores[i]) });
  // Sum of the weights, for the share display
  const total = DOMAINS.reduce((sum, d) => sum + state.weights[d.key], 0) || 1;
  // Show each domain's share of the total weight
  for (const d of DOMAINS) document.getElementById(`o-${d.key}`).textContent = `${Math.round((100 * state.weights[d.key]) / total)}%`;
  // Compute the HDB–private summary
  const s = summarise();
  // Format a number with one decimal
  const f = (x) => x.toFixed(1);
  // Format a signed number with one decimal, using a true minus sign
  const sign = (x) => (x < 0 ? "&minus;" : "+") + Math.abs(x).toFixed(1);
  // Fill in the summary table
  document.getElementById("summary").innerHTML =
    // Header row
    `<thead><tr><th></th><th>HDB</th><th>Private</th><th>Gap</th></tr></thead><tbody>`
    // Mean score row
    + `<tr><td>Mean score (${state.t} min)</td><td>${f(s.mean.HDB)}</td><td>${f(s.mean.Private)}</td><td>${sign(s.gap)}</td></tr>`
    // Within-subzone row
    + `<tr><td>Gap within subzone</td><td></td><td></td><td>${sign(s.gapWithin)}</td></tr>`
    // All-five-domains row
    + `<tr><td>Units with all 5 domains (%)</td><td>${f(s.allFive.HDB)}</td><td>${f(s.allFive.Private)}</td><td>${sign(s.allFive.Private - s.allFive.HDB)}</td></tr></tbody>`;
  // Refresh an open popup so it shows the new score
  map.eachLayer((layer) => {
    // Only dots of homes with an open popup
    if (layer.homeIndex !== undefined && layer.isPopupOpen()) layer.setPopupContent(popupHtml(layer.homeIndex));
  });
  // Redraw the legend for the walking time and theme
  drawLegend(document.querySelector(".score-legend"));
  // Show the caps used for Parks & Recreation under the current gym setting
  document.getElementById("cap-park").textContent = state.gyms ? CAPS.park : PARK_CAP_NO_GYMS;
  // Redraw the selected building's amenities for the new walking time or gym setting
  renderSelection();
}

// Draw everything once at the start
update();
// Then load the walking routes of Notebook 07 in the background
loadReach();
