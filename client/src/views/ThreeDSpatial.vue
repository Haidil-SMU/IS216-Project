<template>
  <div class="spatial-page" :style="{ '--nav-h': navH + 'px' }">
    <div class="spatial-sky" aria-hidden="true">
      <div class="spatial-sun"></div>
      <div class="spatial-cloud cloud-a"></div>
      <div class="spatial-cloud cloud-b"></div>
      <div class="spatial-hills"></div>
    </div>

    <header class="spatial-toolbar">
      <div class="d-flex align-items-center gap-3 min-w-0">
        <span class="title-badge d-none d-sm-grid" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/></svg>
        </span>
        <div class="min-w-0">
          <h1 class="page-title text-truncate">{{ pageTitle }}</h1>
        </div>
      </div>

      <div class="d-flex align-items-center gap-2 flex-wrap justify-content-end">
        <label v-if="energyPlans.length" class="scope-picker" :class="{ 'is-plan': scopeId }" title="Choose which saved layout the 3D model edits">
          <span class="scope-label">Editing</span>
          <select class="scope-select" :value="scopeId" aria-label="Layout to edit" @change="switchScope">
            <option value="">Current home (default)</option>
            <option v-for="p in energyPlans" :key="p.id" :value="p.id">
              Plan: {{ p.name }}{{ p.hasLayout ? '' : ' (no saved layout, use current home…)' }}
            </option>
          </select>
        </label>

        <div class="layer-group" role="group" aria-label="Show in room">
          <template v-for="layer in OVERLAY_LAYERS" :key="layer.key">
            <input :id="`layer-${layer.key}`" type="checkbox" class="btn-check" v-model="overlays[layer.key]" autocomplete="off">
            <label :for="`layer-${layer.key}`" class="layer-pill" :style="{ '--c': layer.color }" :title="layer.hint">
              <span class="layer-icon" aria-hidden="true">
                <svg v-if="layer.key === 'sun'" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
                <svg v-else-if="layer.key === 'heat'" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/></svg>
                <svg v-else viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>
              </span>{{ layer.label }}
            </label>
          </template>
        </div>

        <button
          type="button" class="lock-switch" :class="{ 'is-on': layoutLocked }" role="switch" :aria-checked="layoutLocked"
          title="When on, room sizes and positions can't be changed by accident. You can still move items."
          @click="layoutLocked = !layoutLocked"
        >
          <svg v-if="layoutLocked" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
          <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>
          <span>Lock room sizes</span>
          <span class="switch" aria-hidden="true"><i></i></span>
        </button>

        <div class="history-group" role="group" aria-label="History and hammer">
          <button type="button" class="hist-btn" :disabled="!canUndo" title="Undo (Ctrl+Z)" aria-label="Undo" @click="undo">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>
          </button>
          <button type="button" class="hist-btn" :disabled="!canRedo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" @click="redo">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>
          </button>
          <span class="hist-divider" aria-hidden="true"></span>

          <button
            type="button" class="tools-btn" :class="{ 'is-active': hammer }" :aria-pressed="hammer" :disabled="layoutLocked"
            :title="layoutLocked ? 'Turn off &quot;Lock room sizes&quot; to use the hammer.' : 'Knock out the wall between two rooms, or build it back. Press Esc to put it down.'"
            @click="toggleHammer"
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 13-8.4 8.4a2 2 0 0 1-2.8-2.8L11 10.8"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><path d="m21 11-8-8"/></svg>
            Hammer
            <span v-if="hammer" class="tools-dot" title="Hammer is on" role="img" aria-label="Hammer is on"></span>
          </button>
        </div>
      </div>
    </header>

    <div class="spatial-body">
      <main class="canvas-card">
        <FloorPlan3D
          :rooms="plan.rooms" :footprint="plan.footprint"
          :selected-id="selectedRoomId" :selected-item-id="selectedItemId"
          @select-room="selectedRoomId = $event" @select-item="selectedItemId = $event"
          :overlays="overlays" plain :layout-key="scopeId" :plan-name="scopePlan?.name ?? ''"
          @ready="sceneReady = true" v-model:hammer="hammer" :locked="layoutLocked" @locked="flash($event)" @hammer-wall="onHammerWall" @edit-rect="onEditRect" @move-items="onMoveItems" @move-opening="onMoveOpening" @drag-preview="preview = $event" @rotate-blocked="flash('No room to rotate it here.')" @move-blocked="flash('Something is in the way of that move.', 2000)" @door-blocked="flash($event)" />

        <div class="canvas-messages">
          <div v-if="scopePlan" class="msg msg-info">
            <span>Editing the layout saved in <b>{{ scopePlan.name }}</b>. Changes stay in this plan and don't touch your current home layout.</span>
            <button type="button" class="btn btn-sm btn-eco-outline btn-pill flex-shrink-0" @click="useHomeLayout(scopePlan, true)">Reset to current home</button>
          </div>
          <div v-if="missingItems" class="msg msg-warn">
            {{ missingItems }} {{ missingItems === 1 ? 'item is' : 'items are' }} not in the catalogue any more, so {{ missingItems === 1 ? 'its' : 'their' }} energy is not counted in the total.
          </div>
          <div v-if="warnings.length" class="msg msg-warn msg-box">
            <button type="button" class="warn-toggle" @click="showWarnings = !showWarnings" :aria-expanded="showWarnings">
              ⚠ {{ warnings.length }} layout {{ warnings.length === 1 ? 'warning' : 'warnings' }}
              <span class="ms-auto">{{ showWarnings ? '▾' : '▸' }}</span>
            </button>
            <ul v-if="showWarnings" class="msg-list">
              <li v-for="w in warnings" :key="w">{{ w }}</li>
            </ul>
          </div>

          <Transition name="toast">
            <div v-if="notice" class="msg msg-toast" :class="notice.kind === 'ok' ? 'msg-ok' : 'msg-warn'" role="status" aria-live="polite">
              <svg v-if="notice.kind === 'ok'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
              <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              <span>{{ notice.text }}</span>
            </div>
          </Transition>
        </div>

      </main>

      <aside class="side-column">
        <section class="stat-card" aria-label="Estimated yearly energy">
          <svg class="stat-wave" viewBox="0 0 320 60" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 32C50 8 100 54 160 32S270 6 320 28V60H0Z" fill="rgba(255,255,255,0.1)" />
            <path d="M0 44C60 24 110 62 170 44S280 26 320 42V60H0Z" fill="rgba(255,255,255,0.08)" />
          </svg>
          <div class="stat-head">
            <span class="stat-leaf" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z"/><path d="M2 21c0-3 1.9-5.4 5.1-6"/></svg>
            </span>
            <span class="stat-label">Estimated energy</span>
            <span class="stat-scope text-truncate" :title="scopePlan ? scopePlan.name : 'Whole flat'">{{ scopePlan ? scopePlan.name : 'Whole flat' }}</span>
          </div>
          <div class="d-flex align-items-baseline gap-2 flex-wrap">
            <span class="stat-value">{{ loading ? '–' : totalKwhYear.toLocaleString() }}</span>
            <span class="stat-unit">kWh/yr</span>
          </div>
          <div v-if="placementImpact >= 0.1" class="stat-note">
            +{{ placementImpact.toFixed(1) }}% from placement (rated {{ ratedKwhYear.toLocaleString() }} kWh/yr)
          </div>
        </section>

        <section v-if="selectedOpening" class="panel-card d-flex align-items-center justify-content-between gap-2 py-2">
          <span class="small text-truncate">
            <b>{{ selectedOpening.name }}</b>
            <span class="text-muted"> · drag along the wall</span>
          </span>
          <button class="btn btn-sm btn-pill-danger flex-shrink-0" @click="removeSelectedOpening">Remove</button>
        </section>

        <section v-if="recs.length || tips.length" class="panel-card recs-card">
          <div class="panel-title mb-2">Recommendations <span class="count-pill">{{ recs.length + tips.length }}</span></div>
          <div class="recs-scroll">
            <div v-for="r in recs" :key="r.id" class="rec-row">
              <span class="small">{{ r.text }}</span>
              <button class="btn btn-sm btn-eco flex-shrink-0" @click="applyRec(r)">Apply</button>
            </div>
            <div v-for="t in tips" :key="t.text" class="rec-row rec-tip" @click="selectedItemId = t.id">
              <span class="small">{{ t.text }}</span>
            </div>
          </div>
        </section>

        <section v-if="!selectedRoom" class="panel-card items-card">
          <div class="mb-2">
            <div class="panel-title">Room breakdown</div>
            <div class="panel-sub">Pick a room to see and edit its items. New appliances go into the room you pick.</div>
          </div>

          <div v-if="loading" class="skeleton-list" aria-hidden="true"><span></span><span></span><span></span><span></span></div>

          <div v-else-if="!roomBreakdown.length" class="empty-state">
            <div class="empty-icon" aria-hidden="true">⌂</div>
            No rooms yet. Add your rooms in My Profile to see them here.
          </div>

          <ul v-else class="breakdown-list list-unstyled mb-0">
            <li v-for="r in roomBreakdown" :key="r.id">
              <button type="button" class="breakdown-row" :aria-label="`${r.name}: ${r.pctLabel} of your energy. Open this room.`" @click="selectedRoomId = r.id">
                <span class="room-dot" :style="{ background: r.color }" aria-hidden="true"></span>
                <span class="breakdown-main">
                  <span class="breakdown-name">{{ r.name }}</span>
                  <span class="breakdown-meta">{{ r.kwh.toLocaleString() }} kWh/yr · {{ r.items }} {{ r.items === 1 ? 'item' : 'items' }}</span>
                  <span class="breakdown-bar" aria-hidden="true"><i :style="{ width: r.pct + '%', background: r.color }"></i></span>
                </span>
                <span class="breakdown-pct">{{ r.pctLabel }}</span>
                <svg class="breakdown-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
              </button>
            </li>
          </ul>
        </section>

        <section v-else class="panel-card items-card">
          <div class="d-flex justify-content-between align-items-center gap-2 mb-2">
            <div class="d-flex align-items-center gap-2 min-w-0">
              <button type="button" class="back-btn" title="Back to all rooms" aria-label="Back to all rooms" @click="selectedRoomId = null">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
              </button>
              <div class="panel-title text-truncate">
                {{ selectedRoom.name }}
                <span class="count-pill">{{ roomItems.length }}</span>
              </div>
            </div>
            <button v-if="roomItems.length" class="btn btn-sm btn-pill-danger flex-shrink-0" @click="clearRoomItems">Clear all</button>
          </div>

          <div v-if="!roomItems.length" class="empty-state">
            Nothing here yet. Pick an appliance from the catalogue below.
          </div>

          <ul v-else class="item-list list-unstyled mb-0">
            <li
              v-for="item in roomItems" :key="item.id"
              class="item-row"
              :class="{ active: item.id === selectedItemId }"
              @click="selectedItemId = item.id"
            >
              <div class="min-w-0 flex-grow-1">
                <div class="item-name" :title="item.name">{{ item.short }}</div>
                <div v-if="item.brand" class="item-meta item-model" :title="`${item.brand} ${item.model}`">{{ item.brand }} {{ item.model }}<span v-if="item.ticks" class="tick-badge">{{ item.ticks }}&#10004;&#xFE0E;</span></div>
                <div v-if="!item.build" class="item-meta">{{ rowOf(item.id) ? Math.round(rowOf(item.id).kwh) : item.kwh }} kWh/yr</div>
                <div v-if="(rowOf(item.id)?.factors?.length) || (rowOf(item.id)?.causedByOthers?.length)" class="item-tags">
                  <span v-for="f in rowOf(item.id)?.factors || []" :key="f.key" class="tag tag-warn">+{{ f.pct.toFixed(1) }}% {{ f.label.toLowerCase() }}</span>
                  <span v-for="f in rowOf(item.id)?.causedByOthers || []" :key="f.key" class="tag tag-warn">+{{ f.pct.toFixed(1) }}% {{ f.label.toLowerCase() }} (move the fan)</span>
                </div>
                <div v-if="rowOf(item.id)?.knockOn?.length" class="item-tags">
                  <span v-for="f in rowOf(item.id)?.knockOn || []" :key="f.label" class="tag tag-good">move it to save ~{{ Math.round(f.kwh) }} kWh/yr on the {{ f.label }}</span>
                </div>
              </div>
              <button class="btn-remove" aria-label="Remove item" title="Remove" @click.stop="removeItem(item.id)">✕</button>
            </li>
          </ul>
        </section>
      </aside>
    </div>


    <AppDialog ref="dialog" />

    <section class="catalogue-dock" :class="{ collapsed: !dockOpen }">
      <button type="button" class="dock-toggle" :aria-expanded="dockOpen" @click="dockOpen = !dockOpen">
        <span class="dock-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>
        </span>
        <span class="dock-title">Appliance Catalogue</span>
        <span class="dock-hint d-none d-sm-inline">Adding to {{ targetRoomName }}</span>
        <span class="ms-auto dock-caret">
          {{ dockOpen ? 'Hide' : 'Show' }}
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path v-if="dockOpen" d="m18 15-6-6-6 6"/><path v-else d="m6 9 6 6 6-6"/></svg>
        </span>
      </button>
      <div v-show="dockOpen" class="dock-body">
        <AppliancesList @add-appliance="handleAddAppliance" />
      </div>
    </section>

    <div
      v-if="!loaderGone"
      class="l3d"
      :class="{ 'is-leaving': loaderLeaving, 'is-error': loaderState === 'error' }"
      :role="loaderState === 'error' ? 'alert' : 'status'"
      aria-live="polite"
    >
      <span class="l3d-sr">{{ loaderState === 'error' ? loadError : 'Loading your 3D home…' }}</span>
      <div class="l3d-stage">
        <svg class="l3d-scene" viewBox="0 0 280 180" aria-hidden="true">
        <defs>
          <linearGradient id="l3d-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#cfeefa" />
            <stop offset="1" stop-color="#e6f6ea" />
          </linearGradient>
          <clipPath id="l3d-panel-clip">
            <polygon points="98,49 118,49 122,41 102,41" />
            <polygon points="128,49 148,49 152,41 132,41" />
            <polygon points="158,49 178,49 182,41 162,41" />
          </clipPath>
        </defs>

        <rect width="280" height="180" fill="url(#l3d-sky)" />

        <g class="l3d-sun">
          <g class="l3d-rays" stroke="#f2b632" stroke-width="3" stroke-linecap="round">
            <line x1="236" y1="20" x2="236" y2="14" /><line x1="248.7" y1="25.3" x2="253" y2="21" />
            <line x1="254" y1="38" x2="260" y2="38" /><line x1="248.7" y1="50.7" x2="253" y2="55" />
            <line x1="236" y1="56" x2="236" y2="62" /><line x1="223.3" y1="50.7" x2="219" y2="55" />
            <line x1="218" y1="38" x2="212" y2="38" /><line x1="223.3" y1="25.3" x2="219" y2="21" />
          </g>
          <circle cx="236" cy="38" r="13" fill="#f6c445" />
        </g>

        <g fill="#ffffff" opacity="0.9">
          <g class="l3d-cloud"><ellipse cx="50" cy="36" rx="22" ry="7" /><ellipse cx="62" cy="31" rx="13" ry="7" /></g>
          <g class="l3d-cloud l3d-cloud-2"><ellipse cx="200" cy="68" rx="18" ry="5.5" /><ellipse cx="190" cy="64" rx="9" ry="5" /></g>
        </g>

        <path d="M0 150 Q70 142 140 150 T280 148 V180 H0 Z" fill="#9fd6ae" />
        <rect y="152" width="280" height="28" fill="#7fc596" />

        <g class="l3d-flat">
          <rect class="l3d-slab" x="86" y="146" width="108" height="6" rx="1.5" fill="#b9ad98" />

          <rect class="l3d-wall l3d-wall-1" x="92" y="76" width="50" height="70" fill="#f4eee3" />
          <rect class="l3d-wall l3d-wall-2" x="142" y="76" width="46" height="70" fill="#e9f3ec" />
          <rect class="l3d-floor" x="92" y="138" width="96" height="8" fill="#d6ccba" />

          <rect class="l3d-wall l3d-wall-1" x="88" y="72" width="5" height="74" fill="#cfc6b6" />
          <rect class="l3d-wall l3d-wall-2" x="140" y="76" width="3" height="62" fill="#cfc6b6" />
          <rect class="l3d-wall l3d-wall-3" x="187" y="72" width="5" height="74" fill="#cfc6b6" />
          <rect class="l3d-roof" x="85" y="67" width="110" height="6" rx="1.5" fill="#a9a08d" />

          <g class="l3d-pop l3d-pop-1">
            <rect x="101" y="88" width="22" height="16" rx="1.5" fill="#bfe3f0" stroke="#fff" stroke-width="1.5" />
            <line x1="112" y1="88" x2="112" y2="104" stroke="#fff" stroke-width="1.2" />
          </g>
          <g class="l3d-pop l3d-pop-2">
            <rect x="154" y="88" width="22" height="16" rx="1.5" fill="#bfe3f0" stroke="#fff" stroke-width="1.5" />
            <line x1="165" y1="88" x2="165" y2="104" stroke="#fff" stroke-width="1.2" />
          </g>

          <g class="l3d-pop l3d-pop-3">

            <rect x="98" y="124" width="30" height="14" rx="3" fill="#168b59" />
            <rect x="98" y="118" width="30" height="8" rx="3" fill="#2fbf71" />
            <rect x="95" y="122" width="6" height="16" rx="3" fill="#116a42" />
          </g>
          <g class="l3d-pop l3d-pop-4">

            <rect x="116" y="78" width="22" height="7" rx="2" fill="#ffffff" stroke="#c9d6cf" stroke-width="0.8" />
            <line x1="119" y1="82.5" x2="135" y2="82.5" stroke="#c9d6cf" stroke-width="0.8" />
            <path class="l3d-air" d="M120 90 q4 4 0 8 M127 90 q4 4 0 8 M134 90 q4 4 0 8" fill="none" stroke="#22b8cf" stroke-width="1.3" stroke-linecap="round" />
          </g>
          <g class="l3d-pop l3d-pop-5">

            <rect x="148" y="104" width="14" height="34" rx="2" fill="#e8eef0" stroke="#c9d6cf" stroke-width="0.8" />
            <line x1="148" y1="118" x2="162" y2="118" stroke="#c9d6cf" stroke-width="0.8" />
            <rect x="159" y="108" width="1.5" height="6" rx="0.7" fill="#8a9aa3" />
          </g>
          <g class="l3d-pop l3d-pop-6">

            <rect x="166" y="126" width="21" height="12" rx="2" fill="#8b5cf6" opacity="0.9" />
            <rect x="166" y="121" width="7" height="8" rx="2" fill="#fff" />
          </g>
          <g class="l3d-pop l3d-pop-7">

            <rect x="132" y="126" width="1.6" height="12" fill="#8a6a4a" />
            <path d="M128 127 L138 127 L135.5 120 L130.5 120 Z" fill="#f6c445" />
          </g>
        </g>

        <g stroke="#6ea6c9" stroke-width="0.6">
          <g class="l3d-panel l3d-panel-1"><polygon points="98,49 118,49 122,41 102,41" fill="#2c5e80" /><line x1="100" y1="45" x2="120" y2="45" /></g>
          <g class="l3d-panel l3d-panel-2"><polygon points="128,49 148,49 152,41 132,41" fill="#2c5e80" /><line x1="130" y1="45" x2="150" y2="45" /></g>
          <g class="l3d-panel l3d-panel-3"><polygon points="158,49 178,49 182,41 162,41" fill="#2c5e80" /><line x1="160" y1="45" x2="180" y2="45" /></g>
        </g>
        <g stroke="#8a9aa3" stroke-width="1.5">
          <line class="l3d-panel l3d-panel-1" x1="104" y1="49" x2="104" y2="67" /><line class="l3d-panel l3d-panel-2" x1="134" y1="49" x2="134" y2="67" /><line class="l3d-panel l3d-panel-3" x1="164" y1="49" x2="164" y2="67" />
        </g>
        <g clip-path="url(#l3d-panel-clip)">
          <g transform="skewX(-20)"><rect class="l3d-glint" x="90" y="38" width="7" height="14" fill="#fff" opacity="0.6" /></g>
        </g>

        <g class="l3d-tree">
          <rect x="52" y="124" width="4" height="26" fill="#8a6a4a" />
          <circle cx="54" cy="118" r="12" fill="#3f9a5c" /><circle cx="45" cy="125" r="8" fill="#3f9a5c" /><circle cx="63" cy="125" r="8" fill="#3f9a5c" />
          <circle cx="50" cy="114" r="5" fill="#5db574" />
        </g>
        <g class="l3d-tree l3d-tree-2">
          <rect x="226" y="130" width="4" height="20" fill="#8a6a4a" />
          <circle cx="228" cy="125" r="10" fill="#3f9a5c" /><circle cx="220" cy="131" r="7" fill="#3f9a5c" /><circle cx="236" cy="131" r="7" fill="#3f9a5c" />
          <circle cx="224" cy="121" r="4" fill="#5db574" />
        </g>

        <g class="l3d-guides" fill="none" stroke="#168b59" stroke-width="0.8" stroke-dasharray="3 3">
          <path d="M82 160 H198" /><path d="M82 156 V164 M198 156 V164" stroke-dasharray="0" />
          <path d="M76 66 V152" /><path d="M72 66 H80 M72 152 H80" stroke-dasharray="0" />
        </g>
        </svg>
      </div>

      <div v-if="loaderState !== 'error'" class="l3d-text" aria-hidden="true">
        <div class="l3d-brand"><span class="l3d-icon">⌂</span> 3D <span class="l3d-green">Spatial</span></div>
        <div class="l3d-bar"></div>
        <div class="l3d-captions">
          <span>Measuring your rooms…</span>
          <span>Raising the walls…</span>
          <span>Placing your appliances…</span>
          <span>Switching on the lights…</span>
          <span class="l3d-final">Loading your 3D home…</span>
        </div>
      </div>
      <div v-else class="l3d-error">
        <h2 class="l3d-title">{{ needsHousehold ? 'Set up your household first' : "We couldn't load your floor plan" }}</h2>
        <p class="l3d-message">{{ loadError }}</p>
        <RouterLink v-if="needsHousehold" to="/MyProfile" class="l3d-btn">Open My Profile</RouterLink>
        <button v-else type="button" class="l3d-btn" @click="loadAll">Try again</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import AppliancesList from '../components/AppliancesList.vue'
