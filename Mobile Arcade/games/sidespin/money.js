// money.js
// =====================================================================
// MONEY — 3 ways Sidespin earns (same setup as BlockJam):
//   1. Rewind        → lost a match? watch a rewarded ad to take your
//                      last shot again (once per match)
//   2. Theme unlocks → watch a rewarded ad to unlock one locked theme
//   3. Theme Pack    → one-time Google Play purchase that unlocks ALL themes
//
// Ads are always optional. In a normal browser everything runs in DEMO
// mode: ads are a short fake countdown, purchases only show a message.
// Inside the Android app (Capacitor) the real plugins take over:
//   • @capacitor-community/admob  → rewarded video ads
//   • cordova-plugin-purchase     → Google Play "theme_pack" purchase
//
// BEFORE RELEASE: put your real AdMob rewarded unit ID below and set
// MONEY.TESTING to false. Until then Google's TEST ads are shown.
// =====================================================================
var MONEY = {
  TESTING: true,
  REWARDED_ID: "ca-app-pub-3940256099942544/5224354917", // Google's TEST rewarded ID — replace with yours
  THEME_PACK_SKU: "theme_pack",   // must match the product ID in Play Console
  THEME_PACK_PRICE: "$1.99",      // replaced by the real Google Play price when the store loads
  FREE_THEMES: ["nature", "ete", "printemps", "automne", "hiver", "calme"]
};

