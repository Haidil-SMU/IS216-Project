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
              </span><span class="layer-full">{{ layer.label }}</span><span class="layer-short">{{ layer.short || layer.label }}</span>
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
          :rooms="plan.rooms"
          :footprint="plan.footprint"
          :selected-id="selectedRoomId"
          :selected-item-id="selectedItemId"
          @select-room="selectedRoomId = $event"
          @select-item="selectedItemId = $event"
          :overlays="overlays"
          plain
          :layout-key="scopeId"
          :plan-name="scopePlanName"
          @ready="sceneReady = true"
          v-model:hammer="hammer"
          :locked="layoutLocked"
          @locked="flash($event)"
          @hammer-wall="onHammerWall"
          @edit-rect="onEditRect"
          @move-items="onMoveItems"
          @move-opening="onMoveOpening"
          @drag-preview="preview = $event"
          @rotate-blocked="flash('No room to rotate it here.')"
          @move-blocked="flash('Something is in the way of that move.', 2000)"
          @door-blocked="flash($event)"
        />

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

        <section v-if="recs.length || tips.length" class="panel-card recs-card" :class="'recs-' + currentKind">
          <div class="recs-tabs" role="tablist" aria-label="Advice for this room">
            <button type="button" role="tab" class="recs-tab" :class="{ active: activeTab === 'recs' }" :aria-selected="activeTab === 'recs'" @click="activeTab = 'recs'">
              <span>Recommendations</span><span class="recs-tab-count">{{ recs.length }}</span>
            </button>
            <button type="button" role="tab" class="recs-tab" :class="{ active: activeTab === 'tips' }" :aria-selected="activeTab === 'tips'" @click="activeTab = 'tips'">
              <span>Tips</span><span class="recs-tab-count">{{ tips.length }}</span>
            </button>
          </div>

          <div v-if="!currentList.length" class="recs-empty">
            {{ activeTab === 'recs' ? 'No moves to suggest right now.' : 'No tips for this room.' }}
          </div>

          <template v-else>
            <!-- Fixed controls: they stay put while the text below scrolls -->
            <div class="recs-nav">
              <button type="button" class="recs-arrow" :disabled="currentList.length < 2" aria-label="Previous" @click="stepAdvice(-1)">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
              </button>
              <span class="recs-count" aria-live="polite">{{ currentIndex + 1 }}/{{ currentList.length }}</span>
              <button type="button" class="recs-arrow" :disabled="currentList.length < 2" aria-label="Next" @click="stepAdvice(1)">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
              </button>
              <button v-if="activeTab === 'recs'" type="button" class="recs-action recs-action-primary" :disabled="actionBusy" @click="onApplyClick(currentItem)">{{ actionBusy ? 'Applying…' : 'Apply' }}</button>
              <button v-else-if="currentItem.id" type="button" class="recs-action" :disabled="actionBusy || selectedItemId === currentItem.id" @click="onShowItemClick(currentItem.id)">{{ selectedItemId === currentItem.id ? 'Selected ✓' : 'Show item' }}</button>
            </div>

            <div class="recs-title" :title="currentItem.title">
              <span class="source-badge" :class="'badge-' + currentKind">{{ currentLabel }}</span>
              {{ currentItem.title }}
            </div>

            <!-- Only this part scrolls -->
            <div class="recs-scroll" :key="activeTab + currentIndex">
              <p class="recs-text">{{ currentItem.body }}</p>
            </div>
          </template>
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
                <div v-if="rowListOf(item.id, 'factors').length || rowListOf(item.id, 'causedByOthers').length" class="item-tags">
                  <span v-for="f in rowListOf(item.id, 'factors')" :key="f.key" class="tag tag-warn">+{{ f.pct.toFixed(1) }}% {{ f.label.toLowerCase() }}</span>
                  <span v-for="f in rowListOf(item.id, 'causedByOthers')" :key="f.key" class="tag tag-warn">+{{ f.pct.toFixed(1) }}% {{ f.label.toLowerCase() }} (move the fan)</span>
                </div>
                <div v-if="rowListOf(item.id, 'knockOn').length" class="item-tags">
                  <span v-for="f in rowListOf(item.id, 'knockOn')" :key="f.label" class="tag tag-good">move it to save ~{{ Math.round(f.kwh) }} kWh/yr on the {{ f.label }}</span>
                </div>
              </div>
              <button class="btn-remove" aria-label="Remove item" title="Remove" @click="onRemoveClick($event, item.id)">✕</button>
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import AppliancesList from '../components/AppliancesList.vue'
import FloorPlan3D from '../components/FloorPlan3D.vue'
import AppDialog from '../components/AppDialog.vue'
import { resolveSpec } from '../stores/applianceModels.js'
import { OPENING_KEYS, isBuild, isOpening, isCountertop, newPlacementDoc, typeOf, productOf, kwhOfPlacement, loadCatalogue, shortNameOf } from '../stores/catalog.js'
import { findSpot, gapsOf, onWall, isBlocked, doorBlockedBeyond, needsOutsideWall, roomBehindOpening, sharedWall, sharedRange } from '../stores/placement.js'
import { analyse } from '../stores/energy.js'
import { splitTip } from '../data/placementRules.js'
import { useLayoutHistory } from '../utils/layoutHistory.js'

// ============================================================
// SMALL HELPERS
// ============================================================

// True when a value is undefined or null.
function isMissing(value) {
  return value === undefined || value === null
}

// Give null when a value is missing, otherwise the value itself.
function valueOrNull(value) {
  if (isMissing(value)) {
    return null
  }
  return value
}

// Add a value to a list only if it is not in the list yet.
function addOnce(list, value) {
  if (list.indexOf(value) === -1) {
    list.push(value)
  }
}

// Copy every property of "from" onto "to".
function copyKeys(from, to) {
  for (const key of Object.keys(from)) {
    to[key] = from[key]
  }
}

// Find a room in a list of rooms by its id (undefined if there is none).
function findRoom(rooms, roomId) {
  return rooms.find(function (room) {
    return String(room._id) === roomId
  })
}

// Find a placement in a room by its id (undefined if there is none).
function findPlacement(room, placementId) {
  return room.placements.find(function (p) {
    return String(p._id) === placementId
  })
}

// Does this room contain a placement with this id?
function roomHasItem(room, itemId) {
  return findPlacement(room, itemId) !== undefined
}

// Does any room in the list contain a placement with this id?
function anyRoomHasItem(rooms, itemId) {
  for (const room of rooms) {
    if (roomHasItem(room, itemId)) {
      return true
    }
  }
  return false
}

// Short text for an error, preferring the message the server sent.
function reasonOf(error) {
  if (error.response && error.response.data && error.response.data.error) {
    return error.response.data.error
  }
  return error.message
}

// ============================================================
// AXIOS
// ============================================================

const API_URL = '/api/spatial'

function householdUrl(householdId) {
  return `${API_URL}/households/${householdId}`
}

// The address of the layout being edited: a saved plan or the household.
function layoutBase(householdId, planId) {
  if (planId) {
    return `${API_URL}/plans/${planId}`
  }
  return householdUrl(householdId)
}

// The address of one room.
function roomBase(roomId, planId) {
  if (planId) {
    return `${API_URL}/plans/${planId}/rooms/${roomId}`
  }
  return `${API_URL}/rooms/${roomId}`
}

async function getCurrentHousehold() {
  const response = await axios.get(`${API_URL}/current`)
  return response.data
}

async function getFloorplan(householdId) {
  const response = await axios.get(`${householdUrl(householdId)}/floorplan`)
  return response.data
}

async function getHouseholdPlans(householdId) {
  const response = await axios.get(`${householdUrl(householdId)}/plans`)
  return response.data
}

