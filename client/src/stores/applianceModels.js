import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

const SIZES = {
  refrigerator_no_freezer: [0.55, 0.85, 0.58],
  refrigerator_freezer_400l: [0.7, 1.75, 0.7],
  refrigerator_ice_dispenser: [0.9, 1.8, 0.75],
  commercial_storage_refrigerator: [0.75, 1.9, 0.8],
  '32_inch': [0.73, 0.62, 0.22],
  '55_inch': [1.23, 0.9, 0.25],
  '65_inch': [1.45, 1.03, 0.28],
  led_10w: [0.2, 0.3, 0.2],
  led_15w: [0.26, 0.36, 0.26],
  cfl: [0.16, 0.34, 0.16],
  linear_led: [1.2, 0.06, 0.08],
  fluorescent_tube: [1.2, 0.08, 0.1],
  glass_sliding_door: [1.6, 2.05, 0.1],
  microwave_oven: [0.45, 0.26, 0.35],
  air_fryer: [0.3, 0.3, 0.35],
  rice_cooker: [0.3, 0.25, 0.3],
  induction_cooker: [0.35, 0.06, 0.42],
}

const KINDS = {
  window: { mode: 'opening', size: [1.2, 1.1, 0.1], y: 1.0 },
  door: { mode: 'opening', size: [0.9, 2.05, 0.1], y: 0 },
  counter: { mode: 'wall', size: [1.8, 0.9, 0.6], y: 0 },
  ac: { mode: 'wall', size: [0.9, 0.3, 0.22], y: 2.0 },
  fridge: { mode: 'floor', size: [0.7, 1.75, 0.7], y: 0, gap: 0.1 }, 
  cook: { mode: 'top', size: [0.45, 0.26, 0.35], y: 0.9 }, 
  tv: { mode: 'floor', size: [1.23, 0.9, 0.25], y: 0 },
  dryer: { mode: 'floor', size: [0.6, 0.85, 0.65], y: 0 },
  light: { mode: 'ceiling', size: [0.2, 0.3, 0.2], y: 0 },
}

function classify(type, category) {
  if (category === 'build') {
    if (type.includes('window')) return { kind: 'window', variant: type.startsWith('double') ? 'double' : '' }
    if (type.includes('door')) return { kind: 'door', variant: type.includes('glass') ? 'glass' : '' }
    return { kind: 'counter', variant: type.includes('plain') ? 'plain' : 'sink' }
  }
  if (category === 'kitchen' && !type.includes('refrigerator')) return { kind: 'cook', variant: type }
  if (category === 'kitchen') {
    const variant = type.includes('ice') ? 'ice' : type.includes('commercial') ? 'commercial' : type.includes('no_freezer') ? 'mini' : ''
    return { kind: 'fridge', variant }
  }
  if (category === 'living') {
    if (type === 'portable') return { kind: 'ac', variant: 'portable' }
    if (type === 'window' || type === 'casement') return { kind: 'ac', variant: 'window' }
    return { kind: 'ac', variant: 'split' }
  }
  if (category === 'television') return { kind: 'tv', variant: '' }
  if (category === 'laundry') return { kind: 'dryer', variant: type }
  if (category === 'lights') return { kind: 'light', variant: type }
  return { kind: 'dryer', variant: '' } 
}

export function resolveSpec(type = '', category = '') {
  const { kind, variant } = classify(type, category)
  const base = KINDS[kind]
  let [w, h, d] = SIZES[type] || base.size
  let mode = base.mode, y = base.y
  if (kind === 'ac' && variant === 'window') { [w, h, d, y] = [0.6, 0.4, 0.5, 1.6] }
  if (kind === 'ac' && variant === 'portable') { [w, h, d, y, mode] = [0.4, 0.8, 0.4, 0, 'floor'] }
  if (kind === 'ac' && type === 'vrf') { [w, h] = [1.1, 0.34] }
  if (kind === 'light') y = 0 
  return { kind, variant, mode, w, h, d, y, gap: base.gap }
}

