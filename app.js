const fileInput = document.getElementById("fileInput");
const grid = document.getElementById("grid");
const viewer = document.getElementById("viewer");
const viewerCanvas = document.getElementById("viewerCanvas");
const viewerIframe = document.getElementById("viewerIframe");
const nameInput = document.getElementById("nameInput");
const notif = document.getElementById("notif");
const downloadBtn = document.getElementById("downloadBtn");
const closeBtn = document.getElementById("closeBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");

let items = []; // {file, name, arrayBuffer, pdf}
let currentIndex = -1;
let viewerBaseScale = 1;

fileInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  // revoke any existing object URLs from previous items
  try {
    (items || []).forEach((it) => {
      if (it && it._iframeUrl) URL.revokeObjectURL(it._iframeUrl);
    });
  } catch (err) {}
  items = [];
  grid.innerHTML = "";
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const ab = await f.arrayBuffer();
    const item = { file: f, name: stripExt(f.name), arrayBuffer: ab, currentPage: 1, numPages: 1, _iframeUrl: null };
    items.push(item);
  }
  await renderAllThumbnails();
  checkState();
});

function stripExt(name) {
  return name.replace(/\.pdf$/i, "");
}

async function renderAllThumbnails() {
  grid.innerHTML = "";
  // show a quick loader while generating thumbnails
  showViewerLoader('กำลังสร้างตัวอย่าง...');
  await new Promise((r) => setTimeout(r, 50));
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const card = document.createElement("div");
    card.className = "card";
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 400;
    card.appendChild(canvas);
    const caption = document.createElement("div");
    caption.className = "caption";
    const nameSpan = document.createElement("div");
    nameSpan.className = "name";
    nameSpan.textContent = it.name;
    caption.appendChild(nameSpan);
    card.appendChild(caption);
    grid.appendChild(card);

    // make whole card clickable to open viewer
    card.setAttribute('role','button');
    card.setAttribute('tabindex','0');
    card.addEventListener("click", () => openViewer(i));
    card.addEventListener("keydown", (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') openViewer(i);
    });

    // render first page thumbnail
    try {
      const pdf = await pdfjsLib.getDocument({ data: it.arrayBuffer }).promise;
      it.pdf = pdf;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 0.5 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (err) {
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#eee";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#666";
      ctx.fillText("ไม่สามารถแสดงตัวอย่าง", 10, 20);
    }
  }
  hideViewerLoader();
}

function openViewer(index) {
  currentIndex = index;
  viewer.classList.remove("hidden");
  renderViewer();
  // focus and select the filename for quick renaming
  setTimeout(() => {
    try { nameInput.focus(); nameInput.select(); } catch (e) {}
  }, 0);
  updateFileCounter();
}

function closeViewer() {
  viewer.classList.add("hidden");
  // stop iframe playback and revoke url for current item to free memory
  try {
    if (viewerIframe) {
      viewerIframe.src = '';
      viewerIframe.classList.add('hidden');
    }
    const it = items[currentIndex];
    if (it && it._iframeUrl) {
      try { URL.revokeObjectURL(it._iframeUrl); } catch (e) {}
      it._iframeUrl = null;
    }
  } catch (err) {}
  // hide file counter
  try { const fc = document.getElementById('fileCounter'); if (fc) fc.classList.add('hidden'); } catch(e){}
}

async function renderViewer() {
  const it = items[currentIndex];
  if (!it) return;
  nameInput.value = it.name || "";
  // Prefer native browser preview via iframe (clearer) — fallback to canvas render if iframe fails
  showViewerLoader();
  try {
    // ensure numPages known (we may lazily get it via pdf.js)
    if (!it.pdf) {
      try {
        const pdf = await pdfjsLib.getDocument({ data: it.arrayBuffer }).promise;
        it.pdf = pdf;
        it.numPages = pdf.numPages || 1;
      } catch (err) {
        // ignore here, we'll still try iframe
      }
    }

    // create blob URL if not present
    if (!it._iframeUrl) {
      try {
        if (it._iframeUrl) URL.revokeObjectURL(it._iframeUrl);
      } catch (e) {}
      const blob = new Blob([it.arrayBuffer], { type: 'application/pdf' });
      it._iframeUrl = URL.createObjectURL(blob);
    }

    const pageIndex = Math.min(Math.max(1, it.currentPage || 1), it.numPages || 1);

    // show iframe, hide canvas
    try {
      viewerCanvas.classList.add('hidden');
      viewerIframe.classList.remove('hidden');
      // when iframe loads, hide loader and update controls
      viewerIframe.onload = () => {
        hideViewerLoader();
        updatePageControls(it);
        updateFileCounter();
      };
      viewerIframe.onerror = async () => {
        // fallback to canvas rendering if iframe can't render
        hideViewerLoader();
        viewerIframe.classList.add('hidden');
        viewerCanvas.classList.remove('hidden');
        await renderViewerCanvas(it, pageIndex);
      };
      // set src with page fragment (works in Chrome and many viewers)
      viewerIframe.src = it._iframeUrl + '#page=' + pageIndex;
    } catch (err) {
      // fallback
      viewerIframe.classList.add('hidden');
      viewerCanvas.classList.remove('hidden');
      await renderViewerCanvas(it, pageIndex);
    }
  } catch (err) {
    // final fallback to canvas
    await renderViewerCanvas(it, it.currentPage || 1);
  }
  checkDuplicatesUI();
}

