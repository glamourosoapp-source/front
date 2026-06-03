"use client";

import axios, { AxiosInstance } from "axios";
import type { ApiResponse } from "@glamouroso/shared";
import { config } from "@/config";

class HttpClient {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({ baseURL: config.apiBaseUrl, headers: { "Content-Type": "application/json" } });
    this.api.interceptors.request.use((request) => {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      if (token) request.headers.Authorization = `Bearer ${token}`;
      if (typeof window !== "undefined") {
        const organizationId = this.readOrganizationId();
        if (organizationId) request.headers["X-Organization-Id"] = organizationId;
      }
      return request;
    });
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401 && typeof window !== "undefined") {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }
    );
  }

  private readOrganizationId(): string | null {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return null;
      const user = JSON.parse(raw) as { organizationId?: string };
      return user?.organizationId ?? null;
    } catch {
      return null;
    }
  }

  unwrap<T>(payload: unknown): T {
    const body = payload as ApiResponse<T>;
    if (body && typeof body === "object" && body.success && "data" in body) return body.data as T;
    return payload as T;
  }

  async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const res = await this.api.get(url, { params });
    return this.unwrap<T>(res.data);
  }

  async post<T>(url: string, data?: Record<string, unknown>): Promise<T> {
    const res = await this.api.post(url, data);
    return this.unwrap<T>(res.data);
  }

  async put<T>(url: string, data?: Record<string, unknown>): Promise<T> {
    const res = await this.api.put(url, data);
    return this.unwrap<T>(res.data);
  }

  async patch<T>(url: string, data?: Record<string, unknown>): Promise<T> {
    const res = await this.api.patch(url, data);
    return this.unwrap<T>(res.data);
  }

  async delete<T>(url: string): Promise<T> {
    const res = await this.api.delete(url);
    return this.unwrap<T>(res.data);
  }
}

export const httpClient = new HttpClient();
