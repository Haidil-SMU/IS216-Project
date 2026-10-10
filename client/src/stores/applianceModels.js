import * as THREE from 'three'

export function createAppliance3DModel(type = '', category = '') {
  const group = new THREE.Group()
  const t = type.toLowerCase()
  const c = category.toLowerCase()

  const enableShadows = (obj) => {
    obj.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
  }

  if (t.includes('window') || (c.includes('build') && t.includes('window'))) {
    const isDoubleGlazed = t.includes('double') || t.includes('3_tick') || t.includes('4_tick') || t.includes('5_tick')

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.8 })
    
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.12), frameMat)
    frameTop.position.y = 2.2
    const frameBottom = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.12), frameMat)
    frameBottom.position.y = 1.0
    const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.28, 0.12), frameMat)
    frameLeft.position.set(-0.66, 1.6, 0)
    const frameRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.28, 0.12), frameMat)
    frameRight.position.set(0.66, 1.6, 0)

    const vertMullion = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.2, 0.06), frameMat)
    vertMullion.position.set(0, 1.6, 0)
    const horizGrille = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.02, 0.02), frameMat)
    horizGrille.position.set(0, 1.6, 0)

    const sill = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.06, 0.22),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 })
    )
    sill.position.set(0, 0.95, 0.05)

    const glassMat = new THREE.MeshPhysicalMaterial({ 
      color: isDoubleGlazed ? 0x3b82f6 : 0x93c5fd, 
      transparent: true, 
      opacity: 0.5, 
      roughness: 0.05, 
      transmission: 0.9,
      ior: 1.5,
      thickness: isDoubleGlazed ? 0.08 : 0.02
    })

    const leftGlass = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.12, 0.02), glassMat)
    leftGlass.position.set(-0.32, 1.6, 0)

    const rightGlass = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.12, 0.02), glassMat)
    rightGlass.position.set(0.32, 1.6, 0)

    const latch = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.14, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.1 })
    )
    latch.position.set(-0.04, 1.6, 0.04)

    group.add(frameTop, frameBottom, frameLeft, frameRight, vertMullion, horizGrille, sill, leftGlass, rightGlass, latch)
    enableShadows(group)
    return group
  }

  if (t.includes('door') || (c.includes('build') && t.includes('door'))) {
    const isGlassDoor = t.includes('glass') || t.includes('sliding')

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 })
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.08, 0.12), frameMat)
    frameTop.position.y = 2.04
    const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.04, 0.12), frameMat)
    frameLeft.position.set(-0.52, 1.02, 0)
    const frameRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.04, 0.12), frameMat)
    frameRight.position.set(0.52, 1.02, 0)

    group.add(frameTop, frameLeft, frameRight)

    if (isGlassDoor) {
      const glassMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x93c5fd, 
        transparent: true, 
        opacity: 0.5, 
        roughness: 0.1, 
        transmission: 0.85 
      })
      const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.96, 1.96, 0.04), glassMat)
      doorPanel.position.y = 1.0

      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.4, 0.05),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9 })
      )
      handle.position.set(0.4, 1.0, 0.04)

      group.add(doorPanel, handle)
    } else {
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.55 })
      const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.96, 1.96, 0.05), woodMat)
      doorPanel.position.y = 1.0

      const panelMat = new THREE.MeshStandardMaterial({ color: 0x6e2a0f, roughness: 0.6 })
      const topInset = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.75, 0.06), panelMat)
      topInset.position.set(0, 1.38, 0)
      const bottomInset = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.75, 0.06), panelMat)
      bottomInset.position.set(0, 0.55, 0)

      const leverGroup = new THREE.Group()
      const backplate = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.18, 0.01),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.15 })
      )
      const lever = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.12, 16),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.15 })
      )
      lever.rotation.x = Math.PI / 2
      lever.position.set(0.04, 0.02, 0.03)

      leverGroup.add(backplate, lever)
      leverGroup.position.set(0.38, 1.0, 0.03)

      group.add(doorPanel, topInset, bottomInset, leverGroup)
    }

    enableShadows(group)
    return group
  }


  if (t.includes('counter') || t.includes('quartz')) {
    const cabinet = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.82, 0.75),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 })
    )
    cabinet.position.y = 0.41

    const slabMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.15, metalness: 0.1 })
    const topSlab = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.08, 0.8), slabMat)
    topSlab.position.y = 0.88

    const backsplash = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.15, 0.04), slabMat)
    backsplash.position.set(0, 0.995, -0.38)

    const sinkMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 })
    const sink = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.4), sinkMat)
    sink.position.set(-0.4, 0.925, 0)

    const faucet = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 16), sinkMat)
    faucet.position.set(-0.4, 1.04, -0.15)

    const handles = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.02, 0.03),
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9, roughness: 0.2 })
    )
    handles.position.set(0.2, 0.5, 0.39)

    group.add(cabinet, topSlab, backsplash, sink, faucet, handles)
    enableShadows(group)
    return group
  }

  if (t.includes('refriger') || c.includes('kitchen')) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 1.75, 0.75),
      new THREE.MeshStandardMaterial({ color: 0xc0c6cc, roughness: 0.3, metalness: 0.7 })
    )
    body.position.y = 0.875

    const seam = new THREE.Mesh(
      new THREE.BoxGeometry(0.86, 0.015, 0.76),
      new THREE.MeshStandardMaterial({ color: 0x0f172a })
    )
    seam.position.y = 1.05

    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.6, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.2 })
    )
    handle.position.set(0.36, 1.1, 0.39)

    group.add(body, seam, handle)

    if (t.includes('dispenser') || t.includes('ice')) {
      const dispenser = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.3, 0.03),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2 })
      )
      dispenser.position.set(-0.18, 1.25, 0.39)
      group.add(dispenser)
    }

    enableShadows(group)
    return group
  }

  if (t.includes('split') || t.includes('system') || t.includes('ac') || c.includes('living')) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.42, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 })
    )
    body.position.y = 2.3

    const vent = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.04, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x334155 })
    )
    vent.position.set(0, 2.15, 0.18)

    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.015, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x10b981 })
    )
    led.position.set(0.5, 2.22, 0.18)

    group.add(body, vent, led)
    enableShadows(group)
    return group
  }

  if (t.includes('inch') || t.includes('tv') || c.includes('television')) {
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.85, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x030712, roughness: 0.05 })
    )
    screen.position.y = 0.85

    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.4, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 })
    )
    stand.position.y = 0.2

    group.add(screen, stand)
    enableShadows(group)
    return group
  }


  if (t.includes('dryer') || c.includes('laundry')) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.9, 0.8),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 })
    )
    body.position.y = 0.45

    const door = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.04, 32),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.8 })
    )
    door.rotation.x = Math.PI / 2
    door.position.set(0, 0.45, 0.41)

    group.add(body, door)
    enableShadows(group)
    return group
  }


  if (t.includes('led') || t.includes('lamp') || t.includes('cfl') || t.includes('tube') || c.includes('lights')) {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 0.06, 32),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 })
    )
    base.position.y = 2.8

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 32, 16),
      new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xeab308, emissiveIntensity: 1.2 })
    )
    bulb.position.y = 2.7

    group.add(base, bulb)
    enableShadows(group)
    return group
  }


  if (t.includes('motor') || c.includes('motors')) {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.85, 24),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.7, roughness: 0.3 })
    )
    body.rotation.z = Math.PI / 2
    body.position.y = 0.4

    group.add(body)
    enableShadows(group)
    return group
  }

  const fallback = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.8, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.4 })
  )
  fallback.position.y = 0.4
  group.add(fallback)
  enableShadows(group)
  return group
}