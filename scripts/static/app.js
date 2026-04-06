console.log("✅ app.js v8");

/* ══════════════════════════════════
   TODAS las funciones van en window
   para que onclick="" en HTML funcione
   en todos los dispositivos y navegadores.
══════════════════════════════════ */

// ─── ESTADO DE RED ───────────────────────────────────────
function actualizarRed() {
    const el  = document.getElementById("estadoRed");
    const txt = document.getElementById("estadoTxt");
    if (navigator.onLine) {
        el.className = "online";
        txt.textContent = "Conectado";
        _sincronizarPendientes();
    } else {
        el.className = "offline";
        txt.textContent = "Sin conexión";
    }
}
window.addEventListener("online",  actualizarRed);
window.addEventListener("offline", actualizarRed);
actualizarRed();

// ─── DATOS ───────────────────────────────────────────────
let _manuales = null;
let _r2Url    = localStorage.getItem("r2Url") || "";

async function _cargarManuales() {
    if (_manuales) return _manuales;
    const r = await fetch("/data/all_manuals.json");
    if (!r.ok) throw new Error("No se pudo cargar all_manuals.json");
    _manuales = await r.json();
    return _manuales;
}

// ─── HELPERS ─────────────────────────────────────────────
function _esc(s) {
    return String(s)
        .replace(/&/g,"&amp;").replace(/</g,"&lt;")
        .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function _escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }

function _hi(text, kw) {
    if (!kw) return _esc(text);
    return _esc(text).replace(new RegExp(_escRe(kw),"gi"), m=>`<mark>${m}</mark>`);
}

function _toast(msg, tipo="ok") {
    document.querySelectorAll(".toast").forEach(t=>t.remove());
    const t = document.createElement("div");
    t.className = `toast ${tipo}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(()=>t.remove(), 3500);
}

// ─── PDF ─────────────────────────────────────────────────
// Estrategia simple y universal:
// Abre el PDF directamente en nueva pestaña.
// El navegador del dispositivo decide cómo mostrarlo.
// En Chrome desktop: muestra con #page=N
// En Android: descarga o abre según el navegador instalado
// Sin visor iframe (falla con PDFs grandes)
window.abrirPDF = function(manual, page) {
    if (!_r2Url) {
        _toast("⚠️ URL de PDFs no configurada","err");
        return;
    }
    const pdfUrl = `${_r2Url}/${encodeURIComponent(manual + ".pdf")}`;

    // Chrome desktop: #page funciona nativamente
    // Móviles: ignorarán #page pero al menos abrirán el PDF
    window.open(`${pdfUrl}#page=${page}`, "_blank");
};

// ─── UI STATES ───────────────────────────────────────────
function _mostrar(estado) {
    ["welcomeState","spinnerState","emptyState","resultsList","metaBar"]
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "none";
        });
    const mapa = {
        welcome: ["welcomeState","flex"],
        loading: ["spinnerState","block"],
        empty:   ["emptyState","flex"],
        results: ["resultsList","block"],
    };
    if (mapa[estado]) {
        const el = document.getElementById(mapa[estado][0]);
        if (el) el.style.display = mapa[estado][1];
    }
    if (estado === "results") {
        const mb = document.getElementById("metaBar");
        if (mb) mb.style.display = "flex";
    }
}

// ─── RENDER RESULTADOS ───────────────────────────────────
function _renderResultados(results, kw, modo) {
    const lista = document.getElementById("resultsList");
    lista.innerHTML = "";

    if (!results?.length) { _mostrar("empty"); return; }

    document.getElementById("countNum").textContent = results.length;
    document.getElementById("modeTag").textContent  = modo === "online" ? "ONLINE" : "OFFLINE";
    _mostrar("results");

    results.forEach((r, i) => {
        const esNota = r.type === "note";
        const card   = document.createElement("div");
        card.className = `result-card${esNota ? " note-card" : ""}`;
        card.style.animationDelay = `${i * 30}ms`;

        const badge  = esNota ? "note-badge" : "manual-badge";
        const mLabel = esNota ? "📝 Apunte" : _esc(r.manual);
        const pLabel = esNota ? _esc(r.page) : `Página ${r.page}`;
        const tags   = esNota && r.tags?.length
            ? `<div class="card-tags">${r.tags.map(t=>`<span class="tag">${_esc(t)}</span>`).join("")}</div>`
            : "";

        const pdfBtn = (!esNota && _r2Url)
            ? `<button class="btn-pdf" onclick="abrirPDF('${_esc(r.manual)}',${r.page})">📖 Ver PDF — pág. ${r.page}</button>`
            : "";

        card.innerHTML = `
            <div class="card-header">
                <span class="card-manual ${badge}">${mLabel}</span>
                <span class="card-page">📄 ${pLabel}</span>
            </div>
            <div class="card-ctx">${_hi(r.context, kw)}</div>
            <div class="card-footer">
                <div class="card-action">${_esc(r.action)}</div>
                ${pdfBtn}
            </div>
            ${tags}
        `;
        lista.appendChild(card);
    });
}

