import admin from "../firebase/admin.js";
const db = admin.firestore();

export default async function saveOutputs(userId, platform, output) {
  await db.collection("outputs").add({
    userId,
    platform,
    output,
    createdAt: new Date(),
  });
}
