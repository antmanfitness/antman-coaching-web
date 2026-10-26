// Set Orbit — "My Glance" Home Screen widget for the free Scriptable app (iOS / iPadOS).  v156
// Shows the tiles you picked in Set Orbit (Today tab → My Glance → "Edit my box"). Small, medium and large widgets.
//
// SETUP (3 steps — full instructions in Set Orbit → Settings → Home Screen widget):
//   1. Install the free "Scriptable" app from the App Store.
//   2. In Scriptable tap "+", paste this whole script, name it "Set Orbit". (Copying it from Set Orbit's Settings page
//      puts your widget token on the TOKEN line for you. Otherwise paste the token below, or in the widget's Parameter field.)
//   3. Home Screen → long-press → "+" → Scriptable → pick a size → Add → long-press it → Edit Widget → Script: "Set Orbit".
//
// SECURITY: this script holds ONLY a revocable, read-only widget token — never your password or login session.
// The token can read just the tile values you picked, for your account only. Revoke it any time in Settings → Home Screen widget.
// The key below is Set Orbit's public (anon) API key; it cannot read anything by itself.
//
// If tiles ever look washed out, check Home Screen → Customize → Widgets: iOS's Tinted / Clear styles recolor every widget.
// Honest limits: iOS decides when a widget refreshes (roughly every 5–15 minutes, sometimes less often). Tapping a tile
// opens that screen in Set Orbit (small widgets have one tap target: they open Today).

const SUPABASE_URL = "https://bvbcydanngfzemnnbuxa.supabase.co"
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2YmN5ZGFubmdmemVtbm5idXhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MjkyODcsImV4cCI6MjEwNDIwNTI4N30.YSwnhoOr3N8yw6akbbv53xhKDdFqnucJhAxwkgO4Hug"
const APP_URL = "https://antmanfitness.github.io/antman-coaching-web"
let TOKEN = "PASTE_YOUR_TOKEN_HERE"

// A token typed into the widget's "Parameter" field wins over the line above.
const param = typeof args.widgetParameter === "string" ? args.widgetParameter.trim() : ""
if (param.indexOf("sow_") === 0) TOKEN = param

// Cards are outlined (not filled) by default: iOS's Tinted / Clear Home Screen styles can paint solid fills white, which hid
// the text in v153. Set FILLED_CARDS = true only if you use the normal (non-tinted) style and like filled cards.
const FILLED_CARDS = false

const CACHE_FILE = "setorbit-glance-cache.json"
const REFRESH_MINUTES = 15

// Always-dark design with fixed colors (no dynamic/appearance colors), so text never ends up white-on-white.
const C = {
  bg: new Color("#0a1022"),
  card: new Color("#ffffff", 0.1),
  outline: new Color("#ffffff", 0.2),
  text: new Color("#ffffff"),
  label: new Color("#aab4cf"),
  faint: new Color("#7f8aa8"),
  accent: new Color("#4d8dff"),
  done: new Color("#4ade80"),
  warn: new Color("#ff6b6b"),
  todo: new Color("#fbbf24"),
}
const valueColor = (s) => (s === "done" ? C.done : s === "warn" ? C.warn : s === "todo" ? C.todo : s === "na" ? C.faint : C.text)

function cachePath() {
  const fm = FileManager.local()
  return fm.joinPath(fm.libraryDirectory(), CACHE_FILE)
}
function readCache() {
  try {
    const fm = FileManager.local()
    const p = cachePath()
    if (!fm.fileExists(p)) return null
    return JSON.parse(fm.readString(p))
  } catch (e) { return null }
}
function writeCache(snapshot) {
  try { FileManager.local().writeString(cachePath(), JSON.stringify({ at: Date.now(), snapshot: snapshot })) } catch (e) { /* cache is optional */ }
}

// Returns { snapshot } on success or { error } ("no_token" | "invalid_token" | "rate_limited" | "network" | "server").
async function fetchSnapshot() {
  if (!TOKEN || TOKEN.indexOf("sow_") !== 0) return { error: "no_token" }
  try {
    const req = new Request(SUPABASE_URL + "/rest/v1/rpc/widget_snapshot")
    req.method = "POST"
    const headers = { apikey: ANON_KEY, "Content-Type": "application/json" }
    if (ANON_KEY.indexOf("eyJ") === 0) headers.Authorization = "Bearer " + ANON_KEY
    req.headers = headers
    req.body = JSON.stringify({ p_token: TOKEN })
    req.timeoutInterval = 20
    const json = await req.loadJSON()
    const status = req.response ? req.response.statusCode : 0
    if (status < 200 || status >= 300) return { error: "server" }
    if (json && json.error) return { error: String(json.error) }
    if (!json || !Array.isArray(json.tiles)) return { error: "server" }
    return { snapshot: json }
  } catch (e) {
    return { error: "network" }
  }
}

