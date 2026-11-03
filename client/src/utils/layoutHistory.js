// layoutHistory.js
// Remembers the Undo / Redo lists of the 3D page, so they are still there
// after the page is reloaded (they are kept in sessionStorage).
//
// It is written like a composable (see Week 4): call useLayoutHistory() once
// and you get an object with three functions:
//   history.save(id, rooms, undo, redo)   remember the lists of one layout
//   history.load(id, rooms)               get the lists back -> { undo, redo }
//   history.flush()                       write to sessionStorage right now
//
// "id" is the id of the saved plan ('' means the current home layout).
// A saved list is only used again if the rooms still look exactly the same
// as when the list was saved. layoutSig() makes a short text that describes
// the rooms, and two layouts are the same when their texts are the same.
//
// Used by: views/ThreeDSpatial.vue

const STORAGE_KEY = 'ecohome.3d.history'
const MAX_CHARS = 1500000  // sessionStorage is small, so old steps are dropped above this size
const SAVE_DELAY_MS = 400  // wait a little, so quick changes are written only once

// ============================================================
// SMALL HELPERS
// ============================================================

// Round a number to 3 decimals (0.30000000000000004 becomes 0.3).
function round3(value) {
  const number = Number(value) || 0
  return Math.round(number * 1000) / 1000
}

// Used to sort rooms and placements by their _id.
function compareById(a, b) {
  const idA = String(a._id)
  const idB = String(b._id)
  if (idA < idB) {
    return -1
  }
  if (idA > idB) {
    return 1
  }
  return 0
}

// Give '' when a value is missing (undefined or null).
function textOrEmpty(value) {
  if (value === undefined || value === null) {
    return ''
  }
  return value
}

// ============================================================
// THE TEXT THAT DESCRIBES A LAYOUT
// ============================================================

// Make a text that describes every room: its size, position, open walls and placements.
export function layoutSig(rooms) {
  const sortedRooms = rooms.slice().sort(compareById)
  const result = []

  for (const room of sortedRooms) {
    // the walls that were knocked out
    const openWalls = []
    const walls = room.openWalls || []
    for (const o of walls) {
      openWalls.push([o.wall, round3(o.t0), round3(o.t1), o.to])
    }

    // everything placed in the room
    const placements = []
    const sortedPlacements = room.placements.slice().sort(compareById)
    for (const p of sortedPlacements) {
      placements.push([
        String(p._id),
        p.applianceTypeKey,
        textOrEmpty(p.brand),
        textOrEmpty(p.model),
        round3(p.x),
        round3(p.z),
        round3(p.rotY),
        p.wall,
        round3(p.t),
        round3(p.cu),
        String(textOrEmpty(p.onPlacementId)),
      ])
    }

    result.push([
      String(room._id),
      room.name,
      round3(room.origin.x),
      round3(room.origin.z),
      round3(room.dimension.w),
      round3(room.dimension.d),
      round3(room.dimension.h),
      openWalls,
      placements,
    ])
  }

  return JSON.stringify(result)
}

// ============================================================
// THE HISTORY (a composable)
// ============================================================

export function useLayoutHistory() {
  // What we remember while the page is open, one entry per layout id:
  //   { sig, undo, redo }
  const histories = {}

  // The ids that still have to be written to sessionStorage.
  let waitingIds = []
  let timer = 0

  // Read everything that is stored. Gives {} if nothing is there or it cannot be read.
  function readStored() {
    try {
      const text = sessionStorage.getItem(STORAGE_KEY) || '{}'
      return JSON.parse(text) || {}
    } catch (error) {
      return {}
    }
  }

  // Write the waiting layouts into sessionStorage.
  function writeWaiting() {
    timer = 0
    const ids = waitingIds
    waitingIds = []

    try {
      const all = readStored()

      for (const id of ids) {
        const entry = histories[id]
        if (entry) {
          all[id] = { sig: entry.sig, undo: entry.undo.slice(), redo: entry.redo }
        }
      }

      // too big? drop the oldest undo steps until it fits (keep at least one)
      let text = JSON.stringify(all)
      for (const id of ids) {
        const copy = all[id]
        while (copy && text.length > MAX_CHARS && copy.undo.length > 1) {
          copy.undo.shift()
          text = JSON.stringify(all)
        }
      }

      if (text.length <= MAX_CHARS) {
        sessionStorage.setItem(STORAGE_KEY, text)
      }
    } catch (error) {
      // sessionStorage can be full or blocked. The history is a bonus, so ignore it.
    }
  }

  // Remember the lists of one layout. They are written to sessionStorage a moment later.
  function save(id, rooms, undo, redo) {
    histories[id] = { sig: layoutSig(rooms), undo: undo.slice(), redo: redo.slice() }

    if (waitingIds.indexOf(id) === -1) {
      waitingIds.push(id)
    }

    clearTimeout(timer)
    timer = setTimeout(writeWaiting, SAVE_DELAY_MS)
  }

  // Get the lists of one layout back. Gives empty lists if the rooms have changed since.
  function load(id, rooms) {
    const sig = layoutSig(rooms)

    let entry = histories[id]
    if (entry === undefined || entry === null || entry.sig !== sig) {
      entry = readStored()[id]
    }

    let usable = false
    if (entry !== undefined && entry !== null && entry.sig === sig) {
      if (Array.isArray(entry.undo) && Array.isArray(entry.redo)) {
        usable = true
      }
    }

    if (usable) {
      return { undo: entry.undo.slice(), redo: entry.redo.slice() }
    }
    return { undo: [], redo: [] }
  }

  // Write to sessionStorage right now (used when the page is closed).
  function flush() {
    if (!timer) {
      return
    }
    clearTimeout(timer)
    writeWaiting()
  }

  return { save: save, load: load, flush: flush }
}