// ─── BÚSQUEDA OFFLINE ────────────────────────────────────
async function _buscarOffline(kw, mf) {
    const data    = await _cargarManuales();
    const results = [];
    const kwl     = kw.toLowerCase();
    const mfl     = mf.toLowerCase();

    for (const page of data) {
        if (mfl && mfl !== "apuntes" && page.manual.toLowerCase() !== mfl) continue;
        const tl = page.text.toLowerCase();
        if (!tl.includes(kwl)) continue;
        const pos = tl.indexOf(kwl);
        const ctx = page.text
            .substring(Math.max(0,pos-80), Math.min(page.text.length,pos+120))
            .replace(/\n+/g," ").trim();
        results.push({
            type:"manual", manual:page.manual, page:page.page,
            context:ctx, action:"Revisar sección completa del manual"
        });
    }

    if (!mfl || mfl === "apuntes") {
        for (const nota of _notasLocales()) {
            const blob = (nota.title+" "+nota.text+" "+(nota.tags||[]).join(" ")).toLowerCase();
            if (!blob.includes(kwl)) continue;
            results.push({
                type:"note", id:nota.id, manual:"apuntes",
                page:nota.title, context:nota.text.substring(0,220),
                action:"Apunte personal", tags:nota.tags||[]
            });
        }
    }
    return results;
}

// ─── BÚSQUEDA ONLINE ─────────────────────────────────────
async function _buscarOnline(kw, mf) {
    let url = `/search?q=${encodeURIComponent(kw)}`;
    if (mf) url += `&manual=${encodeURIComponent(mf)}`;
    const r    = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (data.r2_url) {
        _r2Url = data.r2_url;
        localStorage.setItem("r2Url", _r2Url);
    }
    return data.results || [];
}

// ─── BUSCAR (llamado por onclick del botón) ───────────────
window.iniciarBusqueda = async function() {
    const kwEl = document.getElementById("q");
    const mfEl = document.getElementById("manual");
    const btn  = document.getElementById("btnBuscar");
    const kw   = kwEl?.value.trim() || "";
    const mf   = mfEl?.value.trim() || "";

    if (!kw) {
        if (kwEl) { kwEl.style.borderColor="var(--danger)"; setTimeout(()=>kwEl.style.borderColor="",1200); }
        return;
    }

    _mostrar("loading");
    if (btn) { btn.classList.add("loading"); btn.textContent = "Buscando..."; }

    try {
        let results, modo;
        if (navigator.onLine) {
            try   { results = await _buscarOnline(kw, mf); modo = "online"; }
            catch { results = await _buscarOffline(kw, mf); modo = "offline"; }
        } else {
            results = await _buscarOffline(kw, mf);
            modo = "offline";
        }
        _renderResultados(results, kw, modo);
    } catch(e) {
        console.error(e);
        const l = document.getElementById("resultsList");
        if (l) l.innerHTML = `<div class="result-card"><span style="color:var(--danger)">❌ ${_esc(e.message)}</span></div>`;
        _mostrar("results");
    } finally {
        if (btn) { btn.classList.remove("loading"); btn.textContent = "Buscar"; }
    }
};

// ─── INIT (solo Enter en inputs, sin tocar botones) ───────
// Los botones ya tienen onclick en el HTML.
// Aquí solo se registra el Enter de los inputs.
document.addEventListener("DOMContentLoaded", function() {
    const q = document.getElementById("q");
    const m = document.getElementById("manual");

    q?.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); window.iniciarBusqueda(); }
    });
    m?.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); window.iniciarBusqueda(); }
    });
    document.getElementById("adminPass")?.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); window.adminLogin(); }
    });
    document.getElementById("noteTitle")?.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); window.saveNote(); }
    });

    _mostrar("welcome");
    if (navigator.onLine) _sincronizarPendientes();
});

// ─── NOTAS — localStorage ────────────────────────────────
function _notasLocales() {
    try { return JSON.parse(localStorage.getItem("interlocks_notes")||"[]"); }
    catch { return []; }
}
function _notasGuardar(notas) {
    localStorage.setItem("interlocks_notes", JSON.stringify(notas));
}
function _notaSync(nota) {
    const todas = _notasLocales().filter(n=>n.id!==nota.id);
    todas.push(nota);
    _notasGuardar(todas);
}
function _notaBorrar(id) {
    _notasGuardar(_notasLocales().filter(n=>n.id!==id));
}

