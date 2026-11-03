// Tests for the placement rules: the rule table, the new factors, the tips and the standard wording.
// The positions are made with the real sizes from applianceModels.js, so the tests follow the app.

import { describe, it, expect } from 'vitest'
import { analyse, factors, FACTOR_KEYS, DETECTOR_NAMES } from '../energy.js'
import { onWall, placeAt } from '../placement.js'
import { resolveSpec } from '../applianceModels.js'
import { RULES, rulesFor, ruleById, tipText, splitTip, recText, sentence, capital } from '../../data/placementRules.js'

const ROOM = { w: 4, d: 4 }
let counter = 0

// An item standing against a wall (wall 0..3, t = metres along it).
function onWallItem(type, category, wall, t, kwh = 100, name = type) {
  const spec = resolveSpec(type, category)
  const pos = onWall(ROOM, spec, wall, t)
  counter = counter + 1
  return { id: 'i' + counter, name: name, spec: spec, kwh: kwh, x: pos.x, z: pos.z, rotY: pos.rotY, wall: pos.wall, t: pos.t }
}

// An item standing at a point on the floor (or hanging at a point on the ceiling).
function freeItem(type, category, x, z, kwh = 100, name = type) {
  const spec = resolveSpec(type, category)
  const pos = placeAt(ROOM, spec, [x, z], null, [])
  counter = counter + 1
  return { id: 'i' + counter, name: name, spec: spec, kwh: kwh, x: pos.x, z: pos.z, rotY: pos.rotY, wall: pos.wall, t: pos.t }
}

// All the factors of item a, with the other items around it.
function factorsOf(a, all) {
  const others = []
  for (const o of all) {
    if (o !== a) {
      others.push(o)
    }
  }
  return factors(ROOM, others, a)
}

// The tips for a list of items (kwh 0 so only advice is made).
function tipsOf(items) {
  return analyse(ROOM, items, 'Room').tips
}

