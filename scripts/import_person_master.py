#!/usr/bin/env python3
"""
Bulk-import persons and organizations from a CSV or JSON file.
Usage:
    python scripts/import_person_master.py --file persons.csv
    python scripts/import_person_master.py --file persons.json
"""
import argparse
import csv
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def load_file(filepath: str) -> list[dict]:
    if filepath.endswith(".json"):
        with open(filepath) as f:
            return json.load(f)
    elif filepath.endswith(".csv"):
        with open(filepath, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            return list(reader)
    else:
        raise ValueError("Unsupported file format. Use .csv or .json")


def main():
    parser = argparse.ArgumentParser(description="Import Person Master from CSV or JSON")
    parser.add_argument("--file", required=True, help="Path to CSV or JSON file")
    args = parser.parse_args()

    records = load_file(args.file)

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.config import get_settings
    from app.models.person_models import Person

    settings = get_settings()
    sync_url = settings.database_url.replace("postgresql+asyncpg", "postgresql+psycopg2")
    engine = create_engine(sync_url)
    Session = sessionmaker(bind=engine)
    db = Session()

    created = 0
    skipped = 0
    conflicts = []

    for record in records:
        full_name = record.get("full_name", "").strip()
        if not full_name:
            continue

        existing = db.query(Person).filter(
            Person.full_name.ilike(full_name), Person.deleted_at.is_(None)
        ).first()

        if existing:
            skipped += 1
            conflicts.append(f"{full_name} → conflicts with ID {existing.id}")
            continue

        aliases_raw = record.get("aliases", "")
        aliases = [a.strip() for a in aliases_raw.split(",") if a.strip()] if aliases_raw else []

        person = Person(
            full_name=full_name,
            aliases=aliases,
            designation=record.get("designation") or None,
            organization=record.get("organization") or None,
            category=record.get("category") or None,
        )
        db.add(person)
        created += 1

    db.commit()
    db.close()

    print(f"\nImport complete: {created} created, {skipped} skipped (conflicts)")
    if conflicts:
        print("\nConflicts:")
        for c in conflicts:
            print(f"  - {c}")


if __name__ == "__main__":
    main()