import FloorPlan3D from '../components/FloorPlan3D.vue'
import AppDialog from '../components/AppDialog.vue'
import { resolveSpec } from '../stores/applianceModels.js'
import { OPENING_KEYS, isBuild, isOpening, isCountertop, newPlacementDoc, typeOf, productOf, kwhOfPlacement, loadCatalogue, shortNameOf } from '../stores/catalog.js'
import { findSpot, onWall, isBlocked, doorBlockedBeyond, needsOutsideWall, roomBehindOpening, sharedWall, sharedRange } from '../stores/placement.js'
import { analyse } from '../stores/energy.js'

const API_URL = '/api/spatial'
const unwrap = (response) => response.data

const householdUrl = (id) => `${API_URL}/households/${id}`
const layoutBase = (householdId, planId) => (planId ? `${API_URL}/plans/${planId}` : householdUrl(householdId))
const roomBase = (roomId, planId) => (planId ? `${API_URL}/plans/${planId}/rooms/${roomId}` : `${API_URL}/rooms/${roomId}`)

const getCatalogue = () => axios.get(`${API_URL}/catalogue`).then(unwrap)
const getCurrentHousehold = () => axios.get(`${API_URL}/current`).then(unwrap)
const getFloorplan = (householdId) => axios.get(`${householdUrl(householdId)}/floorplan`).then(unwrap)
const getHouseholdPlans = (householdId) => axios.get(`${householdUrl(householdId)}/plans`).then(unwrap)
const getPlanFloorplan = (planId) => axios.get(`${API_URL}/plans/${planId}/floorplan`).then(unwrap)
const restoreLayout = (householdId, rooms, planId) => axios.put(`${layoutBase(householdId, planId)}/layout`, { rooms }).then(unwrap)