function clock(ms) {
  const d = new Date(ms)
  let h = d.getHours()
  const m = d.getMinutes()
  const ap = h >= 12 ? "PM" : "AM"
  h = h % 12
  if (h === 0) h = 12
  return h + ":" + (m < 10 ? "0" : "") + m + " " + ap
}

// Never blank: unavailable values show a dash plus a plain reason.
function normalize(tile) {
  const id = String(tile.id || "")
  let value = tile.value == null || String(tile.value).trim() === "" ? "—" : String(tile.value)
  let sub = tile.sub == null ? "" : String(tile.sub)
  let state = tile.state || "info"
  if (value === "—") {
    state = "na"
    const generic = !sub || sub === "no data yet" || sub === "readiness"
    if (id.indexOf("oura") === 0) { if (generic) sub = "Connect Oura" }
    else if (id === "whoop") sub = "Connect WHOOP"
    else if (!sub || sub === "no data yet") sub = "No data"
  }
  const extra = Array.isArray(tile.extra) ? tile.extra.filter((e) => typeof e === "string" && e).map((e) => String(e)) : []
  return { id: id, label: String(tile.label || "—"), value: value, sub: sub, state: state, path: tile.path, extra: extra }
}

// Shorter names for the narrow layouts (small widget and 3-across rows) so labels are not cut off.
const SHORT = { "Oura overview": "Oura all", "Sleep score": "Sleep", "Sleep time": "Slept", "Deep sleep": "Deep", "REM sleep": "REM", "Resting HR": "Rest HR", "Body temp": "Temp", "Active cal": "Active" }

// One line of text that stretches the card to the full width of its grid slot (works at iPhone and iPad widget sizes).
function line(parent, str, font, color, opts) {
  const row = parent.addStack()
  row.layoutHorizontally()
  const t = row.addText(str)
  t.font = font
  t.textColor = color
  t.lineLimit = 1
  t.minimumScaleFactor = opts && opts.scale ? opts.scale : 0.7
  row.addSpacer()
  return t
}

function tileCell(parent, raw, sz) {
  const tile = normalize(raw)
  const cell = parent.addStack()
  cell.layoutVertically()
  if (FILLED_CARDS) cell.backgroundColor = C.card
  else { cell.borderColor = C.outline; cell.borderWidth = 1 }
  cell.cornerRadius = 14
  cell.setPadding(sz.padV, sz.padH, sz.padV, sz.padH)
  cell.spacing = 1
  cell.url = APP_URL + (tile.path && tile.path.charAt(0) === "/" ? tile.path : "/today")
  const label = sz.short && SHORT[tile.label] ? SHORT[tile.label] : tile.label
  const sub = sz.short && tile.value !== "—" && tile.extra.length ? tile.extra[0] : tile.sub
  line(cell, label, Font.mediumSystemFont(sz.label), C.label)
  line(cell, tile.value, Font.boldSystemFont(sz.value), valueColor(tile.state), { scale: 0.5 })
  line(cell, sub || " ", Font.systemFont(sz.sub), C.faint)
  // Multi-value tiles (Oura overview) show their remaining values on large widgets, where there is room.
  if (sz.more && tile.value !== "—" && tile.extra.length > 2) line(cell, tile.extra.slice(2, 4).join(" · "), Font.systemFont(sz.sub), C.faint)
  return cell
}

// Lays tiles out in rows of `cols`. Short last rows are padded with empty slots so every card is the same width.
function grid(widget, tiles, cols, sz) {
  const rows = Math.ceil(tiles.length / cols)
  for (let r = 0; r < rows; r++) {
    const row = widget.addStack()
    row.layoutHorizontally()
    row.spacing = 6
    for (let c = 0; c < cols; c++) {
      const t = tiles[r * cols + c]
      if (t) tileCell(row, t, sz)
      else {
        const empty = row.addStack()
        empty.layoutVertically()
        empty.addSpacer()
      }
    }
    if (r < rows - 1) widget.addSpacer(6)
  }
}

