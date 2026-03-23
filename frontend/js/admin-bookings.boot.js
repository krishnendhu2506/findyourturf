(() => {
  const show = (text) => {
    const msg = document.getElementById("bookingRequestsMessage");
    if (!msg) return;
    msg.textContent = text;
    msg.className = "text-sm text-rose-600";
  };

  // Some environments (e.g. certain live-server setups/extensions) may load a script
  // but not execute it. This boot file fetches and executes the admin bookings UI
  // code explicitly so the table always renders.
  const src = "js/admin-bookings.js?v=20260321";

  fetch(src, { cache: "no-store" })
    .then((resp) => {
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.text();
    })
    .then((code) => {
      try {
        // eslint-disable-next-line no-new-func
        new Function(code)();
      } catch (err) {
        const message = err && err.message ? err.message : String(err || "unknown");
        show(`Failed to run bookings UI: ${message}`);
      }
    })
    .catch((err) => {
      const message = err && err.message ? err.message : String(err || "unknown");
      show(`Failed to load bookings UI: ${message}`);
    });
})();

