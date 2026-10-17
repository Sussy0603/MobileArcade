// ==========================================================
// store.js — who is signed in, and where progress is saved.
//
// Two modes:
//  • FIREBASE: Google sign-in + progress saved online (Firestore),
//    one private document per person: users/{uid}
//  • LOCAL: no config yet → progress saved in this browser only.
// The rest of the app doesn't care which mode is used.
// ==========================================================
import { firebaseConfig, FIREBASE_VERSION, ADMIN_EMAILS } from './config.js';

const LOCAL_KEY = 'cpp-pas-a-pas:data';

// What a brand-new person starts with.
export function defaultData() {
  return {
    v: 1,
    onboarded: false,
    nickname: '',
    avatar: '🐱',
    accent: '#ff3ea5',
    accessory: 'headphones',
    fur: '#22123a',
    textSize: 1,          // 0 small, 1 medium, 2 big
    sounds: false,
    reduceMotion: false,
    examDates: {},        // { ex2: '2026-10-05', ... } overrides the guessed dates
    progress: {},         // { notionId: { lesson: true, cards: {0: true}, puzzles: {0: true}, explain: {0: true} } }
    weak: [],             // [{ key, label, notionId, at }]
    stats: { puzzlesSolved: 0, bugsFound: 0, bestMock: null, perfect: false, night: false },
    last: null,           // { notionId, tab }
    defi: {},             // { '2026-09-28': true } days the daily challenge was solved
  };
}

export const store = {
  mode: 'local',          // 'firebase' or 'local'
  user: null,             // { uid, name, email } or null
  data: defaultData(),
  isAdmin: false,
  _fb: null,              // Firebase modules, once loaded
  _saveTimer: null,
  _listeners: [],

  onChange(fn) { this._listeners.push(fn); },
  _emit() { this._listeners.forEach(fn => fn(this.user)); },

  // ---------- start ----------
  async init() {
    if (!firebaseConfig.apiKey) {
      this.mode = 'local';
      this.user = null;           // shows the login screen; "sign in" = local profile
      try { const raw = localStorage.getItem(LOCAL_KEY); if (raw) { this.user = { uid: 'local', name: 'toi', email: '' }; this.data = { ...defaultData(), ...JSON.parse(raw) }; } } catch { /* storage blocked: start fresh */ }
      this._emit();
      return;
    }
    this.mode = 'firebase';
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-auth.js`),
      import(`${base}/firebase-firestore.js`),
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    const auth = authMod.getAuth(app);
    auth.languageCode = 'fr';
    let db;
    try {
      db = fsMod.initializeFirestore(app, { localCache: fsMod.persistentLocalCache() }); // works offline too
    } catch {
      db = fsMod.getFirestore(app);
    }
    this._fb = { authMod, fsMod, auth, db };
    try { await authMod.getRedirectResult(auth); } catch (e) { console.warn('redirect result', e); }

    await new Promise(resolve => {
      let first = true;
      authMod.onAuthStateChanged(auth, async u => {
        if (u) {
          this.user = { uid: u.uid, name: u.displayName || '', email: u.email || '' };
          this.isAdmin = !!u.email && ADMIN_EMAILS.includes(u.email.toLowerCase());
          await this._loadRemote();
        } else {
          this.user = null;
          this.isAdmin = false;
          this.data = defaultData();
        }
        if (first) { first = false; resolve(); } else this._emit();
      });
    });
    this._emit();
  },

  async _loadRemote() {
    const { fsMod, db } = this._fb;
    try {
      const snap = await fsMod.getDoc(fsMod.doc(db, 'users', this.user.uid));
      this.data = snap.exists() ? { ...defaultData(), ...snap.data() } : defaultData();
    } catch (e) {
      console.warn('load failed', e);
      this.data = defaultData();
    }
  },

  // ---------- sign in / out ----------
  async signIn() {
    if (this.mode === 'local') {
      this.user = { uid: 'local', name: 'toi', email: '' };
      this.save(true);
      this._emit();
      return;
    }
    const { authMod, auth } = this._fb;
    const provider = new authMod.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await authMod.signInWithPopup(auth, provider);
    } catch (e) {
      // Some phones block pop-ups: use a full-page redirect instead.
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) {
        await authMod.signInWithRedirect(auth, provider);
      } else if (e.code !== 'auth/popup-closed-by-user') {
        throw e;
      }
    }
  },

  async signOut() {
    await this.flush();
    if (this.mode === 'local') {
      this.user = null;
      this._emit();
      return;
    }
    await this._fb.authMod.signOut(this._fb.auth);
  },

  // Deletes ALL of this person's data, then the account itself.
  async deleteAccount() {
    clearTimeout(this._saveTimer);
    if (this.mode === 'local') {
      try { localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ }
      this.data = defaultData();
      this.user = null;
      this._emit();
      return;
    }
    const { authMod, fsMod, auth, db } = this._fb;
    await fsMod.deleteDoc(fsMod.doc(db, 'users', this.user.uid));
    try {
      await auth.currentUser.delete();
    } catch (e) {
      if (e.code === 'auth/requires-recent-login') {
        // Google asks to confirm who you are before deleting an account.
        await authMod.reauthenticateWithPopup(auth.currentUser, new authMod.GoogleAuthProvider());
        await auth.currentUser.delete();
      } else throw e;
    }
  },

  // ---------- saving ----------
  // Saves a little later, so 10 quick clicks = 1 save.
  save(now = false) {
    clearTimeout(this._saveTimer);
    if (now) return this.flush();
    this._saveTimer = setTimeout(() => this.flush(), 800);
  },

  async flush() {
    clearTimeout(this._saveTimer);
    if (!this.user) return;
    if (this.mode === 'local') {
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(this.data)); } catch { /* storage full or blocked */ }
      return;
    }
    const { fsMod, db } = this._fb;
    try {
      await fsMod.setDoc(fsMod.doc(db, 'users', this.user.uid), this.data);
    } catch (e) {
      console.warn('save failed', e);
    }
  },

  // ---------- anonymous class stats ----------
  // +1 on "wrong answers" for a notion. No name, no id: just a counter.
  async bumpWrong(notionId) {
    if (this.mode !== 'firebase' || !this.user) return;
    const { fsMod, db } = this._fb;
    try {
      await fsMod.setDoc(fsMod.doc(db, 'stats', notionId), { wrong: fsMod.increment(1) }, { merge: true });
    } catch (e) { console.warn('stat failed', e); }
  },

  async reportError(item, text) {
    if (this.mode !== 'firebase') return true;
    const { fsMod, db } = this._fb;
    await fsMod.addDoc(fsMod.collection(db, 'reports'), {
      item: String(item).slice(0, 100),
      text: String(text).slice(0, 500),
      at: fsMod.serverTimestamp(),
    });
    return true;
  },

  // Owner only: hardest notions + reports.
  async loadAdmin() {
    if (this.mode !== 'firebase' || !this.isAdmin) return null;
    const { fsMod, db } = this._fb;
    const statsSnap = await fsMod.getDocs(fsMod.collection(db, 'stats'));
    const stats = statsSnap.docs.map(d => ({ id: d.id, wrong: d.data().wrong || 0 })).sort((a, b) => b.wrong - a.wrong);
    const repSnap = await fsMod.getDocs(fsMod.query(fsMod.collection(db, 'reports'), fsMod.orderBy('at', 'desc'), fsMod.limit(50)));
    const reports = repSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    return { stats, reports };
  },
};

// Save before the tab closes or the app goes to the background.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') store.flush(); });
