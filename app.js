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
const uploadOverlay = document.getElementById("uploadOverlay");
const uploadProgressBar = document.getElementById("uploadProgressBar");
const uploadPercent = document.getElementById("uploadPercent");
const processingOverlay = document.getElementById("processingOverlay");
const processingText = document.getElementById("processingText");
const addFileInput = document.getElementById("addFileInput");
const pageThumbnailPanel = document.getElementById("pageThumbnailPanel");
const thumbnailStrip = document.getElementById("thumbnailStrip");
const openThumbnailPanelBtn = document.getElementById("openThumbnailPanelBtn");
const closeThumbnailPanelBtn = document.getElementById("closeThumbnailPanel");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const thumbnailBackdrop = document.getElementById("thumbnailBackdrop");
const openSortPanelBtn = document.getElementById("openSortPanelBtn");
const pageSortPanel = document.getElementById("pageSortPanel");
const sortStrip = document.getElementById("sortStrip");
const closeSortPanelBtn = document.getElementById("closeSortPanelBtn");
const saveSortBtn = document.getElementById("saveSortBtn");
const sortBackdrop = document.getElementById("sortBackdrop");

let items = []; // {file, name, arrayBuffer, pdf}
let currentIndex = -1;
let viewerBaseScale = 1;

// Add file input handler for merging PDFs in viewer
addFileInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length || currentIndex < 0) return;

  // Validate file types - only allow PDF files
  const nonPdfFiles = files.filter(file => {
    const fileName = file.name.toLowerCase();
    const fileType = file.type;
    return !fileName.endsWith('.pdf') && fileType !== 'application/pdf';
  });

  if (nonPdfFiles.length > 0) {
    alert(`ข้อผิดพลาด: ไม่สามารถเพิ่มไฟล์ที่ไม่ใช่ PDF ได้\n\nไฟล์ที่ไม่ใช่ PDF: ${nonPdfFiles.map(f => f.name).join(', ')}`);
    e.target.value = '';
    return;
  }

  // Show processing overlay
  if (processingOverlay) {
    processingText.textContent = 'กำลังรวมไฟล์...';
    processingOverlay.classList.remove('hidden');
  }

  try {
    const it = items[currentIndex];
    const { PDFDocument } = PDFLib;

    // Load current PDF
    let currentPdfDoc;
    try {
      currentPdfDoc = await PDFDocument.load(it.arrayBuffer, { ignoreEncryption: true });
    } catch (loadErr) {
      throw new Error(`ไฟล์ PDF ปัจจุบันเสียหายหรือไม่ถูกต้อง: ${loadErr.message}`);
    }

    // Create a new PDF to avoid encryption in output
    const newPdfDoc = await PDFDocument.create();

    // Copy all pages from current PDF
    let currentPages;
    try {
      currentPages = await newPdfDoc.copyPages(currentPdfDoc, currentPdfDoc.getPageIndices());
      currentPages.forEach(page => newPdfDoc.addPage(page));
    } catch (copyErr) {
      throw new Error(`ไม่สามารถคัดลอกหน้าจากไฟล์ปัจจุบัน "${it.name}": ${copyErr.message}`);
    }

    // Merge all selected files
    for (const file of files) {
      const fileArrayBuffer = await file.arrayBuffer();
      let filePdf;
      try {
        filePdf = await PDFDocument.load(fileArrayBuffer, { ignoreEncryption: true });
      } catch (loadErr) {
        throw new Error(`ไฟล์ "${file.name}" เสียหายหรือไม่ถูกต้อง: ${loadErr.message}`);
      }
      let copiedPages;
      try {
        copiedPages = await newPdfDoc.copyPages(filePdf, filePdf.getPageIndices());
        copiedPages.forEach(page => newPdfDoc.addPage(page));
      } catch (copyErr) {
        throw new Error(`ไม่สามารถคัดลอกหน้าจากไฟล์ "${file.name}": ${copyErr.message}`);
      }
    }

    // Save merged PDF (new PDF has no encryption)
    const mergedPdfBytes = await newPdfDoc.save();
    it.arrayBuffer = mergedPdfBytes.buffer;

    // Update PDF.js instance (merged PDF should have encryption removed)
    try {
      it.pdf = await pdfjsLib.getDocument({ data: it.arrayBuffer }).promise;
      it.numPages = it.pdf.numPages;
    } catch (pdfErr) {
      // If pdf.js can't load it (e.g., still encrypted), create a minimal PDF object
      console.warn('pdf.js could not load merged PDF:', pdfErr);
      it.pdf = null;
      it.numPages = 1;
    }
    it.currentPage = 1;

    // Revoke old iframe URL
    if (it._iframeUrl) {
      URL.revokeObjectURL(it._iframeUrl);
      it._iframeUrl = null;
    }

    // Update viewer
    renderViewer();
    updateGridCaptions();
    await updateGridThumbnail(currentIndex);
    checkState();

  } catch (err) {
    console.error('Error merging PDFs:', err);
    alert('เกิดข้อผิดพลาดในการรวมไฟล์: ' + err.message);
  } finally {
    // Hide processing overlay
    try { if (processingOverlay) processingOverlay.classList.add('hidden'); } catch(e){}
    e.target.value = '';
  }
});