async function getPlanFloorplan(planId) {
  const response = await axios.get(`${API_URL}/plans/${planId}/floorplan`)
  return response.data
}

// Put a whole saved layout back (used by Undo and Redo).
async function restoreLayout(householdId, rooms, planId) {
  const response = await axios.put(`${layoutBase(householdId, planId)}/layout`, { rooms: rooms })
  return response.data
}

// Change the size / position of one room.
async function setRoomRect(householdId, roomId, rect, planId) {
  const response = await axios.put(`${layoutBase(householdId, planId)}/room-rect`, { roomId: roomId, rect: rect })
  return response.data
}

async function addOpening(householdId, roomId, applianceTypeKey, spots, planId) {
  const body = { roomId: roomId, applianceTypeKey: applianceTypeKey, spots: spots }
  const response = await axios.post(`${layoutBase(householdId, planId)}/openings`, body)
  return response.data
}

async function moveOpening(householdId, roomId, placementId, wall, t, planId) {
  const body = { roomId: roomId, wall: wall, t: t }
  const response = await axios.put(`${layoutBase(householdId, planId)}/openings/${placementId}`, body)
  return response.data
}

async function removeOpening(householdId, roomId, placementId, planId) {
  const response = await axios.delete(`${layoutBase(householdId, planId)}/openings/${placementId}`, { params: { roomId: roomId } })
  return response.data
}

// Knock out the wall between two rooms (open = true) or build it back (open = false).
async function setWallOpen(householdId, roomId, otherId, open, planId) {
  const body = { roomId: roomId, otherId: otherId, open: open }
  const response = await axios.put(`${layoutBase(householdId, planId)}/wall-opening`, body)
  return response.data
}

async function addPlacement(roomId, placement, planId) {
  const response = await axios.post(`${roomBase(roomId, planId)}/placements`, placement)
  return response.data
}

async function removePlacement(roomId, placementId, planId) {
  await axios.delete(`${roomBase(roomId, planId)}/placements/${placementId}`)
}

async function saveRoomPlacements(roomId, placements, planId) {
  const response = await axios.put(`${roomBase(roomId, planId)}/placements`, { placements: placements })
  return response.data
}

async function moveManyPlacements(roomId, moves, planId) {
  const response = await axios.post(`${roomBase(roomId, planId)}/placements/move`, { moves: moves })
  return response.data
}

// Copy the current home layout into a saved plan.
async function copyHomeToPlan(planId) {
  const response = await axios.post(`${API_URL}/plans/${planId}/layout/from-home`)
  return response.data
}

// ============================================================
// STATE OF THE PAGE
// ============================================================

const route = useRoute()
const router = useRouter()

// The layout shown in 3D: { household, rooms, footprint }
const plan = ref({ rooms: [], footprint: null })
const warnings = ref([])
const showWarnings = ref(false)

// The small message that pops up over the 3D view: { text, kind }
const notice = ref(null)
let flashTimer = null

// The pop-up dialog (AppDialog) has notify() and confirm()
const dialog = ref(null)

// What is selected
const selectedRoomId = ref(null)
const selectedItemId = ref(null)

// While an item is being dragged
const preview = ref(null)

// Which pictures are drawn on the floors
const overlays = ref({ sun: false, heat: true, air: true })
const OVERLAY_LAYERS = [
  { key: 'sun', label: 'Sunlight', color: '#f2a900', hint: 'Show where sunlight falls in each room' },
  { key: 'heat', label: 'Heat', color: '#e8420f', hint: 'Show hot spots made by appliances and sunlight' },
  { key: 'air', label: 'Airflow (aircon & fans)', short: 'Airflow', color: '#14a3b8', hint: 'Show where air from aircon and fans flows' },
]

// The catalogue at the bottom is open on tall screens and closed on small ones
const dockOpen = ref(window.innerHeight >= 860)

// Height of the navigation bar (the page sits below it)
const navH = ref(72)

// Changes are sent to the server one after another, never at the same time.
let taskQueue = Promise.resolve()

function enqueue(task) {
  const result = taskQueue.then(task)
  taskQueue = result.catch(function () {})
  return result
}

// Show a small message for a few seconds. kind is 'warn' or 'ok'.
function flash(message, ms = 4000, kind = 'warn') {
  notice.value = { text: message, kind: kind }
  clearTimeout(flashTimer)
  flashTimer = setTimeout(function () {
    notice.value = null
  }, ms)
}

// Tell the user something went wrong. Uses the dialog, or a small message if there is no dialog.
function problem(message, title = 'Something went wrong') {
  notice.value = null
  if (dialog.value) {
    return dialog.value.notify({ title: title, message: message })
  }
  return flash(message)
}

// The id of the household that owns the layout
function hid() {
  return plan.value.household._id
}

// The room with this id (undefined if there is none)
function roomOf(roomId) {
  return findRoom(plan.value.rooms, roomId)
}

// Measure the navigation bar so the page fits below it.
function measureNav() {
  const nav = document.querySelector('.eco-navbar')
  let height = 0
  if (nav) {
    height = nav.offsetHeight
  }
  navH.value = height || 72
}

// ============================================================
// THE LOADING SCREEN
// ============================================================
// It shows until the data is loaded AND the 3D scene is drawn,
// and stays for at least 3 seconds so the animation can be seen.

const LOADER_MIN_MS = 3000
const LOADER_FADE_MS = 500
const loaderStart = Date.now()
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const loadError = ref('')
const needsHousehold = ref(false)
const dataReady = ref(false)
const sceneReady = ref(false)
const loaderGone = ref(false)
const loaderLeaving = ref(false)
let sceneTimer = null
let loaderTimer = null
let loaderFadeTimer = null

const loading = computed(function () {
  return !dataReady.value && !loadError.value
})

// 'error', 'ready' or 'loading'
const loaderState = computed(function () {
  if (loadError.value) {
    return 'error'
  }
  if (dataReady.value && sceneReady.value) {
    return 'ready'
  }
  return 'loading'
})

// When everything is ready, wait out the minimum time, fade the loader out, then remove it.
watch(loaderState, function (state) {
  clearTimeout(loaderTimer)
  clearTimeout(loaderFadeTimer)
  loaderLeaving.value = false
  if (state !== 'ready') {
    return
  }

  let wait = 0
  if (!reduceMotion) {
    wait = Math.max(0, LOADER_MIN_MS - (Date.now() - loaderStart))
  }
  let fadeWait = LOADER_FADE_MS
  if (reduceMotion) {
    fadeWait = 0
  }

  loaderTimer = setTimeout(function () {
    loaderLeaving.value = true
    loaderFadeTimer = setTimeout(function () {
      loaderGone.value = true
    }, fadeWait)
  }, wait)
})

// Load the catalogue, the household, the saved plans and then the right layout.
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
    measureNav()

    // The scene tells us when it is drawn. If it never does, show the page after 5 seconds.
    clearTimeout(sceneTimer)
    let sceneWait = 0
    if (plan.value.rooms.length) {
      sceneWait = 5000
    }
    sceneTimer = setTimeout(function () {
      sceneReady.value = true
    }, sceneWait)
  } catch (error) {
    const response = error.response
    let code = ''
    if (response && response.data && response.data.code) {
      code = response.data.code
    }
    needsHousehold.value = code === 'NO_HOUSEHOLD'

    if (needsHousehold.value) {
      loadError.value = response.data.error
    } else if (response) {
      let serverText = ''
      if (response.data && response.data.error) {
        serverText = response.data.error
      }
      loadError.value = serverText || `The server answered with an error (${response.status}).`
    } else {
      loadError.value = 'The server could not be reached. Check your connection, then try again.'
    }
  }
}