function message(widget, title, body) {
  widget.addSpacer()
  const t = widget.addText(title)
  t.font = Font.boldSystemFont(15)
  t.textColor = C.text
  widget.addSpacer(4)
  const b = widget.addText(body)
  b.font = Font.systemFont(12)
  b.textColor = C.label
  widget.addSpacer()
  widget.url = APP_URL + "/settings"
}

function header(widget, small, stamp, stale) {
  const head = widget.addStack()
  head.layoutHorizontally()
  head.centerAlignContent()
  const title = head.addText("Set Orbit")
  title.font = Font.boldSystemFont(small ? 11 : 13)
  title.textColor = C.accent
  head.addSpacer()
  const when = head.addText((stale ? "offline · " : "") + clock(stamp))
  when.font = Font.systemFont(small ? 8 : 9)
  when.textColor = stale ? C.todo : C.faint
  widget.addSpacer(small ? 5 : 6)
}

function buildLock(family, snapshot) {
  const widget = new ListWidget()
  const tiles = (snapshot ? snapshot.tiles : []).map(normalize).slice(0, family === "accessoryRectangular" ? 3 : 1)
  if (!tiles.length) { const t = widget.addText("Set Orbit"); t.textColor = C.text; return widget }
  for (const t of tiles) {
    const x = widget.addText(t.label + "  " + t.value)
    x.font = Font.mediumSystemFont(12)
    x.textColor = C.text
    x.lineLimit = 1
    x.minimumScaleFactor = 0.6
  }
  widget.url = APP_URL + "/today"
  return widget
}

function build(family, result, cached) {
  let snapshot = result.snapshot
  let stale = false
  if (!snapshot && cached && cached.snapshot && result.error !== "invalid_token" && result.error !== "no_token") { snapshot = cached.snapshot; stale = true }
  if (family.indexOf("accessory") === 0) return buildLock(family, snapshot)

  const widget = new ListWidget()
  widget.backgroundColor = C.bg
  widget.setPadding(10, 12, 8, 12)
  widget.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000)
  widget.url = APP_URL + "/today"

  if (!snapshot) {
    if (result.error === "no_token") message(widget, "Set Orbit", "Add your widget token: Set Orbit → Settings → Home Screen widget.")
    else if (result.error === "invalid_token") message(widget, "Widget turned off", "This token was revoked or is wrong. Make a new one in Set Orbit → Settings → Home Screen widget.")
    else if (result.error === "rate_limited") message(widget, "Set Orbit", "Refreshing too often — it will catch up shortly.")
    else message(widget, "Set Orbit", "Can't reach Set Orbit right now. Will retry.")
    return widget
  }

  const small = family === "small"
  const large = family === "large" || family === "extraLarge"
  const tiles = snapshot.tiles.slice(0, 6)
  header(widget, small, cached && stale ? cached.at : Date.now(), stale)
  if (!tiles.length) { message(widget, "No tiles yet", "In Set Orbit open Today → My Glance → Edit my box."); return widget }

  if (small) grid(widget, tiles.slice(0, 4), 2, { padV: 5, padH: 8, label: 10, value: 17, sub: 9, short: true })
  else if (large) grid(widget, tiles, 2, { padV: 12, padH: 12, label: 12, value: 26, sub: 11, more: true })
  else if (tiles.length <= 3) grid(widget, tiles, tiles.length, { padV: 12, padH: 10, label: 12, value: 24, sub: 11, short: true })
  else if (tiles.length === 4) grid(widget, tiles, 2, { padV: 5, padH: 12, label: 10, value: 17, sub: 9 })
  else grid(widget, tiles, 3, { padV: 5, padH: 9, label: 10, value: 17, sub: 9 })
  widget.addSpacer()
  return widget
}

const family = config.widgetFamily || "medium"
const result = await fetchSnapshot()
if (result.snapshot) writeCache(result.snapshot)
const widget = build(family, result, readCache())

if (config.runsInWidget) {
  Script.setWidget(widget)
} else {
  // Running inside the Scriptable app: show a preview.
  if (family === "small") await widget.presentSmall()
  else if (family === "large") await widget.presentLarge()
  else await widget.presentMedium()
}
Script.complete()
