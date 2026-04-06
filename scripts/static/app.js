console.log("✅ app.js v7");

/* ══════════════════════════════════════════
   EXPONER FUNCIONES GLOBALMENTE
   Los botones usan onclick="" en el HTML,
   las funciones deben estar en window.
══════════════════════════════════════════ */

/* ══════════════════════════════════════════
   RED
══════════════════════════════════════════ */
function actualizarRed() {
    const el  = document.getElementById("estadoRed");
    const txt = document.getElementById("estadoTxt");
    if (navigator.onLine) {
        el.className = "online";
        txt.textContent = "Conectado";
        sincronizarPendientes();
    } else {
        el.className = "offline";
        txt.textContent = "Sin conexión";
    }
}
window.addEventListener("online",  actualizarRed);
window.addEventListener("offline", actualizarRed);
actualizarRed();

/* ══════════════════════════════════════════
   CACHÉ OFFLINE
══════════════════════════════════════════ */
let manualsData = null;
let r2BaseUrl   = localStorage.getItem("r2BaseUrl") || "";

async function cargarManuales() {
    if (manualsData) return manualsData;
    const r = await fetch("/data/all_manuals.json");
    if (!r.ok) throw new Error("No se pudo cargar all_manuals.json");
    manualsData = await r.json();
    return manualsData;
}

/* ══════════════════════════════════════════
   HELPERS
══════════════════════════════════════════ */
function esc(s) {
    return String(s)
        .replace(/&/g,"&amp;").replace(/</g,"&lt;")
        .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }

function highlight(text, kw) {
    if (!kw) return esc(text);
    return esc(text).replace(new RegExp(escRe(kw),"gi"), m => `<mark>${m}</mark>`);
}

function toast(msg, type="ok") {
    document.querySelectorAll(".toast").forEach(t => t.remove());
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

/* ══════════════════════════════════════════
   PDF VIEWER
   - Desktop Chrome/Edge: abre PDF directo con #page
   - Android/iOS móvil: usa Google Docs Viewer
     (permite ver el PDF en el navegador sin descargar)
══════════════════════════════════════════ */
window.abrirPDF = function(manual, page) {
    if (!r2BaseUrl) {
        toast("⚠️ PDFs no configurados aún","err");
        return;
    }
    const filename = encodeURIComponent(manual + ".pdf");
    const pdfUrl   = `${r2BaseUrl}/${filename}`;

    // Detectar si es móvil
    const esMobil = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (esMobil) {
        // Google Docs Viewer — muestra el PDF en el navegador sin descargar
        // No soporta ir a página exacta, pero al menos muestra el PDF
        const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(pdfUrl)}&embedded=true`;
        // Abrir visor interno
        mostrarVisorPDF(viewerUrl, manual, page, pdfUrl);
    } else {
        // Desktop: abrir directo con #page
        window.open(`${pdfUrl}#page=${page}`, "_blank");
    }
};

