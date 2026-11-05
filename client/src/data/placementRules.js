const NEA = 'NEA'
const GUIDE = 'Tips'
const FRIDGE = [{ kind: 'fridge' }]
const HEAT_PRODUCERS = [{ kind: 'cook', variants: ['induction_cooker', 'rice_cooker', 'air_fryer', 'electric_kettle', 'toaster'] }, { kind: 'dishwasher' }]
const VENTED_DRYERS = [{ kind: 'dryer', variants: ['vented', 'standard'] }]
const ALL_DRYERS = [{ kind: 'dryer' }]
const SMALL_LIGHTS = [{ kind: 'light', variants: ['led_10w', 'led_15w', 'cfl'] }]
const LONG_LIGHTS = [{ kind: 'light', variants: ['linear_led', 'fluorescent_tube'] }]
const SEATS = [{ kind: 'furniture', variants: ['sofa_3_seater', 'sofa_2_seater', 'armchair'] }]
const BEDS = [{ kind: 'furniture', variants: ['bed_single', 'bed_queen', 'bedside_table'] }]
const TABLES = [{ kind: 'furniture', variants: ['coffee_table', 'tv_console'] }]
const DINING = [{ kind: 'furniture', variants: ['dining_table', 'dining_chair'] }]
const DESKS = [{ kind: 'furniture', variants: ['study_desk', 'office_chair', 'bookshelf'] }]

// Builds one rule
function rule(id, group, appliesTo, title, instruction, reason, source, factor = null, detect = null) {
  return { id: id, group: group, appliesTo: appliesTo, title: title, instruction: instruction, reason: reason, source: source, factor: factor, detect: detect }
}