// Open thumbnail panel button handler
openThumbnailPanelBtn.addEventListener("click", async () => {
  if (currentIndex < 0) return;
  await generatePageThumbnails();
  pageThumbnailPanel.classList.remove("hidden");
  thumbnailBackdrop.classList.remove("hidden");
});

// Close thumbnail panel button handler
closeThumbnailPanelBtn.addEventListener("click", () => {
  pageThumbnailPanel.classList.add("hidden");
  thumbnailBackdrop.classList.add("hidden");
});

// Click on backdrop to close panel
thumbnailBackdrop.addEventListener("click", () => {
  pageThumbnailPanel.classList.add("hidden");
  thumbnailBackdrop.classList.add("hidden");
});

// Open sort panel button handler
openSortPanelBtn.addEventListener("click", async () => {
  if (currentIndex < 0) return;
  await generateSortThumbnails();
  pageSortPanel.classList.remove("hidden");
  sortBackdrop.classList.remove("hidden");
});

// Close sort panel button handler
closeSortPanelBtn.addEventListener("click", () => {
  pageSortPanel.classList.add("hidden");
  sortBackdrop.classList.add("hidden");
});

// Click on sort backdrop to close panel
sortBackdrop.addEventListener("click", () => {
  pageSortPanel.classList.add("hidden");
  sortBackdrop.classList.add("hidden");
});

// Save sort button handler - apply page reordering to PDF
saveSortBtn.addEventListener("click", async () => {
  const thumbnails = Array.from(sortStrip.querySelectorAll('.sort-thumbnail'));
  if (thumbnails.length === 0) return;

  // Get the new page order (original page numbers in the new order)
  const newPageOrder = thumbnails.map(th => parseInt(th.dataset.pageNumber));

  // Close sort panel
  pageSortPanel.classList.add("hidden");
  sortBackdrop.classList.add("hidden");

  // Show processing overlay
  if (processingOverlay) {
    processingText.textContent = 'กำลังจัดเรียงหน้า...';
    processingOverlay.classList.remove('hidden');
  }

  try {
    const it = items[currentIndex];
    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.load(it.arrayBuffer, { ignoreEncryption: true });

    // Create a new PDF with pages in the new order
    const newPdfDoc = await PDFDocument.create();

    // Copy pages in the new order (0-indexed, so subtract 1)
    for (const originalPageNum of newPageOrder) {
      const copiedPages = await newPdfDoc.copyPages(pdfDoc, [originalPageNum - 1]);
      copiedPages.forEach(page => newPdfDoc.addPage(page));
    }

    // Save the reordered PDF
    const reorderedPdfBytes = await newPdfDoc.save();
    it.arrayBuffer = reorderedPdfBytes.buffer;

    // Update PDF.js instance (merged PDF should have encryption removed)
    try {
      it.pdf = await pdfjsLib.getDocument({ data: it.arrayBuffer }).promise;
      it.numPages = it.pdf.numPages;
    } catch (pdfErr) {
      // If pdf.js can't load it (e.g., still encrypted), create a minimal PDF object
      console.warn('pdf.js could not load merged PDF:', pdfErr);
      it.pdf = null;
      it.numPages = 1;
    }
    it.currentPage = 1;

    // Revoke old iframe URL
    if (it._iframeUrl) {
      URL.revokeObjectURL(it._iframeUrl);
      it._iframeUrl = null;
    }

    // Update viewer
    renderViewer();
    updateGridCaptions();
    await updateGridThumbnail(currentIndex);
    checkState();

  } catch (err) {
    console.error('Error reordering pages:', err);
    alert('เกิดข้อผิดพลาดในการจัดเรียงหน้า: ' + err.message);
  } finally {
    // Hide processing overlay
    try { if (processingOverlay) processingOverlay.classList.add('hidden'); } catch(e){}
  }
});

