const API_BASE = (() => {
  const host = window.location.hostname;

  const getLocalApiPort = () => {
    const raw = localStorage.getItem("API_PORT");
    const port = Number.parseInt(raw || "", 10);
    if (Number.isFinite(port) && port > 0 && port < 65536) return String(port);
    return "5000";
  };

  if (host === "localhost" || host === "127.0.0.1") {
    return `http://127.0.0.1:${getLocalApiPort()}/api`;
  }
  return "/api";
})();

window.APP_CONFIG = { API_BASE };

const setActiveNav = () => {
  const current = window.location.pathname.split("/").pop();
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.getAttribute("href") === current) {
      link.classList.add("text-emerald-400");
    }
  });
};

const setYear = () => {
  const yearEl = document.querySelector("[data-year]");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
};

setActiveNav();
setYear();