export const RULES = [
  // ---------------- Kitchen ----------------
  rule('fridge-sun', 'Kitchen', FRIDGE, 'Fridge and sunlight', 'Keep the fridge out of direct sunlight', 'Sun warms the fridge, so its compressor runs longer', NEA, 'sun'),
  rule('fridge-heat', 'Kitchen', FRIDGE, 'Fridge and heat', 'Keep the fridge away from the cooker, oven, dishwasher and dryer', 'Heat from nearby appliances makes the fridge work harder', NEA, 'heat'),
  rule('fridge-side', 'Kitchen', FRIDGE, 'Fridge side clearance', 'Leave about 2 cm on each side of the fridge', 'Air needs room to carry heat away from the fridge', NEA, 'side'),
  rule('fridge-rear', 'Kitchen', FRIDGE, 'Fridge rear clearance', 'Leave about 5 cm behind the fridge', 'Air needs room to carry heat away from the back of the fridge', NEA, 'clear'),
  rule('fridge-top', 'Kitchen', FRIDGE, 'Fridge top clearance', 'Leave about 10 cm above the fridge', 'Warm air rises off the fridge and needs room to escape', GUIDE),
  rule('fridge-enclosed', 'Kitchen', FRIDGE, 'Fridge in cabinetry', 'Do not build the fridge into a closed cabinet', 'A closed cabinet traps the heat the fridge gives off', GUIDE),
  rule('fridge-door', 'Kitchen', FRIDGE, 'Fridge door space', 'Keep the floor in front of the fridge clear so the door opens fully', 'A blocked door is held open longer, which lets cold air out', GUIDE, 'door'),
  rule('microwave-vent', 'Kitchen', [{ kind: 'cook', variants: ['microwave_oven'] }], 'Microwave ventilation', 'Leave space around the microwave vents', 'Blocked vents trap heat inside the microwave', GUIDE),
  rule('microwave-enclosed', 'Kitchen', [{ kind: 'cook', variants: ['microwave_oven'] }], 'Microwave in cabinetry', 'Do not put the microwave in a closed cabinet', 'A closed cabinet traps the heat it gives off', GUIDE),
  rule('microwave-prep', 'Kitchen', [{ kind: 'cook', variants: ['microwave_oven'] }], 'Microwave position', 'Place the microwave near the food preparation area', 'A handy spot makes it easy to reheat small portions instead of using the oven', GUIDE),
  rule('induction-vent', 'Kitchen', [{ kind: 'cook', variants: ['induction_cooker'] }], 'Induction cooker ventilation', 'Leave space around the induction cooker vents', 'Blocked vents make its fan work harder', GUIDE),
  rule('induction-enclosed', 'Kitchen', [{ kind: 'cook', variants: ['induction_cooker'] }], 'Induction cooker in cabinetry', 'Do not use the induction cooker inside a closed cabinet', 'A closed cabinet traps heat and steam', GUIDE),
  rule('rice-cabinet', 'Kitchen', [{ kind: 'cook', variants: ['rice_cooker'] }], 'Rice cooker and cabinets', 'Do not put the rice cooker under an overhead cabinet', 'Steam collects under the cabinet', GUIDE),
  rule('rice-socket', 'Kitchen', [{ kind: 'cook', variants: ['rice_cooker'] }], 'Rice cooker socket', 'Place the rice cooker within reach of a wall socket', 'A short lead avoids the need for an extension cord', GUIDE),
  rule('rice-warm', 'Kitchen', [{ kind: 'cook', variants: ['rice_cooker'] }], 'Rice cooker keep-warm', 'Avoid leaving the rice cooker on keep-warm for long', 'Keep-warm mode draws power for as long as it is on', GUIDE),
  rule('airfryer-clear', 'Kitchen', [{ kind: 'cook', variants: ['air_fryer'] }], 'Air fryer clearance', 'Leave space behind and beside the air fryer', 'Its hot air needs room to leave the unit', GUIDE),
  rule('airfryer-cabinet', 'Kitchen', [{ kind: 'cook', variants: ['air_fryer'] }], 'Air fryer and cabinets', 'Do not use the air fryer under low cabinets or inside a closed cabinet', 'Hot air and steam collect there', GUIDE),
  rule('kettle-cabinet', 'Kitchen', [{ kind: 'cook', variants: ['electric_kettle'] }], 'Kettle and cabinets', 'Do not put the kettle under a cabinet', 'Steam from the spout collects under the cabinet', GUIDE),
  rule('kettle-flask', 'Kitchen', [{ kind: 'cook', variants: ['electric_kettle'] }], 'Kettle use', 'Boil only what you need and keep the hot water in a flask', 'Boiling the same water again wastes electricity', GUIDE),
  rule('toaster-clear', 'Kitchen', [{ kind: 'cook', variants: ['toaster'] }], 'Toaster surroundings', 'Keep the toaster away from curtains and cabinets', 'Heat and crumbs build up where air cannot move', GUIDE),
  rule('toaster-vent', 'Kitchen', [{ kind: 'cook', variants: ['toaster'] }], 'Toaster ventilation', 'Leave open space around the toaster', 'Air around it carries the heat away', GUIDE),
  rule('heat-fridge', 'Kitchen', HEAT_PRODUCERS, 'Heat away from the fridge', 'Keep the {name} away from the fridge', 'Its heat makes the fridge work harder', GUIDE),
  rule('dishwasher-clear', 'Kitchen', [{ kind: 'dishwasher' }], 'Dishwasher clearance', 'Leave space at the sides and back of the dishwasher', 'Air and hoses need room around it', GUIDE),
  rule('dishwasher-enclosed', 'Kitchen', [{ kind: 'dishwasher' }], 'Dishwasher in cabinetry', 'Do not box the dishwasher in without ventilation', 'A closed space traps the heat it gives off', GUIDE),
  rule('dishwasher-dry', 'Kitchen', [{ kind: 'dishwasher' }], 'Dishwasher drying', 'Open the door and let the dishes air-dry', 'The heated drying step uses extra electricity', GUIDE),
  rule('exhaust-path', 'Kitchen', [{ kind: 'exhaust' }], 'Exhaust fan path', 'Keep the path between the cooker and the exhaust fan clear', 'Blocked air takes heat and steam out more slowly', GUIDE),
  rule('exhaust-air', 'Kitchen', [{ kind: 'exhaust' }], 'Exhaust fan replacement air', 'Open a window or vent so fresh air can replace what the fan removes', 'A fan pulling against a sealed room works harder', GUIDE),

  // ---------------- Cooling and air ----------------
  rule('ac-doors', 'Cooling and air', [{ kind: 'ac' }], 'Aircon and openings', 'Close doors and windows while the aircon runs', 'Cool air escapes through open doors and windows', GUIDE),
  rule('ac-intake', 'Cooling and air', 'any', 'Aircon airflow', 'Move the {name} out of the way of the aircon airflow', 'It blocks the air, so the aircon runs longer to cool the room', GUIDE, 'air', 'acBlocked'),
  rule('ac-sun', 'Cooling and air', [{ kind: 'ac' }], 'Aircon and sunlight', 'Keep the aircon out of direct sunlight', 'Sun warms the unit and the air around it', NEA, 'sun'),
  rule('ac-window-opening', 'Cooling and air', [{ kind: 'ac', variants: ['window'] }], 'Window aircon opening', 'Fit a window aircon only in an approved opening', 'An unsuitable opening cannot hold the unit securely or seal around it', GUIDE),
  rule('ac-window-seal', 'Cooling and air', [{ kind: 'ac', variants: ['window'] }], 'Window aircon seal', 'Seal the gaps around the window aircon', 'Gaps let warm air back in', GUIDE),
  rule('ac-window-exhaust', 'Cooling and air', [{ kind: 'ac', variants: ['window'] }], 'Window aircon exhaust', 'Make sure the back of the unit exhausts to the outdoors', 'Hot air blown indoors defeats the cooling', GUIDE),
  rule('ac-portable-hose', 'Cooling and air', [{ kind: 'ac', variants: ['portable'] }], 'Portable aircon hose', 'Keep the hose short and straight, and close to a window', 'A long hose loses cooling and lets heat back into the room', GUIDE, 'hose'),
  rule('ac-portable-seal', 'Cooling and air', [{ kind: 'ac', variants: ['portable'] }], 'Portable aircon hose seal', 'Seal the window gap around the hose with a window kit or tape', 'Hot outdoor air leaking back in makes the aircon work harder', GUIDE),
  rule('ac-portable-corner', 'Cooling and air', [{ kind: 'ac', variants: ['portable'] }], 'Portable aircon space', 'Do not squeeze the portable aircon into a tight corner or cabinet', 'It needs air around it to cool itself', GUIDE, 'cramped'),
  rule('ceilingfan-centre', 'Cooling and air', [{ kind: 'ceilingfan' }], 'Ceiling fan position', 'Hang the ceiling fan over the middle of the room or the seating area', 'Its breeze then reaches the people using the room', GUIDE, 'centre'),
  rule('ceilingfan-clear', 'Cooling and air', [{ kind: 'ceilingfan' }], 'Ceiling fan clearance', 'Keep beams, tall cabinets and partitions away from the fan blades', 'Obstacles break up its airflow', GUIDE),
  rule('ceilingfan-ac', 'Cooling and air', [{ kind: 'ceilingfan' }], 'Ceiling fan and aircon', 'Use the ceiling fan together with the aircon, with the aircon set a little warmer', 'The moving air feels cooler, so the aircon can work less', NEA),
  rule('standfan-occupied', 'Cooling and air', [{ kind: 'standfan' }], 'Stand fan position', 'Place the stand fan close to where people sit or sleep', 'Its air then reaches them', GUIDE, 'occupied'),
  rule('standfan-ac', 'Cooling and air', [{ kind: 'standfan' }], 'Stand fan and aircon', 'Keep the stand fan out of the aircon airflow', 'Two airflows fighting each other waste energy', GUIDE, 'fan'),
  rule('standfan-across', 'Cooling and air', [{ kind: 'standfan' }], 'Stand fan direction', 'Aim the stand fan across the people in the room rather than at one spot', 'The breeze then cools more of the room', GUIDE),
  rule('standfan-cross', 'Cooling and air', [{ kind: 'standfan' }], 'Stand fan and open windows', 'When windows are open, use the stand fan to help air move through the room', 'Cross-ventilation can replace the aircon on mild days', GUIDE),
  rule('standfan-block', 'Cooling and air', [{ kind: 'standfan' }], 'Stand fan and natural airflow', 'Do not place the stand fan where it blocks a window or doorway', 'It would stop natural air from flowing through', GUIDE),
  rule('purifier-occupied', 'Cooling and air', [{ kind: 'purifier', variants: ['purifier'] }], 'Air purifier position', 'Place the air purifier where people spend most of their time', 'It then cleans the air they breathe', GUIDE, 'occupied'),
  rule('purifier-window', 'Cooling and air', [{ kind: 'purifier', variants: ['purifier'] }], 'Air purifier and windows', 'Keep the air purifier away from open windows', 'Outdoor air keeps coming in and the purifier has to clean it again', GUIDE, 'outdoor'),
  rule('purifier-clear', 'Cooling and air', [{ kind: 'purifier', variants: ['purifier'] }], 'Air purifier clearance', 'Leave space around the air purifier intake and outlet', 'Blocked vents cut its airflow', GUIDE, 'cramped'),
  rule('purifier-behind', 'Cooling and air', [{ kind: 'purifier', variants: ['purifier'] }], 'Air purifier surroundings', 'Do not put the air purifier behind curtains, sofas or cabinets', 'They block the air it takes in and gives out', GUIDE),
  rule('purifier-humid', 'Cooling and air', [{ kind: 'purifier', variants: ['purifier'] }], 'Air purifier and damp air', 'Keep the air purifier away from humid areas', 'Damp air can clog the filter', GUIDE),
  rule('dehumidifier-occupied', 'Cooling and air', [{ kind: 'purifier', variants: ['dehumidifier'] }], 'Dehumidifier position', 'Place the dehumidifier where people spend most of their time', 'It then dries the air they breathe', GUIDE, 'occupied'),
  rule('dehumidifier-window', 'Cooling and air', [{ kind: 'purifier', variants: ['dehumidifier'] }], 'Dehumidifier and windows', 'Keep the dehumidifier away from open windows', 'Damp outdoor air keeps coming in', GUIDE, 'outdoor'),
  rule('dehumidifier-clear', 'Cooling and air', [{ kind: 'purifier', variants: ['dehumidifier'] }], 'Dehumidifier clearance', 'Leave space around the dehumidifier intake and outlet', 'Blocked vents cut its airflow', GUIDE, 'cramped'),
  rule('dehumidifier-behind', 'Cooling and air', [{ kind: 'purifier', variants: ['dehumidifier'] }], 'Dehumidifier surroundings', 'Do not put the dehumidifier behind curtains, sofas or cabinets', 'They block the air it takes in and gives out', GUIDE),
  rule('dehumidifier-damp', 'Cooling and air', [{ kind: 'purifier', variants: ['dehumidifier'] }], 'Dehumidifier and damp areas', 'Use the dehumidifier in the damp room, with the door closed', 'It then dries only that room instead of the whole flat', GUIDE),

  // ---------------- Laundry ----------------
  rule('washer-clear', 'Laundry', [{ kind: 'washer' }], 'Washer clearance', 'Leave space around the washer for vibration and servicing', 'A washer that touches walls or furniture vibrates and wears faster', GUIDE),
  rule('washer-sun', 'Laundry', [{ kind: 'washer' }], 'Washer and sunlight', 'Keep the washer out of direct sunlight', 'Sun heats the machine and its electronics', GUIDE, 'sun'),
  rule('washer-level', 'Laundry', [{ kind: 'washer' }], 'Washer levelling', 'Put the washer on a level floor and adjust its feet', 'An unlevel washer vibrates and can run unbalanced loads', GUIDE),
  rule('washer-lid', 'Laundry', [{ kind: 'washer', variants: ['top'] }], 'Top-load washer lid', 'Leave room above a top-load washer and do not put it under a low shelf', 'The lid must open fully so you can load it', GUIDE),
  rule('dryer-sun-heat', 'Laundry', ALL_DRYERS, 'Dryer and heat', 'Keep the dryer away from sunlight and other heat sources', 'Warm surroundings make it work harder', GUIDE, 'heat'),
  rule('dryer-group', 'Laundry', ALL_DRYERS, 'Washer and dryer together', 'Put the washer and dryer next to each other', 'It makes moving laundry between them quick', NEA, 'group'),
  rule('dryer-ventilated', 'Laundry', ALL_DRYERS, 'Dryer ventilation', 'Put the dryer in a ventilated area, not a cramped cabinet', 'A dryer in a tight space heats up and works harder', GUIDE, 'cramped'),
  rule('dryer-clear', 'Laundry', ALL_DRYERS, 'Dryer clearance', 'Keep air space around the dryer intake and exhaust', 'Blocked airflow lengthens every cycle', GUIDE),
  rule('dryer-filter', 'Laundry', ALL_DRYERS, 'Dryer filter', 'Keep the lint filter reachable and clean it after every load', 'A clogged filter makes the dryer run longer', GUIDE),
  rule('dryer-airdry', 'Laundry', ALL_DRYERS, 'Dryer use', 'Air-dry clothes when you can and run only full loads in the dryer', 'Air-drying is free', NEA),
  rule('dryer-rack', 'Laundry', ALL_DRYERS, 'Drying rack', 'Keep a drying rack in the yard or another airy spot', 'It makes air-drying easy, so the dryer is used less', GUIDE),
  rule('dryer-heatpump', 'Laundry', [{ kind: 'dryer', variants: ['heat_pump'] }], 'Heat-pump dryer stacking', 'Use the maker\'s stacking kit if you stack the dryer on the washer', 'Only a proper kit holds it steady', GUIDE),
  rule('dryer-vented-route', 'Laundry', VENTED_DRYERS, 'Vented dryer exhaust', 'Give a vented dryer a short, straight route to an outside wall', 'A long or bent duct slows the air and lengthens each cycle', GUIDE),
  rule('dryer-vented-cupboard', 'Laundry', VENTED_DRYERS, 'Vented dryer outlet', 'Never vent the dryer into a cupboard or a bedroom', 'Hot, damp air indoors raises the heat and humidity', GUIDE),

  // ---------------- Bathroom ----------------
  rule('heater-instant-near', 'Bathroom', [{ kind: 'heater', variants: ['instant'] }], 'Instant heater position', 'Put the instant water heater close to the shower so the pipe is short', 'Less hot water is wasted waiting for it to arrive', GUIDE),
  rule('heater-instant-spray', 'Bathroom', [{ kind: 'heater', variants: ['instant'] }], 'Instant heater and water', 'Keep the instant water heater outside the direct spray of the shower', 'Water on the unit is unsafe', GUIDE),
  rule('heater-instant-access', 'Bathroom', [{ kind: 'heater', variants: ['instant'] }], 'Instant heater access', 'Keep the instant water heater within easy reach', 'It can then be checked and serviced', GUIDE),
  rule('heater-storage-near', 'Bathroom', [{ kind: 'heater', variants: ['storage'] }], 'Storage heater position', 'Put the storage water heater close to the shower, with a short insulated pipe', 'Less heat is lost along the pipe', GUIDE),
  rule('heater-storage-access', 'Bathroom', [{ kind: 'heater', variants: ['storage'] }], 'Storage heater access', 'Keep the storage water heater within easy reach', 'It can then be checked and serviced', GUIDE),
  rule('heater-storage-off', 'Bathroom', [{ kind: 'heater', variants: ['storage'] }], 'Storage heater use', 'Switch the storage water heater off when hot water is not needed', 'An instantaneous heater is more efficient than a storage one, and a storage tank keeps losing heat', NEA),

  // ---------------- Lighting ----------------
  rule('light-daylight', 'Lighting', SMALL_LIGHTS, 'Lights and daylight', 'Use daylight and keep lights off in bright rooms', 'Daylight is free', GUIDE),
  rule('light-small', 'Lighting', SMALL_LIGHTS, 'Lights in small rooms', 'Do not fit more bulbs than a small room needs', 'Extra bulbs add watts without adding useful light', GUIDE),
  rule('light-zones', 'Lighting', SMALL_LIGHTS, 'Lighting zones', 'Put lights on separate switches for each zone', 'Only the area in use needs to be lit', GUIDE),
  rule('light-even', 'Lighting', SMALL_LIGHTS, 'Even lighting', 'Spread lights so they cover the room evenly', 'Even light means fewer or weaker bulbs are needed', GUIDE, 'centre'),
  rule('tube-centre', 'Lighting', LONG_LIGHTS, 'Tube light position', 'Put tube lights in the centre of kitchens and corridors', 'The light then spreads along the whole space', GUIDE, 'centre'),
  rule('tube-task', 'Lighting', LONG_LIGHTS, 'Task lighting', 'Add task lighting where you work and keep the tube light for general light', 'Light aimed at the work needs fewer watts', GUIDE),
  rule('tube-shadow', 'Lighting', LONG_LIGHTS, 'Cabinet shadows', 'Keep cabinets from casting shadows on the work area', 'Shadows push people to add more light', GUIDE),
  rule('lamp-seating', 'Lighting', [{ kind: 'lamp' }], 'Floor lamp position', 'Put the floor lamp beside a sofa, armchair or study area', 'Its light falls where people read and work', GUIDE, 'beside'),
  rule('lamp-blocked', 'Lighting', [{ kind: 'lamp' }], 'Floor lamp surroundings', 'Move the tall furniture away from the {name}', 'Blocked light is wasted', GUIDE, null, 'lampBlocked'),

  // ---------------- Entertainment and computing ----------------
  rule('tv-glare', 'Entertainment and computing', [{ kind: 'tv' }], 'TV and windows', 'Place the TV at a right angle to the windows, not facing one', 'Glare makes people turn the brightness up', NEA, 'glare'),
  rule('tv-sun', 'Entertainment and computing', [{ kind: 'tv' }], 'TV and sunlight', 'Keep the TV out of direct sunlight', 'Sun heats the screen and washes it out', NEA, 'sun'),
  rule('tv-socket', 'Entertainment and computing', [{ kind: 'tv' }], 'TV and sockets', 'Place the TV near a wall socket', 'It avoids long extension leads', GUIDE),
  rule('tv-off', 'Entertainment and computing', [{ kind: 'tv' }], 'TV screen-off', 'Turn on the automatic screen-off or sleep timer', 'A TV left on in an empty room wastes power', GUIDE),
  rule('pc-glare', 'Entertainment and computing', [{ kind: 'pc' }], 'Monitor and windows', 'Place the monitor at a right angle to the windows', 'Glare makes people turn the brightness up', NEA, 'glare'),
  rule('pc-sun-heat', 'Entertainment and computing', [{ kind: 'pc' }], 'Computer and heat', 'Keep the computer out of direct sunlight and away from heat sources', 'Heat makes its fans work harder', NEA, 'heat'),
  rule('pc-enclosed', 'Entertainment and computing', [{ kind: 'pc' }], 'Computer tower space', 'Do not put the computer tower in an enclosed cabinet or squeeze it between furniture', 'It needs air around it to stay cool', GUIDE, 'cramped'),
  rule('pc-sleep', 'Entertainment and computing', [{ kind: 'pc' }], 'Computer sleep mode', 'Set the computer to sleep when you are away', 'A computer left on keeps drawing power', GUIDE),

  // ---------------- Furniture ----------------
  rule('seat-window', 'Furniture', SEATS, 'Seating and windows', 'Move the {name} away from the window', 'It stands in front of the window, and large furniture there stops air flowing through the room', NEA, null, 'windowBlocked'),
  rule('seat-air', 'Furniture', SEATS, 'Seating and airflow', 'Keep sofas and armchairs out of the aircon intake and discharge, and clear of the ceiling fan breeze', 'Furniture in the way stops air reaching the room', GUIDE),
  rule('table-vent', 'Furniture', TABLES, 'Tables and electronics', 'Leave air gaps around the TV console and any electronics on it', 'Electronics in a closed space overheat and use more power', GUIDE),
  rule('table-clear', 'Furniture', TABLES, 'Console ventilation', 'Keep the back and sides of the TV console open', 'Air must be able to move past the equipment', GUIDE),
  rule('dining-window', 'Furniture', DINING, 'Dining furniture and windows', 'Move the {name} away from the window', 'It stands in front of the window, and large furniture there stops air flowing through the room', NEA, null, 'windowBlocked'),
  rule('dining-access', 'Furniture', DINING, 'Dining access', 'Keep the way between cooking and dining open', 'A clear path avoids moving appliances and furniture around', GUIDE),
  rule('bed-aircon', 'Furniture', BEDS, 'Bed and aircon', 'Keep beds out of the direct airflow of the aircon', 'People under cold air turn the temperature down', GUIDE, 'draft'),
  rule('bed-window', 'Furniture', BEDS, 'Bed and windows', 'Move the {name} away from the window', 'It stands in front of the window, and large furniture there stops air flowing through the room', NEA, null, 'windowBlocked'),
  rule('bed-fan', 'Furniture', BEDS, 'Bed and ceiling fan', 'Place the bed where the ceiling fan breeze reaches it', 'A gentle breeze can replace some aircon running', NEA),
  rule('wardrobe-window', 'Furniture', [{ kind: 'furniture', variants: ['wardrobe'] }], 'Wardrobe and windows', 'Move the {name} away from the window', 'It stands in front of the window, and large furniture there stops air flowing through the room', NEA, null, 'windowBlocked'),
  rule('window-clear', 'Furniture', 'any', 'Window clearance', 'Move the {name} away from the window', 'It stands in front of the window, and large furniture there stops air flowing through the room', NEA, null, 'windowBlocked'),
  rule('wardrobe-heat', 'Furniture', [{ kind: 'furniture', variants: ['wardrobe'] }], 'Wardrobe and heat', 'Move the {name} away from heat-producing equipment', 'Clothes and fabric should stay cool and dry', GUIDE, null, 'wardrobeHeat'),
  rule('desk-window', 'Furniture', [{ kind: 'furniture', variants: ['study_desk'] }], 'Desk and windows', 'Turn the {name} so it sits at a right angle to the window', 'Glare makes people turn the screen brightness up', NEA, null, 'deskGlare'),
  rule('desk-vent', 'Furniture', DESKS, 'Desk and computer ventilation', 'Leave air gaps around the desk so the computer stays ventilated', 'A computer in a tight space overheats', GUIDE),
  rule('desk-light', 'Furniture', DESKS, 'Desk and light', 'Do not let a tall bookshelf or desk block the window light', 'Blocked daylight means lights stay on longer', GUIDE),
  rule('shelf-air', 'Furniture', [{ kind: 'furniture', variants: ['bookshelf'] }], 'Shelves and airflow', 'Keep tall shelves from blocking airflow in the room', 'Tall furniture stops air moving across the room', GUIDE),
]

