import socket

import pytest

from app.targets import validate_target


def resolution(ip):
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 443))]


@pytest.mark.parametrize("ip", ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "fc00::1"])
def test_private_and_metadata_addresses_are_blocked(monkeypatch, ip):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *_a, **_k: resolution(ip))
    with pytest.raises(ValueError):
        validate_target("https://example.com")


@pytest.mark.parametrize(
    "url", ["file:///etc/passwd", "http://user:password@example.com", "http://example.com:8000"]
)
def test_non_http_credentials_and_nonstandard_ports_are_blocked(url):
    with pytest.raises(ValueError):
        validate_target(url)


def test_allowlist_is_exact_and_public_address_required(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *_a, **_k: resolution("93.184.216.34"))
    assert validate_target("https://example.com", "example.com")
    with pytest.raises(ValueError):
        validate_target("https://example.com.evil.test", "example.com")


def test_mixed_public_and_private_dns_is_blocked(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *_a, **_k: resolution("93.184.216.34") + resolution("127.0.0.1"),
    )
    with pytest.raises(ValueError):
        validate_target("https://example.com")