const setRoomRect = (householdId, roomId, rect, planId) =>
  axios.put(`${layoutBase(householdId, planId)}/room-rect`, { roomId, rect }).then(unwrap)
const addOpening = (householdId, roomId, applianceTypeKey, spots, planId) =>
  axios.post(`${layoutBase(householdId, planId)}/openings`, { roomId, applianceTypeKey, spots }).then(unwrap)
const moveOpening = (householdId, roomId, placementId, wall, t, planId) =>
  axios.put(`${layoutBase(householdId, planId)}/openings/${placementId}`, { roomId, wall, t }).then(unwrap)
const removeOpening = (householdId, roomId, placementId, planId) =>
  axios.delete(`${layoutBase(householdId, planId)}/openings/${placementId}`, { params: { roomId } }).then(unwrap)


const setWallOpen = (householdId, roomId, otherId, open, planId) =>
  axios.put(`${layoutBase(householdId, planId)}/wall-opening`, { roomId, otherId, open }).then(unwrap)

const addPlacement = (roomId, placement, planId) => axios.post(`${roomBase(roomId, planId)}/placements`, placement).then(unwrap)
const removePlacement = (roomId, placementId, planId) => axios.delete(`${roomBase(roomId, planId)}/placements/${placementId}`)
const saveRoomPlacements = (roomId, placements, planId) => axios.put(`${roomBase(roomId, planId)}/placements`, { placements }).then(unwrap)
const moveManyPlacements = (roomId, moves, planId) => axios.post(`${roomBase(roomId, planId)}/placements/move`, { moves }).then(unwrap)
const copyHomeToPlan = (planId) => axios.post(`${API_URL}/plans/${planId}/layout/from-home`).then(unwrap)

const round3 = (v) => Math.round((Number(v) || 0) * 1000) / 1000
const byId = (a, b) => (String(a._id) < String(b._id) ? -1 : String(a._id) > String(b._id) ? 1 : 0)

const layoutSig = (rooms) => JSON.stringify([...rooms].sort(byId).map((r) => [
  String(r._id), r.name, round3(r.origin.x), round3(r.origin.z), round3(r.dimension.w), round3(r.dimension.d), round3(r.dimension.h),
  (r.openWalls || []).map((o) => [o.wall, round3(o.t0), round3(o.t1), o.to]),
  [...r.placements].sort(byId).map((p) => [
    String(p._id), p.applianceTypeKey, p.brand ?? '', p.model ?? '',
    round3(p.x), round3(p.z), round3(p.rotY), p.wall, round3(p.t), round3(p.cu), String(p.onPlacementId ?? ''),
  ]),
]))

function createLayoutHistory({
  key = 'ecohome.3d.history',
  maxChars = 1500000, 
  saveMs = 400,
  storage = () => globalThis.sessionStorage,
} = {}) {
  const histories = new Map()
  const waiting = new Set()
  let timer = 0

  const readStored = () => {
    try { return JSON.parse(storage().getItem(key) || '{}') || {} } catch { return {} }
  }

  function writeWaiting() {
    timer = 0
    const ids = [...waiting]
    waiting.clear()
    try {
      const all = readStored()
      for (const id of ids) {
        const entry = histories.get(id)
        if (entry) all[id] = { ...entry, undo: [...entry.undo] }
      }
      let text = JSON.stringify(all)
      for (const id of ids) {
        const copy = all[id]
        while (copy && text.length > maxChars && copy.undo.length > 1) { copy.undo.shift(); text = JSON.stringify(all) }
      }
      if (text.length <= maxChars) storage().setItem(key, text)
    } catch { }
  }

  return {
    save(id, rooms, undo, redo) {
      histories.set(id, { sig: layoutSig(rooms), undo: [...undo], redo: [...redo] })
      waiting.add(id)
      clearTimeout(timer)
      timer = setTimeout(writeWaiting, saveMs)
    },

    load(id, rooms) {
      const sig = layoutSig(rooms)
      let entry = histories.get(id)
      if (entry?.sig !== sig) entry = readStored()[id]
      const usable = entry?.sig === sig && Array.isArray(entry.undo) && Array.isArray(entry.redo)
      return usable ? { undo: [...entry.undo], redo: [...entry.redo] } : { undo: [], redo: [] }
    },

    flush() {
      if (!timer) return
      clearTimeout(timer)
      writeWaiting()
    },
  }
}

const navH = ref(72)
const dockOpen = ref(typeof window === 'undefined' || window.innerHeight >= 860)
const showWarnings = ref(false)
let navObserver
const measureNav = () => { navH.value = document.querySelector('.eco-navbar')?.offsetHeight || 72 }

const loadError = ref('')
const needsHousehold = ref(false)
const dataReady = ref(false)
const sceneReady = ref(false)
const loaderGone = ref(false)
const loaderLeaving = ref(false)
const loading = computed(() => !dataReady.value && !loadError.value)
const loaderState = computed(() => (loadError.value ? 'error' : dataReady.value && sceneReady.value ? 'ready' : 'loading'))
let sceneTimer

const LOADER_MIN_MS = 3000
const LOADER_FADE_MS = 500
const loaderStart = performance.now()
const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
let loaderTimer, loaderFadeTimer
watch(loaderState, (state) => {
  clearTimeout(loaderTimer); clearTimeout(loaderFadeTimer)
  loaderLeaving.value = false
  if (state !== 'ready') return
  const wait = reduceMotion ? 0 : Math.max(0, LOADER_MIN_MS - (performance.now() - loaderStart))
  loaderTimer = setTimeout(() => {
    loaderLeaving.value = true
    loaderFadeTimer = setTimeout(() => (loaderGone.value = true), reduceMotion ? 0 : LOADER_FADE_MS)
  }, wait)
})
onBeforeUnmount(() => { clearTimeout(loaderTimer); clearTimeout(loaderFadeTimer) })

