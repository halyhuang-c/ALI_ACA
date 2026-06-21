from sqlalchemy.orm import Session

from config import IMAGE_DIR
from models import Image
from services import pipeline_service
from services.pipeline_service import STEP_SCAN

SUPPORTED_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}


def scan_images(db: Session) -> int:
    pipeline_service.update_step(db, STEP_SCAN, status="running", current=0)

    if not IMAGE_DIR.exists():
        pipeline_service.update_step(db, STEP_SCAN, status="completed", total=0, current=0)
        return 0

    files = []
    for p in sorted(IMAGE_DIR.iterdir()):
        if p.is_file() and p.suffix.lower() in SUPPORTED_IMAGE_EXTS:
            files.append(p)

    existing = {img.filename for img in db.query(Image.filename).all()}
    new_count = 0
    for path in files:
        filename = path.name
        if filename in existing:
            continue
        image = Image(filename=filename, path=str(path.resolve()), status="pending")
        db.add(image)
        new_count += 1
    db.commit()

    pipeline_service.update_step(db, STEP_SCAN, status="completed", total=len(files), current=len(files))
    return new_count
