import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBDC1_1gXqulxL_fXqGhzm6qvlmcnkG1wU",
  authDomain: "ricola-nexus.firebaseapp.com",
  projectId: "ricola-nexus",
  storageBucket: "ricola-nexus.firebasestorage.app",
  messagingSenderId: "349163538461",
  appId: "1:349163538461:web:45ad54f956eb5191db5ef4"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
