import http.server
import socketserver
import webbrowser
import threading
import time
import os
import sys

# Garantir que o servidor corre na pasta onde este script está localizado
script_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(script_dir)

PORT = 8000
HANDLER = http.server.SimpleHTTPRequestHandler

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    pass

def open_browser():
    # Aguardar 1.5 segundos para garantir que o servidor já está ativo
    time.sleep(1.5)
    url = f"http://localhost:{PORT}"
    print(f"\n[VisualGuard] A abrir a aplicação no browser em {url}...")
    webbrowser.open(url)

def run_server():
    server_address = ("", PORT)
    # Reutilizar o porto para evitar erros de "Port already in use" se reiniciar rapidamente
    socketserver.TCPServer.allow_reuse_address = True
    
    try:
        with ThreadingHTTPServer(server_address, HANDLER) as httpd:
            print("=" * 60)
            print("         VISUALGUARD - DETEÇÃO DE ÓCULOS EM TEMPO REAL")
            print("=" * 60)
            print(f"Servidor HTTP local iniciado com sucesso!")
            print(f" -> URL: http://localhost:{PORT}")
            print(" -> Para encerrar a aplicação: Prima CTRL+C no terminal")
            print("=" * 60)
            
            # Iniciar thread para abrir o browser automaticamente
            browser_thread = threading.Thread(target=open_browser)
            browser_thread.daemon = True
            browser_thread.start()
            
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[VisualGuard] A desligar o servidor de forma segura... Até breve!")
        sys.exit(0)
    except Exception as e:
        print(f"\n[VisualGuard] Erro ao iniciar o servidor: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_server()
