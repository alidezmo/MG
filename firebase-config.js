import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, push, onValue, set, update, remove, onDisconnect, query, limitToLast, onChildAdded, onChildRemoved, onChildChanged, get } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

export const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/daoenc5dp/auto/upload";
export const CLOUDINARY_UPLOAD_PRESET = "Mg_home_preset";

const firebaseConfig = {
  apiKey: "AIzaSyC7-tcbiTsWceNDICdiFOYw5xX8060-lEk",
  authDomain: "home-massage-7baaa.firebaseapp.com",
  databaseURL: "https://home-massage-7baaa-default-rtdb.firebaseio.com",
  projectId: "home-massage-7baaa",
  storageBucket: "home-massage-7baaa.firebasestorage.app",
  messagingSenderId: "797052107356",
  appId: "1:797052107356:web:31df814476617ad23ac499"
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export { ref, push, onValue, set, update, remove, onDisconnect, query, limitToLast, onChildAdded, onChildRemoved, onChildChanged, get };