// Use a layout that came from the server.
function applyLoaded(loaded, keepHistory = false) {
  plan.value = loaded
  if (isMissing(loaded.warnings)) {
    warnings.value = []
  } else {
    warnings.value = loaded.warnings
  }
  if (!keepHistory) {
    loadHistory()
  }
}

// ============================================================
// WHICH LAYOUT IS EDITED (the current home or a saved plan)
// ============================================================

const SCOPE_KEY = 'ecohome.3d.layout'
const scopeId = ref('')
const energyPlans = ref([])
let scopeReady = false

// The id to send to the server
function planScope() {
  if (scopeId.value) {
    return scopeId.value
  }
  return undefined
}

// The plan being edited
const scopePlan = computed(function () {
  const found = energyPlans.value.find(function (p) {
    return p.id === scopeId.value
  })
  if (found === undefined) {
    return null
  }
  return found
})

// The name shown on the 3D view
const scopePlanName = computed(function () {
  if (scopePlan.value === null || isMissing(scopePlan.value.name)) {
    return ''
  }
  return scopePlan.value.name
})

// The plan being edited names the page. Without a plan (the current home layout)
// it falls back to the household's name.
const pageTitle = computed(function () {
  if (scopePlan.value && scopePlan.value.name) {
    return scopePlan.value.name
  }
  if (plan.value.household && plan.value.household.name) {
    return plan.value.household.name
  }
  return 'Your flat'
})

// Get the layout of the plan being edited from the server.
function loadScope() {
  if (scopeId.value) {
    return getPlanFloorplan(scopeId.value)
  }
  return getFloorplan(hid())
}

async function reloadScope(keepHistory = false) {
  applyLoaded(await loadScope(), keepHistory)
}

async function loadPlanList() {
  try {
    energyPlans.value = await getHouseholdPlans(hid())
  } catch (error) {
    energyPlans.value = []
  }
}

// Switch to another layout. Gives true if it worked.
async function changeScope(next) {
  if (next === scopeId.value) {
    return true
  }
  await taskQueue
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
  } catch (error) {
    scopeId.value = previous
    problem(reasonOf(error), 'Could not switch layouts')
    return false
  }
}

// The user picked something in the "Editing" drop-down.
async function switchScope(event) {
  const next = event.target.value
  const target = energyPlans.value.find(function (p) {
    return p.id === next
  })
  if (target && !target.hasLayout) {
    event.target.value = scopeId.value
    await useHomeLayout(target, false)
    return
  }
  const switched = await changeScope(next)
  if (!switched) {
    event.target.value = scopeId.value
  }
}

// Copy the current home layout into a plan.
async function useHomeLayout(target, reset) {
  if (!target) {
    return
  }

  let ask = ''
  let title = ''
  let okText = ''
  if (reset) {
    ask = `Replace the layout saved in "${target.name}" with your current home layout? Changes you made to this plan's 3D layout will be lost.`
    title = 'Reset this plan\'s layout?'
    okText = 'Replace layout'
  } else {
    ask = `"${target.name}" has no saved 3D layout yet. Copy your current home layout into it?`
    title = 'Use your current home layout?'
    okText = 'Copy layout'
  }

  const yes = await dialog.value.confirm({
    title: title,
    message: ask,
    okText: okText,
    danger: reset,
  })
  if (!yes) {
    return
  }

  await taskQueue
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

    if (reset) {
      flash(`"${target.name}" now matches your current home layout.`, 4000, 'ok')
    } else {
      flash(`Copied your current home layout into "${target.name}".`, 4000, 'ok')
    }
  } catch (error) {
    problem(reasonOf(error), 'Could not copy the layout')
  }
}

// The plan id in the address bar (?plan=...), or '' if there is none
function queryPlan() {
  let q = route.query.plan
  if (Array.isArray(q)) {
    q = q[0]
  }
  return String(q || '')
}

// Can this plan be opened in 3D? (it must exist and have a saved layout)
function openablePlan(id) {
  for (const p of energyPlans.value) {
    if (p.id === id && p.hasLayout) {
      return true
    }
  }
  return false
}

// Change the address bar without leaving the page.
async function replaceAddress(query) {
  try {
    await router.replace({ query: query })
  } catch (error) {
    // going to the same address again is not an error worth showing
  }
}

// Remember the chosen layout in localStorage and in the address bar.
function rememberScope() {
  try {
    if (scopeId.value) {
      localStorage.setItem(SCOPE_KEY, scopeId.value)
    } else {
      localStorage.removeItem(SCOPE_KEY)
    }
  } catch (error) {
    // storage can be blocked; the address still carries it
  }

  if (queryPlan() !== scopeId.value) {
    const query = {}
    copyKeys(route.query, query)
    query.plan = scopeId.value || undefined
    replaceAddress(query)
  }
}

// When the page opens, show the plan from the address bar, or the one used last time.
async function restoreScope() {
  const asked = queryPlan()
  let remembered = ''
  try {
    remembered = localStorage.getItem(SCOPE_KEY) || ''
  } catch (error) {
    // storage can be blocked
  }

  const want = asked || remembered
  if (want && openablePlan(want)) {
    await changeScope(want)
    return
  }
  if (asked) {
    problem('It was not found, or it has no saved layout yet. Pick it in the layout selector to copy your current home layout into it.', 'That plan can\'t be opened in 3D')
  }
  rememberScope()
}

// If the plan in the address bar changes while the page is open, follow it.
const planInAddress = computed(function () {
  return route.query.plan
})

watch(planInAddress, async function () {
  const id = queryPlan()
  if (!scopeReady || !id || id === scopeId.value) {
    return
  }
  if (openablePlan(id)) {
    await changeScope(id)
  } else {
    problem('It was not found, or it has no saved layout yet.', 'That plan can\'t be opened in 3D')
  }
})

// ============================================================
// SELECTION
// ============================================================

const allRooms = computed(function () {
  return plan.value.rooms
})

const selectedRoom = computed(function () {
  return roomOf(selectedRoomId.value)
})

// If the selected room or item disappears (for example after Undo), clear the selection.
watch(allRooms, function (rooms) {
  if (selectedRoomId.value && findRoom(rooms, selectedRoomId.value) === undefined) {
    selectedRoomId.value = null
  }
  if (selectedItemId.value && !anyRoomHasItem(rooms, selectedItemId.value)) {
    selectedItemId.value = null
  }
})

// If another room is picked, an item of the old room cannot stay selected.
watch(selectedRoomId, function (id) {
  if (!selectedItemId.value) {
    return
  }
  const room = roomOf(id)
  if (room === undefined || !roomHasItem(room, selectedItemId.value)) {
    selectedItemId.value = null
  }
})

// ============================================================
// THE ITEMS OF EACH ROOM
// ============================================================

// The name of a placed thing, e.g. "Fridge (2-door, 300L)"
function nameOf(placement) {
  const type = typeOf(placement.category, placement.applianceTypeKey)
  if (isMissing(type) || isMissing(type.name)) {
    return placement.applianceTypeKey
  }
  return type.name
}

// While an item is being dragged, its preview position is used instead.
function placedOf(room) {
  const list = []

  for (const p of room.placements) {
    const product = productOf(p.category, p.applianceTypeKey, p.brand, p.model)
    let ticks = null
    if (product && !isMissing(product.ticks)) {
      ticks = product.ticks
    }

    let kwh = 0
    if (!isBuild(p.category)) {
      kwh = kwhOfPlacement(p)
    }

    let cu = 0
    if (!isMissing(p.cu)) {
      cu = p.cu
    }

    let on = undefined
    if (p.onPlacementId) {
      on = String(p.onPlacementId)
    }

    const item = {
      id: String(p._id),
      name: nameOf(p),
      kwh: kwh,
      ticks: ticks,
      spec: resolveSpec(p.applianceTypeKey, p.category),
      x: p.x,
      z: p.z,
      rotY: p.rotY,
      wall: p.wall,
      t: p.t,
      cu: cu,
      on: on,
    }

    // being dragged right now? then use the position of the drag
    if (preview.value && preview.value.roomId === String(room._id)) {
      const pose = preview.value.poses[String(p._id)]
      if (pose) {
        copyKeys(pose, item)
      }
    }

    list.push(item)
  }

  return list
}

