


export function effectivePower(item) {
    
  if (item.basePowerKw == null) return 0

  let power = item.basePowerKw
  const setting = item.setting
  const type = item.controlType

  if (type === 'aircon') {
    if (setting.mode === 'Fan') power *= 0.12
    else if (setting.mode === 'Dry') power *= 0.75
    else {
      const factor = Math.max(0.55, Math.min(1.35, 1 + (25 - setting.temperature) * 0.08))
      power *= factor
      if (setting.speed === 'High') power *= 1.08
      if (setting.speed === 'Low') power *= 0.94
    }
  }
  if (type === 'fan') {
    if (setting.speed === '1') power *= 0.55
    if (setting.speed === '2') power *= 0.8
  }
  if (type === 'light') power *= setting.brightness / 100
  if (type === 'tv') {
    if (setting.picture === 'Eco') power *= 0.75
    if (setting.picture === 'Vivid') power *= 1.15
  }
  if (type === 'washer') {
    if (setting.mode === 'Eco') power *= 0.7
    if (setting.mode === 'Intensive') power *= 1.25
    if (setting.water === 'Warm') power *= 1.3
  }
  if (type === 'dryer') {
    if (setting.mode === 'Eco') power *= 0.8
    if (setting.mode === 'Quick') power *= 1.15
  }
  if (type === 'dishwasher') {
    if (setting.mode === 'Eco') power *= 0.75
    if (setting.mode === 'Intensive') power *= 1.2
  }
  if (type === 'heater') power *= Math.max(0.6, Math.min(1.2, 1 + (setting.temperature - 40) * 0.025))
  if (type === 'fridge') power *= Math.max(0.8, Math.min(1.25, 1 + (4 - setting.temperature) * 0.07))
  if (type === 'microwave' || type === 'induction') {
    if (setting.level === 'Low') power *= 0.45
    if (setting.level === 'Medium') power *= 0.7
  }
  if (type === 'oven' || type === 'airfryer') power *= Math.max(0.7, Math.min(1.2, 1 + (setting.temperature - 180) * 0.002))
  if (type === 'purifier') {
    if (setting.speed === 'Low') power *= 0.6
    if (setting.speed === 'High') power *= 1.3
  }
  if (type === 'dehumidifier') power *= Math.max(0.7, Math.min(1.2, 1 + (60 - setting.humidity) * 0.018))
  if (type === 'computer') {
    if (setting.mode === 'Eco') power *= 0.65
    if (setting.mode === 'Performance') power *= 1.2
  }
  if (type === 'exhaust') {
    if (setting.speed === 'Low') power *= 0.65
  }
  if (type === 'ricecooker' && setting.mode === 'Keep Warm') power *= 0.2

  return power
}