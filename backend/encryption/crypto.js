import CryptoJS from "crypto-js";

const KEY = process.env.SESSION_ENCRYPTION_KEY;

export function encrypt(data) {
  return CryptoJS.AES.encrypt(JSON.stringify(data), KEY).toString();
}

export function decrypt(cipher) {
  const bytes = CryptoJS.AES.decrypt(cipher, KEY);
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
}
