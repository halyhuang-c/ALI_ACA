from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Tag
from schemas import TagOut

router = APIRouter()


@router.get("/tags", response_model=list[TagOut])
def list_tags(db: Session = Depends(get_db)):
    return db.query(Tag).order_by(Tag.ref_count.desc(), Tag.name.asc()).all()
