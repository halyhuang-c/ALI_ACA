import unicodedata
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session

from config import IMAGE_DIR
from database import get_db
from models import Image
from services.scan_service import SUPPORTED_IMAGE_EXTS

router = APIRouter(prefix="/scan", tags=["scan"])

MAX_FILE_SIZE = 25 * 1024 * 1024
MAX_FILES_PER_REQUEST = 50


def _safe_filename(name: str) -> str:
    name = unicodedata.normalize("NFC", name).replace("\\", "/").split("/")[-1].strip()
    for ch in ('..', '/', '\\', ':', '*', '?', '"', '<', '>', '|'):
        name = name.replace(ch, "_")
    return name or "upload.png"


@router.post("/upload")
async def upload_images(
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    if not files:
        raise HTTPException(status_code=400, detail="没有接收到文件")
    if len(files) > MAX_FILES_PER_REQUEST:
        raise HTTPException(
            status_code=400,
            detail=f"单次最多上传 {MAX_FILES_PER_REQUEST} 张图片",
        )

    IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    existing_filenames = {img.filename for img in db.query(Image.filename).all()}
    existing_disk = {p.name for p in IMAGE_DIR.iterdir() if p.is_file()}

    saved = []
    skipped = []
    failed = []

    for upload in files:
        raw_name = _safe_filename(upload.filename or "upload.png")
        suffix = Path(raw_name).suffix.lower()
        if not suffix or suffix not in SUPPORTED_IMAGE_EXTS:
            skipped.append({"filename": raw_name, "reason": "不支持的图片格式"})
            continue

        candidate = raw_name
        n = 1
        while candidate in existing_disk:
            stem = Path(raw_name).stem
            candidate = f"{stem}_{n}{suffix}"
            n += 1

        dest = IMAGE_DIR / candidate
        try:
            size = 0
            with open(dest, "wb") as f:
                while True:
                    chunk = await upload.read(1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > MAX_FILE_SIZE:
                        f.close()
                        dest.unlink(missing_ok=True)
                        raise HTTPException(
                            status_code=400,
                            detail=f"{raw_name} 超过单文件大小上限 {MAX_FILE_SIZE // 1024 // 1024}MB",
                        )
                    f.write(chunk)

            if candidate not in existing_filenames:
                db.add(
                    Image(
                        filename=candidate,
                        path=str(dest.resolve()),
                        status="pending",
                    )
                )
                existing_filenames.add(candidate)
            existing_disk.add(candidate)
            saved.append({"filename": candidate, "size": size})
        except HTTPException:
            failed.append({"filename": raw_name, "reason": "文件过大"})
        except Exception as e:
            if dest.exists():
                try:
                    dest.unlink()
                except Exception:
                    pass
            failed.append({"filename": raw_name, "reason": str(e)[:200]})

    db.commit()
    return {
        "saved": saved,
        "skipped": skipped,
        "failed": failed,
        "saved_count": len(saved),
    }