// The list on the right: the appliances and furniture of the selected room
const roomItems = computed(function () {
  const room = selectedRoom.value
  if (!room) {
    return []
  }

  const items = []
  for (const p of room.placements) {
    if (isOpening(p)) {
      continue
    }
    const product = productOf(p.category, p.applianceTypeKey, p.brand, p.model)
    let brand = null
    let model = null
    let ticks = null
    if (product) {
      brand = valueOrNull(product.brand)
      model = valueOrNull(product.model)
      ticks = valueOrNull(product.ticks)
    }

    items.push({
      id: String(p._id),
      name: nameOf(p),
      short: shortNameOf(typeOf(p.category, p.applianceTypeKey)) || nameOf(p),
      brand: brand,
      model: model,
      ticks: ticks,
      kwh: kwhOfPlacement(p),
      build: isBuild(p.category),
    })
  }
  return items
})

// Is this id one of the items in the list on the right?
function isListedItem(itemId) {
  for (const item of roomItems.value) {
    if (item.id === itemId) {
      return true
    }
  }
  return false
}

// How many placed things are not in the catalogue any more?
const missingItems = computed(function () {
  let count = 0
  for (const room of plan.value.rooms) {
    for (const p of room.placements) {
      if (!typeOf(p.category, p.applianceTypeKey)) {
        count = count + 1
      }
    }
  }
  return count
})

// ============================================================
// ENERGY (the maths is in stores/energy.js)
// ============================================================

// When walls are knocked out, a room also needs to know the rooms next to it.
function openLinkOf(room) {
  const open = room.openWalls || []
  if (!open.length) {
    return null
  }

  const near = []
  const doneNames = []
  for (const o of open) {
    if (doneNames.indexOf(o.to) !== -1) {
      continue
    }
    doneNames.push(o.to)

    const other = plan.value.rooms.find(function (x) {
      return x.name === o.to
    })
    if (other) {
      near.push({
        name: other.name,
        w: other.dimension.w,
        d: other.dimension.d,
        dx: other.origin.x - room.origin.x,
        dz: other.origin.z - room.origin.z,
        items: placedOf(other),
      })
    }
  }
  return { open: open, near: near }
}

// The energy result of every room
const analyses = computed(function () {
  const list = []
  for (const room of plan.value.rooms) {
    const result = analyse(room.dimension, placedOf(room), room.name, openLinkOf(room))
    result.roomId = String(room._id)
    list.push(result)
  }
  return list
})

// The result row of one item (null if there is none)
function rowOf(itemId) {
  for (const a of analyses.value) {
    const row = a.rows.find(function (x) {
      return x.id === itemId
    })
    if (row) {
      return row
    }
  }
  return null
}

// One list of an item's result row ('factors', 'causedByOthers' or 'knockOn'). Empty if there is none.
function rowListOf(itemId, key) {
  const row = rowOf(itemId)
  if (row === null) {
    return []
  }
  return row[key] || []
}

// Add up one number (e.g. 'kwh') over all the rooms.
function sumOf(key) {
  let total = 0
  for (const a of analyses.value) {
    total = total + a[key]
  }
  return total
}

const ratedKwhYear = computed(function () {
  return Math.round(sumOf('base'))
})

const totalKwhYear = computed(function () {
  return Math.round(sumOf('kwh'))
})

// How many percent more energy the placement of the items costs
const placementImpact = computed(function () {
  if (sumOf('base')) {
    return (sumOf('avoidKwh') / sumOf('base')) * 100
  }
  return 0
})

// The result of the selected room (undefined if no room is selected)
function selectedAnalysis() {
  return analyses.value.find(function (a) {
    return a.roomId === selectedRoomId.value
  })
}

// Tips that move something to save energy
const recs = computed(function () {
  const a = selectedAnalysis()
  if (a === undefined || isMissing(a.recs)) {
    return []
  }
  return a.recs
})

// Other tips
const tips = computed(function () {
  const a = selectedAnalysis()
  if (a === undefined || isMissing(a.tips)) {
    return []
  }
  return a.tips
})

// ============================================================
// THE ADVICE CAROUSEL (recommendations tab and tips tab)
// ============================================================

const activeTab = ref('recs') // 'recs' or 'tips'
const recIndex = ref(0)
const tipIndex = ref(0)

// Each tip with its title, text and source (NEA or Tips) split apart, so the title can sit above the text.
const tipCards = computed(function () {
  return tips.value.map(function (t) {
    const parts = splitTip(t.text)
    return { id: t.id, title: parts.title || 'Tip', body: parts.body, source: parts.source }
  })
})

// Each recommendation with a short title above its text.
const recCards = computed(function () {
  return recs.value.map(function (r) {
    const full = r.title || 'Move an item'
    let body = r.text
    if (r.title && r.text.startsWith(r.title + ' ')) {
      body = 'Move it ' + r.text.slice(r.title.length + 1)
    }
    return { id: r.id, to: r.to, title: full.replace(/\s*\(.*\)\s*$/, ''), body: body, source: '' }
  })
})

const currentList = computed(function () {
  return activeTab.value === 'recs' ? recCards.value : tipCards.value
})

const currentIndex = computed(function () {
  const i = activeTab.value === 'recs' ? recIndex.value : tipIndex.value
  return Math.min(i, Math.max(currentList.value.length - 1, 0))
})

const currentItem = computed(function () {
  return currentList.value[currentIndex.value]
})

// 'rec', 'nea' or 'tip': decides the colour of the card
const currentKind = computed(function () {
  if (activeTab.value === 'recs') {
    return 'rec'
  }
  const item = currentItem.value
  if (item && item.source === 'NEA') {
    return 'nea'
  }
  return 'tip'
})

const currentLabel = computed(function () {
  if (currentKind.value === 'rec') {
    return 'Recommendation'
  }
  return currentKind.value === 'nea' ? 'NEA' : 'Tips'
})

// Arrow buttons: wrap around at both ends.
function stepAdvice(direction) {
  const n = currentList.value.length
  if (n < 2) {
    return
  }
  const next = (currentIndex.value + direction + n) % n
  if (activeTab.value === 'recs') {
    recIndex.value = next
  } else {
    tipIndex.value = next
  }
}

// Pressing Apply or Show item re-draws the 3D view
const actionBusy = ref(false)

function afterPaint() {
  return new Promise(function (resolve) {
    requestAnimationFrame(function () {
      requestAnimationFrame(resolve)
    })
  })
}

async function onShowItemClick(id) {
  actionBusy.value = true
  await afterPaint()
  selectedItemId.value = id
  actionBusy.value = false
}

async function onApplyClick(rec) {
  actionBusy.value = true
  await afterPaint()
  applyRec(rec)
  actionBusy.value = false
}

// A different room starts again at the first card of the tab that has something in it.
watch(selectedRoomId, function () {
  recIndex.value = 0
  tipIndex.value = 0
  activeTab.value = recs.value.length || !tips.value.length ? 'recs' : 'tips'
})

// If the tab being read becomes empty (e.g. after "Apply"), jump to the other tab.
watch([recs, tips], function () {
  if (activeTab.value === 'recs' && !recs.value.length && tips.value.length) {
    activeTab.value = 'tips'
  } else if (activeTab.value === 'tips' && !tips.value.length && recs.value.length) {
    activeTab.value = 'recs'
  }
})

