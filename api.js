const API_BASE = "https://backend.leadconnectorhq.com";

const API_TOKEN = process.env.MP_API_TOKEN || "";
const LOCATION_ID = process.env.MP_LOCATION_ID || "0jtnQ6cZiKMjLmKTR5Dl";
const PROXY_KEY = process.env.MP_PROXY_KEY || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Proxy-Key",
};

function json(res, status, body) {
  return res.status(status).json(body);
}

function authorized(req) {
  if (!PROXY_KEY) return false;
  return req.headers["x-proxy-key"] === PROXY_KEY;
}

async function apiFetch(path, options = {}) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
      Version: "2021-07-28",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(204).end();
  }
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.url === "/api/health") {
    return json(res, 200, {
      ok: true,
      tokenConfigured: Boolean(API_TOKEN),
      locationId: LOCATION_ID,
    });
  }

  if (!authorized(req)) {
    return json(res, 401, { error: "Unauthorized — invalid or missing X-Proxy-Key" });
  }
  if (!API_TOKEN) {
    return json(res, 500, { error: "MP_API_TOKEN not set on the proxy" });
  }

  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  const body = req.body && typeof req.body === "object" ? req.body : {};

  try {
    if (path === "/api/contacts" && req.method === "GET") {
      const r = await apiFetch(`/contacts/?locationId=${LOCATION_ID}&limit=100`);
      return json(res, r.status, r.data);
    }
    if (path === "/api/opportunities" && req.method === "GET") {
      const r = await apiFetch(`/opportunities/search?locationId=${LOCATION_ID}&limit=100`, {
        method: "POST",
        body: JSON.stringify({ locationId: LOCATION_ID }),
      });
      return json(res, r.status, r.data);
    }
    if (path === "/api/invoices" && req.method === "GET") {
      const r = await apiFetch(`/invoices/search?locationId=${LOCATION_ID}&limit=100`, {
        method: "POST",
        body: JSON.stringify({ locationId: LOCATION_ID }),
      });
      return json(res, r.status, r.data);
    }
    if (path === "/api/appointments" && req.method === "GET") {
      const calId = url.searchParams.get("calendarId") || "r6O6JjbMwFhmgbnQvrji";
      const start = url.searchParams.get("startDate") || String(Date.now() - 7 * 86400000);
      const end = url.searchParams.get("endDate") || String(Date.now() + 60 * 86400000);
      const r = await apiFetch(
        `/calendars/${calId}/appointments?locationId=${LOCATION_ID}&startTime=${start}&endTime=${end}`,
      );
      return json(res, r.status, r.data);
    }

    if (path === "/api/contact" && req.method === "POST") {
      const contact = { locationId: LOCATION_ID, ...body.contact };
      const r = await apiFetch(`/contacts/`, {
        method: "POST",
        body: JSON.stringify(contact),
      });
      return json(res, r.status, r.data);
    }
    if (path.startsWith("/api/contact/") && req.method === "PUT") {
      const id = path.split("/")[3];
      const r = await apiFetch(`/contacts/${id}`, {
        method: "PUT",
        body: JSON.stringify(body.patch),
      });
      return json(res, r.status, r.data);
    }

    if (path === "/api/opportunity" && req.method === "POST") {
      const opp = { locationId: LOCATION_ID, ...body.opportunity };
      const r = await apiFetch(`/opportunities/`, {
        method: "POST",
        body: JSON.stringify(opp),
      });
      return json(res, r.status, r.data);
    }
    if (path.startsWith("/api/opportunity/") && req.method === "PUT") {
      const id = path.split("/")[3];
      const r = await apiFetch(`/opportunities/${id}`, {
        method: "PUT",
        body: JSON.stringify(body.patch),
      });
      return json(res, r.status, r.data);
    }

    if (path === "/api/invoice" && req.method === "POST") {
      const inv = { locationId: LOCATION_ID, ...body.invoice };
      const r = await apiFetch(`/invoices/`, {
        method: "POST",
        body: JSON.stringify(inv),
      });
      return json(res, r.status, r.data);
    }

    if (path === "/api/note" && req.method === "POST") {
      const r = await apiFetch(`/contacts/${body.contactId}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: body.body }),
      });
      return json(res, r.status, r.data);
    }

    return json(res, 404, { error: `Unknown route: ${req.method} ${path}` });
  } catch (err) {
    return json(res, 502, { error: "Upstream request failed", detail: String(err) });
  }
}
