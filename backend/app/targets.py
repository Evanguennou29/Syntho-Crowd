import ipaddress
import socket
from urllib.parse import urlsplit


def validate_target(url: str, allowed_hosts: str = "") -> str:
    """Apply to the initial URL and every browser network request, including redirects."""
    parts = urlsplit(url)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        raise ValueError("Seules les URL HTTP et HTTPS sont acceptées.")
    if parts.username or parts.password or parts.port not in {None, 80, 443}:
        raise ValueError("Identifiants et ports non standards interdits dans l’URL.")
    host = parts.hostname.lower().rstrip(".")
    hosts = {item.strip().lower().rstrip(".") for item in allowed_hosts.split(",") if item.strip()}
    if hosts and host not in hosts:
        raise ValueError("Ce domaine ne figure pas dans TARGET_ALLOWED_HOSTS.")
    try:
        addresses = socket.getaddrinfo(host, parts.port or 443, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise ValueError("Le domaine cible ne peut pas être résolu.") from exc
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError("Les adresses privées, locales et réservées sont interdites.")
    return url
