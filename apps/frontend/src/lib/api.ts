import axios, { type AxiosInstance } from "axios";

// Centralised HTTP client. Adds Authorization from localStorage and bounces
// the user back to /login on 401.

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3005";

export const ACCESS_TOKEN_KEY = "acoustic:accessToken";
export const REFRESH_TOKEN_KEY = "acoustic:refreshToken";
export const USER_KEY = "acoustic:user";

export const api: AxiosInstance = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  withCredentials: false,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) {
    config.headers.set?.("Authorization", `Bearer ${token}`);
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }
    return Promise.reject(err);
  },
);

export const apiBaseUrl = BASE_URL;
