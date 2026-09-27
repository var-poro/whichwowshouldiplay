#!/usr/bin/env python3
"""Serveur local du site, sans cache : chaque rechargement prend la dernière
version des fichiers (sinon le navigateur garde d'anciens modules JavaScript).

Usage : python3 tools/serve.py [port]   (8765 par défaut)
"""

import http.server
import os
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):
        pass


os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
print(f"http://localhost:{port}")
http.server.ThreadingHTTPServer(("", port), NoCache).serve_forever()