async function loadAll() {
  loadError.value = ''
  needsHousehold.value = false
  dataReady.value = false
  try {
    await loadCatalogue()
    applyLoaded(await getCurrentHousehold())
    await loadPlanList()
    await restoreScope()
    scopeReady = true
    dataReady.value = true
    clearTimeout(sceneTimer)
    sceneTimer = setTimeout(() => { sceneReady.value = true }, plan.value.rooms.length ? 5000 : 0)
  } catch (e) {
    needsHousehold.value = e.response?.data?.code === 'NO_HOUSEHOLD'
    loadError.value = needsHousehold.value
      ? e.response.data.error
      : e.response
        ? e.response.data?.error || `The server answered with an error (${e.response.status}).`
        : 'The server could not be reached. Check your connection, then try again.'
  }
}
onMounted(loadAll)

const plan = ref({ rooms: [], footprint: null })
const warnings = ref([])
const notice = ref(null)
const dialog = ref(null)
let flashTimer
const flash = (msg, ms = 4000, kind = 'warn') => { notice.value = { text: msg, kind }; clearTimeout(flashTimer); flashTimer = setTimeout(() => (notice.value = null), ms) }
const problem = (msg, title = 'Something went wrong') => { notice.value = null; return dialog.value?.notify({ title, message: msg }) ?? flash(msg) }
const reasonOf = (e) => e.response?.data?.error || e.message
const hid = () => plan.value.household._id

function applyLoaded(loaded, { keepHistory = false } = {}) {
  plan.value = loaded
  warnings.value = loaded.warnings ?? []
  if (!keepHistory) loadHistory()
}

const scopeId = ref('')
const energyPlans = ref([])
const planScope = () => scopeId.value || undefined
const scopePlan = computed(() => energyPlans.value.find((p) => p.id === scopeId.value) ?? null)
// The plan being edited names the page. Without a plan (the current home layout) it falls back to the household's name.
const pageTitle = computed(() => scopePlan.value?.name || plan.value.household?.name || 'Your flat')
const loadScope = () => (scopeId.value ? getPlanFloorplan(scopeId.value) : getFloorplan(hid()))
const reloadScope = async ({ keepHistory = false } = {}) => applyLoaded(await loadScope(), { keepHistory })

async function loadPlanList() {
  try { energyPlans.value = await getHouseholdPlans(hid()) } catch { energyPlans.value = [] }
}

async function changeScope(next) {
  if (next === scopeId.value) return true
  await chain
  const previous = scopeId.value
  try {
    scopeId.value = next
    const loaded = await loadScope()
    selectedRoomId.value = null
    selectedItemId.value = null
    preview.value = null
    applyLoaded(loaded)
    rememberScope()
    return true
  } catch (e) {
    scopeId.value = previous
    problem(reasonOf(e), 'Could not switch layouts')
    return false
  }
}

async function switchScope(event) {
  const next = event.target.value
  const target = energyPlans.value.find((p) => p.id === next)
  if (target && !target.hasLayout) {
    event.target.value = scopeId.value
    await useHomeLayout(target, false)
    return
  }
  if (!(await changeScope(next))) event.target.value = scopeId.value
}

async function useHomeLayout(target, reset) {
  if (!target) return
  const ask = reset
    ? `Replace the layout saved in "${target.name}" with your current home layout? Changes you made to this plan's 3D layout will be lost.`
    : `"${target.name}" has no saved 3D layout yet. Copy your current home layout into it?`
  const yes = await dialog.value.confirm({
    title: reset ? 'Reset this plan\'s layout?' : 'Use your current home layout?',
    message: ask,
    okText: reset ? 'Replace layout' : 'Copy layout',
    danger: reset,
  })
  if (!yes) return
  await chain
  try {
    await copyHomeToPlan(target.id)
    await loadPlanList()
    if (scopeId.value === target.id) {
      selectedRoomId.value = null
      selectedItemId.value = null
      preview.value = null
      await reloadScope()
    } else {
      await changeScope(target.id)
    }
    flash(reset ? `"${target.name}" now matches your current home layout.` : `Copied your current home layout into "${target.name}".`, 4000, 'ok')
  } catch (e) {
    problem(reasonOf(e), 'Could not copy the layout')
  }
}

const route = useRoute()
const router = useRouter()
const SCOPE_KEY = 'ecohome.3d.layout'
let scopeReady = false
const queryPlan = () => { const q = route.query.plan; return String((Array.isArray(q) ? q[0] : q) || '') }
const openablePlan = (id) => energyPlans.value.some((p) => p.id === id && p.hasLayout)

function rememberScope() {
  try { if (scopeId.value) localStorage.setItem(SCOPE_KEY, scopeId.value); else localStorage.removeItem(SCOPE_KEY) } catch { /* storage can be blocked; the address still carries it */ }
  if (queryPlan() !== scopeId.value) router.replace({ query: { ...route.query, plan: scopeId.value || undefined } }).catch(() => {})
}

async function restoreScope() {
  const asked = queryPlan()
  let remembered = ''
  try { remembered = localStorage.getItem(SCOPE_KEY) || '' } catch { }
  const want = asked || remembered
  if (want && openablePlan(want)) { await changeScope(want); return }
  if (asked) problem("It was not found, or it has no saved layout yet. Pick it in the layout selector to copy your current home layout into it.", "That plan can't be opened in 3D")
  rememberScope()
}

watch(() => route.query.plan, async () => {
  const id = queryPlan()
  if (!scopeReady || !id || id === scopeId.value) return
  if (openablePlan(id)) await changeScope(id)
  else problem('It was not found, or it has no saved layout yet.', "That plan can't be opened in 3D")
})

const selectedRoomId = ref(null)
const selectedItemId = ref(null)
const selectedRoom = computed(() => plan.value.rooms.find((r) => String(r._id) === selectedRoomId.value))

watch(() => plan.value.rooms, (rooms) => {
  if (selectedRoomId.value && !rooms.some((r) => String(r._id) === selectedRoomId.value)) selectedRoomId.value = null
  if (selectedItemId.value && !rooms.some((r) => r.placements.some((p) => String(p._id) === selectedItemId.value))) selectedItemId.value = null
})
watch(selectedRoomId, (id) => {
  const r = plan.value.rooms.find((x) => String(x._id) === id)
  if (selectedItemId.value && !r?.placements.some((p) => String(p._id) === selectedItemId.value)) selectedItemId.value = null
})

const kwhOf = kwhOfPlacement
const nameOf = (p) => typeOf(p.category, p.applianceTypeKey)?.name ?? p.applianceTypeKey

const preview = ref(null)
const placedOf = (r) => r.placements.map((p) => ({
  id: String(p._id), name: nameOf(p), kwh: isBuild(p.category) ? 0 : kwhOf(p), ticks: productOf(p.category, p.applianceTypeKey, p.brand, p.model)?.ticks ?? null,
  spec: resolveSpec(p.applianceTypeKey, p.category),
  x: p.x, z: p.z, rotY: p.rotY, wall: p.wall, t: p.t, cu: p.cu ?? 0,
  on: p.onPlacementId ? String(p.onPlacementId) : undefined,
  ...(preview.value?.roomId === String(r._id) ? preview.value.poses[String(p._id)] : null),
}))

const roomItems = computed(() => {
  const r = selectedRoom.value
  if (!r) return []
  return r.placements
    .filter((p) => !isOpening(p))
    .map((p) => {
      const product = productOf(p.category, p.applianceTypeKey, p.brand, p.model)
      return { id: String(p._id), name: nameOf(p), short: shortNameOf(typeOf(p.category, p.applianceTypeKey)) || nameOf(p), brand: product?.brand ?? null, model: product?.model ?? null, ticks: product?.ticks ?? null, kwh: kwhOf(p), build: isBuild(p.category) }
    })
})

const missingItems = computed(() => plan.value.rooms.reduce((n, r) => n + r.placements.filter((p) => !typeOf(p.category, p.applianceTypeKey)).length, 0))

function openLinkOf(r) {
  const open = r.openWalls || []
  if (!open.length) return null
  const near = []
  for (const name of new Set(open.map((o) => o.to))) {
    const n = plan.value.rooms.find((x) => x.name === name)
    if (n) near.push({ name: n.name, w: n.dimension.w, d: n.dimension.d, dx: n.origin.x - r.origin.x, dz: n.origin.z - r.origin.z, items: placedOf(n) })
  }
  return { open, near }
}

const analyses = computed(() => plan.value.rooms.map((r) => ({
  roomId: String(r._id),
  ...analyse(r.dimension, placedOf(r), r.name, openLinkOf(r)),
})))
const rowOf = (id) => { for (const a of analyses.value) { const row = a.rows.find((x) => x.id === id); if (row) return row } return null }
const sumOf = (key) => analyses.value.reduce((total, a) => total + a[key], 0)

const ratedKwhYear = computed(() => Math.round(sumOf('base')))
const totalKwhYear = computed(() => Math.round(sumOf('kwh')))
const placementImpact = computed(() => (sumOf('base') ? (sumOf('avoidKwh') / sumOf('base')) * 100 : 0))

const recs = computed(() => analyses.value.find((a) => a.roomId === selectedRoomId.value)?.recs ?? [])
const tips = computed(() => analyses.value.find((a) => a.roomId === selectedRoomId.value)?.tips ?? [])

const overlays = reactive({ sun: false, heat: true, air: true })
const OVERLAY_LAYERS = [
  { key: 'sun', label: 'Sunlight', color: '#f2a900', hint: 'Show where sunlight falls in each room' },
  { key: 'heat', label: 'Heat', color: '#e8420f', hint: 'Show hot spots made by appliances and sunlight' },
  { key: 'air', label: 'Airflow (aircon & fans)', color: '#14a3b8', hint: 'Show where air from aircon and fans flows' },
]

function toggleHammer() {
  if (layoutLocked.value) return
  hammer.value = !hammer.value
}

