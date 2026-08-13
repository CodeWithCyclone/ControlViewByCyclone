// Shared client-side helpers: device fingerprint + small API wrapper.
(function () {
  function uuidv4() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getFingerprint() {
    var key = "device_fingerprint";
    var fp = localStorage.getItem(key);
    if (!fp) {
      fp = uuidv4();
      localStorage.setItem(key, fp);
    }
    return fp;
  }

  async function api(path, options) {
    options = options || {};
    var res = await fetch(path, Object.assign({ credentials: "include" }, options, {
      headers: Object.assign({ "Content-Type": "application/json" }, options.headers || {}),
    }));
    var data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      var err = new Error((data && data.error) || "Request failed");
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  window.ACC = { getFingerprint: getFingerprint, api: api };
})();