function makeBuilder() {
  const group = new THREE.Group()
  const add = (geometry, color, [x, y, z], opts = {}) => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...opts }))
    mesh.position.set(x, y, z)
    mesh.castShadow = mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }
  return {
    group,
    box: (w, h, d, color, [x, y, z], opts) =>
      add(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.02, w / 3, h / 3, d / 3)), color, [x, y + h / 2, z], opts),
    cyl: (r, h, color, [x, y, z], opts) => add(new THREE.CylinderGeometry(r, r, h, 24), color, [x, y + h / 2, z], opts),
    ball: (r, color, [x, y, z], opts) => add(new THREE.SphereGeometry(r, 24, 16), color, [x, y, z], opts),
    glass: (w, h, d, color, [x, y, z], opacity = 0.35) =>
      add(new THREE.BoxGeometry(w, h, d), color, [x, y + h / 2, z], { transparent: true, opacity, roughness: 0.05, depthWrite: false }),
  }
}

const STEEL = 0xaab4bd, DARK = 0x1f2933, WHITE = 0xf4f4f0, METAL = { metalness: 0.8, roughness: 0.25 }

const BUILDERS = {
  window({ w, h, d, variant }, b) {
    const f = 0.05 
    b.box(w, f, d, DARK, [0, 0, 0]); b.box(w, f, d, DARK, [0, h - f, 0])
    b.box(f, h, d, DARK, [-w / 2 + f / 2, 0, 0]); b.box(f, h, d, DARK, [w / 2 - f / 2, 0, 0])
    b.box(0.04, h, d * 0.6, DARK, [0, 0, 0]) 
    const tint = variant === 'double' ? 0x3b82f6 : 0x9ccbf5
    b.glass(w - 2 * f, h - 2 * f, 0.015, tint, [0, f, 0], variant === 'double' ? 0.5 : 0.3)
    b.box(w + 0.1, 0.04, 0.2, 0xe5e7eb, [0, -0.04, d / 2 + 0.05])
    b.box(0.03, 0.12, 0.04, 0xcbd5e1, [-0.05, h / 2 - 0.06, d / 2], METAL)
  },

  door({ w, h, d, variant }, b) {
    const f = 0.06
    b.box(w, f, d, DARK, [0, h - f, 0])
    b.box(f, h, d, DARK, [-w / 2 + f / 2, 0, 0]); b.box(f, h, d, DARK, [w / 2 - f / 2, 0, 0])
    const pw = w - 2 * f, ph = h - f
    if (variant === 'glass') {
      b.glass(pw, ph, 0.03, 0x9ccbf5, [0, 0, 0])
      b.box(0.03, ph, 0.05, 0xcbd5e1, [0, 0, 0], METAL)
      b.box(0.03, 0.4, 0.06, 0xe2e8f0, [0.1, 0.9, d / 2], METAL)
    } else {
      b.box(pw, ph, 0.05, 0x8a4b2a, [0, 0, 0], { roughness: 0.7 })
      b.box(pw * 0.7, ph * 0.38, 0.06, 0x73401f, [0, ph * 0.08, 0], { roughness: 0.8 })
      b.box(pw * 0.7, ph * 0.38, 0.06, 0x73401f, [0, ph * 0.54, 0], { roughness: 0.8 })
      b.box(0.04, 0.04, 0.09, 0xe2e8f0, [pw / 2 - 0.1, 1.0, 0.03], METAL)
    }
  },

  counter({ w, h, d, variant }, b) {
    const top = 0.04, body = h - top, front = d / 2
    b.box(w, body, d - 0.02, 0xd9cfbd, [0, 0, -0.01])
    b.box(w + 0.02, top, d, 0xf8fafc, [0, body, 0], { roughness: 0.15 })
    b.box(w, 0.1, 0.02, 0xf8fafc, [0, h, -d / 2 + 0.01])
    const doors = Math.max(2, Math.round(w / 0.5)), step = w / doors
    for (let i = 1; i < doors; i++) b.box(0.006, body - 0.1, 0.01, 0x8a8170, [-w / 2 + i * step, 0.05, front - 0.01])
    for (let i = 0; i < doors; i++) b.box(0.12, 0.015, 0.02, STEEL, [-w / 2 + (i + 0.5) * step, body - 0.08, front], METAL)
    if (variant === 'plain') return
    b.box(0.5, 0.012, 0.36, 0xc8d0d8, [-w / 2 + 0.45, h, 0.02], METAL)
    b.cyl(0.015, 0.2, STEEL, [-w / 2 + 0.45, h, -0.2], METAL)
    b.box(0.015, 0.015, 0.12, STEEL, [-w / 2 + 0.45, h + 0.2, -0.14], METAL)
  },

  cook({ w, h, d, variant }, b) {
    const front = d / 2
    if (variant === 'microwave_oven') {
      b.box(w, h, d, 0xd5d9de, [0, 0, 0], METAL)
      b.box(w * 0.65, h * 0.78, 0.01, 0x14181d, [-w * 0.1, h * 0.11, front], { roughness: 0.1 })
      b.box(w * 0.2, h * 0.78, 0.012, 0x2b3139, [w * 0.35, h * 0.11, front])
      b.box(0.012, h * 0.6, 0.02, STEEL, [w * 0.2, h * 0.2, front + 0.01], METAL)
    } else if (variant === 'air_fryer') {
      b.box(w, h * 0.78, d, 0x2b2f36, [0, 0, 0])
      b.cyl(w * 0.5, h * 0.22, 0x1c1f24, [0, h * 0.78, 0])
      b.box(w * 0.5, 0.05, 0.03, 0x4b5563, [0, h * 0.32, front + 0.01], METAL)
      b.box(0.04, 0.025, 0.01, 0x10b981, [0, h * 0.62, front], { emissive: 0x10b981, emissiveIntensity: 0.6 })
      b.cyl(w * 0.45, h * 0.75, 0xeceff3, [0, 0, 0])
      b.cyl(w * 0.47, h * 0.12, 0xcfd6dd, [0, h * 0.75, 0])
      b.ball(0.025, 0x64748b, [0, h * 0.9, 0])
      b.box(0.1, 0.04, 0.01, 0x374151, [0, h * 0.3, w * 0.45])
    } else {
      b.box(w, h, d, 0x111827, [0, 0, 0], { roughness: 0.15 })
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.004, 8, 32), new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.4 }))
      ring.rotation.x = Math.PI / 2; ring.position.set(0, h + 0.002, -0.02); b.group.add(ring)
      b.box(0.1, 0.004, 0.03, 0x64748b, [0, h, d / 2 - 0.05])
    }
  },

  fridge({ w, h, d, variant }, b) {
    const front = d / 2
    if (variant === 'mini') { 
      b.box(w, h, d, STEEL, [0, 0, 0], METAL)
      b.box(0.02, h * 0.5, 0.03, DARK, [w / 2 - 0.07, h * 0.25, front], METAL)
      return
    }
    if (variant === 'commercial') { 
      b.box(w, h, d, WHITE, [0, 0, 0])
      b.glass(w - 0.1, h - 0.2, 0.02, 0x93c5fd, [0, 0.1, front], 0.35)
      for (let i = 1; i < 5; i++) b.box(w - 0.12, 0.012, d * 0.8, 0xe2e8f0, [0, 0.1 + (i * (h - 0.2)) / 5, 0])
      b.box(0.03, h * 0.5, 0.04, DARK, [w / 2 - 0.05, h * 0.25, front + 0.02], METAL)
      return
    }
    b.box(w, h, d, STEEL, [0, 0, 0], METAL)
    const split = h * 0.66 
    b.box(w + 0.005, 0.012, d + 0.005, DARK, [0, h - split, 0])
    b.box(0.025, 0.5, 0.035, DARK, [w / 2 - 0.07, h - split + 0.1, front + 0.01], METAL) 
    b.box(0.025, 0.4, 0.035, DARK, [w / 2 - 0.07, h - split - 0.5, front + 0.01], METAL) 
    if (variant === 'ice') b.box(0.22, 0.32, 0.02, DARK, [-w / 4, h * 0.45, front], { roughness: 0.2 })
  },

  ac({ w, h, d, variant }, b) {
    if (variant === 'window') { 
      b.box(w, h, d, 0xe8e8e3, [0, 0, 0])
      b.box(w * 0.8, h * 0.45, 0.02, 0x64748b, [0, h * 0.4, d / 2])
      for (let i = 0; i < 4; i++) b.box(w * 0.8, 0.008, 0.02, DARK, [0, 0.04 + i * 0.03, d / 2 + 0.005])
      return
    }
    if (variant === 'portable') { 
      b.box(w, h - 0.06, d, 0xf0f0ec, [0, 0.06, 0])
      b.box(w * 0.7, 0.06, 0.02, DARK, [0, h - 0.18, d / 2])
      b.box(0.06, 0.1, 0.02, 0x10b981, [w / 2 - 0.08, h - 0.28, d / 2], { emissive: 0x10b981, emissiveIntensity: 0.5 })
      for (const x of [-1, 1]) for (const z of [-1, 1]) b.ball(0.025, DARK, [x * w * 0.35, 0.025, z * d * 0.35])
      return
    }

    b.box(w, h, d, WHITE, [0, 0, 0], { roughness: 0.3 })
    b.box(w * 0.92, 0.035, 0.05, DARK, [0, 0.03, d / 2 - 0.02]) 
    b.box(w * 0.88, 0.02, 0.01, 0xe2e8f0, [0, h - 0.08, d / 2]) 
    b.box(0.03, 0.012, 0.012, 0x10b981, [w / 2 - 0.1, h - 0.06, d / 2], { emissive: 0x10b981, emissiveIntensity: 1 })
  },

  tv({ w, h, d }, b) {
    const legH = 0.12, sh = h - legH, bezel = 0.012
    b.box(w * 0.4, 0.02, d, 0x374151, [0, 0, 0], METAL) 
    b.box(0.06, legH, 0.04, 0x374151, [0, 0.02, 0], METAL) 
    b.box(w, sh, 0.04, 0x111418, [0, legH, 0], { roughness: 0.35 })
    b.box(w - 2 * bezel, sh - 2 * bezel, 0.005, 0x05070a, [0, legH + bezel, 0.022], { roughness: 0.05, metalness: 0.3 }) 
  },

  dryer({ w, h, d, variant }, b) {
    const front = d / 2, colour = variant === 'heat_pump' ? 0xe2e8f0 : WHITE
    b.box(w, h, d, colour, [0, 0, 0], { roughness: 0.3 })
    b.box(w, 0.1, 0.02, 0x475569, [0, h - 0.14, front])
    b.cyl(0.02, 0.03, STEEL, [0.15, h - 0.1, front + 0.01], METAL).rotation.x = Math.PI / 2
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 12, 32), new THREE.MeshStandardMaterial({ color: STEEL, ...METAL }))
    ring.position.set(0, h * 0.45, front); ring.castShadow = true; b.group.add(ring)
    const glass = b.cyl(0.19, 0.02, 0x1e293b, [0, 0, front - 0.005], { roughness: 0.1, transparent: true, opacity: 0.85 })
    glass.rotation.x = Math.PI / 2
    glass.position.y = h * 0.45
  },

  light({ w, h, variant }, b) {
    const glow = { color: 0xfff3b0, emissive: 0xffd24a, emissiveIntensity: 1.1 }
    const lit = (mesh) => { mesh.material.emissive.setHex(glow.emissive); mesh.material.emissiveIntensity = glow.emissiveIntensity; return mesh }
    if (variant.includes('tube') || variant.includes('linear')) { 
      const tube = b.cyl(h * 0.4, w, 0xffffff, [0, 0, 0]); tube.rotation.z = Math.PI / 2; tube.position.set(0, h / 2, 0); lit(tube)
      b.box(0.06, h * 0.4, 0.06, DARK, [-w / 2 + 0.05, h * 0.6, 0]); b.box(0.06, h * 0.4, 0.06, DARK, [w / 2 - 0.05, h * 0.6, 0])
      return
    }

    const r = w / 2, cord = h - r * 2
    b.cyl(0.05, 0.02, DARK, [0, h - 0.02, 0])
    b.cyl(0.006, cord, DARK, [0, r * 2, 0])
    lit(b.ball(variant === 'cfl' ? r * 0.7 : r, glow.color, [0, r, 0]))
    if (variant === 'cfl') b.cyl(r * 0.8, r * 1.6, 0xf1f5f9, [0, r * 1.4, 0])
  },
}


export function createAppliance3DModel(type = '', category = '') {
  const spec = resolveSpec(type, category)
  const b = makeBuilder()
  ;(BUILDERS[spec.kind] || BUILDERS.dryer)(spec, b)
  b.group.userData.spec = spec
  return b.group
}
