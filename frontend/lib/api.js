import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export const getSession = async (platform, token) => {
  const res = await axios.get(`${API_URL}/session/${platform}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.session;
};

export const saveSession = async (platform, sessionData, token) => {
  await axios.post(`${API_URL}/session/save`, { platform, sessionData }, {
    headers: { Authorization: `Bearer ${token}` },
  });
};

export const runAutomation = async (platform, token) => {
  await axios.post(`${API_URL}/automation/run`, { platform }, {
    headers: { Authorization: `Bearer ${token}` },
  });
};

export const getStats = async (token) => {
  try {
    const res = await axios.get(`${API_URL}/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (err) {
    // Normalize network errors so UI can handle them gracefully
    if (err.code === "ERR_NETWORK" || err.message === "Network Error") {
      return { __error: "network" };
    }
    // Firestore quota handling: return a special marker so UI can show friendly message
    if (err.response && err.response.status === 429) {
      return { __quota: true };
    }
    // Re-throw other errors so callers can surface messages
    throw err;
  }
};

export const startInteractiveLogin = async (platform, token) => {
  const res = await axios.post(`${API_URL}/session/login/${platform}`, {}, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 130000,
  });
  return res.data;
};

export const startAutomation = async (payload, token) => {
  const res = await axios.post(`${API_URL}/automation/start`, payload, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 120000,
  });
  return res.data;
};
