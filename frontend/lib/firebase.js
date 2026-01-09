import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBBbCJw9o_d86SvGLcJgAE16E5W-g6tnfY",
  authDomain: "dmautomation-4693a.firebaseapp.com",
  projectId: "dmautomation-4693a",
  storageBucket: "dmautomation-4693a.firebasestorage.app",
  messagingSenderId: "92974592866",
  appId: "1:92974592866:web:fda5097fb8e3ea1ec0323b",
  measurementId: "G-4B62TH9RB1",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
