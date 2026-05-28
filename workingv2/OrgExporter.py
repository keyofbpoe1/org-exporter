#!/usr/bin/env python3#!/usr/bin/env python3
import json
import argparse
from collections import deque
from urllib.parse import urljoin
from concurrent.futures import ThreadPoolExecutor

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_URL = "https://nucleus.acs.org"


# ===============================
# ✅ SESSION SETUP
# ===============================
def build_session(cookie: str, referer: str) -> requests.Session:
    session = requests.Session()

    session.headers.update({
        "accept": "application/json, text/plain, */*",
        "user-agent": "Mozilla/5.0",
        "x-requested-with": "XMLHttpRequest",
        "referer": referer,
        "origin": "https://nucleus.acs.org",
        "cookie": cookie.strip()
    })

    retry = Retry(
        total=5,
        backoff_factor=0.5,
        status_forcelist=[429, 500, 502, 503, 504]
    )

    session.mount("https://", HTTPAdapter(max_retries=retry))

    return session


# ===============================
# ✅ SINGLE FETCH
# ===============================
def fetch(session: requests.Session, org_id: int):
    url = urljoin(BASE_URL, f"/webapi/orgchart/{org_id}/directreports")

    try:
        r = session.get(url, timeout=10)

        if r.status_code != 200:
            return []

        return r.json().get("users", [])

    except Exception:
        return []


# ===============================
# ✅ PARALLEL BATCH FETCH
# ===============================
def fetch_batch(session, ids):
    results = {}

    def worker(i):
        return i, fetch(session, i)

    # ✅ controlled concurrency
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(worker, i) for i in ids]

        for f in futures:
            i, users = f.result()
            results[i] = users

    return results


# ===============================
# ✅ STREAMING BFS TRAVERSAL
# ===============================
def stream_tree(session, root_id):
    visited = set()
    queue = deque([root_id])

    processed = 0

    while queue:
        batch = []

        # ✅ build batch of IDs
        while queue and len(batch) < 10:
            current = queue.popleft()

            if current not in visited:
                visited.add(current)
                batch.append(current)

        # ✅ parallel batch request
        results = fetch_batch(session, batch)

        for parent_id in batch:
            children = results.get(parent_id, [])

            for child in children:
                cid = child.get("userId") or child.get("id")

                if not cid:
                    continue

                # ✅ STREAM NODE EVENT (important!)
                print(json.dumps({
                    "type": "node",
                    "parent": parent_id,
                    "data": child
                }), flush=True)

                if cid not in visited:
                    queue.append(cid)

            processed += 1

            # ✅ STREAM PROGRESS
            print(json.dumps({
                "type": "progress",
                "value": processed
            }), flush=True)

    # ✅ SEND DONE SIGNAL
    print(json.dumps({
        "type": "done"
    }), flush=True)


# ===============================
# ✅ MAIN ENTRY
# ===============================
def main():
    parser = argparse.ArgumentParser()

    parser.add_argument("--id", type=int, required=True)
    parser.add_argument("--cookie", required=True)

    args = parser.parse_args()

    session = build_session(
        args.cookie,
        referer=f"https://nucleus.acs.org/content/{args.id}/"
    )

    stream_tree(session, args.id)


if __name__ == "__main__":
    main()