// Delete selected pages button handler
deleteSelectedBtn.addEventListener("click", async () => {
  const selectedThumbnails = thumbnailStrip.querySelectorAll(".page-thumbnail.selected");
  if (selectedThumbnails.length === 0) return;

  const selectedPages = Array.from(selectedThumbnails).map(th => parseInt(th.dataset.pageNumber)).sort((a, b) => b - a); // Sort descending to delete from end first

  // Check if deleting all pages
  const it = items[currentIndex];
  if (selectedPages.length === it.numPages) {
    alert('ไม่สามารถลบหน้าทั้งหมดได้ ต้องมีหน้าอย่างน้อย 1 หน้า');
    return;
  }

  if (!confirm(`ต้องการลบ ${selectedPages.length} หน้า?`)) {
    return;
  }

  // Close thumbnail panel
  pageThumbnailPanel.classList.add("hidden");
  thumbnailBackdrop.classList.add("hidden");

  // Show processing overlay
  if (processingOverlay) {
    processingText.textContent = 'กำลังลบหน้า...';
    processingOverlay.classList.remove('hidden');
  }

  try {
    const it = items[currentIndex];
    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.load(it.arrayBuffer, { ignoreEncryption: true });

    // Create a new PDF to avoid encryption in output
    const newPdfDoc = await PDFDocument.create();

    // Copy all pages except the ones to be deleted (0-indexed)
    const allPageIndices = pdfDoc.getPageIndices();
    const pagesToKeep = allPageIndices.filter(idx => !selectedPages.includes(idx + 1));
    const copiedPages = await newPdfDoc.copyPages(pdfDoc, pagesToKeep);
    copiedPages.forEach(page => newPdfDoc.addPage(page));

    // Save modified PDF (new PDF has no encryption)
    const modifiedPdfBytes = await newPdfDoc.save();
    it.arrayBuffer = modifiedPdfBytes.buffer;

    // Update PDF.js instance (merged PDF should have encryption removed)
    try {
      it.pdf = await pdfjsLib.getDocument({ data: it.arrayBuffer }).promise;
      it.numPages = it.pdf.numPages;
    } catch (pdfErr) {
      // If pdf.js can't load it (e.g., still encrypted), create a minimal PDF object
      console.warn('pdf.js could not load modified PDF:', pdfErr);
      it.pdf = null;
      it.numPages = 1;
    }

    // Adjust current page if needed
    if (it.currentPage > it.numPages) {
      it.currentPage = it.numPages;
    }

    // Revoke old iframe URL
    if (it._iframeUrl) {
      URL.revokeObjectURL(it._iframeUrl);
      it._iframeUrl = null;
    }

    // Update viewer
    renderViewer();
    updateGridCaptions();
    await updateGridThumbnail(currentIndex);
    checkState();

  } catch (err) {
    console.error('Error deleting pages:', err);
    alert('เกิดข้อผิดพลาดในการลบหน้า: ' + err.message);
  } finally {
    // Hide processing overlay
    try { if (processingOverlay) processingOverlay.classList.add('hidden'); } catch(e){}
  }
});

