#!/usr/bin/env python3
"""
Seed the Person Master database with sample persons and organizations.
Run: python scripts/seed_person_master.py
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.config import get_settings
from app.models.person_models import Person, Organization

settings = get_settings()

SAMPLE_PERSONS = [
    {"full_name": "Narendra Modi", "aliases": ["PM Modi", "NaMo"], "designation": "Prime Minister", "organization": "Government of India", "category": "Government"},
    {"full_name": "Nirmala Sitharaman", "aliases": ["FM Sitharaman"], "designation": "Finance Minister", "organization": "Ministry of Finance", "category": "Government"},
    {"full_name": "Raghuram Rajan", "aliases": ["Raghu Rajan"], "designation": "Former RBI Governor", "organization": "Reserve Bank of India", "category": "Analyst"},
    {"full_name": "Mukesh Ambani", "aliases": ["MA", "Mukesh D Ambani"], "designation": "Chairman", "organization": "Reliance Industries", "category": "Businessperson"},
    {"full_name": "Ratan Tata", "aliases": ["Ratan N Tata"], "designation": "Former Chairman", "organization": "Tata Group", "category": "Businessperson"},
    {"full_name": "Uday Kotak", "aliases": [], "designation": "Founder & CEO", "organization": "Kotak Mahindra Bank", "category": "Businessperson"},
    {"full_name": "Prannoy Roy", "aliases": [], "designation": "Co-Founder", "organization": "NDTV", "category": "NDTV Staff"},
    {"full_name": "Sonia Bhandhary", "aliases": [], "designation": "Anchor", "organization": "NDTV Profit", "category": "NDTV Staff"},
    {"full_name": "Aditi Pherwani", "aliases": [], "designation": "Senior Editor", "organization": "NDTV Profit", "category": "NDTV Staff"},
    {"full_name": "Swaminathan Aiyar", "aliases": ["Swamy Aiyar", "Swaninomics"], "designation": "Consulting Editor", "organization": "The Economic Times", "category": "Analyst"},
]

SAMPLE_ORGS = [
    {"name": "NDTV Group", "entity_type": "Media"},
    {"name": "NDTV Profit", "entity_type": "Media", "_parent": "NDTV Group"},
    {"name": "NDTV 24x7", "entity_type": "Media", "_parent": "NDTV Group"},
    {"name": "Government of India", "entity_type": "Government"},
    {"name": "Ministry of Finance", "entity_type": "Government", "_parent": "Government of India"},
    {"name": "Reserve Bank of India", "entity_type": "Government"},
    {"name": "Reliance Industries", "entity_type": "Corporate"},
    {"name": "Tata Group", "entity_type": "Corporate"},
    {"name": "Kotak Mahindra Bank", "entity_type": "Banking"},
    {"name": "The Economic Times", "entity_type": "Media"},
]


def main():
    sync_url = settings.database_url.replace("postgresql+asyncpg", "postgresql+psycopg2")
    engine = create_engine(sync_url)
    Session = sessionmaker(bind=engine)
    db = Session()

    print("Seeding organizations...")
    org_map: dict[str, Organization] = {}
    for org_data in SAMPLE_ORGS:
        parent_name = org_data.pop("_parent", None)
        existing = db.query(Organization).filter(Organization.name == org_data["name"]).first()
        if not existing:
            org = Organization(**org_data)
            db.add(org)
            db.flush()
            org_map[org_data["name"]] = org
            print(f"  + {org_data['name']}")
        else:
            org_map[org_data["name"]] = existing
            print(f"  = {org_data['name']} (exists)")

    # Set parent relationships
    for org_data_orig in SAMPLE_ORGS:
        parent_name = org_data_orig.get("_parent") if isinstance(org_data_orig, dict) else None

    db.commit()

    print("\nSeeding persons...")
    for person_data in SAMPLE_PERSONS:
        existing = db.query(Person).filter(Person.full_name == person_data["full_name"]).first()
        if not existing:
            person = Person(**person_data)
            db.add(person)
            print(f"  + {person_data['full_name']}")
        else:
            print(f"  = {person_data['full_name']} (exists)")

    db.commit()
    db.close()
    print(f"\nDone! {len(SAMPLE_PERSONS)} persons, {len(SAMPLE_ORGS)} organizations seeded.")


if __name__ == "__main__":
    main()