const ROOM_COLORS = { living: '#f59e0b', kitchen: '#0ea5e9', bedroom: '#8b5cf6', bathroom: '#10b981' }
const roomBreakdown = computed(() => {
  const rows = plan.value.rooms.map((r, i) => {
    const raw = analyses.value[i]?.kwh ?? 0
    return {
      id: String(r._id), name: r.name, color: ROOM_COLORS[r.type] ?? '#94a3b8', raw,
      kwh: Math.round(raw), items: r.placements.filter((p) => !isOpening(p)).length,
    }
  })
  const total = rows.reduce((n, r) => n + r.raw, 0)
  const shares = rows.map((r) => (total > 0 ? (r.raw / total) * 100 : 0))
  const whole = shares.map(Math.floor)
  let left = total > 0 ? 100 - whole.reduce((n, v) => n + v, 0) : 0
  shares.map((v, i) => [v - whole[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { whole[i]++; left-- } })
  return rows
    .map((r, i) => ({ ...r, pct: shares[i], pctLabel: r.raw > 0 && whole[i] === 0 ? '<1%' : `${whole[i]}%` }))
    .sort((a, b) => b.raw - a.raw)
})

const targetRoomName = computed(() => selectedRoom.value?.name ?? (plan.value.rooms.find((r) => r.type === 'living') ?? plan.value.rooms[0])?.name ?? 'your home')

const MAX_HISTORY = 50
const undoStack = ref([])
const redoStack = ref([])
const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)
const snapshot = () => JSON.stringify(plan.value.rooms)
function remember(before) {
  undoStack.value.push(before)
  if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
  redoStack.value = []
  saveHistory()
}

const history = createLayoutHistory()
const saveHistory = () => history.save(scopeId.value, plan.value.rooms, undoStack.value, redoStack.value)
const flushHistory = () => history.flush()

function loadHistory() {
  const { undo, redo } = history.load(scopeId.value, plan.value.rooms)
  undoStack.value = undo
  redoStack.value = redo
}

let chain = Promise.resolve()
const enqueue = (fn) => { const p = chain.then(fn); chain = p.catch(() => {}); return p }

const applyGeometry = (res) => {
  plan.value = { ...plan.value, rooms: res.rooms, footprint: res.footprint }
  warnings.value = res.warnings ?? []
}

function commit(fn) {
  return enqueue(async () => {
    const before = snapshot()
    try {
      const res = await fn()
      applyGeometry(res)
      remember(before)
      return res
    } catch (e) { problem(reasonOf(e), 'Could not save that change'); return null }
  })
}
const run = async (fn) => !!(await commit(fn))

function travel(from, to) {
  return enqueue(async () => {
    const target = from.value[from.value.length - 1]
    if (!target) return
    const current = snapshot()
    try {
      applyGeometry(await restoreLayout(hid(), JSON.parse(target), planScope()))
      from.value.pop()
      to.value.push(current)
      saveHistory()
    } catch (e) { problem(reasonOf(e), 'Could not undo or redo') }
  })
}
const undo = () => travel(undoStack, redoStack)
const redo = () => travel(redoStack, undoStack)

const isConnected = (a, b) =>
  a.placements.some((p) => isOpening(p) && p.connectsTo === b.name) || (a.openWalls || []).some((o) => o.to === b.name)
const DOOR_FIT = 1.1
const unconnectedNeighbours = (room) => plan.value.rooms.filter((o) => {
  if (o === room || isConnected(room, o)) return false
  const s = sharedWall(room, o)
  return s && s.length >= DOOR_FIT
})

const LOCK_KEY = 'ecohome.3d.locked'
const hammer = ref(false)
const layoutLocked = ref(false)
try { layoutLocked.value = localStorage.getItem(LOCK_KEY) === '1' } catch { /* storage can be blocked */ }
watch(layoutLocked, (on) => {
  try { on ? localStorage.setItem(LOCK_KEY, '1') : localStorage.removeItem(LOCK_KEY) } catch { /* ignore */ }
  if (on) hammer.value = false
})

const onEditRect = async ({ roomId, rect }) => {
  if (layoutLocked.value) return
  const before = new Set((roomOf(roomId) ? unconnectedNeighbours(roomOf(roomId)) : []).map((o) => o.name))
  const saved = await run(() => setRoomRect(hid(), roomId, rect, planScope()))
  if (saved) {
    const moved = roomOf(roomId)
    const fresh = moved ? unconnectedNeighbours(moved).filter((o) => !before.has(o.name)) : []
    if (fresh.length) {
      flash(`The ${moved.name} now touches the ${fresh.map((o) => o.name).join(' and the ')}. To connect them, drag a door onto the wall they share, or add a door from the catalogue.`, 9000)
    }
  }
  if (!saved) plan.value = { ...plan.value, rooms: [...plan.value.rooms] }
}

const selectedOpening = computed(() => {
  for (const r of plan.value.rooms) {
    const p = r.placements.find((x) => String(x._id) === selectedItemId.value)
    if (p && isOpening(p)) return { roomId: String(r._id), id: String(p._id), name: nameOf(p) }
  }
  return null
})
const removeSelectedOpening = () => {
  const o = selectedOpening.value
  if (o) run(() => removeOpening(hid(), o.roomId, o.id, planScope()))
}

const HANGING = new Set(['ac', 'tv', 'heater']) 
function hangingOnSharedWall(a, b) {
  const found = []
  for (const [room, other] of [[a, b], [b, a]]) {
    const s = sharedWall(room, other)
    const range = s && sharedRange(room, other, s.wall)
    if (!range) continue
    for (const p of room.placements) {
      if (p.wall !== s.wall || isOpening(p) || p.onPlacementId) continue
      const spec = resolveSpec(p.applianceTypeKey, p.category)
      if (spec.mode === 'wall' && HANGING.has(spec.kind) && p.t + spec.w / 2 > range.t0 && p.t - spec.w / 2 < range.t1) found.push(nameOf(p))
    }
  }
  return found
}

async function onHammerWall({ roomId, otherId, open }) {
  const r = plan.value.rooms.find((x) => String(x._id) === roomId)
  const other = plan.value.rooms.find((x) => String(x._id) === otherId)
  if (!r || !other) return
  if (open) {
    const hanging = hangingOnSharedWall(r, other)
    if (hanging.length) return flash(`Move the ${[...new Set(hanging)].join(' and the ')} off that wall first. It would be left hanging in the gap.`, 6000)
  }
  const saved = await run(() => setWallOpen(hid(), roomId, otherId, open, planScope()))
  if (saved) flash(open ? `The wall between the ${r.name} and the ${other.name} is gone.` : `The wall between the ${r.name} and the ${other.name} is back, with a door in it.`, 3500, 'ok')
}

async function onMoveOpening({ roomId, id, wall, t }) {
  const saved = await run(() => moveOpening(hid(), roomId, id, wall, t, planScope()))
  preview.value = null
  if (!saved) plan.value = { ...plan.value, rooms: [...plan.value.rooms] }
}

const roomOf = (roomId) => plan.value.rooms.find((x) => String(x._id) === roomId)

function openingSpots(r, appliance) {
  const spec = resolveSpec(appliance.applianceTypeKey, appliance.category)
  const dim = r.dimension, others = placedOf(r)
  const lenOf = (w) => (w % 2 ? dim.d : dim.w)
  const margin = Math.max(0.6, spec.w / 2 + 0.15)
  const walls = [0, 1, 2, 3].map((w) => ({ w, centre: lenOf(w) / 2, preferred: false }))
  if (spec.kind === 'door' && !needsOutsideWall(spec)) {
    for (const o of plan.value.rooms) {
      if (o === r || isConnected(r, o)) continue
      const s = sharedWall(r, o)
      if (s && s.length >= DOOR_FIT && !walls[s.wall].preferred) Object.assign(walls[s.wall], { preferred: true, centre: s.t })
    }
  }
  walls.sort((a, b) => (b.preferred - a.preferred) || (lenOf(b.w) - lenOf(a.w)))
  const spots = []
  const skipped = new Set()
  const beyond = new Map()
  for (const { w, centre, preferred } of walls) {
    let found = 0
    const refused = new Set()
    const ts = []
    for (let t = margin; t <= lenOf(w) - margin + 1e-9; t += 0.1) ts.push(Math.round(t * 10) / 10)
    ts.sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre))
    for (const t of ts) {
      const pos = onWall(dim, spec, w, t)
      if (!pos || isBlocked({ spec, ...pos }, others)) continue
      if (needsOutsideWall(spec) && roomBehindOpening(plan.value.rooms, r, spec, pos)) continue
      const behind = doorBlockedBeyond(plan.value.rooms, r, spec, pos, { cache: beyond })
      if (behind) { if (!behind.straddle) refused.add(behind.name); continue }
      spots.push([w, pos.t]); found++
    }
    if (preferred && !found) refused.forEach((n) => skipped.add(n))
  }
  const out = spots.slice(0, 300)
  out.skipped = [...skipped]
  return out
}

const handleAddAppliance = async (appliance) => {
  if (!selectedRoom.value) {
    const first = plan.value.rooms.find((r) => r.type === 'living') ?? plan.value.rooms[0]
    if (!first) return
    selectedRoomId.value = String(first._id)
  }
  const r = selectedRoom.value

  if (isBuild(appliance.category) && OPENING_KEYS.has(appliance.applianceTypeKey)) {
    const roomId = String(r._id)
    const spots = openingSpots(r, appliance)
    if (!spots.length) return flash(`There is no clear space on the ${r.name} walls for that. Move an appliance away from the wall, or make the room bigger.`)
    const added = await run(() => addOpening(hid(), roomId, appliance.applianceTypeKey, spots, planScope()))
    if (added && spots.skipped?.length)
      flash(`A countertop or appliance in the ${spots.skipped.join(' / ')} is in the way of a door there, so this door went on another wall. Move it first if you want the rooms joined.`, 9000)
    return added
  }
  const spec = resolveSpec(appliance.applianceTypeKey, appliance.category)
  const others = placedOf(r)
  const spot = findSpot({ ...r.dimension }, spec, others)
  if (!spot) {
    if (spec.mode === 'top') {
      const hasCounter = others.some((o) => o.spec.kind === 'counter')
      return flash(hasCounter
        ? 'No free space on the countertop (the sink can\'t be used). Clear some space or add another countertop.'
        : 'Add a countertop first, then place this on it.')
    }
    return flash(`No free space in the ${r.name}. Move something, or make the room bigger.`)
  }
  const roomId = String(r._id)
  await enqueue(async () => {
    const before = snapshot()
    try {
      const saved = await addPlacement(roomId, newPlacementDoc(appliance, spot), planScope())
      roomOf(roomId)?.placements.push(saved)
      remember(before)
      selectedItemId.value = String(saved._id)
    } catch (e) {
      problem(reasonOf(e), 'Could not add it')
    }
  })
}