function mostrarVisorPDF(viewerUrl, manual, page, pdfUrl) {
    // Crear modal con iframe
    let modal = document.getElementById("pdfModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "pdfModal";
        modal.style.cssText = `
            position:fixed;inset:0;z-index:9999;background:#0b0f1a;
            display:flex;flex-direction:column;
        `;
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;
                    padding:12px 16px;background:#111827;border-bottom:1px solid #1e293b;
                    flex-shrink:0;">
            <div>
                <div style="font-size:.75rem;color:#00d4ff;font-family:monospace;text-transform:uppercase">
                    📘 ${esc(manual)} — Página ${page}
                </div>
                <div style="font-size:.68rem;color:#64748b;margin-top:2px">
                    Si no carga, usa el botón de descarga ↓
                </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
                <a href="${pdfUrl}" download
                   style="font-size:.72rem;padding:5px 10px;border-radius:6px;
                          background:rgba(0,212,255,.1);color:#00d4ff;
                          border:1px solid rgba(0,212,255,.3);text-decoration:none">
                    ⬇ Descargar
                </a>
                <button onclick="cerrarVisorPDF()"
                        style="background:#ef4444;border:none;color:#fff;
                               border-radius:6px;padding:5px 10px;cursor:pointer;
                               font-size:.8rem">✕ Cerrar</button>
            </div>
        </div>
        <iframe src="${viewerUrl}"
                style="flex:1;border:none;width:100%;background:#fff;"
                allowfullscreen>
        </iframe>
    `;
    modal.style.display = "flex";
}

window.cerrarVisorPDF = function() {
    const modal = document.getElementById("pdfModal");
    if (modal) modal.style.display = "none";
};

/* ══════════════════════════════════════════
   UI STATES
══════════════════════════════════════════ */
function showState(state) {
    ["welcomeState","spinnerState","emptyState","resultsList","metaBar"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });
    if (state === "welcome") document.getElementById("welcomeState").style.display = "flex";
    if (state === "loading") document.getElementById("spinnerState").style.display = "block";
    if (state === "empty")   document.getElementById("emptyState").style.display   = "flex";
    if (state === "results") {
        document.getElementById("resultsList").style.display = "block";
        document.getElementById("metaBar").style.display     = "flex";
    }
}

/* ══════════════════════════════════════════
   RENDER RESULTADOS
══════════════════════════════════════════ */
function renderResultados(results, keyword, mode) {
    const list = document.getElementById("resultsList");
    list.innerHTML = "";

    if (!results || results.length === 0) { showState("empty"); return; }

    document.getElementById("countNum").textContent = results.length;
    document.getElementById("modeTag").textContent  = mode === "online" ? "ONLINE" : "OFFLINE";
    showState("results");

    results.forEach((r, i) => {
        const isNote = r.type === "note";
        const card   = document.createElement("div");
        card.className = `result-card${isNote ? " note-card" : ""}`;
        card.style.animationDelay = `${i * 30}ms`;

        const badge  = isNote ? "note-badge" : "manual-badge";
        const mLabel = isNote ? "📝 Apunte"  : esc(r.manual);
        const pLabel = isNote ? esc(r.page)   : `Página ${r.page}`;
        const tagsHtml = isNote && r.tags?.length
            ? `<div class="card-tags">${r.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join("")}</div>`
            : "";

        const pdfBtn = (!isNote && r2BaseUrl)
            ? `<button class="btn-pdf" onclick="abrirPDF('${esc(r.manual)}',${r.page})">📖 Ver PDF pág. ${r.page}</button>`
            : "";

        card.innerHTML = `
            <div class="card-header">
                <span class="card-manual ${badge}">${mLabel}</span>
                <span class="card-page">📄 ${pLabel}</span>
            </div>
            <div class="card-ctx">${highlight(r.context, keyword)}</div>
            <div class="card-footer">
                <div class="card-action">${esc(r.action)}</div>
                ${pdfBtn}
            </div>
            ${tagsHtml}
        `;
        list.appendChild(card);
    });
}

/* ══════════════════════════════════════════
   BÚSQUEDA OFFLINE
══════════════════════════════════════════ */
async function buscarOffline(kw, mf) {
    const data    = await cargarManuales();
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
        results.push({ type:"manual", manual:page.manual, page:page.page,
                       context:ctx, action:"Revisar sección completa del manual" });
    }

    if (!mfl || mfl === "apuntes") {
        for (const note of localNotesLoad()) {
            const blob = (note.title+" "+note.text+" "+(note.tags||[]).join(" ")).toLowerCase();
            if (blob.includes(kwl)) {
                results.push({ type:"note", id:note.id, manual:"apuntes",
                               page:note.title, context:note.text.substring(0,220),
                               action:"Apunte personal", tags:note.tags||[] });
            }
        }
    }
    return results;
}

/* ══════════════════════════════════════════
   BÚSQUEDA ONLINE
══════════════════════════════════════════ */
async function buscarOnline(kw, mf) {
    let url = `/search?q=${encodeURIComponent(kw)}`;
    if (mf) url += `&manual=${encodeURIComponent(mf)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (data.r2_url) {
        r2BaseUrl = data.r2_url;
        localStorage.setItem("r2BaseUrl", r2BaseUrl); // guardar para offline
    }
    return data.results || [];
}

/* ══════════════════════════════════════════
   CONTROLADOR BÚSQUEDA
══════════════════════════════════════════ */
window.iniciarBusqueda = async function() {
    const kw = document.getElementById("q").value.trim();
    const mf = document.getElementById("manual").value.trim();
    if (!kw) {
        const inp = document.getElementById("q");
        inp.style.borderColor = "var(--danger)";
        setTimeout(() => inp.style.borderColor = "", 1200);
        return;
    }

    showState("loading");
    const btn = document.getElementById("btnBuscar");
    if (btn) { btn.classList.add("loading"); btn.textContent = "Buscando..."; }

    try {
        let results, mode;
        if (navigator.onLine) {
            try   { results = await buscarOnline(kw, mf); mode = "online"; }
            catch { results = await buscarOffline(kw, mf); mode = "offline"; }
        } else {
            results = await buscarOffline(kw, mf);
            mode = "offline";
        }
        renderResultados(results, kw, mode);
    } catch(e) {
        console.error(e);
        document.getElementById("resultsList").innerHTML =
            `<div class="result-card"><span style="color:var(--danger)">❌ ${esc(e.message)}</span></div>`;
        showState("results");
    } finally {
        if (btn) { btn.classList.remove("loading"); btn.textContent = "Buscar"; }
    }
};

/* ══════════════════════════════════════════
   INIT — registrar eventos al cargar
══════════════════════════════════════════ */
function initEventos() {
    const q   = document.getElementById("q");
    const m   = document.getElementById("manual");
    const btn = document.getElementById("btnBuscar");

    if (q) {
        q.disabled = false;
        q.readOnly = false;
        q.addEventListener("keydown", e => { if(e.key==="Enter"){e.preventDefault();window.iniciarBusqueda();} });
        q.addEventListener("keyup",   e => { if(e.key==="Enter"){e.preventDefault();window.iniciarBusqueda();} });
    }
    if (m) {
        m.disabled = false;
        m.addEventListener("keydown", e => { if(e.key==="Enter"){e.preventDefault();window.iniciarBusqueda();} });
    }
    // Botón buscar — doble registro para mayor compatibilidad móvil
    if (btn) {
        btn.onclick = null;
        btn.addEventListener("click",      () => window.iniciarBusqueda());
        btn.addEventListener("touchstart", (e) => { e.preventDefault(); window.iniciarBusqueda(); }, {passive:false});
    }

    const adminPass = document.getElementById("adminPass");
    if (adminPass) {
        adminPass.addEventListener("keydown", e => { if(e.key==="Enter"){e.preventDefault();window.adminLogin();} });
    }

    showState("welcome");
    if (navigator.onLine) sincronizarPendientes();

    // Focus en input de búsqueda (solo desktop)
    if (!/Android|iPhone|iPad/i.test(navigator.userAgent)) {
        setTimeout(() => q?.focus(), 300);
    }
}

// Ejecutar cuando el DOM esté listo
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEventos);
} else {
    initEventos();
}

