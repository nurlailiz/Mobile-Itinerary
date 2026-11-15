// Online sync (Firebase). Loaded as a module; talks to app.js through window.Cloud and window events.
// If Firebase can't load (e.g. offline on first launch) the app keeps working with on-device data only.
//
// The config below is not a secret: it only identifies the Firebase project. Who can read/write
// a trip is enforced by the Firestore security rules (only emails listed in the trip's `members`).
const SDK = 'https://www.gstatic.com/firebasejs/13.3.0';
const firebaseConfig = {
  apiKey: 'AIzaSyDzuRwQBqp7tMmTx2bVIrV1O9s8W2UQjFQ',
  authDomain: 'mobile-itinerary-ccdfc.firebaseapp.com',
  projectId: 'mobile-itinerary-ccdfc',
  storageBucket: 'mobile-itinerary-ccdfc.firebasestorage.app',
  messagingSenderId: '339387721821',
  appId: '1:339387721821:web:48bc74dab59165012cc5b4',
};

const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

(async () => {
  try {
    const [{ initializeApp }, A, F] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    const app = initializeApp(firebaseConfig);
    const auth = A.getAuth(app);
    let db;
    try {
      // Keeps unsent changes on the phone so edits made offline are uploaded later
      db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
    } catch (e) {
      db = F.getFirestore(app);
    }
    const ref = (id) => F.doc(db, 'trips', id);
    let unsubscribe = null;

    // Finish a sign-in that had to use a full-page redirect instead of a popup
    A.getRedirectResult(auth).catch((err) => emit('cloud-error', err));

    const Cloud = {
      user: null,
      async signIn() {
        const provider = new A.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        try {
          await A.signInWithPopup(auth, provider);
        } catch (err) {
          if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
          if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
            await A.signInWithRedirect(auth, provider);
            return;
          }
          throw err;
        }
      },
      signOut: () => A.signOut(auth),

      // Live list of every trip this email is a member of
      watch(email, onChanges, onError) {
        Cloud.stop();
        const q = F.query(F.collection(db, 'trips'), F.where('members', 'array-contains', email));
        unsubscribe = F.onSnapshot(q, (snap) => {
          onChanges(snap.docChanges().map((c) => ({
            type: c.type, id: c.doc.id, data: c.doc.data(), pending: c.doc.metadata.hasPendingWrites,
          })));
        }, onError);
      },
      stop() { if (unsubscribe) unsubscribe(); unsubscribe = null; },

      create: (id, data) => F.setDoc(ref(id), data),
      update: (id, data) => F.updateDoc(ref(id), data),
      remove: (id) => F.deleteDoc(ref(id)),
      addMember: (id, email) => F.updateDoc(ref(id), { members: F.arrayUnion(email) }),
      removeMember: (id, email) => F.updateDoc(ref(id), { members: F.arrayRemove(email) }),
    };

    A.onAuthStateChanged(auth, (u) => {
      Cloud.user = u ? { email: String(u.email || '').toLowerCase(), name: u.displayName || '' } : null;
      emit('cloud-user', Cloud.user);
    });
    window.Cloud = Cloud;
    emit('cloud-ready');
  } catch (err) {
    console.warn('Online sync unavailable:', err);
    emit('cloud-unavailable', err);
  }
})();
