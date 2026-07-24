#!/usr/bin/env python3
"""Local proxy for MiniMax OpenAI-compatible API.

Injects "reasoning_split": true into chat completion requests so the model's
thinking is returned in reasoning_details instead of polluting message.content
with <think> blocks (which breaks task-master's generateObject JSON parsing).

Usage:  python minimax_proxy.py [port]   (default 8471)
Then set baseURL to http://127.0.0.1:8471/v1 in .taskmaster/config.json.
"""
import http.client
import json
import ssl
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UPSTREAM_HOST = "api.minimax.chat"


class ProxyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b""
        try:
            payload = json.loads(body)
            if isinstance(payload, dict) and "messages" in payload:
                payload["reasoning_split"] = True
                body = json.dumps(payload).encode("utf-8")
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass  # forward body unchanged

        conn = http.client.HTTPSConnection(UPSTREAM_HOST, context=ssl.create_default_context())
        headers = {
            "Content-Type": self.headers.get("Content-Type", "application/json"),
            "Authorization": self.headers.get("Authorization", ""),
            "Accept": self.headers.get("Accept", "application/json"),
        }
        conn.request("POST", self.path, body=body, headers=headers)
        resp = conn.getresponse()
        data = resp.read()
        conn.close()

        self.send_response(resp.status)
        self.send_header("Content-Type", resp.getheader("Content-Type") or "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):  # e.g. /v1/models
        conn = http.client.HTTPSConnection(UPSTREAM_HOST, context=ssl.create_default_context())
        conn.request("GET", self.path, headers={"Authorization": self.headers.get("Authorization", "")})
        resp = conn.getresponse()
        data = resp.read()
        conn.close()
        self.send_response(resp.status)
        self.send_header("Content-Type", resp.getheader("Content-Type") or "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        sys.stderr.write("[proxy] " + fmt % args + "\n")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8471
    server = ThreadingHTTPServer(("127.0.0.1", port), ProxyHandler)
    print(f"MiniMax reasoning_split proxy listening on http://127.0.0.1:{port}")
    server.serve_forever()