/* ══════════════════════════════════════════
   APUNTES — localStorage
══════════════════════════════════════════ */
function localNotesLoad() {
    try { return JSON.parse(localStorage.getItem("interlocks_notes") || "[]"); }
    catch { return []; }
}
function localNotesSave(notes) {
    localStorage.setItem("interlocks_notes", JSON.stringify(notes));
}
function localNoteSync(note) {
    const all = localNotesLoad().filter(n => n.id !== note.id);
    all.push(note);
    localNotesSave(all);
}
function localNoteDelete(id) {
    localNotesSave(localNotesLoad().filter(n => n.id !== id));
}

function pendingLoad()     { try{return JSON.parse(localStorage.getItem("interlocks_pending")||"[]");}catch{return[];} }
function pendingSave(p)    { localStorage.setItem("interlocks_pending", JSON.stringify(p)); }
function pendingAdd(note)  { const p=pendingLoad(); p.push(note); pendingSave(p); }
function pendingRemove(id) { pendingSave(pendingLoad().filter(n=>n.id!==id)); }

async function sincronizarPendientes() {
    const pending = pendingLoad();
    if (!pending.length) return;
    let synced = 0;
    for (const note of pending) {
        try {
            await fetch("/notes", {
                method:"POST",
                headers:{"Content-Type":"application/json"},
                body: JSON.stringify(note)
            });
            pendingRemove(note.id);
            synced++;
        } catch { break; }
    }
    if (synced > 0) toast(`☁️ ${synced} apunte(s) sincronizado(s)`);
}