(function () {
  // ---------- what the player owns (own key: "Erase all progress" keeps it) ----------
  var UNLOCK_KEY = "sidespin.unlocks.v1";
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(UNLOCK_KEY) || "{}");
      return { themes: o.themes || [], pack: !!o.pack };
    } catch (e) { return { themes: [], pack: false }; }
  }
  function save(u) { try { localStorage.setItem(UNLOCK_KEY, JSON.stringify(u)); } catch (e) {} }

  function isThemeUnlocked(id) {
    if (MONEY.FREE_THEMES.indexOf(id) >= 0) return true;
    var u = load();
    return u.pack || u.themes.indexOf(id) >= 0;
  }
  function unlockTheme(id) {
    var u = load();
    if (u.themes.indexOf(id) < 0) u.themes.push(id);
    save(u);
  }
  function grantPack() { // true only the first time
    var u = load();
    if (u.pack) return false;
    u.pack = true; save(u); return true;
  }

  var listeners = [];
  function changed() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }

  function A() { return window.CUE_APP; }
  function info(icon, title, sub) { if (A()) A().toast(icon, title, sub || ""); }

  // ---------- pause game sound while an ad plays ----------
  function pauseSound() { window.dispatchEvent(new Event("sidespin:pause")); }
  function resumeSound() { window.dispatchEvent(new Event("sidespin:resume")); }

  // ---------- rewarded ads ----------
  function isNative() { return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); }
  function AdMob() { return isNative() && window.Capacitor.Plugins ? Capacitor.Plugins.AdMob : null; }
  var adBusy = false;

  // Shows one rewarded ad. Resolves true only if the player earned the reward.
  function showRewardedAd() {
    if (adBusy) return Promise.resolve(false);
    adBusy = true;
    pauseSound();
    function done(r) { adBusy = false; resumeSound(); return r; }
    var Ad = AdMob();
    if (!Ad) return demoAd().then(done);
    return new Promise(function (res) {
      var earned = false, finished = false, hs = [];
      function finish() {
        if (finished) return;
        finished = true;
        hs.forEach(function (h) { try { h.remove(); } catch (e) {} });
        res(earned);
      }
      (async function () {
        try {
          hs.push(await Ad.addListener("onRewardedVideoAdReward", function () { earned = true; }));
          hs.push(await Ad.addListener("onRewardedVideoAdDismissed", function () { setTimeout(finish, 250); }));
          hs.push(await Ad.addListener("onRewardedVideoAdFailedToShow", finish));
          await Ad.prepareRewardVideoAd({ adId: MONEY.REWARDED_ID, isTesting: MONEY.TESTING });
          var item = await Ad.showRewardVideoAd();
          if (item && item.amount !== undefined) earned = true;
          setTimeout(finish, 600);
        } catch (e) { finish(); }
      })();
    }).then(function (r) {
      if (!r) info("📺", "No ad right now", "Try again in a minute");
      return done(r);
    });
  }

  // Browser preview: a 3-second fake ad so the flow can be tested.
  function demoAd() {
    return new Promise(function (res) {
      var n = 3, settled = false;
      var iv = setInterval(function () {
        n--;
        var t = document.getElementById("mText");
        if (t) t.textContent = "A real video ad plays here in the app. " + n + "…";
        if (n <= 0) { clearInterval(iv); settled = true; A().closeModal(); res(true); }
      }, 1000);
      A().modal("📺", "Ad preview", "A real video ad plays here in the app. " + n + "…", [
        { label: "Close (no reward)", ghost: true, fn: function () { if (!settled) { clearInterval(iv); res(false); } } }
      ]);
    });
  }

  function adsInit() {
    var Ad = AdMob();
    if (!Ad) return;
    try { Ad.initialize({ initializeForTesting: MONEY.TESTING }); } catch (e) {}
  }

  // ---------- Google Play: Theme Pack (one-time purchase) ----------
  var iapReady = false;
  function store() { return window.CdvPurchase && CdvPurchase.store; }
  function iapInit() {
    var Cdv = window.CdvPurchase;
    if (!Cdv || iapReady) return;
    iapReady = true;
    var st = Cdv.store;
    st.register([{ id: MONEY.THEME_PACK_SKU, type: Cdv.ProductType.NON_CONSUMABLE, platform: Cdv.Platform.GOOGLE_PLAY }]);
    st.when()
      .productUpdated(function (p) {
        if (p.id !== MONEY.THEME_PACK_SKU) return;
        if (p.pricing && p.pricing.price) { MONEY.THEME_PACK_PRICE = p.pricing.price; changed(); }
        if (p.owned && grantPack()) changed(); // bought before (new phone / reinstall)
      })
      .approved(function (tr) {
        if (grantPack()) {
          info("👑", "Thank you!", "All themes unlocked");
          if (A()) A().sfxBadge();
          changed();
        }
        tr.finish(); // tells Google Play the purchase was delivered
      });
    st.error(function (e) {
      if (e && e.code !== Cdv.ErrorCode.PAYMENT_CANCELLED) info("⚠️", "Store error", "Please try again");
    });
    st.initialize([Cdv.Platform.GOOGLE_PLAY]);
  }
  document.addEventListener("deviceready", function () { adsInit(); iapInit(); }, false);

  function buyThemePack() {
    var st = store();
    if (st) {
      var pr = st.get(MONEY.THEME_PACK_SKU);
      var offer = pr && pr.getOffer();
      if (!offer) { info("⏳", "Store is loading", "Try again in a moment"); return; }
      offer.order();
      return;
    }
    A().modal("👑", "Theme Pack", "Purchases work in the Android app through Google Play.", [{ label: "OK" }]);
  }
  function restorePurchases() {
    var st = store();
    if (!st) { info("🛒", "Restore", "Works in the Android app"); return; }
    st.restorePurchases();
    info("🛒", "Checking your purchases…");
  }

  // ---------- locked theme pop-up ----------
  // onUnlocked(id) is called after a theme gets unlocked by an ad.
  function openThemeUnlock(theme, onUnlocked) {
    A().modal("🔒", theme.label, "This theme is locked. Unlock it forever:", [
      { label: "▶ Watch an ad", fn: function () {
          showRewardedAd().then(function (ok) {
            if (!ok) return;
            unlockTheme(theme.id);
            A().sfxBadge();
            info("🎨", theme.label + " unlocked!");
            if (onUnlocked) onUnlocked(theme.id);
            changed();
          });
        } },
      { label: "👑 Unlock ALL themes — " + MONEY.THEME_PACK_PRICE, fn: buyThemePack },
      { label: "Not now", ghost: true }
    ]);
  }

  window.SS_MONEY = {
    isThemeUnlocked: isThemeUnlocked,
    ownsPack: function () { return load().pack; },
    showRewardedAd: showRewardedAd,
    buyThemePack: buyThemePack,
    restorePurchases: restorePurchases,
    openThemeUnlock: openThemeUnlock,
    onChange: function (f) { listeners.push(f); },
    price: function () { return MONEY.THEME_PACK_PRICE; }
  };
})();
