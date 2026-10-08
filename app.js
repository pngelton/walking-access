// GE5219 Final Project: interactive map of 5- and 10-minute walking accessibility.
// Reads HOMES (data_homes.js) and AMENITIES (data_amenities.js), both written by Notebook 06.

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

// Upper limits of the first four score classes (the fifth class is everything above)
const BREAKS = [10, 25, 40, 55];
// One blue per class, light (low score) to dark (high score)
const COLOURS = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#0d366b"];
// Colour of the amenity dots (orange, so they stand apart from the blue homes)
const AMENITY_COLOUR = "#c4581c";
// Weights for the "Older residents" preset (Healthcare and Groceries count more)
const OLDER_WEIGHTS = { food: 15, groc: 25, health: 35, park: 10, pt: 15 };
// Map centre (Singapore) and starting zoom level
const START_VIEW = { center: [1.3521, 103.8198], zoom: 12 };

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
};

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
  // Find the first class whose upper limit is above the score
  const k = BREAKS.findIndex((b) => score < b);
  // Scores above the last limit fall in the darkest class
  return COLOURS[k === -1 ? COLOURS.length - 1 : k];
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
  // Dot at the home's location, without an outline
  const m = L.circleMarker([HOMES.lat[i], HOMES.lon[i]], { radius: 3, stroke: false, fillOpacity: 0.85 });
  // Remember which home the dot belongs to
  m.homeIndex = i;
  // Open the details of the home when the dot is clicked
  m.on("click", () => m.bindPopup(popupHtml(i), { maxWidth: 340 }).openPopup());
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
    // Score under the current settings
    + `Score (${state.t} min, your weights): <strong>${scores[i].toFixed(1)}</strong><br>`
    // Table of counts and nearest times
    + `<table class="popup-table"><thead><tr><th>Domain</th><th>5 min</th><th>10 min</th><th>Nearest (min)</th></tr></thead><tbody>${rows}</tbody></table>`;
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

// Legend in the lower-right corner
const legend = L.control({ position: "bottomright" });
// Build the legend content when it is added to the map
legend.onAdd = function () {
  // Container for the legend
  const div = L.DomUtil.create("div", "legend");
  // Lower edge of each class
  const lows = [0, ...BREAKS];
  // One line per class, e.g. "10–25"
  const lines = COLOURS.map((c, k) => `<i style="background:${c}"></i>${lows[k]}${k < BREAKS.length ? "–" + BREAKS[k] : "+"}`);
  // Title plus the class lines
  div.innerHTML = "<strong>Score</strong><br>" + lines.join("<br>");
  // Return the finished legend
  return div;
};
// Add the legend to the map
legend.addTo(map);

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
  // Add the layer back to the map, or remove it
  if (on) groupLayers[g].addTo(map); else map.removeLayer(groupLayers[g]);
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
  // Zoom to street level at the home
  map.setView([HOMES.lat[i], HOMES.lon[i]], 17);
  // Draw the ring around the home
  foundRing.setLatLng([HOMES.lat[i], HOMES.lon[i]]).addTo(map);
  // Open the home's details
  markers[i].bindPopup(popupHtml(i), { maxWidth: 340 }).openPopup();
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
}

// Draw everything once at the start
update();