// ============================================================
// THE ROOM BREAKDOWN (the list shown when no room is selected)
// ============================================================

const ROOM_COLORS = { living: '#f59e0b', kitchen: '#0ea5e9', bedroom: '#8b5cf6', bathroom: '#10b981' }

// One row per room with its energy and its share of the total.
// The shares are whole percentages that add up to exactly 100%.
const roomBreakdown = computed(function () {
  const rows = []
  for (let i = 0; i < plan.value.rooms.length; i++) {
    const room = plan.value.rooms[i]

    let raw = 0
    const a = analyses.value[i]
    if (a && !isMissing(a.kwh)) {
      raw = a.kwh
    }

    let color = ROOM_COLORS[room.type]
    if (isMissing(color)) {
      color = '#94a3b8'
    }

    let itemCount = 0
    for (const p of room.placements) {
      if (!isOpening(p)) {
        itemCount = itemCount + 1
      }
    }

    rows.push({ id: String(room._id), name: room.name, color: color, raw: raw, kwh: Math.round(raw), items: itemCount })
  }

  let total = 0
  for (const row of rows) {
    total = total + row.raw
  }

  // each room's exact share, and the same share rounded down
  const shares = []
  const whole = []
  for (const row of rows) {
    let share = 0
    if (total > 0) {
      share = (row.raw / total) * 100
    }
    shares.push(share)
    whole.push(Math.floor(share))
  }

  // the percentages that are still missing to reach 100 go to the rooms with the biggest leftover
  let left = 0
  if (total > 0) {
    let wholeSum = 0
    for (const w of whole) {
      wholeSum = wholeSum + w
    }
    left = 100 - wholeSum
  }
  const leftovers = []
  for (let i = 0; i < shares.length; i++) {
    leftovers.push({ amount: shares[i] - whole[i], index: i })
  }
  leftovers.sort(function (a, b) {
    return b.amount - a.amount
  })
  for (const leftover of leftovers) {
    if (left > 0) {
      whole[leftover.index] = whole[leftover.index] + 1
      left = left - 1
    }
  }

  for (let i = 0; i < rows.length; i++) {
    rows[i].pct = shares[i]
    if (rows[i].raw > 0 && whole[i] === 0) {
      rows[i].pctLabel = '<1%'
    } else {
      rows[i].pctLabel = `${whole[i]}%`
    }
  }

  // the room that uses the most energy comes first
  rows.sort(function (a, b) {
    return b.raw - a.raw
  })
  return rows
})

// The living room, or the first room if there is no living room (undefined if there are no rooms)
function defaultRoom() {
  const living = plan.value.rooms.find(function (room) {
    return room.type === 'living'
  })
  if (living) {
    return living
  }
  return plan.value.rooms[0]
}

// The room that new appliances go into
const targetRoomName = computed(function () {
  if (selectedRoom.value && !isMissing(selectedRoom.value.name)) {
    return selectedRoom.value.name
  }
  const room = defaultRoom()
  if (room && !isMissing(room.name)) {
    return room.name
  }
  return 'your home'
})

// ============================================================
// UNDO AND REDO
// ============================================================
// Before every change we keep the rooms as text (a "snapshot").
// Undo sends the last snapshot back to the server.

const MAX_HISTORY = 50
const undoStack = ref([])
const redoStack = ref([])
const history = useLayoutHistory()

const canUndo = computed(function () {
  return undoStack.value.length > 0
})

const canRedo = computed(function () {
  return redoStack.value.length > 0
})

function snapshot() {
  return JSON.stringify(plan.value.rooms)
}

function saveHistory() {
  history.save(scopeId.value, plan.value.rooms, undoStack.value, redoStack.value)
}

function flushHistory() {
  history.flush()
}

// Get the Undo / Redo lists of the layout that is shown.
function loadHistory() {
  const saved = history.load(scopeId.value, plan.value.rooms)
  undoStack.value = saved.undo
  redoStack.value = saved.redo
}

// A change was saved: keep the snapshot from before it, so it can be undone.
function remember(before) {
  undoStack.value.push(before)
  if (undoStack.value.length > MAX_HISTORY) {
    undoStack.value.shift()
  }
  redoStack.value = []
  saveHistory()
}

// Show the rooms and footprint that the server sent back.
function applyGeometry(result) {
  plan.value.rooms = result.rooms
  plan.value.footprint = result.footprint
  if (isMissing(result.warnings)) {
    warnings.value = []
  } else {
    warnings.value = result.warnings
  }
}

// Show the same rooms again as a new list, so the 3D view draws them again.
// Used when a change was refused and the 3D view has to jump back.
function redrawRooms() {
  plan.value.rooms = plan.value.rooms.slice()
}

// Save a change to the layout. "task" is a function that sends the change to the server
// and gives back the new rooms. Gives the server's answer, or null if it failed.
function commit(task) {
  return enqueue(async function () {
    const before = snapshot()
    try {
      const result = await task()
      applyGeometry(result)
      remember(before)
      return result
    } catch (error) {
      problem(reasonOf(error), 'Could not save that change')
      return null
    }
  })
}

// Same as commit(), but gives true or false.
async function run(task) {
  const result = await commit(task)
  if (result) {
    return true
  }
  return false
}

// Go one step back (from = undoStack, to = redoStack) or forward (from = redoStack, to = undoStack).
function travel(from, to) {
  return enqueue(async function () {
    const target = from.value[from.value.length - 1]
    if (!target) {
      return
    }
    const current = snapshot()
    try {
      applyGeometry(await restoreLayout(hid(), JSON.parse(target), planScope()))
      from.value.pop()
      to.value.push(current)
      saveHistory()
    } catch (error) {
      problem(reasonOf(error), 'Could not undo or redo')
    }
  })
}

function undo() {
  return travel(undoStack, redoStack)
}

function redo() {
  return travel(redoStack, undoStack)
}

// ============================================================
// LOCKING THE ROOM SIZES AND THE HAMMER
// ============================================================

const LOCK_KEY = 'ecohome.3d.locked'
const hammer = ref(false)
const layoutLocked = ref(false)

try {
  layoutLocked.value = localStorage.getItem(LOCK_KEY) === '1'
} catch (error) {
  // storage can be blocked
}

// Remember the lock. Turning it on also puts the hammer down.
watch(layoutLocked, function (on) {
  try {
    if (on) {
      localStorage.setItem(LOCK_KEY, '1')
    } else {
      localStorage.removeItem(LOCK_KEY)
    }
  } catch (error) {
    // storage can be blocked
  }
  if (on) {
    hammer.value = false
  }
})

function toggleHammer() {
  if (layoutLocked.value) {
    return
  }
  hammer.value = !hammer.value
}

// ============================================================
// RESIZING AND MOVING ROOMS
// ============================================================

// Is room a connected to room b? (by a door, or by a knocked-out wall)
function isConnected(a, b) {
  for (const p of a.placements) {
    if (isOpening(p) && p.connectsTo === b.name) {
      return true
    }
  }
  const open = a.openWalls || []
  for (const o of open) {
    if (o.to === b.name) {
      return true
    }
  }
  return false
}

// A shared wall must be at least this long (metres) to fit a door.
const DOOR_FIT = 1.1

// The rooms that touch this room along a wall long enough for a door, but are not connected to it.
function unconnectedNeighbours(room) {
  const found = []
  for (const other of plan.value.rooms) {
    if (other === room || isConnected(room, other)) {
      continue
    }
    const shared = sharedWall(room, other)
    if (shared && shared.length >= DOOR_FIT) {
      found.push(other)
    }
  }
  return found
}

