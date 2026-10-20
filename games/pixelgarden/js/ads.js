'use strict';
/* Optional rewarded videos (AdMob). The player always chooses to watch.
   In a normal browser (the Arcade, testing) a short fake "test video" plays.

   >>> BEFORE RELEASE: replace the two TEST ids below with your real AdMob ids.
       App id also lives in android/app/src/main/AndroidManifest.xml. */
const AD_CONFIG = {
  rewardedId: 'ca-app-pub-3940256099942544/5224354917', // TEST rewarded unit — replace
  isTesting: true                                         // set false for release
};

const Ads = (() => {
  const P = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) || null;
  const native = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && P());
  let ready = false, loading = null, inited = false;

  async function init(){
    if (!native() || inited) return;
    inited = true;
    const A = P();
    try { await A.initialize({ initializeForTesting: AD_CONFIG.isTesting }); } catch(e){}
    // EU / UK consent form when required (Google UMP).
    try {
      const info = await A.requestConsentInfo();
      if (info && info.isConsentFormAvailable && info.status === 'REQUIRED') await A.showConsentForm();
    } catch(e){}
    preload();
  }
  function preload(){
    if (!native() || ready || loading) return loading;
    const A = P();
    loading = A.prepareRewardVideoAd({ adId: AD_CONFIG.rewardedId, isTesting: AD_CONFIG.isTesting })
      .then(() => { ready = true; })
      .catch(() => { ready = false; })
      .finally(() => { loading = null; });
    return loading;
  }
  function fakeAd(){
    return new Promise(res => {
      const el = document.getElementById('fakeAd');
      const bar = el.querySelector('.fill');
      el.classList.add('on');
      bar.style.transition = 'none'; bar.style.width = '0%';
      requestAnimationFrame(() => { bar.style.transition = 'width 2.4s linear'; bar.style.width = '100%'; });
      setTimeout(() => { el.classList.remove('on'); res(true); }, 2500);
    });
  }
  async function show(){
    Snd.pause(true);
    try {
      if (!native()) return await fakeAd();
      const A = P();
      if (!ready) { if (loading) await loading; else await preload(); }
      if (!ready) return false;
      ready = false;
      let rewarded = false;
      const h = await A.addListener('onRewardedVideoAdReward', () => { rewarded = true; });
      try {
        const item = await A.showRewardVideoAd();
        if (item && (item.amount !== undefined || item.type)) rewarded = true;
      } catch(e){}
      try { h && h.remove && h.remove(); } catch(e){}
      preload();
      return rewarded;
    } finally {
      Snd.pause(false);
    }
  }
  return { init, show, preload };
})();