function updatePageControls(it) {
  const pageInput = document.getElementById('pageInput');
  const pageTotal = document.getElementById('pageTotal');
  const pagePrev = document.getElementById('pagePrev');
  const pageNext = document.getElementById('pageNext');
  if (!pageInput || !pageTotal) return;
  pageInput.value = it.currentPage || 1;
  pageTotal.textContent = `/ ${it.numPages || 1}`;
  pageInput.max = it.numPages || 1;
  // enable/disable page prev/next
  if ((it.currentPage || 1) <= 1) pagePrev.disabled = true; else pagePrev.disabled = false;
  if ((it.currentPage || 1) >= (it.numPages || 1)) pageNext.disabled = true; else pageNext.disabled = false;
}

function updateFileCounter() {
  try {
    const el = document.getElementById('fileCounter');
    if (!el) return;
    const total = items.length || 0;
    const idx = (currentIndex >= 0 ? currentIndex + 1 : 0);
    el.textContent = `ไฟล์ที่ ${idx}/${total}`;
    el.classList.remove('hidden');
    // update overlay nav visibility as well
    updateFileNavButtons();
  } catch (e) {}
}

function updateFileNavButtons() {
  try {
    const prev = document.getElementById('prevBtn');
    const next = document.getElementById('nextBtn');
    if (!prev || !next) return;
    const total = items.length || 0;
    if (total <= 1) {
      prev.classList.add('hidden');
      next.classList.add('hidden');
      return;
    }
    if (currentIndex <= 0) prev.classList.add('hidden'); else prev.classList.remove('hidden');
    if (currentIndex >= total - 1) next.classList.add('hidden'); else next.classList.remove('hidden');
  } catch (e) {}
}

// page control handlers
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'pagePrev') {
    changePage(-1);
  }
  if (e.target && e.target.id === 'pageNext') {
    changePage(1);
  }
  if (e.target && e.target.id === 'closeInline') {
    closeViewer();
  }
});
const pageInputEl = document.getElementById('pageInput');
if (pageInputEl) {
  pageInputEl.addEventListener('change', (e) => {
    const v = parseInt(e.target.value || '1', 10);
    const it = items[currentIndex];
    if (!it) return;
    it.currentPage = Math.min(Math.max(1, v), it.numPages || 1);
    if (viewerIframe && !viewerIframe.classList.contains('hidden') && it._iframeUrl) {
      showViewerLoader();
      viewerIframe.src = it._iframeUrl + '#page=' + it.currentPage;
    } else {
      renderViewer();
    }
  });
}

function changePage(delta) {
  const it = items[currentIndex];
  if (!it) return;
  it.currentPage = Math.min(Math.max(1, (it.currentPage || 1) + delta), it.numPages || 1);
  // if iframe preview is active, update fragment to show correct page
  if (viewerIframe && !viewerIframe.classList.contains('hidden') && it._iframeUrl) {
    showViewerLoader();
    viewerIframe.src = it._iframeUrl + '#page=' + it.currentPage;
    // onload will hide loader and update controls
  } else {
    renderViewer();
  }
}

function showViewerLoader(text) {
  const el = document.getElementById('viewerLoader');
  if (!el) return;
  if (text) {
    const t = el.querySelector('.loader-text');
    if (t) t.textContent = text;
  }
  el.classList.remove('hidden');
}

function hideViewerLoader() {
  const el = document.getElementById('viewerLoader');
  if (!el) return;
  el.classList.add('hidden');
}

// zoom via wheel/touch removed to avoid blurring and unwanted scaling