// The user finished dragging a room's edge. payload = { roomId, rect }
async function onEditRect(payload) {
  if (layoutLocked.value) {
    return
  }
  const roomId = payload.roomId
  const rect = payload.rect

  // which rooms touched this room without a door before the change?
  const namesBefore = []
  const roomBefore = roomOf(roomId)
  if (roomBefore) {
    for (const o of unconnectedNeighbours(roomBefore)) {
      namesBefore.push(o.name)
    }
  }

  const saved = await run(function () {
    return setRoomRect(hid(), roomId, rect, planScope())
  })

  if (saved) {
    // remind the user that they can add a door
    const moved = roomOf(roomId)
    const newNames = []
    if (moved) {
      for (const o of unconnectedNeighbours(moved)) {
        if (namesBefore.indexOf(o.name) === -1) {
          newNames.push(o.name)
        }
      }
    }
    if (newNames.length) {
      flash(`The ${moved.name} now touches the ${newNames.join(' and the ')}. To connect them, drag a door onto the wall they share, or add a door from the catalogue.`, 9000)
    }
  } else {
    redrawRooms()
  }
}

// ============================================================
// DOORS AND WINDOWS
// ============================================================

// The door or window that is selected (null if something else, or nothing, is selected)
const selectedOpening = computed(function () {
  for (const room of plan.value.rooms) {
    const p = findPlacement(room, selectedItemId.value)
    if (p && isOpening(p)) {
      return { roomId: String(room._id), id: String(p._id), name: nameOf(p) }
    }
  }
  return null
})

function removeSelectedOpening() {
  const opening = selectedOpening.value
  if (opening) {
    run(function () {
      return removeOpening(hid(), opening.roomId, opening.id, planScope())
    })
  }
}

// The user dragged a door or window to another spot. payload = { roomId, id, wall, t }
async function onMoveOpening(payload) {
  const saved = await run(function () {
    return moveOpening(hid(), payload.roomId, payload.id, payload.wall, payload.t, planScope())
  })
  preview.value = null
  if (!saved) {
    redrawRooms()
  }
}

// Things that hang on a wall. They cannot hang in the gap of a knocked-out wall.
const HANGING_KINDS = ['ac', 'tv', 'heater']

// Add the names of the things hanging on the wall that "room" shares with "other".
function addHangingNames(room, other, names) {
  const shared = sharedWall(room, other)
  let range = null
  if (shared) {
    range = sharedRange(room, other, shared.wall)
  }
  if (!range) {
    return
  }

  for (const p of room.placements) {
    if (p.wall !== shared.wall || isOpening(p) || p.onPlacementId) {
      continue
    }
    const spec = resolveSpec(p.applianceTypeKey, p.category)
    const isHanging = spec.mode === 'wall' && HANGING_KINDS.indexOf(spec.kind) !== -1
    if (isHanging && p.t + spec.w / 2 > range.t0 && p.t - spec.w / 2 < range.t1) {
      names.push(nameOf(p))
    }
  }
}

// The names of the things hanging on the wall between two rooms (looking from both sides).
function hangingOnSharedWall(a, b) {
  const names = []
  addHangingNames(a, b, names)
  addHangingNames(b, a, names)
  return names
}

// The user clicked a wall with the hammer.
async function onHammerWall(payload) {
  const roomId = payload.roomId
  const otherId = payload.otherId
  const open = payload.open

  const room = roomOf(roomId)
  const other = roomOf(otherId)
  if (!room || !other) {
    return
  }

  // before knocking the wall out, nothing may hang on it
  if (open) {
    const hanging = hangingOnSharedWall(room, other)
    if (hanging.length) {
      const names = []
      for (const name of hanging) {
        addOnce(names, name)
      }
      flash(`Move the ${names.join(' and the ')} off that wall first. It would be left hanging in the gap.`, 6000)
      return
    }
  }

  const saved = await run(function () {
    return setWallOpen(hid(), roomId, otherId, open, planScope())
  })
  if (saved) {
    if (open) {
      flash(`The wall between the ${room.name} and the ${other.name} is gone.`, 3500, 'ok')
    } else {
      flash(`The wall between the ${room.name} and the ${other.name} is back, with a door in it.`, 3500, 'ok')
    }
  }
}

// How long is a wall? Walls 0 and 2 run along the width, walls 1 and 3 along the depth.
function lengthOfWall(dim, wall) {
  if (wall % 2) {
    return dim.d
  }
  return dim.w
}

// A copy of the spot, with the spec added, so that isBlocked() can check it.
function candidateAt(spec, pos) {
  const candidate = { spec: spec }
  copyKeys(pos, candidate)
  return candidate
}

// Find every spot on the walls of a room where a door or window fits.
function openingSpots(room, appliance) {
  const spec = resolveSpec(appliance.applianceTypeKey, appliance.category)
  const dim = room.dimension
  const others = placedOf(room)
  const margin = Math.max(0.6, spec.w / 2 + 0.15)

  // The 4 walls. "centre" is where we start looking, "preferred" walls come first.
  const walls = []
  for (let w = 0; w < 4; w++) {
    walls.push({ w: w, centre: lengthOfWall(dim, w) / 2, preferred: false })
  }

  // A door prefers a wall it shares with a room it is not connected to yet.
  if (spec.kind === 'door' && !needsOutsideWall(spec)) {
    for (const other of plan.value.rooms) {
      if (other === room || isConnected(room, other)) {
        continue
      }
      const shared = sharedWall(room, other)
      if (shared && shared.length >= DOOR_FIT && !walls[shared.wall].preferred) {
        walls[shared.wall].preferred = true
        walls[shared.wall].centre = shared.t
      }
    }
  }

  // preferred walls first, then the longer walls
  walls.sort(function (a, b) {
    const byPreferred = Number(b.preferred) - Number(a.preferred)
    if (byPreferred !== 0) {
      return byPreferred
    }
    return lengthOfWall(dim, b.w) - lengthOfWall(dim, a.w)
  })

  const spots = []
  const skipped = []
  const beyond = new Map() // doorBlockedBeyond() (placement.js) uses a Map to remember what it already checked

  for (const wallInfo of walls) {
    const w = wallInfo.w
    const centre = wallInfo.centre
    let found = 0
    const refused = []

    // try a spot every 10 cm along the wall, starting at the centre
    const ts = []
    for (let t = margin; t <= lengthOfWall(dim, w) - margin + 1e-9; t += 0.1) {
      ts.push(Math.round(t * 10) / 10)
    }
    ts.sort(function (a, b) {
      return Math.abs(a - centre) - Math.abs(b - centre)
    })

    for (const t of ts) {
      const pos = onWall(dim, spec, w, t)
      if (!pos || isBlocked(candidateAt(spec, pos), others)) {
        continue
      }
      if (needsOutsideWall(spec) && roomBehindOpening(plan.value.rooms, room, spec, pos)) {
        continue
      }
      const behind = doorBlockedBeyond(plan.value.rooms, room, spec, pos, { cache: beyond })
      if (behind) {
        if (!behind.straddle) {
          addOnce(refused, behind.name)
        }
        continue
      }
      spots.push([w, pos.t])
      found = found + 1
    }

    // a preferred wall with no spot: tell the user which rooms were in the way
    if (wallInfo.preferred && !found) {
      for (const name of refused) {
        addOnce(skipped, name)
      }
    }
  }

  return { spots: spots.slice(0, 300), skipped: skipped }
}

// ============================================================
// ADDING, MOVING AND REMOVING ITEMS
// ============================================================

