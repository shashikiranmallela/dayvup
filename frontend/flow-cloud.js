// Cloud is optional; render the local workspace before loading external scripts.
(async () => {
  if (!window.STUDYFLOW_FIREBASE_CONFIG && !window.STUDYFLOW_USE_CLASSIC_FIREBASE) return;
  const load = src => new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.append(s)});
  try {
    const base='https://www.gstatic.com/firebasejs/8.10.1/';
    for(const f of ['firebase-app.js','firebase-auth.js','firebase-firestore.js']) await load(base+f);
    if(window.STUDYFLOW_USE_CLASSIC_FIREBASE) await load('./firebase-init.js');
    else {
      firebase.initializeApp(window.STUDYFLOW_FIREBASE_CONFIG);
      window.firebaseAuth=firebase.auth();window.firestore=firebase.firestore();
    }
    window.dispatchEvent(new Event('flow-cloud-ready'));
  }catch(e){console.warn('Dayvup cloud unavailable; local workspace remains available.',e);}
})();
