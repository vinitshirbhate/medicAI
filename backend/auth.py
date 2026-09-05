"""Accounts, sign-in, and role gates.

Two roles, drawn from the product brief rather than invented for the demo:

- ``NURSE`` runs intake and the queue. A triage nurse registers arrivals, records observations, and
  makes a documented accept/override decision — the brief names the charge nurse as the primary
  decision-maker, so nothing clinical is withheld from them.
- ``DOCTOR`` additionally administers the service: creating and removing nurse accounts, and
  resetting the demonstration. Those are the operations that change who can act and that erase the
  decision record, which is why they sit behind a second role rather than a confirmation dialog.

Credentials live in the local SQLite store and are mirrored to MongoDB when it is reachable. Sign-in
deliberately reads the local copy: a console that cannot authenticate because a remote database is
unreachable is a console that fails exactly when the department is busiest.

Passwords are scrypt-hashed with a per-user salt. Tokens are HMAC-signed, carry the role and an
expiry, and are verified on every request — the client never tells the server who it is, which is
what makes the audit log's actor field worth anything.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Literal

from fastapi import Depends, HTTPException, Request

Role = Literal["DOCTOR", "NURSE"]
UTC = timezone.utc

TOKEN_TTL_HOURS = int(os.getenv("SUNDARA_TOKEN_TTL_HOURS", "12"))
# Seeded sign-in buttons are a demonstration affordance. Set to 0 and the endpoint stops serving
# them, so the same build can be shown without handing out working credentials.
DEMO_LOGINS_ENABLED = os.getenv("SUNDARA_DEMO_LOGINS", "1") != "0"

SCRYPT = {"n": 2**14, "r": 8, "p": 1, "dklen": 32}

SEED_ACCOUNTS: list[dict[str, str]] = [
    {"email": "doctor@sundara.health", "password": "sundara-doctor", "name": "Dr. A. Rao", "role": "DOCTOR",
     "title": "Emergency physician"},
    {"email": "nurse@sundara.health", "password": "sundara-nurse", "name": "S. Menon", "role": "NURSE",
     "title": "Charge nurse"},
]


def _secret() -> bytes:
    """A signing key that survives a restart, so a reload does not sign every clinician out."""
    configured = os.getenv("SUNDARA_SECRET")
    if configured:
        return configured.encode()
    path = os.path.join(os.path.dirname(__file__), ".session_secret")
    if not os.path.exists(path):
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(secrets.token_hex(32))
    with open(path, encoding="utf-8") as handle:
        return handle.read().strip().encode()


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), **SCRYPT).hex()
    return f"scrypt${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt, digest = stored.split("$", 2)
    except ValueError:
        return False
    if scheme != "scrypt":
        return False
    candidate = hashlib.scrypt(password.encode(), salt=salt.encode(), **SCRYPT).hex()
    return hmac.compare_digest(candidate, digest)  # Constant time: a timing signal is a signal.


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def issue_token(user: dict[str, Any]) -> tuple[str, str]:
    expires = datetime.now(UTC) + timedelta(hours=TOKEN_TTL_HOURS)
    body = {"sub": user["user_id"], "email": user["email"], "role": user["role"],
            "name": user["name"], "exp": expires.isoformat()}
    payload = _b64(json.dumps(body, separators=(",", ":"), sort_keys=True).encode())
    signature = _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{signature}", expires.isoformat()


def read_token(token: str) -> dict[str, Any] | None:
    try:
        payload, signature = token.split(".", 1)
    except ValueError:
        return None
    expected = _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(expected, signature):
        return None
    try:
        body = json.loads(_unb64(payload))
    except Exception:
        return None
    if datetime.fromisoformat(body["exp"]) < datetime.now(UTC):
        return None
    return body


def public(user: dict[str, Any]) -> dict[str, Any]:
    """A user as the API returns it. The hash never leaves this module's storage."""
    return {key: user[key] for key in ("user_id", "email", "name", "role", "title", "created_at")}


# ---------------------------------------------------------------- storage

def create_tables(connect: Callable[[], sqlite3.Connection]) -> None:
    with connect() as c:
        c.execute(
            """CREATE TABLE IF NOT EXISTS users(
                 user_id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
                 role TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
                 password_hash TEXT NOT NULL, created_at TEXT NOT NULL)"""
        )