// Generate thumbnails for all pages
async function generatePageThumbnails() {
  const it = items[currentIndex];
  if (!it || !it.pdf) return;

  thumbnailStrip.innerHTML = "";
  
  // Disable delete selected button initially
  if (deleteSelectedBtn) {
    deleteSelectedBtn.disabled = true;
  }
  
  // Show processing overlay
  if (processingOverlay) {
    processingText.textContent = 'กำลังสร้างตัวอย่างหน้า...';
    processingOverlay.classList.remove('hidden');
  }

  console.log('it',it)
  try {
    for (let i = 1; i <= it.numPages; i++) {
      const page = await it.pdf.getPage(i);
      const viewport = page.getViewport({ scale: 0.3 });
      
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;

      const thumbnail = document.createElement("div");
      thumbnail.className = "page-thumbnail";
      thumbnail.dataset.pageNumber = i;

      // Make thumbnail clickable to toggle selection
      thumbnail.addEventListener("click", () => {
        thumbnail.classList.toggle("selected");
        updateDeleteSelectedButton();
      });

      const pageNumber = document.createElement("div");
      pageNumber.className = "page-thumbnail-number";
      pageNumber.textContent = i;

      thumbnail.appendChild(canvas);
      thumbnail.appendChild(pageNumber);

      thumbnailStrip.appendChild(thumbnail);
    }
  } catch (err) {
    console.error('Error generating thumbnails:', err);
    alert('เกิดข้อผิดพลาดในการสร้างตัวอย่าง: ' + err.message);
  } finally {
    // Hide processing overlay
    try { if (processingOverlay) processingOverlay.classList.add('hidden'); } catch(e){}
  }
}

// Update delete selected button state
function updateDeleteSelectedButton() {
  const selectedThumbnails = thumbnailStrip.querySelectorAll(".page-thumbnail.selected");
  if (deleteSelectedBtn) {
    deleteSelectedBtn.disabled = selectedThumbnails.length === 0;
  }
}

// Generate sortable thumbnails for all pages
async function generateSortThumbnails() {
  const it = items[currentIndex];
  if (!it || !it.pdf) return;

  sortStrip.innerHTML = "";

  // Show processing overlay
  if (processingOverlay) {
    processingText.textContent = 'กำลังสร้างตัวอย่างหน้า...';
    processingOverlay.classList.remove('hidden');
  }

  try {
    for (let i = 1; i <= it.numPages; i++) {
      const page = await it.pdf.getPage(i);
      const viewport = page.getViewport({ scale: 0.3 });

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;

      const thumbnail = document.createElement("div");
      thumbnail.className = "sort-thumbnail";
      thumbnail.dataset.pageNumber = i;
      thumbnail.draggable = true;

      // Add drag event listeners
      thumbnail.addEventListener("dragstart", handleDragStart);
      thumbnail.addEventListener("dragend", handleDragEnd);
      thumbnail.addEventListener("dragover", handleDragOver);
      thumbnail.addEventListener("drop", handleDrop);
      thumbnail.addEventListener("dragenter", handleDragEnter);
      thumbnail.addEventListener("dragleave", handleDragLeave);

      const pageNumber = document.createElement("div");
      pageNumber.className = "sort-thumbnail-number";
      pageNumber.textContent = i;

      thumbnail.appendChild(canvas);
      thumbnail.appendChild(pageNumber);

      sortStrip.appendChild(thumbnail);
    }
  } catch (err) {
    console.error('Error generating sort thumbnails:', err);
    alert('เกิดข้อผิดพลาดในการสร้างตัวอย่าง: ' + err.message);
  } finally {
    // Hide processing overlay
    try { if (processingOverlay) processingOverlay.classList.add('hidden'); } catch(e){}
  }
}

// Drag and drop handlers
let draggedItem = null;