/* ══════════════════════════════════════════
   APUNTES — cargar y renderizar
══════════════════════════════════════════ */
window.loadNotes = async function() {
    const list  = document.getElementById("notesList");
    const empty = document.getElementById("notesEmpty");
    if (!list) return;
    list.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div></div>`;
    if (empty) empty.style.display = "none";

    let notes = [];
    if (navigator.onLine) {
        try {
            const r = await fetch("/notes");
            notes   = await r.json();
            localNotesSave(notes);
        } catch { notes = localNotesLoad(); }
    } else {
        notes = localNotesLoad();
    }
    renderNotes(notes);
};

function renderNotes(notes) {
    const list  = document.getElementById("notesList");
    const empty = document.getElementById("notesEmpty");
    if (!list) return;
    list.innerHTML = "";
    if (!notes?.length) { if(empty) empty.style.display="flex"; return; }
    if (empty) empty.style.display = "none";

    notes.forEach(note => {
        const div = document.createElement("div");
        div.className = "note-item";
        div.id = `note-${note.id}`;
        const tagsHtml  = (note.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join("");
        const isPending = pendingLoad().some(p=>p.id===note.id);
        div.innerHTML = `
            <div class="note-item-header">
                <div class="note-item-title">
                    ${esc(note.title)}
                    ${isPending?'<span style="color:var(--warn);font-size:.7rem"> ⏳</span>':""}
                </div>
                <div class="note-actions">
                    <button class="btn btn-ghost btn-sm" onclick="editNote('${note.id}')">✏️</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteNote('${note.id}')">🗑</button>
                </div>
            </div>
            <div class="note-item-text">${esc(note.text)}</div>
            ${tagsHtml?`<div class="card-tags">${tagsHtml}</div>`:""}
        `;
        list.appendChild(div);
    });
}

/* ══════════════════════════════════════════
   APUNTES — formulario
══════════════════════════════════════════ */
window.toggleNoteForm = function() {
    const form = document.getElementById("noteForm");
    if (!form) return;
    if (form.style.display !== "none") { window.cancelNoteForm(); return; }
    form.style.display = "block";
    document.getElementById("noteFormTitle").textContent = "✏️ NUEVO APUNTE";
    ["editingId","noteTitle","noteText","noteTags"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    setTimeout(() => document.getElementById("noteTitle")?.focus(), 100);
};

window.cancelNoteForm = function() {
    const form = document.getElementById("noteForm");
    if (form) form.style.display = "none";
};

window.editNote = function(id) {
    const note = localNotesLoad().find(n=>n.id===id);
    if (!note) return;
    const form = document.getElementById("noteForm");
    if (form) form.style.display = "block";
    document.getElementById("noteFormTitle").textContent = "✏️ EDITAR APUNTE";
    document.getElementById("editingId").value = id;
    document.getElementById("noteTitle").value = note.title;
    document.getElementById("noteText").value  = note.text;
    document.getElementById("noteTags").value  = (note.tags||[]).join(", ");
    setTimeout(() => document.getElementById("noteTitle")?.focus(), 100);
    form?.scrollIntoView({behavior:"smooth"});
};

window.saveNote = async function() {
    const id    = document.getElementById("editingId").value.trim();
    const title = document.getElementById("noteTitle").value.trim();
    const text  = document.getElementById("noteText").value.trim();
    const tags  = document.getElementById("noteTags").value
                    .split(",").map(t=>t.trim()).filter(Boolean);
    if (!title) { toast("El título es obligatorio","err"); return; }

    const note = { id: id || crypto.randomUUID(), title, text, tags };

    if (navigator.onLine) {
        try {
            const method = id ? "PUT" : "POST";
            const url    = id ? `/notes/${id}` : "/notes";
            await fetch(url, {
                method,
                headers:{"Content-Type":"application/json"},
                body: JSON.stringify(note)
            });
            pendingRemove(note.id);
        } catch { if (!id) pendingAdd(note); }
    } else {
        if (!id) pendingAdd(note);
        toast("⚠️ Sin internet — se sincronizará al conectarte");
    }

    localNoteSync(note);
    window.cancelNoteForm();
    window.loadNotes();
    toast(id ? "✅ Apunte actualizado" : "✅ Apunte guardado");
};

window.deleteNote = async function(id) {
    if (!confirm("¿Eliminar este apunte?")) return;
    if (navigator.onLine) {
        try { await fetch(`/notes/${id}`, {method:"DELETE"}); } catch {}
    }
    localNoteDelete(id);
    pendingRemove(id);
    document.getElementById(`note-${id}`)?.remove();
    const list = document.getElementById("notesList");
    if (list && !list.children.length) {
        const empty = document.getElementById("notesEmpty");
        if (empty) empty.style.display = "flex";
    }
    toast("🗑 Apunte eliminado");
};

/* ══════════════════════════════════════════
   ADMIN
══════════════════════════════════════════ */
let adminPassword = "";

window.adminLogin = async function() {
    const pwEl = document.getElementById("adminPass");
    const pw   = pwEl ? pwEl.value.trim() : "";
    if (!pw) { toast("Ingresa la contraseña","err"); return; }
    try {
        const r = await fetch("/admin/check", {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body: JSON.stringify({password: pw})
        });
        if (r.ok) {
            adminPassword = pw;
            document.getElementById("adminLock").style.display    = "none";
            document.getElementById("adminContent").style.display = "block";
            loadAdminConfig();
            loadManualList();
        } else {
            toast("❌ Contraseña incorrecta","err");
        }
    } catch {
        toast("❌ Sin conexión al servidor","err");
    }
};

window.adminLogout = function() {
    adminPassword = "";
    document.getElementById("adminLock").style.display    = "flex";
    document.getElementById("adminContent").style.display = "none";
    const pwEl = document.getElementById("adminPass");
    if (pwEl) pwEl.value = "";
};

async function loadAdminConfig() {
    try {
        const r    = await fetch(`/admin/config?password=${encodeURIComponent(adminPassword)}`);
        const data = await r.json();
        if (!r.ok) return;
        if (data.r2_url && data.r2_url !== "No configurada") {
            r2BaseUrl = data.r2_url;
            localStorage.setItem("r2BaseUrl", r2BaseUrl);
        }
        document.getElementById("configInfo").innerHTML = `
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
    } catch(e) {
        document.getElementById("configInfo").innerHTML =
            `<p style="color:var(--danger);font-size:.8rem">Error al cargar config</p>`;
    }
}

window.loadManualList = async function() {
    const div = document.getElementById("manualList");
    if (!div) return;
    div.innerHTML = `<div class="spinner-wrap" style="padding:12px 0"><div class="spinner"></div></div>`;
    try {
        const r    = await fetch(`/admin/manuals?password=${encodeURIComponent(adminPassword)}`);
        const data = await r.json();
        if (!r.ok) { div.innerHTML=`<p style="color:var(--danger)">${data.error}</p>`; return; }
        div.innerHTML = data.map(m=>`
            <div class="manual-row">
                <span style="color:var(--text)">${esc(m.manual)}</span>
                <span>${m.pages} págs.</span>
            </div>`).join("");
    } catch(e) {
        div.innerHTML = `<p style="color:var(--danger)">Error: ${e.message}</p>`;
    }
};
