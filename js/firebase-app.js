(function () {
  if (!window.firebase || !window.__FIREBASE_CONFIG__) return;
  var cfg = window.__FIREBASE_CONFIG__;
  if (!cfg.apiKey || cfg.apiKey === "REPLACE_ME") {
    console.warn(
      "Code & Canvas: set window.__FIREBASE_CONFIG__ in js/firebase-config.js (from Firebase Console).",
    );
    return;
  }
  if (!firebase.apps.length) {
    firebase.initializeApp(cfg);
  }
})();