// The user pressed "+ Add" in the catalogue.
async function handleAddAppliance(appliance) {
  // no room selected: use the living room (or the first room)
  if (!selectedRoom.value) {
    const first = defaultRoom()
    if (!first) {
      return
    }
    selectedRoomId.value = String(first._id)
  }
  const room = selectedRoom.value
  const roomId = String(room._id)

  // doors and windows go onto a wall
  if (isBuild(appliance.category) && OPENING_KEYS.has(appliance.applianceTypeKey)) {
    const found = openingSpots(room, appliance)
    if (!found.spots.length) {
      flash(`There is no clear space on the ${room.name} walls for that. Move an appliance away from the wall, or make the room bigger.`)
      return
    }
    const added = await run(function () {
      return addOpening(hid(), roomId, appliance.applianceTypeKey, found.spots, planScope())
    })
    if (added && found.skipped.length) {
      flash(`A countertop or appliance in the ${found.skipped.join(' / ')} is in the way of a door there, so this door went on another wall. Move it first if you want the rooms joined.`, 9000)
    }
    return added
  }

  // everything else: find a free spot in the room
  const spec = resolveSpec(appliance.applianceTypeKey, appliance.category)
  const others = placedOf(room)
  const roomSize = {}
  copyKeys(room.dimension, roomSize)
  // knocked-out wall stretches: an aircon, TV or counter may not be put on them
  const spot = findSpot(roomSize, spec, others.concat(gapsOf(room)))

  if (!spot) {
    if (spec.mode === 'top') {
      let hasCounter = false
      for (const o of others) {
        if (o.spec.kind === 'counter') {
          hasCounter = true
        }
      }
      if (hasCounter) {
        flash('No free space on the countertop (the sink can\'t be used). Clear some space or add another countertop.')
      } else {
        flash('Add a countertop first, then place this on it.')
      }
      return
    }
    flash(`No free space in the ${room.name}. Move something, or make the room bigger.`)
    return
  }

  await enqueue(async function () {
    const before = snapshot()
    try {
      const saved = await addPlacement(roomId, newPlacementDoc(appliance, spot), planScope())
      const target = roomOf(roomId)
      if (target) {
        target.placements.push(saved)
      }
      remember(before)
      selectedItemId.value = String(saved._id)
    } catch (error) {
      problem(reasonOf(error), 'Could not add it')
    }
  })
}

// Items were moved or turned in the 3D view. payload = { roomId, updates }
function onMoveItems(payload) {
  const roomId = payload.roomId
  const updates = payload.updates

  return enqueue(async function () {
    const before = snapshot()
    const room = roomOf(roomId)
    if (!room) {
      return
    }
    try {
      // show the new positions at once, then save them
      const moves = []
      for (const update of updates) {
        const placement = findPlacement(room, update.id)
        if (!placement) {
          continue
        }
        const newPosition = {}
        copyKeys(update, newPosition)
        delete newPosition.id
        copyKeys(newPosition, placement)
        moves.push(update)
      }
      if (!moves.length) {
        return
      }
      await moveManyPlacements(roomId, moves, planScope())
      remember(before)
    } catch (error) {
      problem(reasonOf(error), 'Could not save the move')
      try {
        await reloadScope(true)
      } catch (reloadError) {
        // the problem was already shown
      }
    } finally {
      preview.value = null
    }
  })
}

// The user pressed "Apply" on a recommendation: move the item where the recommendation says.
function applyRec(rec) {
  const room = selectedRoom.value
  if (!room) {
    return
  }
  const to = rec.to
  let cu = 0
  if (!isMissing(to.cu)) {
    cu = to.cu
  }
  onMoveItems({
    roomId: String(room._id),
    updates: [{ id: rec.id, x: to.x, z: to.z, rotY: to.rotY, wall: to.wall, t: to.t, cu: cu }],
  })
  selectedItemId.value = rec.id
}

// What is the id of the item that this placement sits on? ('' if none)
function onIdOf(placement) {
  if (isMissing(placement.onPlacementId)) {
    return ''
  }
  return String(placement.onPlacementId)
}

// Remove one item. Things that sit on it (like a sink on a countertop) go too.
function removeItem(id) {
  const room = selectedRoom.value
  if (!room) {
    return
  }
  const roomId = String(room._id)

  return enqueue(async function () {
    const before = snapshot()
    try {
      await removePlacement(roomId, id, planScope())
      const target = roomOf(roomId)
      if (target) {
        const kept = []
        for (const p of target.placements) {
          if (String(p._id) !== id && onIdOf(p) !== id) {
            kept.push(p)
          }
        }
        target.placements = kept
      }
      remember(before)
    } catch (error) {
      problem(reasonOf(error), 'Could not remove it')
    }
  })
}

// Remove every appliance and piece of furniture from the selected room.
async function clearRoomItems() {
  const room = selectedRoom.value
  if (!room) {
    return
  }
  const roomId = String(room._id)

  const listedIds = []
  for (const item of roomItems.value) {
    listedIds.push(item.id)
  }

  const yes = await dialog.value.confirm({
    title: `Clear the ${room.name}?`,
    message: 'This removes every appliance and piece of furniture in this room. Countertops, doors and windows stay. You can undo it afterwards.',
    okText: 'Clear room',
    danger: true,
  })
  if (!yes) {
    return
  }

  return enqueue(async function () {
    const before = snapshot()
    try {
      // keep what is not in the list, and the countertops
      const kept = []
      for (const p of roomOf(roomId).placements) {
        if (listedIds.indexOf(String(p._id)) === -1 || isCountertop(p)) {
          kept.push(p)
        }
      }
      const keptIds = []
      for (const p of kept) {
        keptIds.push(String(p._id))
      }

      // something that sat on a removed item goes too
      const final = []
      for (const p of kept) {
        if (!p.onPlacementId || keptIds.indexOf(String(p.onPlacementId)) !== -1) {
          final.push(p)
        }
      }

      const result = await saveRoomPlacements(roomId, final, planScope())
      roomOf(roomId).placements = result.placements
      remember(before)
    } catch (error) {
      problem(reasonOf(error), 'Could not clear the room')
    }
  })
}

