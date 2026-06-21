from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class ImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    path: str
    status: str
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None


class AnswerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    question_id: int
    answer: Optional[str] = None
    explanation: Optional[str] = None
    tags: Optional[list[str]] = None
    created_at: Optional[datetime] = None


class QuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    image_id: int
    image_filename: Optional[str] = None
    question_text: str
    options: Optional[Any] = None
    question_type: Optional[str] = None
    correct_answer: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    norm_text: Optional[str] = None
    dedup_hash: Optional[str] = None
    is_duplicate: bool = False
    duplicate_of_id: Optional[int] = None
    created_at: Optional[datetime] = None
    answer_text: Optional[str] = None
    explanation: Optional[str] = None
    tags: Optional[list[str]] = None
    is_correct: Optional[bool] = None
    answer_id: Optional[int] = None
    answer_model: Optional[str] = None
    review_status: Optional[str] = None
    is_reanswered: Optional[bool] = None
    answer_history: Optional[list[Any]] = None
    duplicate_ids: Optional[list[int]] = None
    duplicate_answer_conflict: Optional[bool] = None


class TagOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    display_name: str
    ref_count: int


class PipelineStepOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    step_name: str
    status: str
    total: int
    current: int
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class PipelineOverallOut(BaseModel):
    status: str = "pending"
    current_step: Optional[str] = None
    progress: float = 0.0


class PipelineStatusOut(BaseModel):
    steps: list[PipelineStepOut]
    overall: PipelineOverallOut


class QuestionSearchResult(BaseModel):
    items: list[QuestionOut]
    total: int
    page: int
    page_size: int


class TagSearchResult(BaseModel):
    items: list[TagOut]
    total: int
