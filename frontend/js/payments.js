(() => {
  const ensureModal = () => {
    if (document.getElementById("imagePreviewModal")) return;

    const modal = document.createElement("div");
    modal.id = "imagePreviewModal";
    modal.className = "modal-backdrop hidden";
    modal.innerHTML = `
      <div class="modal-card">
        <div class="flex items-center justify-between gap-4">
          <h3 class="text-2xl">Screenshot Preview</h3>
          <button id="imagePreviewClose" class="btn-outline px-3 py-1 rounded-xl text-xs">Close</button>
        </div>
        <img id="imagePreviewImg" alt="Preview" class="mt-4 rounded-2xl max-h-[70vh] w-full object-contain border border-slate-700" />
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.classList.add("hidden");
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
    modal.querySelector("#imagePreviewClose").addEventListener("click", close);
  };

  const openPreview = (src) => {
    ensureModal();
    const modal = document.getElementById("imagePreviewModal");
    const img = document.getElementById("imagePreviewImg");
    img.src = src;
    modal.classList.remove("hidden");
  };

  window.openImagePreview = openPreview;

  const fileInput = document.getElementById("paymentScreenshot");
  const previewWrap = document.getElementById("screenshotPreviewWrap");
  const previewImg = document.getElementById("screenshotPreview");

  if (fileInput && previewWrap && previewImg) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (!file) {
        previewWrap.classList.add("hidden");
        previewImg.src = "";
        return;
      }
      const url = URL.createObjectURL(file);
      previewImg.src = url;
      previewWrap.classList.remove("hidden");
      previewImg.addEventListener("click", () => openPreview(url), { once: true });
    });
  }
})();