function handleDragStart(e) {
  draggedItem = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  draggedItem = null;
  // Remove drag-over class from all thumbnails
  document.querySelectorAll('.sort-thumbnail').forEach(th => {
    th.classList.remove('drag-over');
  });
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDragEnter(e) {
  if (this !== draggedItem) {
    this.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  this.classList.remove('drag-over');
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }

  if (draggedItem !== this) {
    // Get all thumbnails
    const thumbnails = Array.from(sortStrip.querySelectorAll('.sort-thumbnail'));
    const draggedIndex = thumbnails.indexOf(draggedItem);
    const dropIndex = thumbnails.indexOf(this);

    if (draggedIndex < dropIndex) {
      // Insert after drop target
      this.parentNode.insertBefore(draggedItem, this.nextSibling);
    } else {
      // Insert before drop target
      this.parentNode.insertBefore(draggedItem, this);
    }

    // Update page numbers
    updateSortThumbnailNumbers();
  }

  return false;
}

function updateSortThumbnailNumbers() {
  const thumbnails = sortStrip.querySelectorAll('.sort-thumbnail');
  thumbnails.forEach((th, index) => {
    const numberEl = th.querySelector('.sort-thumbnail-number');
    if (numberEl) {
      numberEl.textContent = index + 1;
    }
  });
}

fileInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  
  // Validate file types - only allow PDF files
  const nonPdfFiles = files.filter(file => {
    const fileName = file.name.toLowerCase();
    const fileType = file.type;
    return !fileName.endsWith('.pdf') && fileType !== 'application/pdf';
  });
  
  if (nonPdfFiles.length > 0) {
    const nonPdfNames = nonPdfFiles.map(f => f.name).join(', ');
    alert(`ข้อผิดพลาด: ไม่สามารถอัปโหลดไฟล์ที่ไม่ใช่ PDF ได้\n\nไฟล์ที่ไม่ใช่ PDF: ${nonPdfNames}\n\nกรุณาเลือกเฉพาะไฟล์ PDF เท่านั้น`);
    e.target.value = ''; // Clear the file input
    return;
  }
  
  // show processing overlay while reading files
  if (processingOverlay) {
    processingText.textContent = 'กำลังอ่านไฟล์...';
    processingOverlay.classList.remove('hidden');
  }
  // revoke any existing object URLs from previous items
  try {
    (items || []).forEach((it) => {
      if (it && it._iframeUrl) URL.revokeObjectURL(it._iframeUrl);
    });
  } catch (err) {}
  items = [];
  grid.innerHTML = "";

  // Validate each PDF file can be loaded AND copied (some files load but fail during copyPages)
  const corruptedFiles = [];
  for (const f of files) {
    const ab = await f.arrayBuffer();
    try {
      const { PDFDocument } = PDFLib;
      const pdfDoc = await PDFDocument.load(ab, { ignoreEncryption: true });

      // Try copying a page to detect files that fail during copy operation
      const testPdf = await PDFDocument.create();
      const pageIndices = pdfDoc.getPageIndices();
      if (pageIndices.length > 0) {
        await testPdf.copyPages(pdfDoc, [pageIndices[0]]);
      }

      const item = { file: f, name: stripExt(f.name), arrayBuffer: ab, currentPage: 1, numPages: 1, _iframeUrl: null };
      items.push(item);
    } catch (loadErr) {
      corruptedFiles.push(f.name);
    }
  }

  if (corruptedFiles.length > 0) {
    alert(`ข้อผิดพลาด: ไฟล์ PDF ต่อไปนี้เสียหายหรือไม่ถูกต้อง ไม่สามารถใช้งานได้:\n\n${corruptedFiles.join('\n')}\n\nกรุณาตรวจสอบไฟล์และลองใหม่`);
    e.target.value = '';
    if (processingOverlay) processingOverlay.classList.add('hidden');
    return;
  }
  await renderAllThumbnails();
  checkState();
  // hide processing overlay (renderAllThumbnails will also hide when done)
  try { if (processingOverlay) processingOverlay.classList.add('hidden'); } catch(e){}
});

