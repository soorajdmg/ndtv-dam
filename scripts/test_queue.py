#!/usr/bin/env python3
"""
Test Celery + Redis end-to-end connectivity.
Run: python scripts/test_queue.py
"""
import sys
import os
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from celery import Celery
from app.config import get_settings

settings = get_settings()


def main():
    print(f"Testing Celery connectivity to: {settings.redis_url}")

    app = Celery(broker=settings.redis_url, backend=settings.redis_url)

    @app.task
    def ping_task():
        return "pong"

    print("Sending ping task...")
    result = ping_task.apply_async()

    timeout = 10
    start = time.time()
    while not result.ready() and time.time() - start < timeout:
        print("  waiting...")
        time.sleep(1)

    if result.ready():
        val = result.get()
        assert val == "pong", f"Expected 'pong', got: {val}"
        print(f"SUCCESS: received '{val}' from worker")
    else:
        print("TIMEOUT: Celery worker did not respond within 10 seconds")
        print("  Make sure celery worker is running: celery -A app.worker worker")
        sys.exit(1)


if __name__ == "__main__":
    main()
