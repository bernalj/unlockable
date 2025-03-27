// firebase-config.js
// Import Firebase modules (using v9+ modular SDK)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
  getDatabase, 
  ref, 
  push, 
  query, 
  orderByChild, 
  limitToLast, 
  onValue,
  set,
  get
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCYlnJnOL938zx7jwqhDzyDLx1KPs7sU58",
  authDomain: "unlockable-80519.firebaseapp.com",
  databaseURL: "https://unlockable-80519-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "unlockable-80519",
  storageBucket: "unlockable-80519.firebasestorage.app",
  messagingSenderId: "1097134073503",
  appId: "1:1097134073503:web:25b79a17911e6e8976e4aa",
  measurementId: "G-H17HYTEYWB"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

function submitHighScore(name, score) {
  const highscoreRef = ref(database, "highscores");
  const timestamp = Date.now();
  return push(highscoreRef, { name, score, timestamp });
}

function getTopHighScores(callback) {
  // Query for top 5 high scores (Firebase returns in ascending order, so we'll reverse)
  const highscoreRef = ref(database, "highscores");
  const highscoreQuery = query(highscoreRef, orderByChild("score"), limitToLast(5));
  onValue(highscoreQuery, (snapshot) => {
    let highscores = [];
    snapshot.forEach((childSnapshot) => {
      highscores.push(childSnapshot.val());
    });
    highscores.reverse();
    callback(highscores);
  });
}

function submitTimingData(gameId, timingData) {
  const timingRef = ref(database, `gameStats/${gameId}`);
  return set(timingRef, {
    timestamp: Date.now(),
    timingData: timingData
  });
}

async function getGameStats() {
  const statsRef = ref(database, "gameStats");
  try {
    const snapshot = await get(statsRef);
    if (snapshot.exists()) {
      return snapshot.val();
    }
    return null;
  } catch (error) {
    console.error("Error fetching game stats:", error);
    return null;
  }
}

export { submitHighScore, getTopHighScores, submitTimingData, getGameStats };