// ============================================================
// FINDING RULES
// ============================================================

// True when the rule applies to a thing with this spec ({ kind, variant }).
export function ruleApplies(rule, spec) {
  if (rule.appliesTo === 'any') {
    return true
  }
  for (const target of rule.appliesTo) {
    if (target.kind !== spec.kind) {
      continue
    }
    if (!target.variants) {
      return true
    }
    if (target.variants.includes(spec.variant)) {
      return true
    }
  }
  return false
}

// The rules that apply to a thing with this spec.
export function rulesFor(spec) {
  const found = []
  for (const r of RULES) {
    if (ruleApplies(r, spec)) {
      found.push(r)
    }
  }
  return found
}

// The rule with this id (or null).
export function ruleById(id) {
  for (const r of RULES) {
    if (r.id === id) {
      return r
    }
  }
  return null
}

// ============================================================
// WRITING THE TEXT
// ============================================================

// Capitalize first letter
export function capital(text) {
  const clean = String(text).trim()
  if (!clean) {
    return ''
  }
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

// Capitalize first letter in sentence
export function sentence(text) {
  let clean = capital(text)
  while (clean.endsWith('.') || clean.endsWith('!') || clean.endsWith('?')) {
    clean = clean.slice(0, -1).trim()
  }
  if (!clean) {
    return ''
  }
  return clean + '.'
}

// A tip
export function tipText(parts) {
  let text = capital(parts.title) + ': ' + sentence(parts.instruction)
  if (parts.reason) {
    text = text + ' ' + sentence(parts.reason)
  }
  if (parts.source) {
    text = text + ' (' + capital(parts.source) + ')'
  }
  return text
}

// Splits a tip written by tipText() back into its parts, so the sidebar can show the title on its own.
export function splitTip(text) {
  let body = String(text)
  let source = ''
  const found = body.match(/\s\((NEA|Tips)\)$/)
  if (found) {
    source = found[1]
    body = body.slice(0, found.index)
  }
  let title = ''
  const colon = body.indexOf(': ')
  if (colon > 0) {
    title = body.slice(0, colon)
    body = body.slice(colon + 2)
  }
  return { title: title, body: body, source: source }
}

// The tip for a rule.
export function ruleTip(rule, name) {
  function fill(text) {
    return text.split('{name}').join(name)
  }
  return tipText({ title: fill(rule.title), instruction: fill(rule.instruction), reason: fill(rule.reason), source: rule.source })
}

// A recommendation in the standard form:
export function recText(parts) {
  return 'Move the ' + parts.name + ' ' + parts.distance + ' ' + parts.direction + '. ' + sentence(parts.reason) + ' Expected saving: ' + parts.saving + '.'
}
