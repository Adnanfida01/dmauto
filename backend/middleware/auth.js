// backend/middleware/auth.js
import admin from "../firebase/admin.js";

// Middleware to verify Firebase ID token
export async function verifyFirebaseToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing token" });
    }

    const idToken = authHeader.split(" ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    // attach user info to request; normalize common uid fields
    const uid = decodedToken.uid || decodedToken.user_id || decodedToken.sub || decodedToken.id;
    req.user = { ...decodedToken, uid };

    // debug log to help trace issues where uid may be missing
    if (!uid) {
      console.warn("verifyFirebaseToken: decoded token has no uid:", decodedToken);
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
}

// ✅ default export for backward compatibility
export default verifyFirebaseToken;