// Pendientes (creados sin internet)
function _pendientes()      { try{return JSON.parse(localStorage.getItem("interlocks_pend")||"[]");}catch{return[];} }
function _pendGuardar(p)    { localStorage.setItem("interlocks_pend", JSON.stringify(p)); }
function _pendAgregar(nota) { const p=_pendientes(); p.push(nota); _pendGuardar(p); }
function _pendQuitar(id)    { _pendGuardar(_pendientes().filter(n=>n.id!==id)); }

async function _sincronizarPendientes() {
    const pend = _pendientes();
    if (!pend.length) return;
    let ok = 0;
    for (const nota of pend) {
        try {
            await fetch("/notes", {
                method:"POST",
                headers:{"Content-Type":"application/json"},
                body: JSON.stringify(nota)
            });
            _pendQuitar(nota.id);
            ok++;
        } catch { break; }
    }
    if (ok > 0) _toast(`☁️ ${ok} apunte(s) sincronizado(s)`);
}

// ─── NOTAS — cargar y mostrar ────────────────────────────
window.loadNotes = async function() {
    const lista = document.getElementById("notesList");
    const empty = document.getElementById("notesEmpty");
    if (!lista) return;
    lista.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div></div>`;
    if (empty) empty.style.display = "none";

    let notas = [];
    if (navigator.onLine) {
        try { const r = await fetch("/notes"); notas = await r.json(); _notasGuardar(notas); }
        catch { notas = _notasLocales(); }
    } else {
        notas = _notasLocales();
    }
    _renderNotas(notas);
};

function _renderNotas(notas) {
    const lista = document.getElementById("notesList");
    const empty = document.getElementById("notesEmpty");
    if (!lista) return;
    lista.innerHTML = "";
    if (!notas?.length) { if(empty) empty.style.display="flex"; return; }
    if (empty) empty.style.display = "none";

    notas.forEach(nota => {
        const div = document.createElement("div");
        div.className = "note-item";
        div.id = `note-${nota.id}`;
        const tags = (nota.tags||[]).map(t=>`<span class="tag">${_esc(t)}</span>`).join("");
        const pend = _pendientes().some(p=>p.id===nota.id);
        div.innerHTML = `
            <div class="note-item-header">
                <div class="note-item-title">
                    ${_esc(nota.title)}
                    ${pend?'<span style="color:var(--warn);font-size:.7rem"> ⏳</span>':""}
                </div>
                <div class="note-actions">
                    <button class="btn btn-ghost btn-sm" onclick="editNote('${nota.id}')">✏️</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteNote('${nota.id}')">🗑</button>
                </div>
            </div>
            <div class="note-item-text">${_esc(nota.text)}</div>
            ${tags?`<div class="card-tags">${tags}</div>`:""}
        `;
        lista.appendChild(div);
    });
}

// ─── NOTAS — formulario ──────────────────────────────────
window.toggleNoteForm = function() {
    const form = document.getElementById("noteForm");
    if (!form) return;
    if (form.style.display === "none" || form.style.display === "") {
        form.style.display = "block";
        document.getElementById("noteFormTitle").textContent = "✏️ NUEVO APUNTE";
        ["editingId","noteTitle","noteText","noteTags"]
            .forEach(id => { const el=document.getElementById(id); if(el) el.value=""; });
        setTimeout(()=>document.getElementById("noteTitle")?.focus(), 100);
    } else {
        window.cancelNoteForm();
    }
};

window.cancelNoteForm = function() {
    const form = document.getElementById("noteForm");
    if (form) form.style.display = "none";
};

window.editNote = function(id) {
    const nota = _notasLocales().find(n=>n.id===id);
    if (!nota) return;
    const form = document.getElementById("noteForm");
    if (form) form.style.display = "block";
    document.getElementById("noteFormTitle").textContent = "✏️ EDITAR APUNTE";
    document.getElementById("editingId").value = id;
    document.getElementById("noteTitle").value = nota.title;
    document.getElementById("noteText").value  = nota.text;
    document.getElementById("noteTags").value  = (nota.tags||[]).join(", ");
    setTimeout(()=>document.getElementById("noteTitle")?.focus(), 100);
    form?.scrollIntoView({behavior:"smooth"});
};

window.saveNote = async function() {
    const id    = document.getElementById("editingId").value.trim();
    const title = document.getElementById("noteTitle").value.trim();
    const text  = document.getElementById("noteText").value.trim();
    const tags  = document.getElementById("noteTags").value
                    .split(",").map(t=>t.trim()).filter(Boolean);

    if (!title) { _toast("El título es obligatorio","err"); return; }

    const nota = { id: id || crypto.randomUUID(), title, text, tags };

    if (navigator.onLine) {
        try {
            const method = id ? "PUT" : "POST";
            const url    = id ? `/notes/${id}` : "/notes";
            await fetch(url, {
                method,
                headers: {"Content-Type":"application/json"},
                body: JSON.stringify(nota)
            });
            _pendQuitar(nota.id);
        } catch {
            if (!id) _pendAgregar(nota);
        }
    } else {
        if (!id) _pendAgregar(nota);
        _toast("⚠️ Sin internet — se sincronizará al conectarte");
    }

    _notaSync(nota);
    window.cancelNoteForm();
    window.loadNotes();
    _toast(id ? "✅ Apunte actualizado" : "✅ Apunte guardado");
};

window.deleteNote = async function(id) {
    if (!confirm("¿Eliminar este apunte?")) return;
    if (navigator.onLine) {
        try { await fetch(`/notes/${id}`, {method:"DELETE"}); } catch {}
    }
    _notaBorrar(id);
    _pendQuitar(id);
    document.getElementById(`note-${id}`)?.remove();
    const lista = document.getElementById("notesList");
    if (lista && !lista.children.length) {
        const empty = document.getElementById("notesEmpty");
        if (empty) empty.style.display = "flex";
    }
    _toast("🗑 Apunte eliminado");
};

// ─── ADMIN ───────────────────────────────────────────────
let _adminPw = "";

window.adminLogin = async function() {
    const pwEl = document.getElementById("adminPass");
    const pw   = pwEl?.value.trim() || "";
    if (!pw) { _toast("Ingresa la contraseña","err"); return; }
    try {
        const r = await fetch("/admin/check", {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body: JSON.stringify({password: pw})
        });
        if (r.ok) {
            _adminPw = pw;
            document.getElementById("adminLock").style.display    = "none";
            document.getElementById("adminContent").style.display = "block";
            _loadAdminConfig();
            window.loadManualList();
        } else {
            _toast("❌ Contraseña incorrecta","err");
        }
    } catch {
        _toast("❌ Sin conexión al servidor","err");
    }
};

window.adminLogout = function() {
    _adminPw = "";
    document.getElementById("adminLock").style.display    = "flex";
    document.getElementById("adminContent").style.display = "none";
    const pwEl = document.getElementById("adminPass");
    if (pwEl) pwEl.value = "";
};

async function _loadAdminConfig() {
    const info = document.getElementById("configInfo");
    if (!info) return;
    try {
        const r    = await fetch(`/admin/config?password=${encodeURIComponent(_adminPw)}`);
        const data = await r.json();
        if (!r.ok) return;
        if (data.r2_url && data.r2_url !== "No configurada") {
            _r2Url = data.r2_url;
            localStorage.setItem("r2Url", _r2Url);
        }
        info.innerHTML = `
            <div class="config-row"><span>📚 Total páginas</span><span>${data.total_pages}</span></div>
            <div class="config-row"><span>📘 Manuales</span><span>${data.total_manuals}</span></div>
            <div class="config-row"><span>📝 Apuntes</span><span>${data.notes_count}</span></div>
            <div class="config-row">
                <span>☁️ Cloudflare R2</span>
                <span style="color:${data.r2_configured?'var(--green)':'var(--warn)'}">
                    ${data.r2_configured?"✅ Configurado":"⚠️ No configurado"}
                </span>
            </div>
        `;
    } catch {
        if (info) info.innerHTML = `<p style="color:var(--danger);font-size:.8rem">Error al cargar</p>`;
    }
}

window.loadManualList = async function() {
    const div = document.getElementById("manualList");
    if (!div) return;
    div.innerHTML = `<div class="spinner-wrap" style="padding:12px 0"><div class="spinner"></div></div>`;
    try {
        const r    = await fetch(`/admin/manuals?password=${encodeURIComponent(_adminPw)}`);
        const data = await r.json();
        if (!r.ok) { div.innerHTML=`<p style="color:var(--danger)">${data.error}</p>`; return; }
        div.innerHTML = data.map(m=>`
            <div class="manual-row">
                <span style="color:var(--text)">${_esc(m.manual)}</span>
                <span>${m.pages} págs.</span>
            </div>`).join("");
    } catch(e) {
        div.innerHTML = `<p style="color:var(--danger)">Error: ${e.message}</p>`;
    }
};
