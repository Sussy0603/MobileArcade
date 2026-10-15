// money.js — Unblock
// =====================================================================
// ADS — always optional. Two places a player can choose to watch one:
//   1. Out of moves → watch an ad for +10 moves (or retry free)
//   2. Hint         → watch an ad to see the next best move
//
// In a normal browser it runs in DEMO mode (a 3-second fake ad).
// Inside the Android app (Capacitor) @capacitor-community/admob
// shows real rewarded video ads.
//
// BEFORE PUBLIC RELEASE: put your real AdMob rewarded unit ID below
// and set TESTING to false. Until then Google's TEST ads are shown.
// =====================================================================
var MONEY = {
  TESTING: true,
  REWARDED_ID: "ca-app-pub-3940256099942544/5224354917" // Google's TEST rewarded ID — replace with yours
};

(function () {
  function isNative() { return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); }
  function AdMob() { return isNative() && Capacitor.Plugins ? Capacitor.Plugins.AdMob : null; }
  if (isNative()) document.documentElement.classList.add("native");

  // ---------- small toast ----------
  function toast(msg) {
    var t = document.createElement("div");
    t.className = "ub-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add("out"); }, 2200);
    setTimeout(function () { t.remove(); }, 2700);
  }

  // ---------- sound pause while an ad plays ----------
  function pauseSound() { window.dispatchEvent(new Event("unblock:pause")); }
  function resumeSound() { window.dispatchEvent(new Event("unblock:resume")); }

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
      if (!r) toast("📺 No ad right now — try again in a minute");
      return done(r);
    });
  }

  // Browser preview: a 3-second fake ad so the flow can be tested.
  function demoAd() {
    return new Promise(function (res) {
      var n = 3, settled = false;
      var box = document.createElement("div");
      box.className = "ub-ad";
      box.innerHTML = '<div class="ub-ad-in"><div style="font-size:40px">📺</div>' +
        '<h3>Ad preview</h3><p id="ubAdTxt">A real video ad plays here in the app. 3…</p>' +
        '<button class="btn ghost" id="ubAdClose">Close (no reward)</button></div>';
      document.body.appendChild(box);
      var iv = setInterval(function () {
        n--;
        var t = document.getElementById("ubAdTxt");
        if (t) t.textContent = "A real video ad plays here in the app. " + n + "…";
        if (n <= 0) { clearInterval(iv); settled = true; box.remove(); res(true); }
      }, 1000);
      box.querySelector("#ubAdClose").addEventListener("click", function () {
        if (settled) return;
        clearInterval(iv); box.remove(); res(false);
      });
    });
  }

  var inited = false;
  function adsInit() {
    var Ad = AdMob();
    if (!Ad || inited) return;
    inited = true;
    try { Ad.initialize({ initializeForTesting: MONEY.TESTING }); } catch (e) {}
  }
  document.addEventListener("deviceready", adsInit, false);
  window.addEventListener("load", adsInit);

  window.UB_MONEY = { showRewardedAd: showRewardedAd, toast: toast };
})();
