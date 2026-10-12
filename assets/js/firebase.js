/* NOVATEC · Sincronización en la nube (Firebase Cloud Firestore) */
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBi8ChVD4YPXYQHOm9ICZ3LUrFMdvPJgek",
  authDomain: "novatec-7889e.firebaseapp.com",
  projectId: "novatec-7889e",
  storageBucket: "novatec-7889e.firebasestorage.app",
  messagingSenderId: "206910405287",
  appId: "1:206910405287:web:94a3cf3073cf6ec6967982"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const ref = doc(db, "novatec", "cealka");           // un documento con todos los datos de la empresa
const CLIENTE = Math.random().toString(36).slice(2); // identifica a este equipo/pestaña

let listo = false;                                   // no subir nada hasta leer la nube por primera vez
window.NOVA_NUBE = {
  get listo(){ return listo; },
  subir(datos){
    if (!listo) return Promise.resolve();
    return setDoc(ref, { datos: JSON.stringify(datos), actualizado: Date.now(), cliente: CLIENTE })
      .catch(err => window.novaNubeError && window.novaNubeError(err));
  }
};

onSnapshot(ref, snap => {
  if (snap.metadata.hasPendingWrites) return;          // eco de un cambio propio aún no confirmado
  const primera = !listo;
  listo = true;
  if (!snap.exists()) { window.novaNubeVacia && window.novaNubeVacia(); return; }   // nube vacía: se sube lo de este equipo
  const d = snap.data();
  if (d.cliente === CLIENTE && !primera) return;       // cambio hecho desde este mismo equipo
  try { window.novaAplicarRemoto && window.novaAplicarRemoto(JSON.parse(d.datos)); }
  catch (e) { console.warn('Datos remotos inválidos', e); }
}, err => { listo = true; window.novaNubeError && window.novaNubeError(err); });