function onMoveItems({ roomId, updates }) {
  return enqueue(async () => {
    const before = snapshot()
    const r = roomOf(roomId)
    if (!r) return
    try {
      const moves = []
      for (const u of updates) {
        const { id, ...pos } = u
        const p = r.placements.find((x) => String(x._id) === id)
        if (!p) continue
        Object.assign(p, pos)
        moves.push(u)
      }
      if (!moves.length) return
      await moveManyPlacements(roomId, moves, planScope())
      remember(before)
    } catch (e) {
      problem(reasonOf(e), 'Could not save the move')
      try { await reloadScope({ keepHistory: true }) } catch { }
    } finally {
      preview.value = null
    }
  })
}
const applyRec = (rec) => {
  const r = selectedRoom.value
  if (!r) return
  const { x, z, rotY, wall, t, cu } = rec.to
  onMoveItems({ roomId: String(r._id), updates: [{ id: rec.id, x, z, rotY, wall, t, cu: cu ?? 0 }] })
  selectedItemId.value = rec.id
}

function removeItem(id) {
  const r = selectedRoom.value
  if (!r) return
  const roomId = String(r._id)
  return enqueue(async () => {
    const before = snapshot()
    try {
      await removePlacement(roomId, id, planScope())
      const room = roomOf(roomId)
      if (room) room.placements = room.placements.filter((p) => String(p._id) !== id && String(p.onPlacementId ?? '') !== id)
      remember(before)
    } catch (e) { problem(reasonOf(e), 'Could not remove it') }
  })
}

async function clearRoomItems() {
  const r = selectedRoom.value
  if (!r) return
  const roomId = String(r._id), listed = new Set(roomItems.value.map((i) => i.id))
  const yes = await dialog.value.confirm({
    title: `Clear the ${r.name}?`,
    message: 'This removes every appliance and piece of furniture in this room. Countertops, doors and windows stay. You can undo it afterwards.',
    okText: 'Clear room',
    danger: true,
  })
  if (!yes) return
  return enqueue(async () => {
    const before = snapshot()
    try {
      const kept = roomOf(roomId).placements.filter((p) => !listed.has(String(p._id)) || isCountertop(p))
      const keptIds = new Set(kept.map((p) => String(p._id)))
      const final = kept.filter((p) => !p.onPlacementId || keptIds.has(String(p.onPlacementId)))
      const res = await saveRoomPlacements(roomId, final, planScope())
      roomOf(roomId).placements = res.placements
      remember(before)
    } catch (e) { problem(reasonOf(e), 'Could not clear the room') }
  })
}

const typing = (e) => { const t = e.target; return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) }
function onKey(e) {
  if (typing(e) || e.altKey) return
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase()
  if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
  else if (mod && k === 'y') { e.preventDefault(); redo() }
  else if (!mod && (e.key === 'Delete' || e.key === 'Backspace') && selectedItemId.value && roomItems.value.some((i) => i.id === selectedItemId.value)) {
    e.preventDefault()
    removeItem(selectedItemId.value)
  } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace') && selectedOpening.value) {
    e.preventDefault()
    removeSelectedOpening()
  }
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('pagehide', flushHistory)
  measureNav()
  const nav = document.querySelector('.eco-navbar')
  if (nav && 'ResizeObserver' in window) { navObserver = new ResizeObserver(measureNav); navObserver.observe(nav) }
  document.documentElement.classList.add('no-page-scroll')
})
onBeforeUnmount(() => {
  clearTimeout(sceneTimer)
  flushHistory()
  window.removeEventListener('pagehide', flushHistory)
  window.removeEventListener('keydown', onKey)
  navObserver?.disconnect()
  document.documentElement.classList.remove('no-page-scroll')
})
</script>

<style>
html.no-page-scroll,
html.no-page-scroll body {
  overflow: hidden;
  overscroll-behavior: none;
}
</style>

<style scoped>
.spatial-page {
  --eco: #168b59;
  --eco-dark: #116a42;
  --eco-light: #2fbf71;
  --ink: #19352a;
  --muted: #5d6f65;
  --line: #dcebe1;
  --tint: #eaf7ee;
  --radius: 18px;
  --shadow: 0 1px 2px rgba(16, 40, 28, 0.04), 0 12px 26px -18px rgba(16, 40, 28, 0.4);
  --shadow-lift: 0 1px 2px rgba(16, 40, 28, 0.06), 0 18px 34px -16px rgba(16, 40, 28, 0.5);

  height: calc(100dvh - var(--nav-h, 72px));
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 22px 16px;
  position: relative;
  isolation: isolate;
  background: #a4e5ec;
  color: var(--ink);
  overflow: hidden;
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-feature-settings: 'tnum' 1;
}

.min-w-0 { min-width: 0; }
.spatial-page > :not(.spatial-sky) { position: relative; z-index: 1; }

