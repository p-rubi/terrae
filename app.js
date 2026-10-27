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

  const LINK_LIMIT = 150e6;      // a whole file above this is saved by the browser straight from the repository, never held in memory
  const CUT_LIMIT = 400e6;       // a country file above this is not opened in the browser to take single divisions out of it
  const ZIP_LIMIT = 1.2e9;       // several files above this are not zipped in the browser
  const DATASET = { reference: 'adm0', de_facto: 'adm0_de_facto', disputes: 'adm0_disputes' };
  // where each dataset is drawn: [tile source, layer in it, the property that is its key]. One tile file holds them all.
  const TILES = { adm0: ['v', 'reference', 'key'], adm0_de_facto: ['v', 'de_facto', 'key'], adm0_disputes: ['v', 'disputes', 'key'],
    adm1: ['v', 'adm1', 'id'], adm2: ['v', 'adm2', 'id'] };
  const TILE_CACHE = 96e6;       // bytes of tiles kept in memory, so that going back to a place reads nothing again
  const HINT = {
    adm: { adm0: 'ADM0: countries, territories and special areas.', adm1: 'ADM1: the first-level administrative divisions of each country, as that country defines them; they tile the countries exactly.',
      adm2: 'ADM2: the second-level administrative divisions, within each first-level division and tiling it exactly.' },
    view: { reference: 'Reference: the territorial status quo of international reference. Where the UN General Assembly or Security Council '
        + 'has taken a position, the boundaries follow it; otherwise, the authority that administers the land. Every point of land is in exactly '
        + 'one country or territory. The one representation with first- and second-level divisions (ADM1, ADM2).',
      de_facto: 'De facto: the world as it is administered on the ground. Occupied and annexed areas go with the authority that controls them, '
        + 'and de facto authorities are features of their own. It describes administration, not sovereignty. Countries level (ADM0) only.',
      disputes: 'Disputed areas: only the areas under dispute (occupied, claimed or disputed land, and the Antarctic claims), each with who '
        + 'administers it, who claims it and on what basis. A layer to combine as each map needs, for example merged with the reference or '
        + 'de facto countries. Countries level (ADM0) only.' },
    geometry: { polygons: 'One polygon feature per unit, with names, codes and area.', lines: 'Each boundary once, classified: border, internal boundary or coastline.' },
    coverage: { world: 'One file for the whole world.' },
    format: { gpkg: 'GeoPackage: one indexed file per layer, what QGIS and most GIS read best. Every level of detail.',
      geojson: 'GeoJSON (RFC 7946), for the web and scripts: the files of the release, made from the same data as the GeoPackage, '
        + 'coordinates to 7 decimals (about 1 cm). Published for the Low and Medium levels of detail.' },
    also: 'The same places at the other levels, in the same download: a whole country at every level; a division with the divisions it holds or the one it is part of.',
  };
  const LEVEL_NAME = { adm0: 'ADM0', adm1: 'ADM1', adm2: 'ADM2' };
  const INFO = '<span class="i" aria-hidden="true">i</span>';
  const FORMAT = { gpkg: ['GeoPackage', '.gpkg', 'application/geopackage+sqlite3'], geojson: ['GeoJSON', '.geojson', 'application/geo+json'] };
  const DISPUTE = { occupied: ['#d9893b', 'Occupied'], claimed: ['#e0b25c', 'Claimed'], disputed: ['#9f86d0', 'Disputed'],
    de_facto: ['#5fae8c', 'De facto administration'], antarctic_claim: ['#8c97a6', 'Antarctic claim'] };

  let M = null;                  // the manifest
  let map = null;
  let busy = false;
  let query = '';
  const state = { adm: 'adm0', view: 'reference', geometry: 'polygons', detail: 'low', coverage: 'world', format: 'gpkg', also: '' };
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
  // the other levels the download takes with it (only for the reference partition: the other views have no divisions)
  const alsoLevels = () => (state.adm === 'adm0' && state.view !== 'reference') ? []
    : state.also.split(',').filter((a) => LEVEL_NAME[a] && a !== state.adm);
  const levelsOf = () => [dsId(), ...alsoLevels()];
  function fileUrl(d, pattern, key) {
    return ROOT + d.trees[state.detail] + pattern.replace('{level}', state.detail).replace('{geometry}', state.geometry)
      .replace('{key}', key || '').replace('{format}', state.format);
  }
  // does every dataset of the download publish this format at this level of detail (as a world file and per place)?
  const hasFormat = (fmt, lv) => levelsOf().every((id) => {
    const d = M.datasets.find((x) => x.id === id);
    return !d || ((d.formats[lv] || []).includes(fmt) && (d.place_formats[lv] || []).includes(fmt));
  });
  // the manifest gives the size of the GeoPackage of each place; another format is estimated from the world files
  function placeBytes(d, lv, g, gpkgBytes) {
    if (state.format === 'gpkg') return gpkgBytes;
    const w = (d.world_files[lv] || {})[g] || {}, a = w[state.format], b = w.gpkg;
    return a && b ? Math.round(gpkgBytes * a.bytes / b.bytes) : gpkgBytes;
  }
  function plan() {
    const lv = state.detail, g = state.geometry, out = [];
    for (const id of levelsOf()) {
      const d = M.datasets.find((x) => x.id === id);
      if (!d || !(lv in d.trees)) continue;
      const stem = `terrae-${d.id}-${M.version}-${lv}-${g}`;
      if (state.coverage === 'world') {
        const w = ((d.world_files[lv] || {})[g] || {})[state.format];
        if (w) out.push({ d, name: stem, url: fileUrl(d, d.world), bytes: w.bytes });
        continue;
      }
      const sizes = (d.place_bytes[lv] || {})[g] || {};
      const whole = new Set(), cut = {};
      const keep = (unit, field, value) => { (cut[unit] = cut[unit] || { field, ids: new Set() }).ids.add(value); };
      for (const [key, v] of sel()) {
        if (v.kind === 'entity') { whole.add(v.unit); continue; }
        // a division chosen on the map, taken at each level: its country, itself, what it holds or what holds it
        if (id === 'adm0') whole.add(v.unit);
        else if (id === state.adm) keep(v.unit, state.adm, key);
        else if (id === 'adm2' && state.adm === 'adm1') keep(v.unit, 'adm1', key);
        else if (id === 'adm1' && state.adm === 'adm2' && v.adm1) keep(v.unit, 'adm1', v.adm1);
      }
      for (const u of [...whole].sort()) if (u in sizes) out.push({ d, name: `${stem}-${u}`, url: fileUrl(d, d.place, u), bytes: placeBytes(d, lv, g, sizes[u]) });
      for (const u of Object.keys(cut).sort()) {
        if (whole.has(u) || !(u in sizes)) continue;
        const c = cut[u];
        out.push({ d, name: `${stem}-${u}-${c.ids.size}-selected`, url: fileUrl(d, d.place, u), bytes: placeBytes(d, lv, g, sizes[u]), ids: [...c.ids], field: c.field });
      }
    }
    for (const f of out) f.name += FORMAT[state.format][1];
    return out;
  }

  // ---- single divisions: a new GeoPackage with the chosen rows of the country's file ---------------------------------
  let sqlite = null;
  const sqlJs = () => (sqlite = sqlite || initSqlJs({ locateFile: (f) => 'vendor/' + f }));
  async function extract(bytes, f) {
    const SQL = await sqlJs();
    const table = f.d.tables[state.geometry], fields = f.d.filter_fields[state.geometry][f.field];
    const src = new SQL.Database(bytes), dst = new SQL.Database();
    try {
      dst.run('PRAGMA application_id = 1196444487');                       // "GPKG"
      dst.run('PRAGMA user_version = ' + src.exec('PRAGMA user_version')[0].values[0][0]);
      const list = f.ids.map((i) => "'" + String(i).replace(/'/g, "''") + "'").join(',');
      // every table but the spatial index, which a reader rebuilds or does without
      const tables = src.exec("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'rtree_%' AND name NOT LIKE 'sqlite_%'")[0].values;
      for (const [name, sql] of tables) {
        dst.run(sql);
        const where = name === table ? ' WHERE ' + fields.map((x) => `"${x}" IN (${list})`).join(' OR ') : '';
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

  // ---- single divisions out of a country's GeoJSON: its features, as they are in the file -----------------------------------
  function cutGeoJSON(bytes, f) {
    const fields = f.d.filter_fields[state.geometry][f.field], keep = new Set(f.ids.map(String));
    const fc = JSON.parse(new TextDecoder().decode(bytes));
    fc.features = fc.features.filter((x) => fields.some((k) => keep.has(String(x.properties[k]))));
    return new Blob([JSON.stringify(fc)], { type: FORMAT.geojson[2] });
  }

  // ---- downloading ------------------------------------------------------------------------------------------------
  function save(bytes, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(bytes instanceof Blob ? bytes : new Blob([bytes], { type: FORMAT[state.format][2] }));
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
    if (!f.ids) return bytes;
    return state.format === 'geojson' ? cutGeoJSON(bytes, f) : extract(bytes, f);
  }
  const licence = (fs) => [`Terrae ${M.version}: ${levelsOf().map((id) => M.datasets.find((d) => d.id === id).title).join('; ')}, `
    + `${state.geometry}, level of detail ${state.detail}, ${FORMAT[state.format][0]}`, '',
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
  // a whole file too large to hold: the browser saves it straight from the repository (the host sends it as a file).
  // Each goes through its own hidden frame, so that several can start one after the other.
  const direct = (fs) => fs.filter((f) => !f.ids && f.bytes > LINK_LIMIT);
  function saveFromRepository(url) {
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.src = url;
    document.body.appendChild(frame);
    setTimeout(() => frame.remove(), 10 * 60e3);
  }
  function download(oneByOne) {
    const all = plan();
    if (!all.length) return;
    const big = direct(all), fs = all.filter((f) => !big.includes(f));
    big.forEach((f, i) => setTimeout(() => saveFromRepository(f.url), i * 1500));
    if (!fs.length) return;
    const total = fs.reduce((a, f) => a + f.bytes, 0);
    oneByOne = oneByOne || total > ZIP_LIMIT;
    run(async () => {
      let done = 0;
      progress(0, total);
      const entries = {};
      for (const f of fs) {
        const bytes = await produce(f);
        done += f.bytes;
        progress(done, total);
        if (fs.length === 1 || oneByOne) { save(bytes, f.name); await new Promise((r) => setTimeout(r, 350)); }
        else entries[f.name] = bytes instanceof Blob ? new Uint8Array(await bytes.arrayBuffer()) : bytes;
      }
      if (fs.length > 1 && !oneByOne) {
        entries['LICENCE.txt'] = fflate.strToU8(licence(fs));
        const zip = await new Promise((res, rej) => fflate.zip(entries, { level: 6 }, (err, data) => (err ? rej(err) : res(data))));
        const what = levelsOf().length > 1 ? 'levels' : ds().id;
        save(new Blob([zip], { type: 'application/zip' }), `terrae-${what}-${M.version}-${state.detail}-${state.geometry}-${fs.length}-files.zip`);
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
    if (!hasFormat(state.format, state.detail)) state.format = 'gpkg';         // e.g. GeoJSON, then a level of detail without it
    document.querySelectorAll('[data-field]').forEach((g) => g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(state[g.dataset.field] === b.value))));
    const off = (field, value, why) => {
      const b = document.querySelector(`[data-field="${field}"] button[value="${value}"]`);
      b.setAttribute('aria-disabled', String(!!why));
      b.dataset.why = why || '';
    };
    for (const a of ['adm1', 'adm2']) off('adm', a, state.view !== 'reference' && 'Only with the Reference representation.');
    for (const v of ['de_facto', 'disputes']) off('view', v, divisions() && 'Countries level (ADM0) only.');
    const others = (state.adm === 'adm0' && state.view !== 'reference') ? [] : Object.keys(LEVEL_NAME).filter((a) => a !== state.adm);
    $('f-also').hidden = !others.length;
    $('also').innerHTML = others.map((a) => `<button type="button" value="${a}" aria-pressed="${alsoLevels().includes(a)}">${LEVEL_NAME[a]}</button>`).join('');
    $('h-also').dataset.tip = HINT.also;
    document.querySelectorAll('[data-field="format"] button').forEach((b) => {
      const ok = hasFormat(b.value, state.detail);
      b.disabled = !ok;
      const where = M.level_order.filter((lv) => hasFormat(b.value, lv)).map(cap);
      b.title = ok ? '' : where.length ? `${FORMAT[b.value][0]} is published for the ${where.join(' and ')} levels of detail` : `${FORMAT[b.value][0]} is not published in this repository`;
    });
    $('f-format').hidden = !M.level_order.some((lv) => hasFormat('geojson', lv));      // one format only: nothing to choose
    $('fmt-name').textContent = FORMAT[state.format][0];
    // what each option means, in its (i)
    const what = state.view === 'disputes' && !divisions() ? 'areas' : 'countries';
    const tips = {
      adm: (v) => HINT.adm[v] + ' ' + M.datasets.find((x) => x.id === v).features.toLocaleString('en-GB') + ' features.',
      view: (v) => HINT.view[v], geometry: (v) => HINT.geometry[v], format: (v) => HINT.format[v],
      detail: (v) => { const L = M.levels[v]; return `${L.label}. ${L.scale}.` + ((d.level_notes || {})[v] ? ' ' + d.level_notes[v] : ''); },
      coverage: (v) => v === 'world' ? HINT.coverage.world : divisions()
        ? 'Click a division on the map to take it alone, or a country in the list to take all its divisions.' : `Click ${what} on the map or in the list.`,
    };
    for (const [field, fn] of Object.entries(tips)) document.querySelectorAll(`[data-field="${field}"] button`).forEach((b) => {
      b.dataset.tip = fn(b.value) + (b.dataset.why ? ' — ' + b.dataset.why : '');
    });
    $('l-picker').textContent = divisions() ? 'Countries (all their divisions)' : state.view === 'disputes' ? 'Disputed areas'
      : state.view === 'de_facto' ? 'Countries, territories and authorities' : 'Countries and territories';
    $('f-picker').hidden = state.coverage !== 'selection';
    if (state.coverage === 'selection') renderList();

    const fs = plan(), total = fs.reduce((a, f) => a + f.bytes, 0), cut = fs.some((f) => f.ids);
    const big = direct(fs), held = fs.filter((f) => !big.includes(f)), heldTotal = held.reduce((a, f) => a + f.bytes, 0);
    const zipped = held.length > 1 && heldTotal <= ZIP_LIMIT, many = held.length > 1;
    const tooBig = fs.some((f) => f.ids && f.bytes > CUT_LIMIT);
    $('total').textContent = state.coverage === 'world' ? 'Whole world'
      : !sel().size ? 'Nothing selected yet'
        : `${sel().size} selected · ${fs.length} ${fs.length === 1 ? 'file' : 'files'}`;
    $('size').textContent = fs.length ? (cut ? 'from ' : state.format !== 'gpkg' && state.coverage !== 'world' ? 'about ' : '') + fmtBytes(total) : '';
    $('go').disabled = !fs.length || tooBig;
    $('go').textContent = fs.length < 2 ? 'Download' : zipped && !big.length ? `Download ${fs.length} files as a zip` : `Download ${fs.length} files`;
    $('each').hidden = !zipped;
    const n = $('notice');
    n.classList.toggle('note', !tooBig);
    n.hidden = !(tooBig || big.length || (many && !zipped));
    if (tooBig) n.textContent = 'A country file this large cannot be cut in the browser: take the whole country, or a lighter level of detail.';
    else if (big.length) {
      const name = (f) => f.url.split('/').pop();
      n.textContent = (big.length === fs.length ? (fs.length === 1 ? 'This file is' : 'These files are')
        : big.length === 1 ? `The large file (${name(big[0])}) is` : `The ${big.length} large files are`)
        + ' saved by your browser straight from the repository' + (fs.length > 1 ? ': allow several downloads if the browser asks.' : '.')
        + (held.length > 1 ? (zipped ? ' The others come as a zip.' : ' The others are saved one by one.') : '');
    }
    else if (many && !zipped) n.textContent = 'Too large to zip in the browser: the files are saved one by one.';
    $('each').disabled = tooBig;
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

  // ---- the map's tiles ---------------------------------------------------------------------------------------------
  // The data host answers every request with a redirect to its CDN: two round trips per tile. This source follows the
  // redirect once and reads the CDN address directly while its signature is valid (about an hour; it asks again when it
  // expires or is refused). It keeps what it has read in memory, because the PMTiles library turns the browser's cache
  // off on Chrome and Edge for Windows.
  class TileSource {
    constructor(url) { this.url = url; this.direct = null; this.until = 0; this.kept = new Map(); this.bytes = 0; }
    getKey() { return this.url; }
    async read(offset, length, signal, renew) {
      const range = { Range: `bytes=${offset}-${offset + length - 1}` };
      if (!renew && this.direct && Date.now() < this.until) return fetch(this.direct, { signal, headers: range, cache: 'no-store' });
      const r = await fetch(this.url, { signal, headers: range, cache: 'no-store' });
      if (r.ok && r.url && r.url !== this.url) {
        const expires = Number((r.url.match(/[?&]Expires=(\d+)/) || [])[1]);
        this.direct = r.url;
        this.until = expires ? expires * 1000 - 120e3 : Date.now() + 30 * 60e3;
      }
      return r;
    }
    async getBytes(offset, length, signal) {
      const key = offset + ':' + length, hit = this.kept.get(key);
      if (hit) { this.kept.delete(key); this.kept.set(key, hit); return hit; }
      let r = await this.read(offset, length, signal, false);
      if (r.status === 401 || r.status === 403 || r.status === 410) r = await this.read(offset, length, signal, true);
      if (r.status >= 300) throw new Error('Bad response code: ' + r.status);
      const etag = r.headers.get('ETag');
      const out = { data: await r.arrayBuffer(), etag: etag && !etag.startsWith('W/') ? etag : undefined };
      this.kept.set(key, out);
      this.bytes += out.data.byteLength;
      for (const [k, v] of this.kept) { if (this.bytes <= TILE_CACHE) break; this.kept.delete(k); this.bytes -= v.data.byteLength; }
      return out;
    }
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
    const url = CFG.tiles || ROOT + 'web/' + M.version + '/viewer.pmtiles';
    protocol.add(new pmtiles.PMTiles(new TileSource(url)));
    map = new maplibregl.Map({
      container: 'map', bounds: WORLD, fitBoundsOptions: { padding: 24 }, minZoom: 0, maxZoom: 9.5, renderWorldCopies: false,
      attributionControl: false, dragRotate: false, pitchWithRotate: false, maxTileCacheZoomLevels: 6,
      style: { version: 8, projection: { type: 'mercator' }, sources: { v: { type: 'vector', url: 'pmtiles://' + url,
        promoteId: { reference: 'key', de_facto: 'key', disputes: 'key', adm1: 'id', adm2: 'id' } } },
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': css('--sea') } }] },
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
      add('land', 'fill', 'v', 'reference', { 'fill-color': land });
      add('df-fill', 'fill', 'v', 'de_facto', { 'fill-color': ['case', ['==', ['get', 'kind'], 'authority'], alt, land] });
      const dc = ['match', ['get', 'kind']];
      for (const [k, v] of Object.entries(DISPUTE)) dc.push(k, v[0]);
      dc.push('#888888');
      add('dis-fill', 'fill', 'v', 'disputes', { 'fill-color': dc, 'fill-opacity': 0.72 });
      for (const [id, [source, layer]] of Object.entries(TILES)) {
        // the hit layer is also the hover: a tint by feature state, which changes without re-reading any tile
        add('hit-' + id, 'fill', source, layer, { 'fill-color': ink, 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.16, 0] });
        add('sel-' + id, 'fill', source, layer, { 'fill-color': pick, 'fill-opacity': 0.85 }, { filter: ['==', '1', '0'] });
      }
      add('a2-line', 'line', 'v', 'adm2', { 'line-color': line, 'line-opacity': 0.55, 'line-width': w(0.1, 0.25, 0.6) });
      add('a1-line', 'line', 'v', 'adm1', { 'line-color': line, 'line-opacity': 0.9, 'line-width': w(0.2, 0.5, 1) });
      add('c-line', 'line', 'v', 'reference', { 'line-color': '#8d97a8', 'line-width': w(0.4, 0.9, 1.5) });
      add('df-line', 'line', 'v', 'de_facto', { 'line-color': '#8d97a8', 'line-width': w(0.4, 0.9, 1.5) });
      add('dis-line', 'line', 'v', 'disputes', { 'line-color': '#c9d1dc', 'line-opacity': 0.6, 'line-width': 0.8, 'line-dasharray': [3, 2] });
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
    for (const k of Object.keys(TILES)) { vis('hit-' + k, k === id); vis('sel-' + k, k === id); }
    if (hover && hover.layer !== TILES[id][1]) setHover(null);
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
    return [key, divisions() ? { kind: 'division', unit: p.unit, name: p.name, adm1: p.adm1 } : { kind: 'entity', unit: key, name: p.name }];
  }
  function setHover(f) {
    const next = f ? { id: f.id, layer: f.sourceLayer } : null;
    if (hover && next && hover.id === next.id && hover.layer === next.layer) return;
    if (hover) map.setFeatureState({ source: 'v', sourceLayer: hover.layer, id: hover.id }, { hover: false });
    if (next) map.setFeatureState({ source: 'v', sourceLayer: next.layer, id: next.id }, { hover: true });
    hover = next;
  }
  function wireMap() {
    const tip = $('tip'), wrap = document.querySelector('.map-wrap');
    let moved = null, frame = 0;
    // the mouse can move many times between two frames: only the last position of each frame is looked up
    const onFrame = () => {
      frame = 0;
      const e = moved, f = featureAt(e.point);
      map.getCanvas().style.cursor = f ? 'pointer' : '';
      setHover(f);
      if (!f) { tip.classList.remove('on'); return; }
      const p = f.properties;
      const sub = divisions() ? unitName(p.unit) : state.view === 'disputes' ? (DISPUTE[p.kind] || ['', p.kind])[1] : p.key;
      const html = `${esc(p.name)}<small>${esc(sub)}</small>`;
      if (tip.innerHTML !== html) tip.innerHTML = html;
      tip.classList.add('on');
      const x = e.point.x + 14 + tip.offsetWidth > wrap.clientWidth ? e.point.x - tip.offsetWidth - 14 : e.point.x + 14;
      tip.style.transform = `translate(${x}px, ${Math.max(8, e.point.y - 34)}px)`;
    };
    map.on('mousemove', (e) => { if (boxing) return; moved = e; if (!frame) frame = requestAnimationFrame(onFrame); });
    map.on('mouseout', () => { if (frame) cancelAnimationFrame(frame); frame = 0; tip.classList.remove('on'); setHover(null); });
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

  // ---- the (i) tooltips ----------------------------------------------------------------------------------------------
  function wireTips() {
    const tt = $('tt');
    const textOf = (el) => { const b = el.closest('button'); return el.dataset.tip || (b && b.dataset.tip) || ''; };
    const show = (icon) => {
      const text = textOf(icon);
      if (!text) return;
      tt.textContent = text;
      tt.classList.add('on');
      const r = icon.getBoundingClientRect(), w = tt.offsetWidth, h = tt.offsetHeight;
      const x = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8));
      const y = r.bottom + 8 + h > innerHeight - 8 ? r.top - h - 8 : r.bottom + 8;
      tt.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    };
    const hide = () => tt.classList.remove('on');
    document.addEventListener('mouseover', (e) => { const i = e.target.closest && e.target.closest('.i'); if (i) show(i); });
    document.addEventListener('mouseout', (e) => { if (e.target.closest && e.target.closest('.i')) hide(); });
    // the keyboard only: a click also focuses a button, and that must not open a tooltip
    document.addEventListener('focusin', (e) => {
      if (!e.target.matches || !e.target.matches(':focus-visible')) return;
      const i = e.target.matches('.i') ? e.target : e.target.querySelector && e.target.querySelector('.i');
      if (i) show(i);
    });
    document.addEventListener('focusout', hide);
    document.addEventListener('scroll', hide, true);
    // a click on the (i) shows what the option means and does not choose it (touch screens have no hover)
    document.addEventListener('click', (e) => { const i = e.target.closest && e.target.closest('.i'); if (i) { e.stopPropagation(); e.preventDefault(); show(i); } }, true);
  }

  // ---- start -------------------------------------------------------------------------------------------------------
  async function start() {
    const repo = await (await fetch(ROOT + 'repository.json')).json();
    M = await (await fetch(ROOT + repo.releases.find((r) => r.version === repo.latest).manifest)).json();
    $('release').textContent = M.version;
    $('detail-seg').innerHTML = M.level_order.map((lv) => `<button type="button" value="${lv}">${cap(lv)}${INFO}</button>`).join('');
    const gh = CFG.github || (CFG.links || {})['About Terrae'];
    if (gh) $('gh').href = gh;
    const q = new URLSearchParams(location.search);
    for (const k of Object.keys(state)) if (q.get(k)) state[k] = q.get(k);
    if (!['adm0', 'adm1', 'adm2'].includes(state.adm)) state.adm = 'adm0';
    if (!DATASET[state.view] || state.adm !== 'adm0') state.view = 'reference';
    if (!M.levels[state.detail]) state.detail = M.level_order[0];
    if (!FORMAT[state.format]) state.format = 'gpkg';
    state.also = state.also.split(',').filter((a) => LEVEL_NAME[a]).join(',');
    state.coverage = 'world';

    document.querySelectorAll('[data-field]').forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') return;
      state[g.dataset.field] = b.value;
      render();
    }));
    $('also').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const set = new Set(state.also.split(',').filter(Boolean));
      if (set.has(b.value)) set.delete(b.value); else set.add(b.value);
      state.also = [...set].sort().join(',');
      render();
    });
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
    wireTips();
    render();
    await createMap();
    wireMap();
    $('loading').hidden = true;
    drawMap();
  }
  start().catch((e) => { $('loading').textContent = 'The data repository could not be read: ' + e.message; });
})();