// Upload logic using XMLHttpRequest to allow upload progress events
let currentXhr = null;

function showUploadOverlay() {
  if (!uploadOverlay) return;
  uploadOverlay.classList.remove('hidden');
  updateUploadProgress(0);
}

function hideUploadOverlay() {
  if (!uploadOverlay) return;
  uploadOverlay.classList.add('hidden');
}

function updateUploadProgress(pct) {
  if (uploadProgressBar) uploadProgressBar.style.width = pct + '%';
  if (uploadPercent) uploadPercent.textContent = Math.round(pct) + '%';
}

function stripExt(name) {
  return name.replace(/\.pdf$/i, "");
}

async function renderAllThumbnails() {
  grid.innerHTML = "";
  // show a quick loader while generating thumbnails
  if (processingOverlay) {
    if (processingText) processingText.textContent = 'กำลังสร้างตัวอย่าง...';
    processingOverlay.classList.remove('hidden');
  }
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
      it.numPages = pdf.numPages;
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
  if (processingOverlay) processingOverlay.classList.add('hidden');
}

function openViewer(index) {
  currentIndex = index;
  viewer.classList.remove("hidden");
  renderViewer();
  // focus and select the filename for quick renaming
  setTimeout(() => {
    try { ameInput.focus(); nameInput.select(); } catch (e) {}
  }, 0);
  updateFileCounter();
}

function closeViewer() {
  viewer.classList.add("hidden");
  // Close thumbnail panel if open
  try { pageThumbnailPanel.classList.add('hidden'); } catch(e){}
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
    } catch {
      // fallback
      viewerIframe.classList.add('hidden');
      viewerCanvas.classList.remove('hidden');
      await renderViewerCanvas(it, pageIndex);
    }
  } catch {
    // final fallback to canvas
    await renderViewerCanvas(it, it.currentPage || 1);
  }
  checkDuplicatesUI();
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

// Control panel drawer toggle
const controlPanelToggle = document.getElementById('controlPanelToggle');
const controlPanelContent = document.getElementById('controlPanelContent');
const drawerIcon = document.getElementById('drawerIcon');
const toggleText = document.getElementById('toggleText');
let isControlPanelExpanded = true;

function setControlPanelExpanded(expanded) {
  isControlPanelExpanded = expanded;
  if (!controlPanelContent) return;
  
  if (expanded) {
    controlPanelContent.classList.remove('py-0');
    controlPanelContent.classList.add('py-3');
    // Use a fixed large max-height to allow content to determine size
    controlPanelContent.style.maxHeight = '500px';
    controlPanelContent.style.opacity = '1';
    if (drawerIcon) drawerIcon.style.transform = 'rotate(0deg)';
    if (toggleText) toggleText.textContent = 'พับ';
  } else {
    controlPanelContent.classList.remove('py-3');
    controlPanelContent.classList.add('py-0');
    controlPanelContent.style.maxHeight = '0';
    controlPanelContent.style.opacity = '0';
    if (drawerIcon) drawerIcon.style.transform = 'rotate(-90deg)';
    if (toggleText) toggleText.textContent = 'เปิด';
  }
}

if (controlPanelToggle && controlPanelContent) {
  // Initialize with proper height
  setControlPanelExpanded(true);
  
  controlPanelToggle.addEventListener('click', () => {
    setControlPanelExpanded(!isControlPanelExpanded);
  });
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
    el.textContent = items[idx].name || "(ไม่มีชื่อ)";
  });
}

async function updateGridThumbnail(index) {
  const cards = document.querySelectorAll(".card");
  if (index < 0 || index >= cards.length) return;
  
  const card = cards[index];
  const canvas = card.querySelector("canvas");
  if (!canvas) return;
  
  const it = items[index];
  if (!it || !it.arrayBuffer) return;
  
  try {
    const pdf = await pdfjsLib.getDocument({ data: it.arrayBuffer }).promise;
    it.pdf = pdf;
    it.numPages = pdf.numPages;
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