// The remove button (✕) on a row: remove the item, but do not select the row.
function onRemoveClick(event, id) {
  event.stopPropagation()
  removeItem(id)
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================

// Is the user typing in a text field? Then the shortcuts must not react.
function isTyping(event) {
  const target = event.target
  if (!target) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

// Ctrl+Z = undo, Ctrl+Shift+Z or Ctrl+Y = redo, Delete = remove the selected item.
function onKey(event) {
  if (isTyping(event) || event.altKey) {
    return
  }
  const withCtrl = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()
  const isDelete = event.key === 'Delete' || event.key === 'Backspace'

  if (withCtrl && key === 'z') {
    event.preventDefault()
    if (event.shiftKey) {
      redo()
    } else {
      undo()
    }
  } else if (withCtrl && key === 'y') {
    event.preventDefault()
    redo()
  } else if (!withCtrl && isDelete && selectedItemId.value && isListedItem(selectedItemId.value)) {
    event.preventDefault()
    removeItem(selectedItemId.value)
  } else if (!withCtrl && isDelete && selectedOpening.value) {
    event.preventDefault()
    removeSelectedOpening()
  }
}

// ============================================================
// WHEN THE PAGE OPENS AND CLOSES
// ============================================================

onMounted(loadAll)

onMounted(function () {
  window.addEventListener('keydown', onKey)
  window.addEventListener('pagehide', flushHistory)

  // the navigation bar changes height when the window is resized or its menu opens or closes
  window.addEventListener('resize', measureNav)
  document.addEventListener('shown.bs.collapse', measureNav)
  document.addEventListener('hidden.bs.collapse', measureNav)
  measureNav()

  document.documentElement.classList.add('no-page-scroll')
})

onUnmounted(function () {
  clearTimeout(loaderTimer)
  clearTimeout(loaderFadeTimer)
  clearTimeout(sceneTimer)
  flushHistory()
  window.removeEventListener('pagehide', flushHistory)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', measureNav)
  document.removeEventListener('shown.bs.collapse', measureNav)
  document.removeEventListener('hidden.bs.collapse', measureNav)
  document.documentElement.classList.remove('no-page-scroll')
})
</script>

<style>
@media (min-width: 992px) and (min-height: 521px) {
  html.no-page-scroll,
  html.no-page-scroll body {
    overflow: hidden;
    overscroll-behavior: none;
  }
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

.recs-card {
  --adv: var(--eco-light); --adv-bg: #e9f7ef; --adv-ink: #0f6b44;
  max-height: max(46%, 250px); display: flex; flex-direction: column; min-height: 0;
  padding: 10px 14px 12px;
  border-left: 4px solid var(--adv);
}
/* colour coding: recommendation = amber, NEA = green, tips = blue */
.recs-card.recs-rec { --adv: #f59e0b; --adv-bg: #fff4de; --adv-ink: #9a5b00; }
.recs-card.recs-nea { --adv: #16a46a; --adv-bg: #e3f6ec; --adv-ink: #0f6b44; }
.recs-card.recs-tip { --adv: #3b82f6; --adv-bg: #e6f0ff; --adv-ink: #1d4fa8; }

.recs-tabs { flex: 0 0 auto; display: flex; gap: 2px; margin-bottom: 8px; padding: 2px; border-radius: 999px; background: #eef4f0; }
.recs-tab {
  flex: 1 1 auto; display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 4px 10px; border: 0; border-radius: 999px; background: transparent;
  color: #5d6f65; font-size: 0.76rem; font-weight: 700; line-height: 1.3; white-space: nowrap; cursor: pointer;
}
.recs-tab.active { background: #fff; color: var(--ink); box-shadow: 0 1px 4px rgba(15, 34, 25, 0.14); }
.recs-tab-count {
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
  background: #dcebe2; color: var(--eco-dark); font-size: 0.68rem; font-weight: 750; line-height: 18px; text-align: center;
}
.recs-tab.active .recs-tab-count { background: var(--adv-bg); color: var(--adv-ink); }

.recs-nav { flex: 0 0 auto; display: flex; align-items: center; gap: 2px; margin-bottom: 6px; }
.recs-count { min-width: 34px; text-align: center; font-size: 0.74rem; font-weight: 700; color: #5d6f65; font-variant-numeric: tabular-nums; }
.recs-arrow {
  display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0;
  border: 1px solid var(--line); border-radius: 50%; background: #fff; color: var(--ink); cursor: pointer;
}
.recs-arrow:hover:not(:disabled) { background: var(--adv-bg); border-color: var(--adv); }
.recs-arrow:disabled { opacity: 0.35; cursor: default; }
.recs-action {
  margin-left: auto; padding: 3px 12px; border: 1px solid var(--line); border-radius: 999px;
  background: #fff; color: var(--ink); font-size: 0.74rem; font-weight: 700; white-space: nowrap; cursor: pointer;
}
.recs-action:hover:not(:disabled) { border-color: var(--adv); background: var(--adv-bg); }
.recs-action:disabled { opacity: 0.7; cursor: default; }
.recs-action-primary { border-color: transparent; background: var(--eco-dark); color: #fff; }
.recs-action-primary:hover:not(:disabled) { background: var(--eco); border-color: transparent; }

.source-badge {
  display: inline-block; margin-right: 6px; padding: 0 8px; border-radius: 999px; vertical-align: 1px;
  background: var(--adv-bg); color: var(--adv-ink); font-size: 0.62rem; font-weight: 780; letter-spacing: 0.4px; line-height: 1.7; text-transform: uppercase;
}
.recs-title { flex: 0 0 auto; margin-bottom: 4px; font-size: 0.88rem; font-weight: 720; color: var(--ink); line-height: 1.35; }

.recs-scroll { flex: 1 1 auto; overflow-y: auto; min-height: 5.5em; padding-right: 4px; }
.recs-text { margin: 0; font-size: 0.85rem; line-height: 1.55; color: #3d4f45; }
.recs-empty { padding: 8px 2px 2px; font-size: 0.82rem; color: #5d6f65; }

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

/* Laptops and small desktops: the sidebar gets a little narrower */
@media (max-width: 1199px) {
  .side-column { flex-basis: 288px; width: 288px; }
}

.layer-short { display: none; }

/* Tablets, phones and short (landscape) screens: the page scrolls.
   The 3D view keeps a fixed height, then the energy card, recommendations, room
   breakdown and catalogue stack underneath it. */
@media (max-width: 991px), (max-height: 520px) {
  .spatial-page {
    height: auto;
    min-height: calc(100dvh - var(--nav-h, 72px));
    overflow: visible;
    padding: 10px 14px 18px;
    gap: 12px;
  }
  /* The sky is fixed to the page, so it still fills the window while scrolling */
  .spatial-sky { position: fixed; top: var(--nav-h, 72px); }

  .spatial-body { flex: 0 0 auto; flex-direction: column; gap: 12px; }
  .canvas-card { flex: 0 0 auto; height: clamp(320px, 56dvh, 640px); border-radius: 18px; }
  .canvas-messages { bottom: 64px; }

  .side-column { flex: 0 0 auto; width: auto; min-height: auto; }
  .stat-value { font-size: 2rem; }
  .recs-card { max-height: none; }
  .recs-scroll { max-height: 240px; flex: 0 1 auto; }
  .items-card { flex: 0 0 auto; }
  .item-list, .breakdown-list { flex: 0 0 auto; overflow: visible; }

  .dock-body { height: 300px; }

  /* Finger-sized tap targets */
  .hist-btn { width: 40px; height: 38px; }
  .tools-btn { height: 38px; }
  .layer-pill { padding-top: 8px; padding-bottom: 8px; }
  .lock-switch { padding-top: 7px; padding-bottom: 7px; }
  .btn-remove { width: 34px; height: 34px; opacity: 1; }
  .breakdown-row { padding-top: 10px; padding-bottom: 10px; }
  .item-row { padding: 11px; }
}

/* Tablets: energy card on top, recommendations and rooms side by side */
@media (min-width: 640px) and (max-width: 991px) and (min-height: 521px) {
  .side-column { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
  .side-column > .stat-card,
  .side-column > .items-card,
  .side-column > .panel-card:not(.recs-card) { grid-column: 1 / -1; }
  /* when there are recommendations, they sit beside the room list */
  .side-column > .recs-card + .items-card { grid-column: auto; }
  .canvas-card { height: clamp(380px, 52dvh, 640px); }
}

/* Phones */
@media (max-width: 639px) {
  .spatial-page { padding: 8px 10px 16px; gap: 10px; }
  .spatial-toolbar { gap: 8px; }
  .spatial-toolbar > :last-child { flex: 1 1 100%; justify-content: stretch; gap: 8px; }
  .page-title { font-size: 1.1rem; }
  .scope-picker { flex: 1 1 100%; }
  .scope-select { flex: 1 1 auto; max-width: none; }
  .layer-group { flex: 1 1 100%; justify-content: space-between; }
  .layer-pill { flex: 1 1 0; justify-content: center; padding-left: 6px; padding-right: 8px; font-size: 0.78rem; }
  .layer-full { display: none; }
  .layer-short { display: inline; }
  .lock-switch { flex: 1 1 auto; justify-content: space-between; }
  .history-group { flex: 1 1 auto; justify-content: space-between; }
  .canvas-card { height: clamp(300px, 54dvh, 520px); }
  .dock-body { height: 280px; }
  .panel-card { padding: 12px; }
}

/* Phone held sideways */
@media (max-height: 520px) {
  .canvas-card { height: max(260px, calc(100dvh - var(--nav-h, 72px) - 24px)); }
  .canvas-messages { bottom: 12px; }
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