def seed_accounts(connect: Callable[[], sqlite3.Connection], mirror: Callable[[dict[str, Any]], Any] | None = None) -> None:
    """Create the demonstration accounts once. An existing password is never overwritten."""
    now = datetime.now(UTC).isoformat()
    for account in SEED_ACCOUNTS:
        with connect() as c:
            if c.execute("SELECT 1 FROM users WHERE email=?", (account["email"],)).fetchone():
                continue
            user = {
                "user_id": f"U-{secrets.token_hex(5)}", "email": account["email"], "name": account["name"],
                "role": account["role"], "title": account["title"],
                "password_hash": hash_password(account["password"]), "created_at": now,
            }
            c.execute(
                "INSERT INTO users(user_id,email,name,role,title,password_hash,created_at) VALUES(?,?,?,?,?,?,?)",
                tuple(user[key] for key in ("user_id", "email", "name", "role", "title", "password_hash", "created_at")),
            )
        if mirror:
            mirror(user)


def find_by_email(connect: Callable[[], sqlite3.Connection], email: str) -> dict[str, Any] | None:
    with connect() as c:
        row = c.execute("SELECT * FROM users WHERE lower(email)=lower(?)", (email.strip(),)).fetchone()
    return dict(row) if row else None


def find_by_id(connect: Callable[[], sqlite3.Connection], user_id: str) -> dict[str, Any] | None:
    with connect() as c:
        row = c.execute("SELECT * FROM users WHERE user_id=?", (user_id,)).fetchone()
    return dict(row) if row else None


def list_users(connect: Callable[[], sqlite3.Connection]) -> list[dict[str, Any]]:
    with connect() as c:
        rows = c.execute("SELECT * FROM users ORDER BY role, name").fetchall()
    return [public(dict(row)) for row in rows]


def create_user(
    connect: Callable[[], sqlite3.Connection], *, email: str, name: str, password: str,
    role: Role, title: str = "", mirror: Callable[[dict[str, Any]], Any] | None = None,
) -> dict[str, Any]:
    if find_by_email(connect, email):
        raise HTTPException(409, "An account with that email already exists.")
    user = {
        "user_id": f"U-{secrets.token_hex(5)}", "email": email.strip(), "name": name.strip(),
        "role": role, "title": title.strip(), "password_hash": hash_password(password),
        "created_at": datetime.now(UTC).isoformat(),
    }
    with connect() as c:
        c.execute(
            "INSERT INTO users(user_id,email,name,role,title,password_hash,created_at) VALUES(?,?,?,?,?,?,?)",
            tuple(user[key] for key in ("user_id", "email", "name", "role", "title", "password_hash", "created_at")),
        )
    if mirror:
        mirror(user)
    return public(user)


def delete_user(connect: Callable[[], sqlite3.Connection], user_id: str) -> dict[str, Any]:
    user = find_by_id(connect, user_id)
    if not user:
        raise HTTPException(404, "No such account.")
    if user["role"] == "DOCTOR":
        # Removing the last administrator would lock everyone out of account management.
        with connect() as c:
            remaining = c.execute("SELECT COUNT(*) n FROM users WHERE role='DOCTOR'").fetchone()["n"]
        if remaining <= 1:
            raise HTTPException(409, "This is the only doctor account; removing it would leave no administrator.")
    with connect() as c:
        c.execute("DELETE FROM users WHERE user_id=?", (user_id,))
    return public(user)


def demo_accounts() -> list[dict[str, str]]:
    """The seeded sign-ins the login screen offers. Empty when the affordance is switched off."""
    if not DEMO_LOGINS_ENABLED:
        return []
    return [
        {"email": account["email"], "password": account["password"], "name": account["name"],
         "role": account["role"], "title": account["title"]}
        for account in SEED_ACCOUNTS
    ]


# ---------------------------------------------------------------- request gates

def build_dependencies(connect: Callable[[], sqlite3.Connection]):
    """FastAPI dependencies bound to this service's database handle."""

    def current_user(request: Request) -> dict[str, Any]:
        header = request.headers.get("authorization", "")
        if not header.lower().startswith("bearer "):
            raise HTTPException(401, "Sign in to use the triage console.")
        claims = read_token(header[7:].strip())
        if not claims:
            raise HTTPException(401, "Your session has expired. Sign in again.")
        user = find_by_id(connect, claims["sub"])
        if not user:
            # The account was removed while a token was still live; the token must stop working.
            raise HTTPException(401, "This account no longer exists.")
        return public(user)

    def require(*roles: Role):
        def guard(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
            if user["role"] not in roles:
                raise HTTPException(
                    403,
                    f"This action needs the {' or '.join(role.lower() for role in roles)} role; "
                    f"you are signed in as {user['role'].lower()}.",
                )
            return user

        return guard

    return current_user, require