nameInput.addEventListener("input", (e) => {
  const val = e.target.value.trim();
  items[currentIndex].name = val;
  updateGridCaptions();
  checkDuplicatesUI();
  checkState();
});

function updateGridCaptions() {
  const names = Array.from(document.querySelectorAll(".card .name"));
  names.forEach((el, idx) => {
    el.textContent = items[idx].name || stripExt(items[idx].file.name);
  });
}

function checkDuplicatesUI() {
  const nameCounts = {};
  items.forEach((it) => {
    const n = (it.name || "").trim();
    if (n) nameCounts[n] = (nameCounts[n] || 0) + 1;
  });
  const cards = Array.from(document.querySelectorAll(".card"));
  cards.forEach((card, idx) => {
    const n = (items[idx].name || "").trim();
    const nameEl = card.querySelector(".name");
    if (n && nameCounts[n] > 1) {
      nameEl.classList.add("duplicate");
      card.classList.add("duplicate");
    } else {
      nameEl.classList.remove("duplicate");
      card.classList.remove("duplicate");
    }
  });
  // viewer input border
  const n = (items[currentIndex].name || "").trim();
  const dupMsgEl = document.getElementById('dupMsg');
  if (n && nameCounts[n] > 1) {
    nameInput.classList.add("duplicate");
    if (dupMsgEl) {
      dupMsgEl.textContent = 'ชื่อไฟล์ซ้ำกัน — กรุณาเปลี่ยนชื่อเพื่อดาวน์โหลดได้';
      dupMsgEl.classList.remove('hidden');
    }
  } else {
    nameInput.classList.remove("duplicate");
    if (dupMsgEl) {
      dupMsgEl.textContent = '';
      dupMsgEl.classList.add('hidden');
    }
  }

  // ensure download button state reflects duplicate situation
  checkState();
}

function hasEmptyNames() {
  return items.some((it) => !(it.name || "").trim());
}

function hasDuplicateNames() {
  const counts = {};
  for (const it of items) {
    const n = (it.name || "").trim();
    if (n) counts[n] = (counts[n] || 0) + 1;
  }
  return Object.values(counts).some((c) => c > 1);
}

function checkState() {
  if (items.length > 0 && !hasEmptyNames() && !hasDuplicateNames()) {
    downloadBtn.disabled = false;
    hideNotif();
  } else {
    downloadBtn.disabled = true;
    if (hasEmptyNames()) showNotif("กรุณาตั้งชื่อไฟล์ทั้งหมดก่อนดาวน์โหลด");
    else if (hasDuplicateNames())
      showNotif("มีชื่อไฟล์ซ้ำกัน ต้องแก้ก่อนดาวน์โหลด");
  }
}

function showNotif(msg) {
  notif.textContent = msg;
  notif.classList.remove("hidden");
}
function hideNotif() {
  notif.textContent = "";
  notif.classList.add("hidden");
}

downloadBtn.addEventListener("click", async () => {
  if (items.length === 0) return;
  if (hasEmptyNames()) {
    alert("ต้องตั้งชื่อไฟล์ทั้งหมดก่อน");
    return;
  }
  if (hasDuplicateNames()) {
    alert("มีชื่อซ้ำกัน แก้ก่อน");
    return;
  }
  const zip = new JSZip();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const filename = `${it.name.trim()}.pdf`;
    zip.file(filename, it.arrayBuffer);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, "pdfs.zip");
});

prevBtn.addEventListener("click", () => {
  gotoPrev();
});
nextBtn.addEventListener("click", () => {
  gotoNext();
});

function gotoNext() {
  if (currentIndex < items.length - 1) {
    currentIndex++;
    renderViewer();
    // focus and select the filename after navigation
    setTimeout(() => {
      try { nameInput.focus(); nameInput.select(); } catch (e) {}
    }, 0);
    updateFileCounter();
  }
}
function gotoPrev() {
  if (currentIndex > 0) {
    currentIndex--;
    renderViewer();
    // focus and select the filename after navigation
    setTimeout(() => {
      try { nameInput.focus(); nameInput.select(); } catch (e) {}
    }, 0);
    updateFileCounter();
  }
}

// keyboard handlers: Tab = next, Ctrl+Tab = prev when viewer open
// keyboard handlers: only keep Escape globally; remove arrow-based next/prev
document.addEventListener("keydown", (e) => {
  if (viewer.classList.contains("hidden")) return;
  if (e.key === "Escape") closeViewer();
});

// When `nameInput` is focused, pressing Enter should go to next file
if (nameInput) {
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      gotoNext();
    }
  });
}
