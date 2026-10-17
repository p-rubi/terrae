/* Terrae downloader. Reads the data repository's manifest (the same one the QGIS plugin reads) and offers what it
   lists: the world or a selection, as GeoPackage. A whole country is its file in the repository; single divisions are
   cut out of their country's file in the browser. No server. */
(function () {
  'use strict';
  const CFG = window.TERRAE || {};
  const ROOT = CFG.dataRoot;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fmtBytes = (b) => (b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' kB');
  const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const cap = (s) => s[0].toUpperCase() + s.slice(1);

  const LINK_LIMIT = 150e6;      // a single file above this is opened as a link, not held in memory
  const ZIP_LIMIT = 1.2e9;       // several files above this are not zipped in the browser
  const DATASET = { reference: 'adm0', de_facto: 'adm0_de_facto', disputes: 'adm0_disputes' };
  // where each dataset is drawn: [tile source, layer in it, the property that is its key]
  const TILES = { adm0: ['t', 'reference', 'key'], adm0_de_facto: ['t', 'de_facto', 'key'], adm0_disputes: ['t', 'disputes', 'key'],
    adm1: ['a1', 'adm1', 'id'], adm2: ['a2', 'adm2', 'id'] };
  const HINT = {
    adm: { adm0: 'Countries, territories and special areas.', adm1: 'The first-level administrative divisions of each country (ADM1), as that country defines them; they tile the countries exactly.',
      adm2: 'The second-level administrative divisions (ADM2), within each first-level division and tiling it exactly.' },
    view: { reference: 'The partition: every point of land in exactly one country or territory.',
      de_facto: 'The world as administered: occupied and administered areas with their administrators; de facto authorities as features.',
      disputes: 'Occupied, claimed and disputed areas and Antarctic claims, with who administers and who claims each.' },
    geometry: { polygons: 'One polygon feature per unit, with names, codes and area.', lines: 'Each boundary once, classified: border, internal boundary or coastline.' },
    coverage: { world: 'One file for the whole world.' },
  };
  const DISPUTE = { occupied: ['#d9893b', 'Occupied'], claimed: ['#e0b25c', 'Claimed'], disputed: ['#9f86d0', 'Disputed'],
    de_facto: ['#5fae8c', 'De facto administration'], antarctic_claim: ['#8c97a6', 'Antarctic claim'] };

  let M = null;                  // the manifest
  let map = null;
  let busy = false;
  let query = '';
  const state = { adm: 'adm0', view: 'reference', geometry: 'polygons', detail: 'low', coverage: 'world' };
  // per dataset: id -> { kind: 'entity' | 'division', unit, name }
  const selection = { adm0: new Map(), adm0_de_facto: new Map(), adm0_disputes: new Map(), adm1: new Map(), adm2: new Map() };

  const dsId = () => (state.adm === 'adm0' ? DATASET[state.view] : state.adm);
  const ds = () => M.datasets.find((d) => d.id === dsId());
  const sel = () => selection[dsId()];
  const divisions = () => state.adm !== 'adm0';
  const entities = () => M.entities[ds().entities];
  const unitName = (k) => { const u = M.entities.units.find((x) => x.key === k); return u ? u.name : k; };
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // ---- what the choice means in files ----------------------------------------------------------------------------
  function fileUrl(pattern, key) {
    const d = ds();
    return ROOT + d.trees[state.detail] + pattern.replace('{level}', state.detail).replace('{geometry}', state.geometry)
      .replace('{key}', key || '').replace('{format}', 'gpkg');
  }
  function plan() {
    const d = ds(), lv = state.detail, g = state.geometry, stem = `terrae-${d.id}-${M.version}-${lv}-${g}`;
    if (state.coverage === 'world') {
      const w = ((d.world_files[lv] || {})[g] || {}).gpkg;
      return w ? [{ name: `${stem}.gpkg`, url: fileUrl(d.world), bytes: w.bytes }] : [];
    }
    const sizes = (d.place_bytes[lv] || {})[g] || {};
    const whole = [], parts = {};
    for (const [id, v] of sel()) { if (v.kind === 'entity') whole.push(id); else (parts[v.unit] = parts[v.unit] || []).push(id); }
    const out = whole.filter((k) => k in sizes).sort().map((k) => ({ name: `${stem}-${k}.gpkg`, url: fileUrl(d.place, k), bytes: sizes[k] }));
    for (const u of Object.keys(parts).sort()) {
      if (whole.includes(u) || !(u in sizes)) continue;
      out.push({ name: `${stem}-${u}-${parts[u].length}-selected.gpkg`, url: fileUrl(d.place, u), bytes: sizes[u], ids: parts[u] });
    }
    return out;
  }

  // ---- single divisions: a new GeoPackage with the chosen rows of the country's file ---------------------------------
  let sqlite = null;
  async function extract(bytes, ids) {
    sqlite = sqlite || initSqlJs({ locateFile: (f) => 'vendor/' + f });
    const SQL = await sqlite;
    const d = ds(), table = d.tables[state.geometry], fields = d.filter_fields[state.geometry][state.adm];
    const src = new SQL.Database(bytes), dst = new SQL.Database();
    try {
      dst.run('PRAGMA application_id = 1196444487');                       // "GPKG"
      dst.run('PRAGMA user_version = ' + src.exec('PRAGMA user_version')[0].values[0][0]);
      const list = ids.map((i) => "'" + String(i).replace(/'/g, "''") + "'").join(',');
      // every table but the spatial index, which a reader rebuilds or does without
      const tables = src.exec("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'rtree_%' AND name NOT LIKE 'sqlite_%'")[0].values;
      for (const [name, sql] of tables) {
        dst.run(sql);
        const where = name === table ? ' WHERE ' + fields.map((f) => `"${f}" IN (${list})`).join(' OR ') : '';
        const read = src.prepare(`SELECT * FROM "${name}"${where}`);
        let write = null;
        dst.run('BEGIN');
        while (read.step()) {
          const row = read.get();
          write = write || dst.prepare(`INSERT INTO "${name}" VALUES (${row.map(() => '?').join(',')})`);
          write.run(row);
        }
        dst.run('COMMIT');
        read.free();
        if (write) write.free();
      }
      const names = tables.map((t) => t[0]);
      if (names.includes('gpkg_extensions')) dst.run("DELETE FROM gpkg_extensions WHERE extension_name = 'gpkg_rtree_index'");
      if (names.includes('gpkg_ogr_contents')) dst.run(`UPDATE gpkg_ogr_contents SET feature_count = (SELECT count(*) FROM "${table}")`);
      return dst.export();
    } finally { src.close(); dst.close(); }
  }

  // ---- downloading ------------------------------------------------------------------------------------------------
  function save(bytes, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(bytes instanceof Blob ? bytes : new Blob([bytes], { type: 'application/geopackage+sqlite3' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function progress(done, total) {
    const b = $('bar');
    b.classList.toggle('on', done < total);
    b.firstElementChild.style.width = (100 * done / Math.max(total, 1)) + '%';
  }
  async function produce(f) {
    const r = await fetch(f.url);
    if (!r.ok) throw new Error(`${f.name}: the repository answered ${r.status}`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    return f.ids ? extract(bytes, f.ids) : bytes;
  }
  const licence = (fs) => [`Terrae ${M.version}: ${ds().title}, ${state.geometry}, level of detail ${state.detail}`, '',
    `Data ${M.attribution}`, 'Open Database License 1.0: https://opendatacommons.org/licenses/odbl/1-0/',
    'Boundaries and names shown do not imply endorsement or acceptance.', '', 'Files:', ...fs.map((f) => '  ' + f.name), ''].join('\n');

  async function run(task) {
    if (busy) return;
    busy = true;
    $('notice').hidden = true;
    $('go').disabled = $('each').disabled = true;
    try { await task(); } catch (e) { $('notice').hidden = false; $('notice').textContent = 'The download failed: ' + e.message; }
    finally { progress(1, 1); busy = false; render(); }
  }
  function download(oneByOne) {
    const fs = plan();
    if (!fs.length) return;
    const total = fs.reduce((a, f) => a + f.bytes, 0);
    if (fs.length === 1 && !fs[0].ids && fs[0].bytes > LINK_LIMIT) { location.href = fs[0].url; return; }
    run(async () => {
      let done = 0;
      progress(0, total);
      const entries = {};
      for (const f of fs) {
        const bytes = await produce(f);
        done += f.bytes;
        progress(done, total);
        if (fs.length === 1 || oneByOne) { save(bytes, f.name); await new Promise((r) => setTimeout(r, 350)); } else entries[f.name] = bytes;
      }
      if (fs.length > 1 && !oneByOne) {
        entries['LICENCE.txt'] = fflate.strToU8(licence(fs));
        const zip = await new Promise((res, rej) => fflate.zip(entries, { level: 6 }, (err, data) => (err ? rej(err) : res(data))));
        save(new Blob([zip], { type: 'application/zip' }), `terrae-${ds().id}-${M.version}-${state.detail}-${state.geometry}-${fs.length}-files.zip`);
      }
    });
  }
  window.TerraeDownloader = { plan, extract, state, selection, map: () => map };
  // ---- the panel ---------------------------------------------------------------------------------------------------
  function toggle(id, item, fit) {
    state.coverage = 'selection';
    if (sel().has(id)) sel().delete(id); else { sel().set(id, item); if (fit) fitTo(fit); }
    render();
  }
  function renderList() {
    const q = norm(query.trim());
    const d = ds();
    const list = entities().filter((p) => !q || norm(p.name).includes(q) || norm(p.key).includes(q) || (p.iso_a2 && norm(p.iso_a2) === q));
    $('list').innerHTML = list.length ? list.map((p) => {
      const n = divisions() ? (p[d.id] || 0) : 0;
      const code = divisions() ? `${n.toLocaleString('en-GB')} ${n === 1 ? 'feature' : 'features'}` : (p.code_a3 || p.iso_a3 || p.key);
      return `<li role="option" data-key="${esc(p.key)}" aria-selected="${sel().has(p.key)}"><span class="chk"></span><span class="nm">${esc(p.name)}</span><span class="code">${esc(code)}</span></li>`;
    }).join('') : '<li class="empty">Nothing matches</li>';
    $('sel-count').textContent = sel().size ? `${sel().size} selected` : '';
    $('chips').innerHTML = Array.from(sel()).map(([id, v]) => {
      const sub = v.kind === 'division' ? unitName(v.unit) : divisions() ? 'all divisions' : '';
      return `<span class="chip">${esc(v.name)}${sub ? ` <small>${esc(sub)}</small>` : ''}<button type="button" data-drop="${esc(id)}" aria-label="Remove ${esc(v.name)}">×</button></span>`;
    }).join('');
  }
  function render() {
    if (busy) return;
    const d = ds();
    if (!(state.detail in d.trees)) state.detail = M.level_order[0];
    document.querySelectorAll('[data-field]').forEach((g) => g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(state[g.dataset.field] === b.value))));
    $('f-view').hidden = divisions();
    $('h-adm').textContent = HINT.adm[state.adm] + ' ' + d.features.toLocaleString('en-GB') + ' features.';
    $('h-view').textContent = HINT.view[state.view];
    $('h-geometry').textContent = HINT.geometry[state.geometry];
    const L = M.levels[state.detail];
    $('h-detail').textContent = `${L.label}. ${L.scale}.` + ((d.level_notes || {})[state.detail] ? ' ' + d.level_notes[state.detail] : '');
    const what = state.view === 'disputes' && !divisions() ? 'areas' : 'countries';
    $('h-coverage').textContent = state.coverage === 'world' ? HINT.coverage.world
      : divisions() ? 'Click a division on the map to take it alone, or a country in the list to take all its divisions.'
        : `Click ${what} on the map or in the list.`;
    $('l-picker').textContent = divisions() ? 'Countries (all their divisions)' : state.view === 'disputes' ? 'Disputed areas'
      : state.view === 'de_facto' ? 'Countries, territories and authorities' : 'Countries and territories';
    $('f-picker').hidden = state.coverage !== 'selection';
    if (state.coverage === 'selection') renderList();

    const fs = plan(), total = fs.reduce((a, f) => a + f.bytes, 0), many = fs.length > 1, cut = fs.some((f) => f.ids);
    $('total').textContent = state.coverage === 'world' ? 'Whole world'
      : !sel().size ? 'Nothing selected yet'
        : `${sel().size} selected · ${fs.length} ${fs.length === 1 ? 'file' : 'files'}`;
    $('size').textContent = fs.length ? (cut ? 'from ' : '') + fmtBytes(total) : '';
    $('go').disabled = !fs.length || (many && total > ZIP_LIMIT);
    $('go').textContent = many ? `Download ${fs.length} files as a zip` : 'Download';
    $('each').hidden = !many;
    const n = $('notice');
    n.hidden = !(many && total > ZIP_LIMIT);
    if (!n.hidden) n.textContent = 'Too large to zip in the browser: use the files one by one, or the whole world.';
    $('clear').hidden = !(state.coverage === 'selection' && sel().size);
    drawMap();
    drawLegend();
    const q = new URLSearchParams(state);
    history.replaceState(null, '', '?' + q.toString());
  }
  function drawLegend() {
    const sw = (c, t) => `<span><i style="background:${c}"></i>${esc(t)}</span>`;
    let h = '';
    if (!divisions() && state.view === 'disputes') h = Object.values(DISPUTE).map(([c, t]) => sw(c, t)).join('');
    else if (!divisions() && state.view === 'de_facto') h = sw(css('--land'), 'As administered') + sw(css('--land-alt'), 'De facto authority');
    else h = sw(css('--land'), divisions() ? 'Division' : 'Country or territory');
    $('legend').innerHTML = h + sw(css('--select'), 'Selected');
  }

  // ---- the map -----------------------------------------------------------------------------------------------------
  const WORLD = [[-180, -60], [180, 80]];
  let hover = null, boxing = null;
  function fitTo(b) {
    if (!b || b[2] - b[0] > 300) return;
    map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 70, maxZoom: 7, duration: 700 });
  }
  function createMap() {
    const protocol = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    const web = ROOT + 'web/' + M.version + '/';
    const adm0 = M.datasets.find((d) => d.id === 'adm0');
    map = new maplibregl.Map({
      container: 'map', bounds: WORLD, fitBoundsOptions: { padding: 24 }, minZoom: 0, maxZoom: 9.5, renderWorldCopies: false,
      attributionControl: false, dragRotate: false, pitchWithRotate: false,
      style: { version: 8, projection: { type: 'mercator' }, sources: {
        t: { type: 'vector', url: 'pmtiles://' + ROOT + adm0.trees.medium + 'tiles/terrae-adm0-' + M.version + '-viewer.pmtiles' },
        a1: { type: 'vector', url: 'pmtiles://' + web + 'adm1.pmtiles' },
        a2: { type: 'vector', url: 'pmtiles://' + web + 'adm2.pmtiles' },
      }, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': css('--sea') } }] },
    });
    // what a test reads: how much is drawn once the map is idle, and any error of the map
    map.on('idle', () => { document.documentElement.dataset.drawn = String(map.queryRenderedFeatures().length); });
    map.on('error', (e) => { document.documentElement.dataset.mapError = String((e.error && e.error.message) || e.error || e); });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.AttributionControl({ compact: false,
      customAttribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a> · Terrae' }), 'bottom-right');
    return new Promise((resolve) => map.once('load', () => {
      const land = css('--land'), alt = css('--land-alt'), line = css('--border'), pick = css('--select'), ink = css('--ink');
      const w = (a, b, c) => ['interpolate', ['linear'], ['zoom'], 0, a, 4, b, 8, c];
      const add = (id, type, source, layer, paint, extra) => map.addLayer(Object.assign({ id, type, source, 'source-layer': layer, paint }, extra || {}));
      add('land', 'fill', 't', 'reference', { 'fill-color': land });
      add('df-fill', 'fill', 't', 'de_facto', { 'fill-color': ['case', ['==', ['get', 'kind'], 'authority'], alt, land] });
      const dc = ['match', ['get', 'kind']];
      for (const [k, v] of Object.entries(DISPUTE)) dc.push(k, v[0]);
      dc.push('#888888');
      add('dis-fill', 'fill', 't', 'disputes', { 'fill-color': dc, 'fill-opacity': 0.72 });
      for (const [id, [source, layer]] of Object.entries(TILES)) {
        add('hit-' + id, 'fill', source, layer, { 'fill-color': '#000000', 'fill-opacity': 0 });
        add('sel-' + id, 'fill', source, layer, { 'fill-color': pick, 'fill-opacity': 0.85 }, { filter: ['==', '1', '0'] });
      }
      add('a2-line', 'line', 'a2', 'adm2', { 'line-color': line, 'line-opacity': 0.55, 'line-width': w(0.1, 0.25, 0.6) });
      add('a1-line', 'line', 'a1', 'adm1', { 'line-color': line, 'line-opacity': 0.9, 'line-width': w(0.2, 0.5, 1) });
      add('c-line', 'line', 't', 'reference', { 'line-color': '#8d97a8', 'line-width': w(0.4, 0.9, 1.5) });
      add('df-line', 'line', 't', 'de_facto', { 'line-color': '#8d97a8', 'line-width': w(0.4, 0.9, 1.5) });
      add('dis-line', 'line', 't', 'disputes', { 'line-color': '#c9d1dc', 'line-opacity': 0.6, 'line-width': 0.8, 'line-dasharray': [3, 2] });
      for (const [id, [source, layer]] of Object.entries(TILES)) add('hov-' + id, 'line', source, layer, { 'line-color': ink, 'line-width': 1.6 }, { filter: ['==', '1', '0'] });
      map.fitBounds(WORLD, { padding: 24, duration: 0 });
      resolve();
    }));
  }
  function drawMap() {
    if (!map || !map.getLayer('land')) return;
    const id = dsId(), key = TILES[id][2];
    const vis = (l, on) => map.setLayoutProperty(l, 'visibility', on ? 'visible' : 'none');
    const view = divisions() ? 'reference' : state.view;
    vis('land', view !== 'de_facto'); vis('c-line', view !== 'de_facto');
    vis('df-fill', view === 'de_facto'); vis('df-line', view === 'de_facto');
    vis('dis-fill', view === 'disputes'); vis('dis-line', view === 'disputes');
    map.setPaintProperty('land', 'fill-opacity', view === 'disputes' ? 0.55 : 1);
    vis('a1-line', divisions()); vis('a2-line', state.adm === 'adm2');
    for (const k of Object.keys(TILES)) { vis('hit-' + k, k === id); vis('sel-' + k, k === id); vis('hov-' + k, k === id); }
    const on = state.coverage === 'selection';
    const ids = [], units = [];
    if (on) for (const [k, v] of sel()) (divisions() && v.kind === 'entity' ? units : ids).push(k);
    const f = ['any', ['in', ['get', key], ['literal', ids]]];
    if (divisions()) f.push(['in', ['get', 'unit'], ['literal', units]]);
    map.setFilter('sel-' + id, f);
  }
  function featureAt(point) { return map.queryRenderedFeatures(point, { layers: ['hit-' + dsId()] })[0] || null; }
  function itemOf(f) {
    const p = f.properties, key = p[TILES[dsId()][2]];
    return [key, divisions() ? { kind: 'division', unit: p.unit, name: p.name } : { kind: 'entity', unit: key, name: p.name }];
  }
  function wireMap() {
    const tip = $('tip'), wrap = document.querySelector('.map-wrap');
    map.on('mousemove', (e) => {
      if (boxing) return;
      const f = featureAt(e.point), id = dsId(), key = TILES[id][2];
      map.getCanvas().style.cursor = f ? 'pointer' : '';
      const k = f ? f.properties[key] : null;
      if (k !== hover) { hover = k; map.setFilter('hov-' + id, k == null ? ['==', '1', '0'] : ['==', ['get', key], k]); }
      if (!f) { tip.classList.remove('on'); return; }
      const p = f.properties;
      const sub = divisions() ? unitName(p.unit) : state.view === 'disputes' ? (DISPUTE[p.kind] || ['', p.kind])[1] : p.key;
      tip.innerHTML = `${esc(p.name)}<small>${esc(sub)}</small>`;
      tip.classList.add('on');
      const x = e.point.x + 14 + tip.offsetWidth > wrap.clientWidth ? e.point.x - tip.offsetWidth - 14 : e.point.x + 14;
      tip.style.left = x + 'px';
      tip.style.top = Math.max(8, e.point.y - 34) + 'px';
    });
    map.on('mouseout', () => { tip.classList.remove('on'); if (hover != null) { hover = null; map.setFilter('hov-' + dsId(), ['==', '1', '0']); } });
    map.on('click', (e) => { if (boxing) return; const f = featureAt(e.point); if (f) toggle(...itemOf(f)); });

    // selection by box: drag a rectangle, everything drawn inside it is added
    const box = $('box'), cont = map.getCanvasContainer();
    const at = (ev) => { const r = cont.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    const end = () => { boxing = null; box.setAttribute('aria-pressed', 'false'); box.textContent = 'Select by box'; wrap.classList.remove('boxing'); map.dragPan.enable(); };
    box.addEventListener('click', () => {
      if (boxing) return end();
      boxing = {}; box.setAttribute('aria-pressed', 'true'); box.textContent = 'Drag on the map'; wrap.classList.add('boxing'); map.dragPan.disable();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && boxing) end(); });
    cont.addEventListener('pointerdown', (ev) => {
      if (!boxing) return;
      boxing.a = at(ev); boxing.el = document.createElement('div'); boxing.el.className = 'box-rect'; wrap.appendChild(boxing.el);
      cont.setPointerCapture(ev.pointerId); ev.preventDefault();
    });
    cont.addEventListener('pointermove', (ev) => {
      if (!boxing || !boxing.a) return;
      const b = at(ev), a = boxing.a, s = boxing.el.style;
      s.left = Math.min(a[0], b[0]) + 'px'; s.top = Math.min(a[1], b[1]) + 'px'; s.width = Math.abs(b[0] - a[0]) + 'px'; s.height = Math.abs(b[1] - a[1]) + 'px';
    });
    cont.addEventListener('pointerup', (ev) => {
      if (!boxing || !boxing.a) return;
      const a = boxing.a, b = at(ev);
      boxing.el.remove();
      end();
      if (Math.abs(b[0] - a[0]) < 4 && Math.abs(b[1] - a[1]) < 4) return;
      const hits = map.queryRenderedFeatures([[Math.min(a[0], b[0]), Math.min(a[1], b[1])], [Math.max(a[0], b[0]), Math.max(a[1], b[1])]], { layers: ['hit-' + dsId()] });
      state.coverage = 'selection';
      for (const f of hits) { const [k, item] = itemOf(f); sel().set(k, item); }
      render();
    });
    $('proj').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      map.setProjection({ type: b.value });
      if (b.value === 'globe' && map.getZoom() < 1.6) map.easeTo({ zoom: 1.6, duration: 500 });
      if (b.value === 'mercator') map.fitBounds(WORLD, { padding: 24, duration: 500 });
      $('proj').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
  }

  // ---- start -------------------------------------------------------------------------------------------------------
  async function start() {
    const repo = await (await fetch(ROOT + 'repository.json')).json();
    M = await (await fetch(ROOT + repo.releases.find((r) => r.version === repo.latest).manifest)).json();
    $('release').textContent = M.version;
    $('detail-seg').innerHTML = M.level_order.map((lv) => `<button type="button" value="${lv}">${cap(lv)}</button>`).join('');
    const L = CFG.links || {};
    $('links').innerHTML = Object.entries(L).map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`).join('');
    const q = new URLSearchParams(location.search);
    for (const k of Object.keys(state)) if (q.get(k)) state[k] = q.get(k);
    if (!['adm0', 'adm1', 'adm2'].includes(state.adm)) state.adm = 'adm0';
    if (!DATASET[state.view]) state.view = 'reference';
    if (!M.levels[state.detail]) state.detail = M.level_order[0];
    state.coverage = 'world';

    document.querySelectorAll('[data-field]').forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      state[g.dataset.field] = b.value;
      render();
    }));
    $('search').addEventListener('input', (e) => { query = e.target.value; renderList(); });
    $('list').addEventListener('click', (e) => {
      const li = e.target.closest('li[data-key]');
      if (!li) return;
      const p = entities().find((x) => x.key === li.dataset.key);
      toggle(p.key, { kind: 'entity', unit: p.key, name: p.name }, p.bbox);
    });
    $('chips').addEventListener('click', (e) => { const k = e.target.dataset && e.target.dataset.drop; if (k) { sel().delete(k); render(); } });
    $('clear').addEventListener('click', () => { sel().clear(); render(); });
    $('go').addEventListener('click', () => download(false));
    $('each').addEventListener('click', () => download(true));
    render();
    await createMap();
    wireMap();
    $('loading').hidden = true;
    drawMap();
  }
  start().catch((e) => { $('loading').textContent = 'The data repository could not be read: ' + e.message; });
})();