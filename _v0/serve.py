#!/usr/bin/env python3
"""Local server for geo-shafaq that never lets the browser cache files.

Plain `python3 -m http.server 8000` lets the browser keep old pages, so after switching
projects on the same port you can still see the previous game. Usage:

    python3 serve.py          # http://localhost:8130, also reachable from the LAN
    python3 serve.py 9000     # another port
"""
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8130
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f"geo-shafaq: http://localhost:{port} (listening on all interfaces)")
    http.server.ThreadingHTTPServer(("0.0.0.0", port), NoCacheHandler).serve_forever()