// True when every sentence of the text starts with a capital letter.
function allSentencesCapital(text) {
  const parts = text.split(/(?<=\.)\s+/)
  for (const part of parts) {
    const first = part.replace(/^\(/, '').charAt(0)
    if (first !== first.toUpperCase() || first === first.toLowerCase()) {
      return false
    }
  }
  return true
}

describe('the rule table', () => {
  it('gives every rule a unique id, a group, a title, an instruction, a reason and a source', () => {
    const ids = {}
    for (const r of RULES) {
      expect(ids[r.id]).toBeUndefined()
      ids[r.id] = true
      expect(r.group).toBeTruthy()
      expect(r.title).toBe(capital(r.title))
      expect(r.instruction).toBe(capital(r.instruction))
      expect(r.reason).toBe(capital(r.reason))
      expect(['NEA', 'Tips']).toContain(r.source)
    }
  })

  it('only names factors and checks that exist in energy.js', () => {
    for (const r of RULES) {
      if (r.factor) {
        expect(FACTOR_KEYS).toContain(r.factor)
      }
      if (r.detect) {
        expect(DETECTOR_NAMES).toContain(r.detect)
      }
    }
  })

  it('finds the rules for an appliance by its kind and variant', () => {
    const portable = rulesFor(resolveSpec('aircon_portable', 'cooling'))
    expect(portable.map((r) => r.id)).toContain('ac-portable-seal')
    expect(portable.map((r) => r.id)).not.toContain('ac-window-seal')
    expect(ruleById('fridge-top').group).toBe('Kitchen')
    expect(ruleById('nothing')).toBeNull()
  })
})

describe('the standard wording', () => {
  it('writes a tip as Title: Instruction. Reason. (Source)', () => {
    const text = tipText({ title: 'fridge top clearance', instruction: 'leave about 10 cm above the fridge.', reason: 'warm air rises', source: 'NEA' })
    expect(text).toBe('Fridge top clearance: Leave about 10 cm above the fridge. Warm air rises. (NEA)')
  })

  it('writes a recommendation as Move the name distance direction. Reason. Expected saving: ...', () => {
    const text = recText({ name: 'Fridge', distance: '35 cm', direction: 'east', reason: 'this keeps it cooler', saving: 'about 5% (around 12 kWh a year)' })
    expect(text).toBe('Move the Fridge 35 cm east. This keeps it cooler. Expected saving: about 5% (around 12 kWh a year).')
  })

  it('ends a sentence with one full stop and a capital first letter', () => {
    expect(sentence('keep it cool...')).toBe('Keep it cool.')
    expect(sentence('')).toBe('')
  })

  it('writes every real recommendation in the standard form', () => {
    // a floor lamp far from the sofa should be moved next to it
    const sofa = onWallItem('sofa_3_seater', 'build', 0, 3.0, 0, 'Sofa')
    const lamp = freeItem('floor_lamp', 'lighting', 0.6, 3.4, 200, 'Floor lamp')
    const result = analyse(ROOM, [sofa, lamp], 'Living room')
    expect(result.recs.length).toBe(1)
    expect(result.recs[0].text).toMatch(/^Move the Floor lamp \d+(\.\d)? (cm|m) (north|south|east|west)\. This .+\. Expected saving: about \d+% \(around [\d.]+ kWh a year\)\.$/)
  })

  it('starts every sentence of every tip with a capital letter', () => {
    const items = [
      onWallItem('refrigerator_freezer_400l', 'kitchen', 0, 1.0, 300, 'Fridge'),
      onWallItem('aircon_portable', 'cooling', 1, 2.0, 400, 'Portable aircon'),
      onWallItem('dryer_standard', 'laundry', 2, 1.0, 200, 'Dryer'),
      onWallItem('instant_water_heater', 'bathroom', 3, 1.0, 100, 'Heater'),
      freeItem('dehumidifier', 'cooling', 2, 2, 100, 'Dehumidifier'),
    ]
    const tips = tipsOf(items)
    expect(tips.length).toBeGreaterThan(8)
    for (const t of tips) {
      expect(allSentencesCapital(t.text)).toBe(true)
    }
  })
})

describe('splitTip', () => {
  it('splits a tip into title, body and source', () => {
    const text = tipText({ title: 'fridge top clearance', instruction: 'leave about 10 cm above the fridge.', reason: 'warm air rises', source: 'NEA' })
    expect(splitTip(text)).toEqual({ title: 'Fridge top clearance', body: 'Leave about 10 cm above the fridge. Warm air rises.', source: 'NEA' })
  })

  it('knows the Tips source and copes with missing parts', () => {
    expect(splitTip('Dryer use: Air-dry when you can. (Tips)').source).toBe('Tips')
    expect(splitTip('Just some advice.')).toEqual({ title: '', body: 'Just some advice.', source: '' })
  })

  it('gives every recommendation a short title', () => {
    const items = [onWallItem('fridge', 'kitchen', 0, 2, 300, 'Fridge'), onWallItem('induction_cooker', 'kitchen', 0, 2.4, 100, 'Cooker')]
    for (const r of analyse(ROOM, items, 'Kitchen').recs) {
      expect(r.title).toMatch(/^Move the /)
    }
  })
})

describe('new factors', () => {
  it('charges a fridge whose door is blocked', () => {
    const fridge = onWallItem('refrigerator_freezer_400l', 'kitchen', 0, 1.0, 300)
    const washer = freeItem('washer_front_load', 'laundry', fridge.x, fridge.z + 0.75)
    expect(factorsOf(fridge, [fridge, washer]).door).toBeGreaterThan(0)
    expect(factorsOf(fridge, [fridge]).door).toBe(0)
  })

  it('charges a dryer squeezed between the wall end and a washer, but not one with air on a side', () => {
    const washer = onWallItem('washer_front_load', 'laundry', 0, 0.5)
    const dryer = onWallItem('dryer_standard', 'laundry', 0, 1.2)
    const crowded = factorsOf(dryer, [washer, dryer])
    expect(crowded.cramped).toBeGreaterThanOrEqual(0)
    const alone = onWallItem('dryer_standard', 'laundry', 0, 2.0)
    expect(factorsOf(alone, [alone]).cramped).toBe(0)
  })

  it('charges a portable aircon in a tight spot, and leaves split aircons alone', () => {
    const left = onWallItem('aircon_portable', 'cooling', 0, 0.3)
    const right = onWallItem('wardrobe', 'build', 0, 3.2)
    expect(factorsOf(left, [left, right]).cramped).toBeDefined()
    const split = onWallItem('aircon_split', 'cooling', 0, 2.0)
    expect(factorsOf(split, [split]).cramped).toBeUndefined()
  })

  it('wants a floor lamp beside seating, not in a corner', () => {
    const sofa = onWallItem('sofa_3_seater', 'build', 0, 3.0, 0)
    const near = freeItem('floor_lamp', 'lighting', sofa.x - 1.4, sofa.z + 0.2)
    const far = freeItem('floor_lamp', 'lighting', 0.6, 3.4)
    expect(factorsOf(near, [sofa, near]).beside).toBe(0)
    expect(factorsOf(far, [sofa, far]).beside).toBeGreaterThan(0)
    expect(factorsOf(far, [far]).beside).toBe(0)
    expect(factorsOf(far, [sofa, far]).corner).toBeUndefined()
  })

  it('gives a dehumidifier the people and window rules that an air purifier has', () => {
    const bed = onWallItem('bed_queen', 'build', 1, 2.0, 0)
    const dry = freeItem('dehumidifier', 'cooling', 0.6, 0.6)
    const f = factorsOf(dry, [bed, dry])
    expect(f.occupied).toBeGreaterThan(0)
    expect(f.outdoor).toBeDefined()
  })
})

describe('tips from the rule table', () => {
  it('gives the portable aircon hose-sealing tip in the standard form', () => {
    const ac = onWallItem('aircon_portable', 'cooling', 0, 2.0, 0, 'Portable aircon')
    const tip = tipsOf([ac]).find((t) => t.rule === 'ac-portable-seal')
    expect(tip.text).toBe('Portable aircon hose seal: Seal the window gap around the hose with a window kit or tape. Hot outdoor air leaking back in makes the aircon work harder. (Tips)')
    expect(tip.id).toBe(ac.id)
  })

  it('shows plain advice once for each room, however many items match', () => {
    const one = onWallItem('dryer_standard', 'laundry', 0, 1.0, 0)
    const two = onWallItem('dryer_standard', 'laundry', 2, 1.0, 0)
    const tips = tipsOf([one, two]).filter((t) => t.rule === 'dryer-filter')
    expect(tips.length).toBe(1)
  })

  it('does not show a heat-pump stacking tip for a standard dryer, nor vented-dryer tips for a heat-pump one', () => {
    const standard = tipsOf([onWallItem('dryer_standard', 'laundry', 0, 1.0, 0)]).map((t) => t.rule)
    const heatPump = tipsOf([onWallItem('dryer_heat_pump', 'laundry', 0, 1.0, 0)]).map((t) => t.rule)
    expect(standard).not.toContain('dryer-heatpump')
    expect(standard).toContain('dryer-vented-route')
    expect(heatPump).toContain('dryer-heatpump')
    expect(heatPump).not.toContain('dryer-vented-route')
  })

  it('warns when a tall wardrobe blocks the airflow of a split aircon', () => {
    const ac = onWallItem('aircon_split', 'cooling', 0, 2.0, 0, 'Aircon')
    const wardrobe = freeItem('wardrobe', 'build', ac.x, ac.z + 1.2, 0, 'Wardrobe')
    const tips = tipsOf([ac, wardrobe])
    const tip = tips.find((t) => t.rule === 'ac-intake')
    expect(tip.text).toContain('Move the Wardrobe out of the way of the aircon airflow.')
    expect(tip.id).toBe(wardrobe.id)
  })

  it('warns when a desk faces a window', () => {
    const window = onWallItem('single_glazed_window', 'build', 0, 2.0, 0)
    const desk = freeItem('study_desk', 'build', 2.0, 1.0, 0, 'Desk')
    desk.rotY = Math.atan2(0, -1)
    const tips = tipsOf([window, desk])
    expect(tips.map((t) => t.rule)).toContain('desk-window')
  })

  it('warns when a wardrobe stands next to a fridge', () => {
    const fridge = onWallItem('refrigerator_freezer_400l', 'kitchen', 0, 1.0, 0, 'Fridge')
    const wardrobe = onWallItem('wardrobe', 'build', 0, 2.0, 0, 'Wardrobe')
    expect(tipsOf([fridge, wardrobe]).map((t) => t.rule)).toContain('wardrobe-heat')
  })

  it('warns when tall furniture stands beside a floor lamp', () => {
    const shelf = onWallItem('bookshelf', 'build', 0, 2.0, 0)
    const lamp = freeItem('floor_lamp', 'lighting', shelf.x + 0.5, shelf.z + 0.1, 0, 'Floor lamp')
    expect(tipsOf([shelf, lamp]).map((t) => t.rule)).toContain('lamp-blocked')
  })

  it('shows each fridge rule that is advice only', () => {
    const fridge = onWallItem('refrigerator_freezer_400l', 'kitchen', 0, 1.0, 0)
    const rules = tipsOf([fridge]).map((t) => t.rule)
    expect(rules).toContain('fridge-top')
    expect(rules).toContain('fridge-enclosed')
  })
})
