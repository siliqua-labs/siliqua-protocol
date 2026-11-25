"""Bluesky searchPosts on the account's own PDS (bsky.social) with an app-password session.

Measured live on 2026-11-25 (docs/sources.md): public.api.bsky.app returns 403 for search;
createSession is limited to 10 per 86,400 s; searchPosts to 3000 per 300 s. One session is
created and then renewed with the refresh token, never one login per run.
"""

import json
from datetime import datetime

import httpx

from social_collectors.post import SocialPost

PLATFORM = "bluesky"
HANDLE_ENV = "BSKY_HANDLE"
APP_PASSWORD_ENV = "BSKY_APP_PASSWORD"
BASE_URL = "https://bsky.social/xrpc"


class BlueskySession:
    def __init__(self, client: httpx.Client, handle: str, app_password: str):
        self._client = client
        self._handle = handle
        self._app_password = app_password
        self._access_jwt = ""
        self._refresh_jwt = ""

    def login(self) -> None:
        response = self._client.post(
            f"{BASE_URL}/com.atproto.server.createSession",
            json={"identifier": self._handle, "password": self._app_password},
        )
        response.raise_for_status()
        self._store_tokens(response.json())

    def _refresh(self) -> None:
        response = self._client.post(
            f"{BASE_URL}/com.atproto.server.refreshSession",
            headers={"Authorization": f"Bearer {self._refresh_jwt}"},
        )
        response.raise_for_status()
        self._store_tokens(response.json())

    def _store_tokens(self, body: dict) -> None:
        self._access_jwt = body["accessJwt"]
        self._refresh_jwt = body["refreshJwt"]

    def search(self, query: str, limit: int, cursor: str | None = None) -> bytes:
        if not self._access_jwt:
            self.login()
        params: dict[str, str | int] = {"q": query, "limit": limit}
        if cursor:
            params["cursor"] = cursor
        response = self._search_request(params)
        if response.status_code == 400 and response.json().get("error") == "ExpiredToken":
            self._refresh()
            response = self._search_request(params)
        response.raise_for_status()
        return response.content

    def _search_request(self, params: dict[str, str | int]) -> httpx.Response:
        return self._client.get(
            f"{BASE_URL}/app.bsky.feed.searchPosts",
            params=params,
            headers={"Authorization": f"Bearer {self._access_jwt}"},
        )


def parse(payload: bytes) -> tuple[list[SocialPost], str | None]:
    body = json.loads(payload)
    posts = []
    for post in body["posts"]:
        author = post["author"]
        author_created_at = author.get("createdAt")
        posts.append(
            SocialPost(
                platform=PLATFORM,
                post_id=post["uri"],
                author_id=author["did"],
                created_at=datetime.fromisoformat(post["record"]["createdAt"]),
                author_created_at=(
                    datetime.fromisoformat(author_created_at) if author_created_at else None
                ),
                quality_score=None,
                text=post["record"]["text"],
            )
        )
    return posts, body.get("cursor")
