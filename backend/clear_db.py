from sqlalchemy import create_engine, text
e = create_engine("postgresql+psycopg2://ndtv:ndtvpass@postgres:5432/ndtv_dam")
with e.connect() as conn:
    conn.execute(text("TRUNCATE images, upload_batches, image_quality_scores, shortlisted_images, processing_logs CASCADE"))
    conn.commit()
print("Cleared")
