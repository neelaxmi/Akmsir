let currentPdfUrl = '';
let currentPdfTitle = '';

// Initialize PDF.js
const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

function openPdf(link, title = 'Module PDF') {
  currentPdfUrl = link;
  currentPdfTitle = title;
  
  // Auto-convert standard drive links for direct fetching
  let fetchUrl = link;
  if (link.includes('drive.google.com')) {
    // Use a proxy or direct export link if CORS allows, 
    // otherwise default to the iframe preview method
    fetchUrl = link.replace(/\/view.*/, '/preview').replace(/\/edit.*/, '/preview');
  }
  
  const container = document.getElementById('pdf-viewer-container');
  document.getElementById('pdf-title').innerText = title;
  document.getElementById('download-btn').onclick = () => window.open(link, '_blank');
  
  container.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  
  // PDF.js Rendering Logic
  renderPdfWithJS(fetchUrl);
}

async function renderPdfWithJS(url) {
  const canvas = document.getElementById('pdf-render-canvas');
  const ctx = canvas.getContext('2d');
  
  try {
    const loadingTask = pdfjsLib.getDocument(url);
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1); // Load first page
    
    const viewport = page.getViewport({ scale: 1.5 });
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };
    await page.render(renderContext).promise;
  } catch (error) {
    console.error("PDF.js Render Error:", error);
    // Fallback to Iframe if PDF.js fails due to CORS
    document.getElementById('pdf-canvas-wrapper').innerHTML = `
            <iframe src="${url}" style="width:90vw; height:80vh; border:none; background:white;"></iframe>`;
  }
}

function sharePdfLink() {
  // Generates a link to your website with the PDF URL as a parameter
  const baseUrl = window.location.origin + window.location.pathname;
  const shareUrl = `${baseUrl}?pdf=${encodeURIComponent(currentPdfUrl)}&title=${encodeURIComponent(currentPdfTitle)}`;
  
  navigator.clipboard.writeText(shareUrl).then(() => {
    alert("Shareable link copied to clipboard! This link will open this PDF on our website.");
  });
}

// Logic to check URL parameters on page load to auto-open shared PDFs
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const pdfUrl = params.get('pdf');
  const pdfTitle = params.get('title');
  
  if (pdfUrl) {
    openPdf(pdfUrl, pdfTitle || 'Shared Module');
  }
});