#!/usr/bin/env python3

import json
import argparse
import csv
import time
from typing import Dict, List, Optional, Set
from urllib.parse import urljoin

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_URL = "https://nucleus.acs.org"


# ===============================
# ✅ SESSION (REQUIRED FOR API)
# ===============================
def build_session(cookie: str, referer: str) -> requests.Session:
    session = requests.Session()

    session.headers.update({
        "accept": "application/json, text/plain, */*",
        "user-agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/145.0.0.0 Safari/537.36"
        ),
        "x-requested-with": "XMLHttpRequest",
        "referer": referer,
        "origin": "https://nucleus.acs.org",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        "cookie": cookie.strip(),  # ✅ trims whitespace issues
    })

    retry = Retry(total=5, backoff_factor=0.5)
    adapter = HTTPAdapter(max_retries=retry)

    session.mount("https://", adapter)
    return session


# ===============================
# ✅ FETCH (STRICT PARSING)
# ===============================
def fetch(session: requests.Session, org_id: int) -> List[Dict]:
    url = urljoin(BASE_URL, f"/webapi/orgchart/{org_id}/directreports")

    try:
        response = session.get(url, timeout=20)

        if response.status_code != 200:
            print(f"[ERROR] {response.status_code} {url}", flush=True)
            return []

        data = response.json()

    except Exception as e:
        print(f"[ERROR] fetch failed: {e}", flush=True)
        return []

    users = data.get("users", [])

    # ✅ streaming progress signal
    print(f"PROGRESS:{min(len(users), 100)}", flush=True)

    return users


# ===============================
# ✅ HELPERS
# ===============================
def has_children(item: Dict) -> bool:
    return int(item.get("numberOfDescendants", 0)) > 0


def get_id(item: Dict) -> Optional[int]:
    return item.get("userId") or item.get("id")


def extract_email(node: Dict) -> str:
    for field in node.get("userCardFields", []):
        if field.get("label") == "Email":
            val = field.get("value")
            if isinstance(val, dict):
                return val.get("label", "")
    return ""


# ===============================
# ✅ TRAVERSE (OPTIMIZED DFS)
# ===============================
def traverse(
    session: requests.Session,
    root: int,
    visited: Optional[Set[int]] = None,
    delay: float = 0.05  # ✅ small delay for stability
) -> Dict:

    if visited is None:
        visited = set()

    if root in visited:
        return {"id": root, "directReports": []}

    visited.add(root)

    if delay:
        time.sleep(delay)

    children = fetch(session, root)
    results = []

    for child in children:
        cid = get_id(child)

        node = {
            "node": child,
            "directReports": []
        }

        # ✅ only recurse when needed
        if cid and cid not in visited and has_children(child):
            node["directReports"] = traverse(
                session, cid, visited, delay
            )["directReports"]

        results.append(node)

    return {
        "id": root,
        "directReports": results
    }


# ===============================
# ✅ FLATTEN → CSV
# ===============================
def flatten(tree: Dict) -> List[Dict]:
    rows: List[Dict] = []

    def walk(node):
        for child in node.get("directReports", []):
            n = child["node"]

            rows.append({
                "displayName": n.get("displayName", ""),
                "jobTitle": n.get("jobTitle", ""),
                "Email": extract_email(n)
            })

            walk(child)

    walk(tree)
    return rows


# ===============================
# ✅ CSV EXPORT
# ===============================
def write_csv(rows: List[Dict], path: str):
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["displayName", "jobTitle", "Email"]
        )
        writer.writeheader()
        writer.writerows(rows)


# ===============================
# ✅ MAIN
# ===============================
def main():
    parser = argparse.ArgumentParser()

    parser.add_argument("--id", type=int, required=True)
    parser.add_argument("--cookie", required=True)
    parser.add_argument("--out", default=None)
    parser.add_argument("--pretty", action="store_true")
    parser.add_argument("--delay", type=float, default=0.05)

    args = parser.parse_args()

    session = build_session(
        args.cookie,
        referer=f"https://nucleus.acs.org/content/{args.id}/"
    )

    tree = traverse(session, args.id, delay=args.delay)

    # ✅ send JSON (needed for Node streaming + CSV route)
    print(json.dumps(tree, indent=2 if args.pretty else None))

    # ✅ optional CSV output
    if args.out:
        rows = flatten(tree)
        write_csv(rows, args.out)

        print(f"[INFO] Extracted {len(rows)} users", flush=True)


if __name__ == "__main__":
    main()