.spatial-sky {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background: linear-gradient(180deg, #71cfee 0%, #b4e9e9 40%, #d9f4d9 100%);
}
.spatial-sky::after { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at 8% 30%, #ffffff35, transparent 44%); }
.spatial-sun {
  position: absolute;
  width: 96px;
  height: 96px;
  right: 9%;
  top: 14px;
  border-radius: 50%;
  background: #fff5bf;
  box-shadow: 0 0 0 16px #fff3b12b, 0 0 80px 30px #ffe8a480;
  animation: spatial-sun 7s ease-in-out infinite;
}
.spatial-cloud {
  position: absolute;
  width: 170px;
  height: 46px;
  left: -220px;
  border-radius: 90px;
  background: #ffffffc4;
  box-shadow: 0 6px 22px #27688014;
  animation: spatial-cloud linear infinite;
}
.spatial-cloud::before, .spatial-cloud::after { content: ''; position: absolute; border-radius: 50%; background: inherit; }
.spatial-cloud::before { width: 82px; height: 70px; left: 32px; bottom: 9px; }
.spatial-cloud::after { width: 90px; height: 58px; left: 82px; bottom: 3px; }
.cloud-a { top: 40px; animation-duration: 70s; animation-delay: -20s; }
.cloud-b { top: 40%; transform: scale(0.7); opacity: 0.7; animation-duration: 95s; animation-delay: -60s; }
.spatial-hills {
  position: absolute;
  inset: auto 0 0;
  height: 40%;
  opacity: 0.5;
  background:
    radial-gradient(ellipse 58% 89% at 5% 138%, #5eb78c 0 82%, transparent 83%),
    radial-gradient(ellipse 58% 85% at 74% 145%, #5eb78c 0 82%, transparent 83%),
    radial-gradient(ellipse 58% 86% at 42% 120%, #94cfa8 0 82%, transparent 83%);
}
@keyframes spatial-cloud { from { translate: 0 0; } to { translate: calc(100vw + 450px) 0; } }
@keyframes spatial-sun { 50% { box-shadow: 0 0 0 20px #fff3b132, 0 0 100px 40px #ffe8a48c; } }


.spatial-page > .spatial-toolbar { z-index: 20; }
.spatial-page > .l3d { position: absolute; z-index: 30; }
.spatial-toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px 14px;
  flex-wrap: wrap;
}
.spatial-toolbar > :first-child { flex: 1 1 160px; min-width: 0; }
.spatial-toolbar > :last-child { flex: 0 1 auto; }
@media (min-width: 1100px) { .spatial-toolbar { flex-wrap: nowrap; } }
.title-badge {
  width: 38px;
  height: 38px;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 13px;
  color: #fff;
  background: linear-gradient(135deg, var(--eco-dark), var(--eco-light));
  box-shadow: 0 10px 18px -10px rgba(22, 139, 89, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}
.page-title { font-size: 1.2rem; font-weight: 780; letter-spacing: -0.4px; margin: 0; color: var(--ink); }
.scope-picker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 3px 6px 3px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: var(--shadow);
  max-width: 100%;
  min-width: 0;
}
.scope-picker.is-plan { border-color: var(--eco); background: var(--tint); }
.scope-label { font-size: 0.8rem; font-weight: 650; color: var(--muted); }
.scope-select {
  min-width: 0;
  max-width: 190px;
  padding: 3px 4px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ink);
  font-size: 0.82rem;
  font-weight: 650;
  cursor: pointer;
  text-overflow: ellipsis;
}
.scope-select:focus-visible { outline: 2px solid var(--eco); outline-offset: 2px; }

.layer-group {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: var(--shadow);
}
.layer-pill {
  --c: var(--eco);
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 12px 5px 10px;
  border-radius: 999px;
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 650;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: background-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}
.layer-icon { display: inline-grid; place-items: center; color: var(--c); opacity: 0.55; transition: opacity 0.18s ease; }
.layer-pill:hover { background: var(--tint); color: var(--ink); }
.btn-check:checked + .layer-pill {
  background: var(--tint);
  background: color-mix(in srgb, var(--c) 11%, #fff);
  color: var(--ink);
  box-shadow: inset 0 0 0 1.5px var(--c);
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--c) 55%, #fff);
}
.btn-check:checked + .layer-pill .layer-icon { opacity: 1; }
.btn-check:focus-visible + .layer-pill { outline: 3px solid rgba(25, 135, 84, 0.45); outline-offset: 1px; }

.lock-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 7px 5px 13px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--ink);
  font-size: 0.82rem;
  font-weight: 650;
  box-shadow: var(--shadow);
  transition: background-color 0.15s ease, border-color 0.15s ease;
}
.lock-switch svg { color: var(--muted); }
.lock-switch:hover { background: var(--tint); }
.lock-switch.is-on { border-color: #bfe3cd; background: var(--tint); }
.lock-switch.is-on svg { color: var(--eco-dark); }
.lock-switch:focus-visible { outline: 3px solid rgba(25, 135, 84, 0.45); outline-offset: 2px; }
.switch { position: relative; width: 36px; height: 21px; border-radius: 999px; background: #cfd9d3; transition: background-color 0.18s ease; }
.switch i { position: absolute; top: 2px; left: 2px; width: 17px; height: 17px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(16, 40, 28, 0.3); transition: transform 0.18s ease; }
.lock-switch.is-on .switch { background: var(--eco); }
.lock-switch.is-on .switch i { transform: translateX(15px); }

.history-group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: var(--shadow);
}
.hist-btn {
  width: 34px;
  height: 32px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ink);
  transition: background-color 0.15s ease, color 0.15s ease;
}
.hist-btn:hover:not(:disabled) { background: var(--tint); color: var(--eco-dark); }
.hist-btn:disabled { color: #b4c1b9; cursor: not-allowed; }
.hist-btn:focus-visible, .tools-btn:focus-visible { outline: 3px solid rgba(25, 135, 84, 0.45); outline-offset: 1px; }
.hist-divider { width: 1px; height: 20px; margin: 0 4px; background: var(--line); }

.tools-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 11px 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ink);
  font-size: 0.82rem;
  font-weight: 650;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.tools-btn:hover:not(:disabled) { background: var(--tint); color: var(--eco-dark); }
.tools-btn.is-active { background: #fdf1f0; color: #a3242b; }
.tools-btn:disabled { color: #b4c1b9; cursor: not-allowed; }
.tools-btn:disabled:hover { background: transparent; color: #b4c1b9; }
.tools-dot { width: 8px; height: 8px; border-radius: 50%; background: #d6403a; box-shadow: 0 0 0 3px #fde8e6; }

.btn-eco-outline {
  color: var(--eco-dark);
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--line);
  font-weight: 650;
  box-shadow: var(--shadow);
}
.btn-eco-outline:hover:not(:disabled) { background: var(--tint); color: var(--eco-dark); border-color: #bfe3cd; }
.btn-eco-outline:disabled { color: #a3b3aa; box-shadow: none; }
.btn-eco {
  background: linear-gradient(135deg, var(--eco), var(--eco-light));
  border-color: var(--eco);
  color: #fff;
  font-weight: 650;
  padding-top: 0.1rem;
  padding-bottom: 0.1rem;
  box-shadow: 0 8px 14px -10px rgba(22, 139, 89, 0.9);
}
.btn-eco:hover { background: var(--eco-dark); border-color: var(--eco-dark); color: #fff; }

.btn-eco { border-radius: 999px; padding-left: 0.8rem; padding-right: 0.8rem; }
.btn-pill { border-radius: 999px; }
.btn-pill-danger {
  border: 1px solid #f1d4d6;
  border-radius: 999px;
  background: #fff6f6;
  color: #b4232a;
  font-weight: 650;
  padding-top: 0.1rem;
  padding-bottom: 0.1rem;
}
.btn-pill-danger:hover { background: #c8323a; border-color: #c8323a; color: #fff; }
.btn-pill-danger:focus-visible { outline: 3px solid rgba(200, 50, 58, 0.35); outline-offset: 1px; }

.spatial-body { flex: 1 1 0; min-height: 0; display: flex; gap: 14px; }

.canvas-card {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 10px 28px -18px rgba(16, 40, 28, 0.35);
  overflow: hidden;
}
.canvas-card :deep(.floorplan) { position: absolute; inset: 0; }

.canvas-messages {
  position: absolute;
  left: 14px;
  bottom: 14px;
  z-index: 7;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  max-width: min(440px, calc(100% - 28px));
  max-height: calc(100% - 28px);
  pointer-events: none;
}
.canvas-messages > * { pointer-events: auto; max-width: 100%; }
.msg {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  padding: 8px 14px;
  border: 1px solid;
  border-radius: 14px;
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.4;
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  box-shadow: 0 8px 22px -14px rgba(16, 40, 28, 0.45);
  animation: rise 0.22s ease-out;
}
.msg > svg { flex: 0 0 auto; }
.msg-info, .msg-ok { border-color: #bfe3cd; background: rgba(234, 247, 238, 0.94); color: #116a42; }
.msg-warn { border-color: #f3dd9a; background: rgba(255, 248, 225, 0.94); color: #7a5a00; }
.msg-toast { flex-wrap: nowrap; }
.msg-box { display: block; padding: 0; width: 100%; }
.warn-toggle {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
}
.msg-list { margin: 0; padding: 0 14px 8px 30px; max-height: 28vh; overflow-y: auto; font-weight: 500; }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

.side-column {
  flex: 0 0 328px;
  width: 328px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stat-card {
  position: relative;
  flex: 0 0 auto;
  padding: 14px 18px 22px;
  border-radius: 22px;
  color: #fff;
  background: linear-gradient(135deg, #0f4d35 0%, #168b59 62%, #2fbf71 120%);
  box-shadow: 0 16px 28px -16px rgba(20, 90, 62, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.22);
  overflow: hidden;
}
.stat-card::before { content: ''; position: absolute; width: 150px; height: 150px; right: -40px; top: -70px; border-radius: 50%; pointer-events: none; background: radial-gradient(circle, rgba(255, 255, 255, 0.22), transparent 70%); }
.stat-card > * { position: relative; }
.stat-wave { position: absolute; left: 0; bottom: 0; width: 100%; height: 38px; pointer-events: none; }
.stat-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.stat-leaf { flex: 0 0 auto; width: 28px; height: 28px; display: grid; place-items: center; border-radius: 50%; background: rgba(255, 255, 255, 0.18); color: #d9f5e4; }
.stat-label { flex: 0 0 auto; font-size: 0.92rem; font-weight: 700; letter-spacing: -0.1px; white-space: nowrap; }
.stat-scope { flex: 0 1 auto; min-width: 0; margin-left: auto; padding: 2px 10px; border-radius: 999px; background: rgba(255, 255, 255, 0.16); color: #e3f6ea; font-size: 0.72rem; font-weight: 650; }
.stat-value { font-size: 2.3rem; font-weight: 780; letter-spacing: -1.2px; line-height: 1.1; }
.stat-unit { font-size: 0.9rem; color: #cfeadb; font-weight: 500; }
.stat-note { margin-top: 6px; font-size: 0.75rem; color: #ffd9a8; }

.panel-card {
  flex: 0 0 auto;
  padding: 13px 15px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: var(--shadow);
}
.panel-title { font-size: 0.92rem; font-weight: 720; color: var(--ink); letter-spacing: -0.1px; }
.count-pill {
  margin-left: 6px;
  padding: 1px 9px;
  border-radius: 999px;
  background: var(--tint);
  color: var(--eco-dark);
  font-size: 0.72rem;
  font-weight: 720;
}

.recs-card { max-height: 28%; display: flex; flex-direction: column; min-height: 0; border-left: 4px solid var(--eco-light); }
.recs-scroll { overflow-y: auto; min-height: 0; }
.rec-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 0;
  border-top: 1px solid #edf4ef;
}
.rec-row:first-child { border-top: 0; padding-top: 0; }
.rec-tip { cursor: pointer; color: #5d6f65; }

.items-card { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
.item-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; margin: 0 -6px; padding: 0 6px; }
.item-row {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 11px;
  margin-bottom: 5px;
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}
.item-row:hover { background: #f4faf6; transform: translateX(1px); }
.item-row.active { background: var(--tint); border-color: #bfe3cd; }
.item-row.active::before { content: ''; position: absolute; left: -1px; top: 9px; bottom: 9px; width: 3px; border-radius: 3px; background: var(--eco); }
.item-name { font-size: 0.86rem; font-weight: 680; line-height: 1.25; overflow-wrap: anywhere; }
.item-meta { font-size: 0.73rem; color: var(--muted); line-height: 1.35; }
.item-model { overflow-wrap: anywhere; } /* long model codes wrap instead of being cut off */
.tick-badge {
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 4px;
  background: #e3f6ea;
  color: #12a150;
  font-size: 0.68rem;
  font-weight: 700;
}
.item-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
.tag { padding: 1px 9px; border-radius: 999px; font-size: 0.68rem; font-weight: 650; line-height: 1.5; }
.tag-warn { background: #fff1d6; color: #8a5a00; }
.tag-good { background: #dff3e6; color: #0f6a3f; }
.btn-remove {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #a3242b;
  font-size: 0.75rem;
  opacity: 0.55;
  transition: opacity 0.15s ease, background-color 0.15s ease;
}
.item-row:hover .btn-remove, .btn-remove:focus-visible { opacity: 1; }
.btn-remove:hover { background: #fdecee; }

.empty-state {
  margin: auto 0;
  padding: 20px 10px;
  text-align: center;
  font-size: 0.82rem;
  color: var(--muted);
}
.empty-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 10px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--tint), #d6f0e0);
  color: var(--eco);
  font-size: 1.7rem;
}

.panel-sub { margin-top: 2px; font-size: 0.76rem; line-height: 1.4; color: var(--muted); }
.back-btn {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: #fff;
  color: var(--ink);
  transition: background-color 0.15s ease, color 0.15s ease;
}
.back-btn:hover { background: var(--tint); color: var(--eco-dark); }
.back-btn:focus-visible { outline: 3px solid rgba(25, 135, 84, 0.45); outline-offset: 2px; }

/* Room breakdown */
.breakdown-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; margin: 0 -6px; padding: 0 6px; }
.breakdown-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 10px;
  margin-bottom: 3px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: var(--ink);
  text-align: left;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}
.breakdown-row:hover { background: #f4faf6; border-color: var(--line); }
.breakdown-row:focus-visible { outline: 3px solid rgba(25, 135, 84, 0.45); outline-offset: -1px; }
.room-dot { flex: 0 0 auto; width: 12px; height: 12px; border-radius: 50%; }
.breakdown-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.breakdown-name { font-size: 0.9rem; font-weight: 680; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.breakdown-meta { font-size: 0.72rem; color: var(--muted); line-height: 1.3; }
.breakdown-bar { display: block; height: 4px; margin-top: 2px; border-radius: 4px; background: #edf3ef; overflow: hidden; }
.breakdown-bar i { display: block; height: 100%; border-radius: 4px; }
.breakdown-pct { flex: 0 0 auto; min-width: 2.6em; text-align: right; font-size: 0.9rem; font-weight: 720; }
.breakdown-chev { flex: 0 0 auto; color: #98a89f; transition: transform 0.15s ease, color 0.15s ease; }
.breakdown-row:hover .breakdown-chev { color: var(--eco-dark); transform: translateX(2px); }

/* Scrollbars */
.item-list::-webkit-scrollbar, .recs-scroll::-webkit-scrollbar, .breakdown-list::-webkit-scrollbar { width: 6px; }
.item-list::-webkit-scrollbar-thumb, .recs-scroll::-webkit-scrollbar-thumb, .breakdown-list::-webkit-scrollbar-thumb { background: #c5dccd; border-radius: 6px; }
.item-list::-webkit-scrollbar-track, .recs-scroll::-webkit-scrollbar-track { background: transparent; }

/* Catalogue dock */
.catalogue-dock {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: 22px;
  background: #fff;
  box-shadow: var(--shadow);
  overflow: hidden;
}
.dock-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 18px;
  border: 0;
  background: #fff;
  color: var(--ink);
  font-size: 0.9rem;
  text-align: left;
  transition: background-color 0.15s ease;
}
.dock-toggle:hover { background: #f7fcf9; }
.dock-toggle:focus-visible { outline: 3px solid rgba(25, 135, 84, 0.45); outline-offset: -3px; }
.dock-icon { display: inline-grid; place-items: center; color: var(--eco); }
.dock-title { font-weight: 720; letter-spacing: -0.1px; }
.dock-hint { color: var(--muted); font-size: 0.8rem; }
.dock-caret { display: inline-flex; align-items: center; gap: 4px; color: var(--eco-dark); font-size: 0.82rem; font-weight: 700; }
.dock-body { height: 214px; border-top: 1px solid var(--line); }

/* Narrower screens: sidebar shrinks, then drops under the canvas */
@media (max-width: 1199px) {
  .side-column { flex-basis: 288px; width: 288px; }
}
@media (max-width: 767px) {
  .spatial-page { padding: 8px 10px 10px; gap: 8px; }
  .spatial-body { flex-direction: column; gap: 10px; }
  .side-column { flex: 0 0 38%; width: auto; }
  .stat-value { font-size: 1.6rem; }
  .layer-pill { padding: 4px 9px; font-size: 0.75rem; }
  .canvas-messages { bottom: 72px; }
  .dock-body { height: 196px; }
  .canvas-card { border-radius: 18px; }
}
.toast-enter-active, .toast-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }

@media (prefers-reduced-motion: reduce) {
  .msg, .item-row, .layer-pill, .layer-icon, .switch, .switch i { animation: none; transition: none; }
}

.skeleton-list { display: flex; flex-direction: column; gap: 8px; }
.skeleton-list span {
  height: 54px;
  border-radius: 14px;
  background: linear-gradient(90deg, #eef4f0 25%, #f8fbf9 40%, #eef4f0 60%);
  background-size: 300% 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
}
@keyframes skeleton-shimmer { from { background-position: 100% 0; } to { background-position: 0 0; } }
@media (prefers-reduced-motion: reduce) { .skeleton-list span { animation: none; } }

.l3d {
  position: absolute;
  inset: 0;
  z-index: 30;
  transition: opacity 0.5s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px;
  background: #fff;
  color: #19352a;
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
}
.l3d-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.l3d-stage { display: flex; justify-content: center; width: 100%; min-height: 0; }
.l3d-text { display: flex; flex-direction: column; align-items: center; gap: 14px; width: min(320px, 100%); }
.l3d.is-leaving { opacity: 0; pointer-events: none; }
.l3d.is-error .l3d-scene * { animation: none; }
.l3d.is-error .l3d-scene { filter: grayscale(0.7) brightness(0.95); }
.l3d-scene {
  display: block;
  width: min(600px, 88%, calc(42vh * 1.556));
  height: auto;
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 14px 34px -10px rgba(16, 47, 36, 0.28), 0 0 0 1px #e3ece6;
}
.l3d-scene * { transform-box: fill-box; transform-origin: center; }

.l3d-brand { font-size: clamp(22px, 2.6vw, 30px); font-weight: 700; white-space: nowrap; }
.l3d-icon { color: #168b59; font-size: 1.43em; vertical-align: -3px; }
.l3d-green { color: #168b59; }
.l3d-bar { width: 160px; height: 4px; border-radius: 4px; background: #dcebe1; overflow: hidden; }
.l3d-bar::after {
  content: '';
  display: block;
  width: 40%;
  height: 100%;
  border-radius: 4px;
  background: #168b59;
  animation: l3d-slide 1.2s ease-in-out infinite;
}


.l3d-captions { position: relative; width: 100%; height: 28px; line-height: 28px; color: #2f5446; font-size: 14px; font-weight: 600; }
.l3d-captions span { position: absolute; inset: 0; text-align: center; opacity: 0; animation: l3d-caption 0.7s ease both; }
.l3d-captions span:nth-child(2) { animation-delay: 0.7s; }
.l3d-captions span:nth-child(3) { animation-delay: 1.4s; }
.l3d-captions span:nth-child(4) { animation-delay: 2.1s; }
.l3d-captions .l3d-final { opacity: 1; animation: l3d-caption-in 0.4s ease 2.8s both; }


.l3d-guides { animation: l3d-fade-out 0.6s ease 1.1s forwards; }
.l3d-slab { animation: l3d-grow-x 0.6s ease-out 0.1s both; }
.l3d-wall { transform-origin: bottom center; animation: l3d-rise 0.6s cubic-bezier(0.34, 1.2, 0.64, 1) both; }
.l3d-wall-1 { animation-delay: 0.5s; }
.l3d-wall-2 { animation-delay: 0.65s; }
.l3d-wall-3 { animation-delay: 0.8s; }
.l3d-floor { animation: l3d-grow-x 0.5s ease-out 0.9s both; }
.l3d-roof { animation: l3d-drop 0.5s ease-out 1.2s both; }
.l3d-pop { animation: l3d-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
.l3d-pop-1 { animation-delay: 1.3s; }
.l3d-pop-2 { animation-delay: 1.4s; }
.l3d-pop-3 { animation-delay: 1.6s; }
.l3d-pop-4 { animation-delay: 1.8s; }
.l3d-pop-5 { animation-delay: 2s; }
.l3d-pop-6 { animation-delay: 2.2s; }
.l3d-pop-7 { animation-delay: 2.4s; }
.l3d-air { animation: l3d-air 1.6s ease-in-out 2.4s infinite; }
.l3d-panel { animation: l3d-drop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
.l3d-panel-1 { animation-delay: 1.5s; }
.l3d-panel-2 { animation-delay: 1.65s; }
.l3d-panel-3 { animation-delay: 1.8s; }
.l3d-glint { transform: translateX(-30px); animation: l3d-glint 3.5s ease-in-out 2.2s infinite; }
.l3d-tree { transform-origin: bottom center; animation: l3d-pop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both, l3d-sway 4s ease-in-out 1s infinite; }
.l3d-tree-2 { animation-delay: 0.4s, 1.2s; }
.l3d-sun { animation: l3d-rise-sun 1s ease-out 0.1s both; }
.l3d-rays { animation: l3d-spin 14s linear infinite; }
.l3d-cloud { animation: l3d-cloud 9s ease-in-out infinite alternate; }
.l3d-cloud-2 { animation-duration: 12s; animation-direction: alternate-reverse; }

@keyframes l3d-slide { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
@keyframes l3d-caption {
  0% { opacity: 0; transform: translateY(6px); }
  15%, 80% { opacity: 1; transform: none; }
  100% { opacity: 0; transform: translateY(-6px); }
}
@keyframes l3d-caption-in { from { opacity: 0; transform: translateY(6px); } }
@keyframes l3d-fade-out { to { opacity: 0; } }
@keyframes l3d-grow-x { from { transform: scaleX(0); } }
@keyframes l3d-rise { from { transform: scaleY(0); } }
@keyframes l3d-drop { from { opacity: 0; transform: translateY(-22px); } }
@keyframes l3d-pop { from { opacity: 0; transform: scale(0); } }
@keyframes l3d-air { 50% { opacity: 0.25; transform: translateY(3px); } }
@keyframes l3d-sway { 50% { transform: rotate(1.5deg); } }
@keyframes l3d-glint { 0% { transform: translateX(-30px); } 40%, 100% { transform: translateX(110px); } }
@keyframes l3d-rise-sun { from { opacity: 0; transform: translateY(40px); } }
@keyframes l3d-spin { to { transform: rotate(360deg); } }
@keyframes l3d-cloud { to { transform: translateX(24px); } }

@media (prefers-reduced-motion: reduce) {
  .l3d *, .l3d *::after { animation: none !important; transition: none !important; }
  .l3d-bar::after { width: 100%; opacity: 0.5; }
  .l3d-guides { opacity: 0; }
}

/* Error state: same card language as the app popup */
.l3d-error { width: min(380px, 100%); text-align: center; }
.l3d-title { margin: 0 0 6px; font-size: 1.2rem; font-weight: 700; letter-spacing: -0.01em; color: #19352a; }
.l3d-message { margin: 0 0 16px; font-size: 0.9rem; line-height: 1.5; color: #35604d; overflow-wrap: anywhere; }
.l3d-btn {
  display: inline-block;
  padding: 9px 22px;
  border: 0;
  border-radius: 999px;
  background: #168b59;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 650;
  text-decoration: none;
  box-shadow: 0 6px 14px -6px rgba(22, 139, 89, 0.7);
  transition: background-color 0.15s ease, transform 0.15s ease;
}
.l3d-btn:hover { background: #116a42; color: #fff; transform: translateY(-1px); }
.l3d-btn:focus-visible { outline: 3px solid rgba(25, 135, 84, 0.45); outline-offset: 3px; }

/* Short canvases (a phone held sideways): smaller scene */
@media (max-height: 420px) {
  .l3d { gap: 8px; }
  .l3d-scene { width: min(300px, 70%, calc(34vh * 1.556)); }
}
@media (prefers-reduced-motion: reduce) {
  .spatial-cloud, .spatial-sun { animation: none; }
  .cloud-a { left: 15%; }
  .cloud-b { left: 65%; }
}
</style>