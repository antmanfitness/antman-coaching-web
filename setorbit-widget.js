// Set Orbit — "My Glance" Home Screen widget for the free Scriptable app (iOS).
// Shows the tiles you picked in Set Orbit (Today tab → My Glance → "Edit my box"). Small and medium (and large) widgets.
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
// Honest limits: iOS decides when a widget refreshes (roughly every 5–15 minutes, sometimes less often). Tapping a tile
// opens that screen in Set Orbit (small widgets have one tap target: they open Today).

const SUPABASE_URL = "https://bvbcydanngfzemnnbuxa.supabase.co"
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2YmN5ZGFubmdmemVtbm5idXhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MjkyODcsImV4cCI6MjEwNDIwNTI4N30.YSwnhoOr3N8yw6akbbv53xhKDdFqnucJhAxwkgO4Hug"
const APP_URL = "https://antmanfitness.github.io/antman-coaching-web"
let TOKEN = "PASTE_YOUR_TOKEN_HERE"

// A token typed into the widget's "Parameter" field wins over the line above.
const param = typeof args.widgetParameter === "string" ? args.widgetParameter.trim() : ""
if (param.indexOf("sow_") === 0) TOKEN = param

const CACHE_FILE = "setorbit-glance-cache.json"
const REFRESH_MINUTES = 15

const COLORS = {
  bg: new Color("#0d0d12"),
  card: new Color("#1c1c24"),
  text: new Color("#ffffff"),
  dim: new Color("#9a9aa8"),
  done: new Color("#34c759"),
  warn: new Color("#ff453a"),
  todo: new Color("#ffb340"),
  na: new Color("#6e6e7a"),
  accent: new Color("#5aa0ff"),
}
const stateColor = (s) => (s === "done" ? COLORS.done : s === "warn" ? COLORS.warn : s === "todo" ? COLORS.todo : s === "na" ? COLORS.na : COLORS.text)

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

function tileCell(parent, tile, compact) {
  const cell = parent.addStack()
  cell.layoutVertically()
  cell.backgroundColor = COLORS.card
  cell.cornerRadius = 12
  cell.setPadding(compact ? 6 : 8, compact ? 8 : 10, compact ? 6 : 8, compact ? 8 : 10)
  cell.url = APP_URL + (tile.path && tile.path.charAt(0) === "/" ? tile.path : "/today")
  const label = cell.addText(String(tile.label || ""))
  label.font = Font.mediumSystemFont(compact ? 10 : 11)
  label.textColor = COLORS.dim
  label.lineLimit = 1
  const value = cell.addText(String(tile.value == null ? "—" : tile.value))
  value.font = Font.boldSystemFont(compact ? 17 : 20)
  value.textColor = stateColor(tile.state)
  value.lineLimit = 1
  value.minimumScaleFactor = 0.6
  const sub = cell.addText(String(tile.sub || " "))
  sub.font = Font.systemFont(compact ? 9 : 10)
  sub.textColor = COLORS.dim
  sub.lineLimit = 1
  sub.minimumScaleFactor = 0.7
  return cell
}

// Lays tiles out in rows of `cols`.
function grid(widget, tiles, cols, compact) {
  const rows = Math.ceil(tiles.length / cols)
  for (let r = 0; r < rows; r++) {
    const row = widget.addStack()
    row.layoutHorizontally()
    row.spacing = 6
    for (let c = 0; c < cols; c++) {
      const t = tiles[r * cols + c]
      if (t) tileCell(row, t, compact)
      else row.addSpacer()
    }
    if (r < rows - 1) widget.addSpacer(6)
  }
}

function message(widget, title, body) {
  const t = widget.addText(title)
  t.font = Font.boldSystemFont(14)
  t.textColor = COLORS.text
  widget.addSpacer(4)
  const b = widget.addText(body)
  b.font = Font.systemFont(11)
  b.textColor = COLORS.dim
  widget.url = APP_URL + "/settings"
}

function build(family, result, cached) {
  const widget = new ListWidget()
  widget.backgroundColor = COLORS.bg
  widget.setPadding(10, 10, 8, 10)
  widget.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000)
  widget.url = APP_URL + "/today"

  let snapshot = result.snapshot
  let stale = false
  if (!snapshot && cached && cached.snapshot && result.error !== "invalid_token" && result.error !== "no_token") { snapshot = cached.snapshot; stale = true }

  if (!snapshot) {
    if (result.error === "no_token") message(widget, "Set Orbit", "Add your widget token: Set Orbit → Settings → Home Screen widget.")
    else if (result.error === "invalid_token") message(widget, "Widget turned off", "This token was revoked or is wrong. Make a new one in Set Orbit → Settings → Home Screen widget.")
    else if (result.error === "rate_limited") message(widget, "Set Orbit", "Refreshing too often — it will catch up shortly.")
    else message(widget, "Set Orbit", "Can't reach Set Orbit right now. Will retry.")
    return widget
  }

  const tiles = snapshot.tiles.slice(0, 6)
  const small = family === "small" || family === "accessoryRectangular" || family === "accessoryCircular" || family === "accessoryInline"
  const large = family === "large" || family === "extraLarge"

  const head = widget.addStack()
  head.layoutHorizontally()
  head.centerAlignContent()
  const title = head.addText("Set Orbit")
  title.font = Font.boldSystemFont(small ? 11 : 12)
  title.textColor = COLORS.accent
  head.addSpacer()
  const when = head.addText((stale ? "offline · " : "") + clock(cached && stale ? cached.at : Date.now()))
  when.font = Font.systemFont(9)
  when.textColor = stale ? COLORS.todo : COLORS.dim
  widget.addSpacer(6)

  if (!tiles.length) { message(widget, "No tiles picked", "Open Set Orbit → Today → My Glance → Edit my box."); return widget }

  if (small) grid(widget, tiles.slice(0, 4), 2, true)          // 2 x 2
  else if (large) grid(widget, tiles, 2, false)                  // up to 2 x 3
  else grid(widget, tiles, 3, true)                              // medium: up to 3 x 2
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
